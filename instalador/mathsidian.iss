; Setup do Mathsidian (Inno Setup 6). Gerar com:
;   ISCC.exe instalador\mathsidian.iss   (usa o app de dist\build\mathsidian-app)

#define Versao "1.0.67"

[Setup]
AppId={{6767A0F1-4D2B-4C67-9E67-6767MATHSID}
AppName=Mathsidian
AppVersion={#Versao}
AppPublisher=Mathsidian 67
DefaultDirName={localappdata}\Programs\Mathsidian
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
DisableWelcomePage=no
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=Mathsidian-Setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\mathsidian.exe
CloseApplications=force

[Languages]
Name: "pt"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Messages]
pt.WelcomeLabel2=Isso vai instalar o Mathsidian e tudo que ele precisa (incluindo o LaTeX/MiKTeX). É só clicar em Avançar. 67!

[Files]
Source: "..\dist\build\mathsidian-app\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "miktex.ps1"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Icons]
Name: "{userdesktop}\Mathsidian"; Filename: "{app}\mathsidian.exe"
Name: "{userprograms}\Mathsidian"; Filename: "{app}\mathsidian.exe"

[Run]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{tmp}\miktex.ps1"""; StatusMsg: "Instalando o LaTeX (MiKTeX)... isso pode levar uns minutos. 67"; Flags: runhidden waituntilterminated
Filename: "{app}\mathsidian.exe"; Description: "Abrir o Mathsidian agora"; Flags: nowait postinstall skipifsilent
