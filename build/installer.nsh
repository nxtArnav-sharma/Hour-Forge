; HourForge NSIS Custom Script (M14b)
; Handles per-user install without UAC, custom dark glass branding,
; autostart registry configuration, and clean uninstall with user data prompt.

!include "LogicLib.nsh"
!include "FileFunc.nsh"

!ifndef BUILD_UNINSTALLER
Function SetAutostartRegistry
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "HourForge" '"$INSTDIR\${APP_FILENAME}.exe" --autostart'
FunctionEnd

Function StartAppCustom
  ExecShell "" "$INSTDIR\${APP_FILENAME}.exe"
FunctionEnd
!endif

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to HourForge Setup"
  !define MUI_WELCOMEPAGE_TEXT "HourForge is an autonomous Windows system tray supervisor and humanized Steam playtime keeper.$\r$\n$\r$\nSculpted to Life by Arnav Sharma, Discord:- Lesserkeyofsolomon.$\r$\n$\r$\nNote: Because this build is unsigned, Windows SmartScreen may show an 'Unknown Publisher' warning. Click 'More info' and 'Run anyway' to proceed.$\r$\n$\r$\nClick Next to continue."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customFinishPage
  !define MUI_FINISHPAGE_TITLE "HourForge Setup Complete"
  !define MUI_FINISHPAGE_TEXT "HourForge has been installed on your computer.$\r$\n$\r$\nSculpted to Life by Arnav Sharma, Discord:- Lesserkeyofsolomon.$\r$\n$\r$\nThe application will run in your Windows system tray, silently managing your playtime schedules according to your configured profiles."

  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_TEXT "Launch HourForge"
  !define MUI_FINISHPAGE_RUN_FUNCTION "StartAppCustom"
  !define MUI_FINISHPAGE_RUN_CHECKED

  !define MUI_FINISHPAGE_SHOWREADME ""
  !define MUI_FINISHPAGE_SHOWREADME_TEXT "Start HourForge with Windows"
  !define MUI_FINISHPAGE_SHOWREADME_CHECKED
  !define MUI_FINISHPAGE_SHOWREADME_FUNCTION "SetAutostartRegistry"

  !insertmacro MUI_PAGE_FINISH
!macroend

!macro customInstall
  IfSilent 0 +2
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "HourForge" '"$INSTDIR\${APP_FILENAME}.exe" --autostart'
!macroend

!macro customUnWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Uninstall HourForge"
  !define MUI_WELCOMEPAGE_TEXT "This wizard will uninstall HourForge from your computer.$\r$\n$\r$\nHourForge — Sculpted to Life by Arnav Sharma.$\r$\n$\r$\nYour custom profiles, tracked games, and goal history can be preserved if you choose to keep your user data.$\r$\n$\r$\nClick Next to continue."
  !insertmacro MUI_UNPAGE_WELCOME
!macroend

!macro customUnInstall
  ; 1. Remove Windows autostart registry entry
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "HourForge"

  ; 2. Handle user data cleanup: default KEEP
  IfSilent silentUninstall guiUninstall

silentUninstall:
  ClearErrors
  ${GetParameters} $R0
  ${GetOptions} $R0 "--delete-app-data" $R1
  IfErrors keepUserData
  RMDir /r "$LOCALAPPDATA\HourForge"
  Goto keepUserData

guiUninstall:
  ; Prompt user with No as default focused button (MB_DEFBUTTON2)
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Do you want to delete all HourForge user data, settings, goals, and history?$\r$\n$\r$\nClick 'No' to keep your data (recommended), or 'Yes' to completely remove all data." IDNO keepUserData
  RMDir /r "$LOCALAPPDATA\HourForge"

keepUserData:
!macroend
