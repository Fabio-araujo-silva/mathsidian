# Instalador do Mathsidian: baixa o app do último Release e cria atalhos.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$url     = 'https://github.com/Fabio-araujo-silva/mathsidian/releases/latest/download/mathsidian-app.zip'
$destino = Join-Path $env:LOCALAPPDATA 'Programs\Mathsidian'
$zip     = Join-Path $env:TEMP 'mathsidian-app-67.zip'

Write-Host '=================== 67 ==================='
Write-Host '      Instalador do Mathsidian  (67)'
Write-Host '=================== 67 ==================='
Write-Host ''

Write-Host '[6/7] Baixando o Mathsidian (~160 MB)...'
Invoke-WebRequest -Uri $url -OutFile $zip

Write-Host "[7/7] Instalando em $destino ..."
Get-Process mathsidian -ErrorAction SilentlyContinue | Stop-Process -Force
if (Test-Path $destino) { Remove-Item $destino -Recurse -Force }
New-Item -ItemType Directory -Force $destino | Out-Null
Expand-Archive -Path $zip -DestinationPath $destino -Force
Remove-Item $zip

$exe = Join-Path $destino 'mathsidian-app\mathsidian.exe'
$shell = New-Object -ComObject WScript.Shell
foreach ($pasta in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
    $atalho = $shell.CreateShortcut((Join-Path $pasta 'Mathsidian.lnk'))
    $atalho.TargetPath = $exe
    $atalho.WorkingDirectory = Split-Path $exe
    $atalho.Save()
}

if (-not (Get-Command latex -ErrorAction SilentlyContinue)) {
    Write-Host ''
    Write-Host 'O MiKTeX (necessario para as formulas) nao foi encontrado.'
    $r = Read-Host 'Instalar agora pelo winget? (s/n)'
    if ($r -eq 's') {
        winget install --id MiKTeX.MiKTeX -e --accept-package-agreements --accept-source-agreements
        Write-Host 'Depois de instalar, reinicie o computador.'
    } else {
        Write-Host 'Instale depois em https://miktex.org/download (veja o README).'
    }
}

Write-Host ''
Write-Host 'Pronto! 67/67 concluido. Abra o Mathsidian pelo atalho na Area de Trabalho.'
Write-Host '=================== 67 ==================='
