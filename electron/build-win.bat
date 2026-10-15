@echo off
setlocal
cd /d "%~dp0"
echo.
echo ================================================
echo  NFC Reader 1.8.3 - Windows Portable (unico EXE)
echo ================================================
echo.
where node >nul 2>&1
if errorlevel 1 (
  echo ERRORE: Node.js non trovato. Usa GitHub Actions oppure installa Node.js 22.
  goto failure
)
where npm >nul 2>&1
if errorlevel 1 (
  echo ERRORE: npm non trovato.
  goto failure
)
echo [1/4] Compilazione bridge WinSCard nativo Windows, senza Python...
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "bridge\build.ps1"
if errorlevel 1 goto failure
echo [2/4] Dipendenze Electron (solo JavaScript)...
call npm install --no-audit --no-fund
if errorlevel 1 goto failure
echo [3/4] Test PC/SC e NDEF...
call npm test
if errorlevel 1 goto failure
echo [4/4] Creazione EXE portable...
call npm run dist:win
if errorlevel 1 goto failure
if not exist "dist\NFC-Reader-Portable-1.8.3-x64.exe" (
  echo ERRORE: EXE portable non creato.
  goto failure
)
echo.
echo COMPLETATO: electron\dist\NFC-Reader-Portable-1.8.3-x64.exe
echo Solo un EXE da copiare: non e' richiesta installazione.
pause
exit /b 0
:failure
echo.
echo Build non riuscita. Puoi compilare su GitHub:
echo Actions -^> Compila EXE portable Windows -^> Run workflow.
pause
exit /b 1
