$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$configPath = Join-Path $root 'config.json'
$agentPath = Join-Path $root 'agent.ps1'

Write-Host ''
Write-Host '=== Artvideo Print - configuração ===' -ForegroundColor Cyan

if (-not (Test-Path -LiteralPath $configPath)) {
  Write-Host 'config.json não encontrado.' -ForegroundColor Yellow
  Write-Host 'No painel do sistema, abra Impressora > Gerar nova chave > Baixar config.json.'
  Write-Host 'Depois coloque o arquivo config.json nesta mesma pasta e execute este setup novamente.'
  exit 1
}

$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json

# Sempre tenta atualizar o agente a partir da main antes de reiniciar.
# Se a internet/GitHub estiver indisponível, continua com a cópia local.
$latestAgentUrl = 'https://raw.githubusercontent.com/rafaelartvideo/fila-eletronica-artvideo/main/print-agent/agent.ps1'
$tempAgentPath = Join-Path $root 'agent.latest.ps1'
try {
  Invoke-WebRequest -Uri $latestAgentUrl -OutFile $tempAgentPath -UseBasicParsing -TimeoutSec 20
  if ((Get-Item -LiteralPath $tempAgentPath).Length -lt 1000) {
    throw 'Arquivo de atualização inválido.'
  }
  Move-Item -LiteralPath $tempAgentPath -Destination $agentPath -Force
  Write-Host 'Agente atualizado para a versão mais recente.' -ForegroundColor Green
} catch {
  if (Test-Path -LiteralPath $tempAgentPath) { Remove-Item -LiteralPath $tempAgentPath -Force -ErrorAction SilentlyContinue }
  Write-Host "Não foi possível buscar atualização automática; usando o agent.ps1 local. $($_.Exception.Message)" -ForegroundColor Yellow
}

$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$printers = @(Get-Printer | Select-Object -ExpandProperty Name)
Write-Host ''
Write-Host 'Impressoras instaladas:'
for ($i = 0; $i -lt $printers.Count; $i++) {
  Write-Host "[$($i + 1)] $($printers[$i])"
}

if ($printers.Count -eq 0) { throw 'Nenhuma impressora instalada no Windows.' }

$currentIndex = [Array]::IndexOf($printers, [string]$config.printerName)
if ($currentIndex -lt 0) {
  Write-Host ''
  $choice = Read-Host 'Digite o número da Elgin i9'
  $index = [int]$choice - 1
  if ($index -lt 0 -or $index -ge $printers.Count) { throw 'Seleção inválida.' }
  $config.printerName = $printers[$index]
  $config | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $configPath -Encoding UTF8
  Write-Host "Impressora salva: $($config.printerName)" -ForegroundColor Green
} else {
  Write-Host "Impressora encontrada: $($config.printerName)" -ForegroundColor Green
}

$startup = [Environment]::GetFolderPath('Startup')
$launcher = Join-Path $startup 'Artvideo Print Agent.cmd'
$nl = [Environment]::NewLine
$launcherBody = '@echo off' + $nl + 'start "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $agentPath + '"' + $nl
Set-Content -LiteralPath $launcher -Value $launcherBody -Encoding ASCII

# Encerra instâncias antigas deste agente antes de iniciar a versão atual.
$escapedAgentPath = [Regex]::Escape($agentPath)
$oldAgents = @(Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
  Where-Object {
    $_.ProcessId -ne $PID -and
    $_.CommandLine -and
    $_.CommandLine -match $escapedAgentPath
  })

foreach ($process in $oldAgents) {
  try {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
    Write-Host "Agente antigo encerrado (PID $($process.ProcessId))." -ForegroundColor DarkGray
  } catch {
    Write-Host "Não foi possível encerrar o agente antigo PID $($process.ProcessId): $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

Start-Sleep -Milliseconds 500
Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + $agentPath + '"'))
Write-Host ''
Write-Host 'Agente instalado e iniciado.' -ForegroundColor Green
Write-Host 'Ele também iniciará automaticamente quando este usuário entrar no Windows.'
Write-Host 'Volte ao painel > Impressora e aguarde o status Conectado.'
