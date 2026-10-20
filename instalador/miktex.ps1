# Etapa 67 do Setup: garante o MiKTeX (latex + dvisvgm) e liga a instalação automática de pacotes.
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

function Find-Bin {
    $dirs = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\MiKTeX\miktex\bin\x64'),
        (Join-Path $env:ProgramFiles 'MiKTeX\miktex\bin\x64')
    )
    $cmd = Get-Command latex -ErrorAction SilentlyContinue
    if ($cmd) { $dirs = @(Split-Path $cmd.Source) + $dirs }
    foreach ($d in $dirs) { if (Test-Path (Join-Path $d 'latex.exe')) { return $d } }
    return $null
}

$bin = Find-Bin
if (-not $bin) {
    Write-Host '[67] Instalando o MiKTeX (pode levar alguns minutos)...'
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install --id MiKTeX.MiKTeX -e --silent --scope user --accept-package-agreements --accept-source-agreements
    }
    $bin = Find-Bin
}
if (-not $bin) {
    # sem winget: baixa o instalador oficial direto do CTAN
    $page = (Invoke-WebRequest 'https://miktex.org/download' -UseBasicParsing).Links.href |
        Where-Object { $_ -match 'basic-miktex-.*-x64\.exe$' } | Select-Object -First 1
    if ($page) {
        if ($page -notmatch '^https?:') { $page = 'https://miktex.org' + $page }
        $exe = Join-Path $env:TEMP 'basic-miktex-67.exe'
        Invoke-WebRequest $page -OutFile $exe -UseBasicParsing
        Start-Process $exe -ArgumentList '--unattended', '--auto-install=yes' -Wait
        Remove-Item $exe -ErrorAction SilentlyContinue
    }
    $bin = Find-Bin
}
if (-not $bin) { exit 67 }

# baixa sozinho os pacotes que faltarem, sem perguntar
& (Join-Path $bin 'initexmf.exe') --set-config-value='[MPM]AutoInstall=1' 2>$null
& (Join-Path $bin 'initexmf.exe') --admin --set-config-value='[MPM]AutoInstall=1' 2>$null
exit 0
