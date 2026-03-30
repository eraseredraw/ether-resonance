#!/bin/bash
# Быстрый запуск Cloudflare Tunnel для ether-resonance

PORT=${1:-8080}

echo "🚀 Запуск сервера на порту $PORT..."
python server.py &
SERVER_PID=$!

sleep 2

echo "🌐 Создание Cloudflare Tunnel..."
../cloudflared.exe tunnel --url http://localhost:$PORT 2>&1 | tee logs/tunnel.log &
TUNNEL_PID=$!

echo ""
echo "✅ Сервер (PID: $SERVER_PID) и туннель (PID: $TUNNEL_PID) запущены"
echo "📋 URL появится в logs/tunnel.log через ~5 сек"
echo ""
echo "⏹️  Для остановки: Ctrl+C или taskkill /F /PID $SERVER_PID $TUNNEL_PID"
