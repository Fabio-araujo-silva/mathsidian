# Instala o Mathsidian com um comando (sem o aviso do SmartScreen):
#   irm https://raw.githubusercontent.com/Fabio-araujo-silva/mathsidian/main/instalar.ps1 | iex
# Baixa o Mathsidian-Setup.exe do ultimo Release e roda em modo silencioso.
# (so ASCII aqui: o irm | iex do Windows PowerShell estraga acentos)

& {
    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    $url   = 'https://github.com/Fabio-araujo-silva/mathsidian/releases/latest/download/Mathsidian-Setup.exe'
    $setup = Join-Path $env:TEMP 'Mathsidian-Setup-67.exe'

    Write-Host ''
    Write-Host '=================== 67 ===================' -ForegroundColor Yellow
    Write-Host '        Instalando o Mathsidian' -ForegroundColor Yellow
    Write-Host '=================== 67 ===================' -ForegroundColor Yellow
    Write-Host ''

    Write-Host '[1/3] Baixando (~110 MB)...'
    Invoke-WebRequest -Uri $url -OutFile $setup -UseBasicParsing

    Write-Host '[2/3] Instalando o app e o LaTeX (MiKTeX). Pode levar alguns minutos, nao feche esta janela...'
    $p = Start-Process $setup -ArgumentList '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART' -Wait -PassThru
    Remove-Item $setup -ErrorAction SilentlyContinue
    if ($p.ExitCode -ne 0) {
        Write-Host "Algo deu errado (codigo $($p.ExitCode)). Tente de novo ou baixe o Setup em:" -ForegroundColor Red
        Write-Host "  $url"
        return
    }

    Write-Host '[3/3] Abrindo o Mathsidian...'
    $exe = Join-Path $env:LOCALAPPDATA 'Programs\Mathsidian\mathsidian.exe'
    if (Test-Path $exe) { Start-Process $exe }

    Write-Host ''
    Write-Host 'Pronto! 67/67. Da proxima vez, abra pelo atalho Mathsidian na Area de Trabalho.' -ForegroundColor Green
}
