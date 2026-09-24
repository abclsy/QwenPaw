; CrecPaw (小铁智友) Desktop NSIS installer. Run makensis from repo root
; after building dist/win-unpacked (see scripts/pack/build_win.ps1).
; Usage: makensis /DQWENPAW_VERSION=1.2.3 /DOUTPUT_EXE=dist\CrecPaw-Setup-1.2.3.exe scripts\pack\desktop.nsi
;
; NOTE: keep this file saved as UTF-8 WITH BOM — makensis on an English-locale
; runner (codepage 1252) would otherwise mangle the Chinese literals below.

!include "MUI2.nsh"
!define MUI_ABORTWARNING
; Use custom icon from unpacked env (copied by build_win.ps1)
!define MUI_ICON "${UNPACKED}\icon.ico"
!define MUI_UNICON "${UNPACKED}\icon.ico"

!ifndef QWENPAW_VERSION
  !define QWENPAW_VERSION "0.0.0"
!endif
!ifndef OUTPUT_EXE
  !define OUTPUT_EXE "dist\CrecPaw-Setup-${QWENPAW_VERSION}.exe"
!endif

; Brand name shown in installer title, shortcuts and Add/Remove Programs.
!ifndef APP_NAME
  !define APP_NAME "小铁智友"
!endif

Name "${APP_NAME}"
OutFile "${OUTPUT_EXE}"
InstallDir "$LOCALAPPDATA\小铁智友"
InstallDirRegKey HKCU "Software\小铁智友" "InstallPath"
RequestExecutionLevel user

!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"

; Pass /DUNPACKED=full_path from build_win.ps1 so path works when cwd != repo root
!ifndef UNPACKED
  !define UNPACKED "dist\win-unpacked"
!endif

Section "${APP_NAME}" SEC01
  SetOutPath "$INSTDIR"
  File /r "${UNPACKED}\*.*"
  WriteRegStr HKCU "Software\小铁智友" "InstallPath" "$INSTDIR"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; Register in Add/Remove Programs (control panel shows 小铁智友)
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\小铁智友" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\小铁智友" "DisplayVersion" "${QWENPAW_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\小铁智友" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\小铁智友" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\小铁智友" "InstallLocation" "$INSTDIR"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\小铁智友" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\小铁智友" "NoRepair" 1

  ; Main shortcut - internal launcher files keep ASCII names (CrecPaw.*) to
  ; avoid .bat/.vbs content-encoding pitfalls; the shortcut NAME is Chinese.
  CreateShortcut "$SMPROGRAMS\小铁智友.lnk" "$INSTDIR\CrecPaw.vbs" "" "$INSTDIR\icon.ico" 0
  CreateShortcut "$DESKTOP\小铁智友.lnk" "$INSTDIR\CrecPaw.vbs" "" "$INSTDIR\icon.ico" 0

  ; Debug shortcut - shows console window for troubleshooting
  CreateShortcut "$SMPROGRAMS\小铁智友 (Debug).lnk" "$INSTDIR\CrecPaw (Debug).bat" "" "$INSTDIR\icon.ico" 0
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\小铁智友.lnk"
  Delete "$SMPROGRAMS\小铁智友 (Debug).lnk"
  Delete "$DESKTOP\小铁智友.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\小铁智友"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\小铁智友"
SectionEnd
