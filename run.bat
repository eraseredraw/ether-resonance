@echo off
REM ============================================
REM ETHER RESONANCE — Главный лаунчер
REM ============================================
REM Универсальный запуск проекта с меню выбора
REM ============================================

setlocal EnableDelayedExpansion

cd /d "%~dp0"

:MENU
cls
echo.
echo ============================================
echo    ETHER RESONANCE — LAUNCHER
echo ============================================
echo.
echo    Выберите действие:
echo.
echo    [1] Запуск сервера + туннель (полный)
echo    [2] Запуск только сервера
echo    [3] Запуск только туннель
echo    [4] Открыть в браузере
echo    [5] Остановить все процессы
echo    [6] Выход
echo.
echo ============================================
echo.

set /p choice="Введите номер (1-6): "

if "%choice%"=="1" goto START_FULL
if "%choice%"=="2" goto START_SERVER
if "%choice%"=="3" goto START_TUNNEL
if "%choice%"=="4" goto OPEN_BROWSER
if "%choice%"=="5" goto STOP_ALL
if "%choice%"=="6" goto EXIT

echo [ОШИБКА] Неверный выбор
timeout /t 2 /nobreak >nul
goto MENU

:START_FULL
echo.
echo [INFO] Запуск сервера + туннель...
call start-tunnel.bat
goto END

:START_SERVER
echo.
echo [INFO] Запуск сервера...
start "EtherResonance Server" cmd /c "python server.py & pause"
timeout /t 3 /nobreak >nul
start http://localhost:8080/
echo [OK] Сервер запущен: http://localhost:8080/
goto END

:START_TUNNEL
echo.
echo [INFO] Запуск туннеля...
call tunnel.bat
goto END

:OPEN_BROWSER
echo.
echo [INFO] Открытие браузера...
start http://localhost:8080/
echo [OK] Браузер открыт
goto END

:STOP_ALL
echo.
echo [INFO] Остановка всех процессов...
taskkill /F /IM python.exe /FI "WINDOWTITLE eq EtherResonance*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq CloudflareTunnel*" >nul 2>&1
echo [OK] Все процессы остановлены
goto END

:EXIT
echo.
echo [INFO] Выход...
exit /b 0

:END
echo.
pause
goto MENU
