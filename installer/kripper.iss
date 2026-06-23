; K-Ripper :: Windows installer (Inno Setup)
;
; Build:   ISCC.exe kripper.iss
; Output:  ../dist/K-Ripper-Windows-Setup.exe
;
; The installer drops the device into the user's Ableton User Library, no
; admin rights required.

#define MyAppName "K-Ripper"
#define MyAppVersion "0.3.3"
#define MyAppPublisher "K-Ripper"
#define MyAppURL "https://github.com/"

[Setup]
AppId={{2BA8E6C4-3A1B-4D8E-9F5E-7C5D8A2F1B3C}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
DefaultDirName={userdocs}\Ableton\User Library\Presets\Audio Effects\Max Audio Effect\K-Ripper
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=..\dist
OutputBaseFilename=K-Ripper-Windows-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=K-Ripper for Ableton Live
DisableReadyPage=no
UsePreviousAppDir=yes
AppendDefaultDirName=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Messages]
FinishedLabel=K-Ripper has been installed into your Ableton User Library.%n%nIn Live's browser: User Library > Audio Effects > Max Audio Effect > K-Ripper — drag it onto an audio track.%n%nIf the device doesn't appear, your User Library may live in a custom location (check Live's Preferences > Library) — re-run this installer and pick that folder.%n%nRipped audio is saved to Music\K-Ripper.

[Files]
Source: "..\kripper\K-Ripper.amxd";         DestDir: "{app}";        Flags: ignoreversion
Source: "..\kripper\LICENSES.txt";          DestDir: "{app}";        Flags: ignoreversion
Source: "..\kripper\kripper.js";            DestDir: "{app}";        Flags: ignoreversion
Source: "..\kripper\kripper.mjs";           DestDir: "{app}";        Flags: ignoreversion
Source: "..\kripper\lib.mjs";               DestDir: "{app}";        Flags: ignoreversion
Source: "..\kripper\package.json";          DestDir: "{app}";        Flags: ignoreversion
Source: "..\kripper\bin\yt-dlp.exe";        DestDir: "{app}\bin";    Flags: ignoreversion
Source: "..\kripper\bin\ffmpeg.exe";        DestDir: "{app}\bin";    Flags: ignoreversion
Source: "..\kripper\assets\*";              DestDir: "{app}\assets"; Flags: ignoreversion recursesubdirs

[Run]
Filename: "{app}"; Verb: open; Flags: shellexec postinstall skipifsilent; Description: "Open installed device folder"

; NOTE: downloads are deliberately NOT deleted — as of this version they live
; in Music\K-Ripper (outside {app}), and older installs may have WAVs in
; {app}\downloads that the user's Live sets reference. Never delete user audio.
[UninstallDelete]
Type: filesandordirs; Name: "{app}\bin"
Type: filesandordirs; Name: "{app}\assets"

[Code]
function GetUserLibraryPath(Param: String): String;
begin
  Result := ExpandConstant('{userdocs}\Ableton\User Library');
end;
