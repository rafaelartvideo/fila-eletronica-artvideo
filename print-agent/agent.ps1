param(
  [string]$ConfigPath = (Join-Path $PSScriptRoot 'config.json')
)

$ErrorActionPreference = 'Stop'

function Write-AgentLog([string]$Message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $Message"
  Write-Host $line
  Add-Content -LiteralPath (Join-Path $PSScriptRoot 'agent.log') -Value $line -Encoding UTF8
}

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  throw "config.json não encontrado. Baixe a configuração no painel em Impressora e salve neste diretório."
}

$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
foreach ($required in @('supabaseUrl','supabaseKey','agentSlug','agentToken','printerName')) {
  if (-not $config.$required) { throw "Campo obrigatório ausente no config.json: $required" }
}

$pollMs = if ($config.pollIntervalMs) { [Math]::Max(500, [int]$config.pollIntervalMs) } else { 1000 }
$feedLines = if ($config.feedLines) { [Math]::Max(1, [Math]::Min(20, [int]$config.feedLines)) } else { 7 }
$cutMode = if ($config.cutMode) { [string]$config.cutMode } else { 'partial' }

if (-not ('RawPrinter.Artvideo' -as [type])) {
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

namespace RawPrinter {
  public static class Artvideo {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
      [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
      [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
      [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
    static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
    [DllImport("winspool.Drv", SetLastError=true)]
    static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
    static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFOA di);
    [DllImport("winspool.Drv", SetLastError=true)]
    static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", SetLastError=true)]
    static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", SetLastError=true)]
    static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", SetLastError=true)]
    static extern bool WritePrinter(IntPtr hPrinter, byte[] bytes, int count, out int written);

    public static void Send(string printerName, byte[] bytes) {
      IntPtr printer;
      if (!OpenPrinter(printerName, out printer, IntPtr.Zero))
        throw new Exception("Não foi possível abrir a impressora. Erro " + Marshal.GetLastWin32Error());
      try {
        var doc = new DOCINFOA { pDocName = "Senha Artvideo", pDataType = "RAW" };
        if (!StartDocPrinter(printer, 1, doc))
          throw new Exception("Não foi possível iniciar o documento RAW. Erro " + Marshal.GetLastWin32Error());
        try {
          if (!StartPagePrinter(printer))
            throw new Exception("Não foi possível iniciar a página. Erro " + Marshal.GetLastWin32Error());
          try {
            int written;
            if (!WritePrinter(printer, bytes, bytes.Length, out written) || written != bytes.Length)
              throw new Exception("Falha ao enviar bytes para a impressora. Erro " + Marshal.GetLastWin32Error());
          } finally { EndPagePrinter(printer); }
        } finally { EndDocPrinter(printer); }
      } finally { ClosePrinter(printer); }
    }
  }
}
"@
}

function Normalize-PrinterText([string]$Text) {
  if ($null -eq $Text) { return '' }
  $normalized = $Text.Normalize([Text.NormalizationForm]::FormD)
  $builder = New-Object Text.StringBuilder
  foreach ($char in $normalized.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($char) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$builder.Append($char)
    }
  }
  return $builder.ToString().Normalize([Text.NormalizationForm]::FormC)
}

function Build-TicketBytes($Job) {
  $bytes = [Collections.Generic.List[byte]]::new()
  $encoding = [Text.Encoding]::GetEncoding(850)

  function Add-Bytes([byte[]]$Value) { $bytes.AddRange($Value) }
  function Add-Line([string]$Value = '') {
    $clean = Normalize-PrinterText $Value
    $bytes.AddRange($encoding.GetBytes($clean))
    $bytes.Add([byte]0x0A)
  }

  # Sempre garante PREFIXO-NUMERO, por exemplo C-001.
  $ticketNumber = ([string]$Job.ticket_number).Trim().ToUpperInvariant()
  if ($ticketNumber -match '^([A-Z]+)-?(\d+)$') {
    $ticketNumber = $matches[1] + '-' + $matches[2]
  }

  Add-Bytes ([byte[]](0x1B,0x40))
  Add-Bytes ([byte[]](0x1B,0x61,0x01))

  Add-Bytes ([byte[]](0x1B,0x45,0x01))
  Add-Line 'FILA DE ATENDIMENTO'
  Add-Bytes ([byte[]](0x1B,0x45,0x00))

  # Mensagem no topo, antes do atendimento e da senha.
  Add-Line 'Aguarde sua senha ser chamada.'
  Add-Line ([string]$Job.service_type_name).ToUpperInvariant()

  Add-Bytes ([byte[]](0x1B,0x45,0x01))
  Add-Bytes ([byte[]](0x1D,0x21,0x22))
  Add-Line $ticketNumber
  Add-Bytes ([byte[]](0x1D,0x21,0x00))
  Add-Bytes ([byte[]](0x1B,0x45,0x00))

  $issued = [DateTimeOffset]::Parse([string]$Job.issued_at).ToLocalTime()
  Add-Line ("Emitida em {0:dd/MM/yyyy HH:mm}" -f $issued)

  # A i9 calcula a posição física da guilhotina.
  # GS V 65/66 n: avança até a posição de corte + n unidades e corta.
  # n = 0 mantém o cupom o mais curto possível sem cortar o conteúdo.
  $cutCommand = if ($cutMode -eq 'full') { [byte]0x41 } else { [byte]0x42 }
  Add-Bytes ([byte[]](0x1D,0x56,$cutCommand,0x00))

  return $bytes.ToArray()
}

function Rpc([string]$Name, [hashtable]$Payload) {
  $headers = @{
    apikey = [string]$config.supabaseKey
    'Content-Type' = 'application/json'
  }
  if ([string]$config.supabaseKey -match '^eyJ') {
    $headers.Authorization = "Bearer $($config.supabaseKey)"
  }
  $uri = "$($config.supabaseUrl.TrimEnd('/'))/rest/v1/rpc/$Name"
  return Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body ($Payload | ConvertTo-Json -Compress -Depth 5) -TimeoutSec 15
}

function Complete-Job([string]$JobId, [bool]$Success, [string]$ErrorMessage = $null) {
  [void](Rpc 'complete_print_job' @{
    p_agent_slug = [string]$config.agentSlug
    p_agent_token = [string]$config.agentToken
    p_job_id = $JobId
    p_success = $Success
    p_error_message = $ErrorMessage
  })
}

Write-AgentLog "Artvideo Print iniciado. Impressora: $($config.printerName)"

while ($true) {
  try {
    $result = Rpc 'claim_next_print_job' @{
      p_agent_slug = [string]$config.agentSlug
      p_agent_token = [string]$config.agentToken
    }
    $job = @($result) | Select-Object -First 1

    if ($job -and $job.job_id) {
      try {
        Write-AgentLog "Imprimindo $($job.ticket_number)..."
        $payload = Build-TicketBytes $job
        [RawPrinter.Artvideo]::Send([string]$config.printerName, $payload)
        Complete-Job ([string]$job.job_id) $true
        Write-AgentLog "Impresso: $($job.ticket_number)"
      } catch {
        $message = $_.Exception.Message
        try { Complete-Job ([string]$job.job_id) $false $message } catch {}
        Write-AgentLog "Erro ao imprimir $($job.ticket_number): $message"
      }
      continue
    }
  } catch {
    Write-AgentLog "Conexão/consulta: $($_.Exception.Message)"
  }

  Start-Sleep -Milliseconds $pollMs
}
