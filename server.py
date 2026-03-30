#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Оптимизированный HTTP сервер для Ether Resonance
- Gzip сжатие
- Keep-Alive
- Кэширование статических файлов
- Async поддержка (при наличии)
"""
import http.server
import socketserver
import os
import gzip
import shutil
from io import BytesIO

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

# MIME типы
MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.glsl': 'text/plain; charset=utf-8',
    '.wasm': 'application/wasm',
}


class OptimizedHandler(http.server.SimpleHTTPRequestHandler):
    """Оптимизированный обработчик с gzip и кэшированием"""

    protocol_version = 'HTTP/1.1'  # Включаем Keep-Alive по умолчанию

    def end_headers(self):
        # Длительное соединение
        self.send_header('Connection', 'keep-alive')
        self.send_header('Keep-Alive', 'timeout=5, max=100')
        super().end_headers()

    def send_response(self, code, message=None):
        self.send_response_only(code, message)
        # Не отправляем заголовки сразу — даём отправить сжатыми

    def guess_type(self, path):
        ext = os.path.splitext(path)[1].lower()
        return MIME_TYPES.get(ext, 'application/octet-stream')

    def do_GET(self):
        # Перенаправляем корень на index-3d.html
        if self.path == '/':
            self.path = '/index-3d.html'

        # Проверяем поддержку gzip клиентом
        accepts_gzip = 'gzip' in self.headers.get('Accept-Encoding', '')

        filepath = os.path.join(DIRECTORY, self.path.lstrip('/'))

        # Файл не найден
        if not os.path.isfile(filepath):
            self.send_error(404, 'File not found')
            return

        # Определяем MIME тип
        content_type = self.guess_type(filepath)

        # Читаем файл
        try:
            with open(filepath, 'rb') as f:
                content = f.read()
        except Exception as e:
            self.send_error(500, str(e))
            return

        # Сжимаем gzip если клиент поддерживает и файл > 1KB
        if accepts_gzip and len(content) > 1024 and not filepath.endswith(('.png', '.jpg', '.gif', '.webp', '.ico')):
            buf = BytesIO()
            with gzip.GzipFile(fileobj=buf, mode='wb', compresslevel=6) as gz:
                gz.write(content)
            content = buf.getvalue()
            content_encoding = 'gzip'
        else:
            content_encoding = 'identity'

        # Отправляем ответ
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Content-Encoding', content_encoding)

        # Кэширование для HTML — отключаем, для остальных — включаем
        if filepath.endswith('.html'):
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
        else:
            self.send_header('Cache-Control', 'public, max-age=31536000')
            self.send_header('ETag', f'"{os.path.getmtime(filepath)}"')

        # CORS для локальной разработки
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

        self.end_headers()
        self.wfile.write(content)

    def do_OPTIONS(self):
        """Preflight запрос для CORS"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def log_message(self, format, *args):
        """Красивое логирование"""
        print(f"[{self.log_date_time_string()}] {args[0]} {args[1]} {args[2]}")


class ReusableTCPServer(socketserver.TCPServer):
    """Сервер с перезапуском сокета"""
    allow_reuse_address = True


if __name__ == '__main__':
    os.chdir(DIRECTORY)

    # Создаём сервер
    with ReusableTCPServer(('', PORT), OptimizedHandler) as httpd:
        print(f'\n{"="*50}')
        print(f'🚀 ETHER RESONANCE SERVER')
        print(f'{"="*50}')
        print(f'📡 Порт: {PORT}')
        print(f'📁 Директория: {DIRECTORY}')
        print(f'🌐 URL: http://localhost:{PORT}')
        print(f'🔥 Gzip: включён')
        print(f'🔗 Keep-Alive: включён')
        print(f'💾 Кэширование: включено')
        print(f'{"="*50}')
        print(f'Нажми Ctrl+C для остановки\n')

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\n⏹️  Сервер остановлен')
