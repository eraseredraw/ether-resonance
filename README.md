# 🧬 ETHER RESONANCE

**Интерактивная визуализация тригонометрических организмов на Three.js**

[![Version](https://img.shields.io/badge/version-4.0-blue.svg)](https://github.com/yourusername/ether-resonance)
[![Three.js](https://img.shields.io/badge/three.js-r160-black.svg)](https://threejs.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

![Ether Resonance](docs/screenshot.png)

---

## 🌟 Особенности

- **40,000 частиц** при 60 FPS
- **8 математических формул** (sphere, cube, torus, helix, jellyfish, vortex...)
- **Zero GC оптимизация** — 0-2 сборки мусора в секунду
- **Адаптивное качество** — автоматическая подстройка под FPS
- **Полный контроль** — настройки частиц, формул, камеры, эффектов

---

## 🚀 Быстрый старт

### Вариант 1: Лаунчер (Windows, рекомендуется)

```bash
# Скачать проект
git clone https://github.com/yourusername/ether-resonance.git
cd ether-resonance

# Запустить лаунчер
run.bat
```

### Вариант 2: Python сервер

```bash
# Запустить сервер
python server.py

# Открыть в браузере
http://localhost:8080/
```

### Вариант 3: npm

```bash
# Установить зависимости
npm install

# Запустить
npm start
```

---

## 🎮 Управление

| Действие | Управление |
|----------|------------|
| **Вращение** | ЛКМ + drag |
| **Зум** | Колёсико |
| **Панели** | Tab (скрыть/показать) |
| **HUD** | ☰ (справа вверху) |
| **Controls** | ⚙️ (слева вверху) |
| **Пауза** | Пробел |
| **Случайная форма** | R |
| **Сброс камеры** | C |

---

## 📁 Структура проекта

```
ether-resonance/
├── index-3d.html              # 🔴 Главный файл (весь код здесь)
├── server.py                  # HTTP сервер с Gzip
├── run.bat                    # Лаунчер с меню
├── package.json               # npm зависимости
│
├── shaders/                   # GLSL шейдеры
│   ├── particleVertex.glsl    # Vertex shader (8 формул)
│   └── particleFragment.glsl  # Fragment shader
│
├── docs/                      # Документация
├── logs/                      # Бенчмарки и логи
│   ├── BENCHMARK.md
│   ├── CHANGELOG.md
│   └── OPTIMIZATION_GUIDE.md
│
└── README.md                  # Этот файл
```

---

## 🔧 Технологии

| Компонент | Технология |
|-----------|------------|
| **Рендеринг** | Three.js r160 + WebGL |
| **Сервер** | Python 3.8+ (Gzip, Keep-Alive) |
| **Шейдеры** | GLSL (vertex + fragment) |
| **Частицы** | BufferGeometry (40K @ 60 FPS) |
| **Пост-процессинг** | EffectComposer + UnrealBloomPass |

---

## 📊 Производительность

| Метрика | Значение |
|---------|----------|
| **Частицы** | 40,000 |
| **FPS** | 60 (stable) |
| **GPU load** | 40-50% |
| **Memory** | ~175 MB |
| **GC/sec** | 0-2 |

### Оптимизации

- ✅ Zero GC — переиспользование объектов
- ✅ Gzip сжатие — 66% экономии трафика
- ✅ Keep-Alive — мгновенные повторные запросы
- ✅ Адаптивное качество Bloom — автоподстройка под FPS
- ✅ GLSL оптимизации — константы, precompute

---

## 🎯 Задачи агентов

### Агент 1 🧮 (Math Core)
- Математические формулы
- Параметры P={k, e, q}
- Физические взаимодействия

**Файлы:** `TASKS_AGENT_1.md`, `AGENT_1_MATH_CORE.md`

### Агент 2 🎨 (Visual/UI)
- Визуальные эффекты
- UI/UX
- Цветовые режимы

**Файлы:** `TASKS_AGENT_2.md`, `AGENT_2_VISUAL_UI.md`

### Агент 3 ⚡ (WebGL/Performance)
- Three.js/WebGL
- Zero GC оптимизация
- Бенчмарки

**Файлы:** `TASKS_AGENT_3.md`, `AGENT_3_PERFORMANCE_WEBGL.md`

---

## 📚 Документация

| Файл | Описание |
|------|----------|
| [START_HERE.md](./START_HERE.md) | Введение в проект |
| [README_AGENTS.md](./README_AGENTS.md) | Гид для новых агентов |
| [MATH_CORE.md](./MATH_CORE.md) | Математическое ядро (7 уравнений) |
| [VISUAL_LAYERS.md](./VISUAL_LAYERS.md) | Визуальные слои |
| [UI_CONTROLS.md](./UI_CONTROLS.md) | Элементы управления |
| [OPTIMIZATION_GUIDE.md](./logs/OPTIMIZATION_GUIDE.md) | Гайд по оптимизациям |
| [CHANGELOG.md](./logs/CHANGELOG.md) | История изменений |

---

## 🛠️ Разработка

### Требования

- Python 3.8+
- Node.js 16+ (опционально)
- Современный браузер (Chrome, Firefox, Edge)

### Запуск в режиме разработки

```bash
# Python сервер (с автоперезагрузкой)
python server.py

# Или через npm
npm install
npm start
```

### Проверка gzip

Откройте DevTools (F12) → Network → проверьте заголовок:
```
Content-Encoding: gzip
```

### Бенчмарки

```bash
# Откройте консоль браузера (F12)
console.log('FPS:', fps);
console.log('Particles:', particleCount);
console.log('Memory:', performance.memory.usedJSHeapSize / 1048576, 'MB');
```

---

## 🌐 Cloudflare Tunnel

Для доступа из интернета:

```bash
# Windows
tunnel.bat

# Или через лаунчер
run.bat → [3] Запуск только туннель
```

URL появится в `logs/tunnel_current.log`

---

## 📝 Лицензия

MIT License — см. [LICENSE](LICENSE)

---

## 🙏 Благодарности

- **Three.js** — WebGL библиотека
- **Cloudflare** — туннели
- **p5.js** — вдохновение для 2D версии

---

## 📬 Контакты

- **GitHub:** [@yourusername](https://github.com/yourusername)
- **Demo:** [Live Demo](https://yourusername.github.io/ether-resonance/)

---

*Последнее обновление: 25.03.2026*  
*Версия: 4.0*
