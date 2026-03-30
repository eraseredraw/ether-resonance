@echo off
REM ============================================
REM ETHER RESONANCE — Cloudflare Tunnel
REM ============================================
REM Запуск только туннеля к существующему серверу
REM ============================================

setlocal EnableDelayedExpansion

set PORT=%1
if "%PORT%"=="" set PORT=8080
set LOG_DIR=%~dp0logs
set TUNNEL_LOG=%LOG_DIR%\tunnel_current.log

REM Создаём директорию для логов
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo.
echo ============================================
echo    CLOUDFLARE TUNNEL
echo ============================================
echo.

REM Проверка cloudflared
set CLOUDFLARED_PATH=%~dp0..\cloudflared.exe
if not exist "%CLOUDFLARED_PATH%" (
    echo [ОШИБКА] cloudflared.exe не найден!
    echo Путь: %CLOUDFLARED_PATH%
    echo.
    echo Скачайте cloudflared:
    echo https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/
    pause
    exit /b 1
)

echo [OK] cloudflared найден
echo [INFO] Порт: %PORT%
echo.

REM Проверка доступности сервера
curl -s -o nul http://localhost:%PORT%/ >nul 2>&1
if %errorlevel% neq 0 (
    echo [ОШИБКА] Сервер на localhost:%PORT% не отвечает!
    echo Сначала запустите: python server.py
    pause
    exit /b 1
)

echo [OK] Сервер доступен
echo.
echo ============================================
echo    ЗАПУСК ТУННЕЛЯ
echo ============================================
echo.
echo [INFO] Создание туннеля...
echo [INFO] URL появится через 3-5 секунд...
echo.

REM Очищаем старый лог
if exist "%TUNNEL_LOG%" del /f /q "%TUNNEL_LOG%"

REM Запуск туннеля с выводом URL
%CLOUDFLARED_PATH% tunnel --url http://localhost:%PORT% 2>&1 | findstr /C:"trycloudflare.com" > "%TUNNEL_LOG%"

REM Читаем URL
if exist "%TUNNEL_LOG%" (
    for /f "delims=" %%a in (%TUNNEL_LOG%) do set TUNNEL_URL=%%a
    if defined TUNNEL_URL (
        echo.
        echo ============================================
        echo    PUBLIC URL
        echo ============================================
        echo !TUNNEL_URL!
        echo ============================================
        echo.
        echo URL сохранён в: %TUNNEL_LOG%
        echo.
        echo Для копирования в буфер:
        echo   clip ^< "%TUNNEL_LOG%"
        echo.
    )
)

echo ⏹️  Нажмите Ctrl+C для остановки туннеля
pause
