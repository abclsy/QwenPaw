@echo off
chcp 65001 >nul
setlocal

echo === 小铁智友 Windows Build ===
echo.

:: Step 1: Check Python
echo [1/5] Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
  echo ERROR: Python not found. Install Python 3.13 first.
  pause
  exit /b 1
)

:: Step 2: Create venv
echo [2/5] Creating virtual environment...
python -m venv venv

:: Step 3: Upgrade pip
echo [3/5] Upgrading pip...
venv\Scripts\python -m pip install --upgrade pip --no-input

:: Step 4: Install dependencies with --no-input to avoid interactive prompts
echo [4/5] Installing dependencies (this may take a few minutes)...
venv\Scripts\pip install --no-input -e . >install.log 2>&1
if errorlevel 1 (
  echo ERROR: pip install failed. Check install.log for details.
  pause
  exit /b 1
)

:: Step 5: Install pyinstaller
echo [5/5] Installing PyInstaller...
venv\Scripts\pip install --no-input pyinstaller >pyinstaller.log 2>&1
if errorlevel 1 (
  echo ERROR: pyinstaller install failed.
  pause
  exit /b 1
)

:: Step 6: Build
echo [6/6] Building executable (this takes ~10 minutes)...
venv\Scripts\pyinstaller QwenPaw.spec --clean 2>&1
echo.
echo Build complete. Check dist\小铁智友\
pause
