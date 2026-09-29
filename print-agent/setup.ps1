$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$configPath = Join-Path $root 'config.json'

Write-Host ''
Write-Host '=== Artvideo Print - configuração ===' -ForegroundColor Cyan

if (-not (Test-Path -LiteralPath $configPath)) {
  Write-Host 'config.json não encontrado.' -ForegroundColor Yellow
  Write-Host 'No painel do sistema, abra Impressora > Gerar nova chave > Baixar config.json.'
  Write-Host 'Depois coloque o arquivo config.json nesta mesma pasta e execute este setup novamente.'
  exit 1
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
$agentPath = Join-Path $root 'agent.ps1'
$nl = [Environment]::NewLine
$launcherBody = '@echo off' + $nl + 'start "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $agentPath + '"' + $nl
Set-Content -LiteralPath $launcher -Value $launcherBody -Encoding ASCII

Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + $agentPath + '"'))
Write-Host ''
Write-Host 'Agente instalado e iniciado.' -ForegroundColor Green
Write-Host 'Ele também iniciará automaticamente quando este usuário entrar no Windows.'
Write-Host 'Volte ao painel > Impressora e aguarde o status Conectado.'
