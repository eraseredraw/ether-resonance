@echo off
REM ============================================
REM ETHER RESONANCE — Быстрый запуск
REM ============================================
REM Оптимизированный скрипт с проверками и логами
REM ============================================

setlocal EnableDelayedExpansion

REM Настройки
set PORT=%1
if "%PORT%"=="" set PORT=8080
set LOG_DIR=%~dp0logs
set TUNNEL_LOG=%LOG_DIR%\tunnel_current.log

REM Создаём директорию для логов
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo.
echo ============================================
echo    ETHER RESONANCE — ЗАПУСК
echo ============================================
echo.

REM Проверка Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ОШИБКА] Python не найден! Установите Python 3.8+
    echo Скачать: https://www.python.org/downloads/
    pause
    exit /b 1
)

echo [OK] Python найден
python --version

REM Проверка cloudflared
set CLOUDFLARED_PATH=%~dp0..\cloudflared.exe
if not exist "%CLOUDFLARED_PATH%" (
    echo [ПРЕДУПРЕЖДЕНИЕ] cloudflared.exe не найден в %CLOUDFLARED_PATH%
    echo Туннель не будет создан автоматически
    set USE_TUNNEL=0
) else (
    echo [OK] cloudflared найден
    set USE_TUNNEL=1
)

echo.
echo ============================================
echo    ЗАПУСК СЕРВЕРА
echo ============================================
echo.

REM Остановка существующих процессов
taskkill /F /IM python.exe /FI "WINDOWTITLE eq EtherResonance*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq CloudflareTunnel*" >nul 2>&1
timeout /t 1 /nobreak >nul

REM Запуск сервера в отдельном окне
start "EtherResonance Server" cmd /c "python server.py & pause"
echo [OK] Сервер запущен на порту %PORT%

REM Ждём инициализации сервера
echo [INFO] Ожидание инициализации сервера...
timeout /t 3 /nobreak >nul

REM Проверка доступности сервера
curl -s -o nul http://localhost:%PORT%/ >nul 2>&1
if %errorlevel% neq 0 (
    echo [ОШИБКА] Сервер не отвечает! Проверьте логи.
    pause
    exit /b 1
)
echo [OK] Сервер отвечает на http://localhost:%PORT%/

echo.
if %USE_TUNNEL%==1 (
    echo ============================================
    echo    ЗАПУСК CLOUDFLARE TUNNEL
    echo ============================================
    echo.

    REM Очищаем старый лог
    if exist "%TUNNEL_LOG%" del /f /q "%TUNNEL_LOG%"

    REM Запуск туннеля в отдельном окне
    start "CloudflareTunnel" cmd /c "%CLOUDFLARED_PATH% tunnel --url http://localhost:%PORT% 2^>^&1 | findstr /C:^"trycloudflare.com^" > \"%TUNNEL_LOG%\" & pause"

    echo [OK] Cloudflare туннель запущен
    echo [INFO] Ожидание генерации URL...
    timeout /t 5 /nobreak >nul

    REM Читаем URL из лога
    if exist "%TUNNEL_LOG%" (
        for /f "delims=" %%a in (%TUNNEL_LOG%) do set TUNNEL_URL=%%a
        if defined TUNNEL_URL (
            echo.
            echo ============================================
            echo    TUNNEL URL
            echo ============================================
            echo !TUNNEL_URL!
            echo.
            echo URL также сохранён в: %TUNNEL_LOG%
            echo ============================================
            echo.
        ) else (
            echo [INFO] URL появится через несколько секунд...
            echo Проверьте: type "%TUNNEL_LOG%"
        )
    )
) else (
    echo ============================================
    echo    TUNNEL ОТКЛЮЧЁН
    echo ============================================
    echo cloudflared.exe не найден
    echo Для включения туннеля поместите cloudflared.exe в:
    echo %CLOUDFLARED_PATH%
    echo ============================================
)

echo.
echo ============================================
echo    ГОТОВО
echo ============================================
echo.
echo 🌐 Локальный URL: http://localhost:%PORT%/
if %USE_TUNNEL%==1 echo 🌍 Публичный URL: см. выше
echo.
echo 📁 Проект: %~dp0
echo 📝 Лог туннеля: %TUNNEL_LOG%
echo.
echo ⏹️  Для остановки:
echo    - Закройте окно "EtherResonance Server"
echo    - Или: taskkill /F /IM python.exe
echo.
echo ============================================
echo.

REM Открываем браузер
start http://localhost:%PORT%/

exit /b 0
