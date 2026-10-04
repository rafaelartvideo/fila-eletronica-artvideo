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
$idlePollMs = if ($config.idlePollIntervalMs) { [Math]::Max($pollMs, [int]$config.idlePollIntervalMs) } else { 10000 }
$operatingStartHour = if ($null -ne $config.operatingStartHour) { [Math]::Max(0, [Math]::Min(23, [int]$config.operatingStartHour)) } else { 7 }
$operatingEndHour = if ($null -ne $config.operatingEndHour) { [Math]::Max(0, [Math]::Min(23, [int]$config.operatingEndHour)) } else { 20 }
$configuredFeedLines = if ($null -ne $config.feedLines) { [int]$config.feedLines } else { 13 }
$feedLines = if ($configuredFeedLines -le 10) { 13 } else { [Math]::Max(11, [Math]::Min(18, $configuredFeedLines)) }

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
  Add-Bytes ([byte[]](0x1D,0x21,0x11))
  Add-Line 'FILA DE ATENDIMENTO'
  Add-Bytes ([byte[]](0x1D,0x21,0x00))
  Add-Bytes ([byte[]](0x1B,0x45,0x00))

  # Mensagem no topo maior, mas mantendo a largura normal para não quebrar a linha.
  Add-Bytes ([byte[]](0x1D,0x21,0x10))
  Add-Line 'Aguarde sua senha ser chamada.'
  Add-Bytes ([byte[]](0x1D,0x21,0x00))

  Add-Bytes ([byte[]](0x1B,0x45,0x01))
  Add-Bytes ([byte[]](0x1D,0x21,0x11))
  Add-Line ([string]$Job.service_type_name).ToUpperInvariant()
  Add-Bytes ([byte[]](0x1D,0x21,0x00))
  Add-Bytes ([byte[]](0x1B,0x45,0x00))

  Add-Bytes ([byte[]](0x1B,0x45,0x01))
  Add-Bytes ([byte[]](0x1D,0x21,0x33))
  Add-Line $ticketNumber
  Add-Bytes ([byte[]](0x1D,0x21,0x00))
  Add-Bytes ([byte[]](0x1B,0x45,0x00))

  $issued = [DateTimeOffset]::Parse([string]$Job.issued_at).ToLocalTime()
  Add-Bytes ([byte[]](0x1D,0x21,0x10))
  Add-Line ("Emitida em {0:dd/MM/yyyy HH:mm}" -f $issued)
  Add-Bytes ([byte[]](0x1D,0x21,0x00))

  # Avanço final para levar toda a senha além da serrilha de destaque manual.
  # Esta impressora não possui guilhotina; não enviamos comandos ESC/POS de corte.
  for ($i = 0; $i -lt $feedLines; $i++) {
    Add-Line ''
  }

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

function Test-OperatingHours([DateTime]$Now) {
  $hour = $Now.Hour
  if ($operatingStartHour -eq $operatingEndHour) { return $true }
  if ($operatingStartHour -lt $operatingEndHour) {
    return $hour -ge $operatingStartHour -and $hour -lt $operatingEndHour
  }
  return $hour -ge $operatingStartHour -or $hour -lt $operatingEndHour
}

function Get-NextOperatingStart([DateTime]$Now) {
  $todayStart = $Now.Date.AddHours($operatingStartHour)
  if ($Now -lt $todayStart) { return $todayStart }
  return $todayStart.AddDays(1)
}

function Get-AdaptivePollMs([int]$EmptyPolls) {
  if ($EmptyPolls -lt 3) { return $pollMs }
  if ($EmptyPolls -lt 6) { return [Math]::Min($idlePollMs, [Math]::Max($pollMs, 2500)) }
  if ($EmptyPolls -lt 10) { return [Math]::Min($idlePollMs, [Math]::Max($pollMs, 5000)) }
  return $idlePollMs
}

Write-AgentLog "Artvideo Print iniciado. Impressora: $($config.printerName)"
Write-AgentLog ("Horário de operação: {0:00}:00 às {1:00}:00. Polling ativo: {2} ms; ocioso: até {3} ms." -f $operatingStartHour, $operatingEndHour, $pollMs, $idlePollMs)

$emptyPolls = 0
$wasSleepingOutsideHours = $false

while ($true) {
  $now = Get-Date
  if (-not (Test-OperatingHours $now)) {
    if (-not $wasSleepingOutsideHours) {
      $nextStart = Get-NextOperatingStart $now
      Write-AgentLog ("Fora do horário de operação. Consultas ao Supabase pausadas até {0:dd/MM HH:mm}." -f $nextStart)
      $wasSleepingOutsideHours = $true
    }

    $nextStart = Get-NextOperatingStart $now
    $sleepSeconds = [Math]::Max(1, [Math]::Ceiling(($nextStart - $now).TotalSeconds))
    Start-Sleep -Seconds ([Math]::Min($sleepSeconds, 3600))
    continue
  }

  if ($wasSleepingOutsideHours) {
    Write-AgentLog "Horário de operação iniciado. Consultas ao Supabase retomadas."
    $wasSleepingOutsideHours = $false
    $emptyPolls = 0
  }
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
        $emptyPolls = 0
        Write-AgentLog "Impresso: $($job.ticket_number)"
      } catch {
        $message = $_.Exception.Message
        try { Complete-Job ([string]$job.job_id) $false $message } catch {}
        Write-AgentLog "Erro ao imprimir $($job.ticket_number): $message"
      }
      continue
    }

    $emptyPolls += 1
  } catch {
    Write-AgentLog "Conexão/consulta: $($_.Exception.Message)"
    $emptyPolls = [Math]::Max($emptyPolls, 6)
  }

  Start-Sleep -Milliseconds (Get-AdaptivePollMs $emptyPolls)
}
