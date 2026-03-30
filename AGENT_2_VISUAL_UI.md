# 🎨 АГЕНТ 2 — ЗОНА ОТВЕТСТВЕННОСТИ: ВИЗУАЛ, UI/UX, ЭФФЕКТЫ

## 📋 ОБЩАЯ ИНФОРМАЦИЯ

**Роль:** Художник-разработчик визуальных эффектов и пользовательского интерфейса  
**Файл для работы:** `index.html` (секции: рендеринг, UI, эффекты)  
**Стиль работы:** TDD → Визуальная проверка → Рефакторинг → Документирование

---

## 🎯 ЗОНЫ ОТВЕТСТВЕННОСТИ

### ✅ ЧТО ДЕЛАЕТ АГЕНТ 2:

| Область | Описание | Файлы/Функции |
|---------|----------|---------------|
| **Визуализация частиц** | Рендеринг точек, цвета, размеры, прозрачность | `drawParticles()`, `colors`, `sizes` |
| **Слои рендеринга** | Тогглы: particles, lines, tentacles, core, glow | `showParticles`, `showLines`, `showTentacles`, `showCore`, `showGlow` |
| **UI/UX элементы** | Слайдеры, кнопки, панели, HUD | `#controls`, `#hud`, `#layer-config` |
| **Цветовые режимы** | Rainbow, Single Hue, White, Cyan, Plasma | `particleColorMode`, `hueOffset` |
| **Эффекты** | Glow, shadow, blending, opacity | CSS `.glow-active`, `globalAlpha` |
| **Экспорт кода** | Генерация и скачивание кода симуляции | `showExport()`, `copyExport()`, `downloadExport()` |
| **Анимация UI** | Плавные переходы, hover-эффекты | CSS transitions, keyframes |
| **Производительность** | FPS counter, оптимизация рендера | `#fps`, `requestAnimationFrame` |
| **Горячие клавиши** | 1-5 для слоёв, F для fullscreen, R для reset | `keyPressed()` |
| **Пресеты** | Сохранение/загрузка настроек в localStorage | `savePreset()`, `loadPreset()` |

---

## 🚫 ЧТО НЕ ДЕЛАЕТ АГЕНТ 2:

| Область | Ответственный |
|---------|---------------|
| Математическое ядро `calc(x, y, time, scale)` | **Агент 1** |
| Параметры формул `P = {k, e, q}` | **Агент 1** |
| Генерация точек сетки `sidePoints[]` | **Агент 1** |
| Логика перетаскивания организмов (координаты) | **Агент 1** |
| Вращение организмов (математика углов) | **Агент 1** |
| Вариации формул (новые паттерны) | **Агент 1** |

---

## 🎨 ВИЗУАЛЬНЫЕ СЛОИ (ДЕТАЛИ)

### 1. Структура слоёв

```javascript
// Глобальные флаги (изменяет Агент 2)
let showParticles = true;   // Отображение частиц
let showLines = false;      // Линии между точками
let showTentacles = true;   // Щупальца организма
let showCore = true;        // Ядро организма
let showGlow = false;       // CSS glow-эффект
```

### 2. Порядок рендеринга

```
┌─────────────────────────────────────────────────────────┐
│ 1. showCore → Ядро (круг в центре организма)            │
│    - fill(255, 200)                                     │
│    - noStroke()                                         │
│    - ellipse(org.x, org.y, 20, 20)                      │
├─────────────────────────────────────────────────────────┤
│ 2. showLines → Линии между точками сетки                │
│    - stroke(255, 100)                                   │
│    - line(x1, y1, x2, y2)                               │
│    - Соединение соседних точек по X и Y                 │
├─────────────────────────────────────────────────────────┤
│ 3. showParticles → Частицы (основной слой)              │
│    - noStroke()                                         │
│    - fill(r, g, b, alpha)                               │
│    - ellipse(x, y, size, size)                          │
│    - Цвет из colorMode, размер от y-координаты          │
├─────────────────────────────────────────────────────────┤
│ 4. showTentacles → Щупальца (дополнительный эффект)     │
│    - Кривые Безье от центра к краям                     │
│    - stroke(255, 150)                                   │
│    - bezierVertex() для плавности                       │
├─────────────────────────────────────────────────────────┤
│ 5. showGlow → CSS эффект (не canvas)                    │
│    - canvas.classList.toggle('glow-active', showGlow)   │
│    - filter: drop-shadow(0 0 25px rgba(0,255,255,0.5))  │
└─────────────────────────────────────────────────────────┘
```

---

## 🌈 ЦВЕТОВЫЕ РЕЖИМЫ

### 1. Rainbow (радужный)

```javascript
function getParticleColor(p, index, total) {
    if (particleColorMode === 'rainbow') {
        const hue = (hueOffset + (index / total) * 360) % 360;
        return color(`hsl(${hue}, 80%, 60%)`);
    }
}
```

### 2. Single Hue (один оттенок)

```javascript
if (particleColorMode === 'hue') {
    const hue = (hueOffset + p.x * 0.05) % 360;
    const saturation = 70;
    const lightness = 70;
    return color(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
}
```

### 3. Plasma (огненный градиент)

```javascript
if (particleColorMode === 'plasma') {
    const intensity = map(p.y, 0, GY * STEP, 255, 100);
    return color(intensity, intensity * 0.5, 0, p.alpha);
}
```

### 4. White / Cyan

```javascript
if (particleColorMode === 'white') {
    return color(255, 255, 255, p.alpha);
}
if (particleColorMode === 'cyan') {
    return color(0, 255, 255, p.alpha);
}
```

---

## 🎛️ UI/UX ЭЛЕМЕНТЫ

### 1. Панель управления `#controls`

**Расположение:** Левый нижний угол  
**Стиль:** Тёмный фон, cyan акценты, backdrop-filter

```html
<div id="controls">
    <h3>⚙️ Simulation Controls</h3>
    
    <!-- Слайдеры -->
    <div class="row">
        <label>⏱️ Time Speed:</label>
        <input type="range" id="speed" min="0" max="100" value="30">
    </div>
    
    <!-- Кнопки -->
    <div class="section">
        <button onclick="rnd()">🎲 Evolve</button>
        <button onclick="rst()">⟳ Reset</button>
        <button onclick="showExport()">📤 Export</button>
    </div>
</div>
```

### 2. Конфиг-панель слоёв `#layer-config`

**Расположение:** Правый нижний угол

```html
<div id="layer-config">
    <h4>LAYERS</h4>
    <div class="row">
        <label><input type="checkbox" id="toggle-particles" checked> Particles</label>
    </div>
    <div class="row">
        <label><input type="checkbox" id="toggle-lines"> Lines</label>
    </div>
    <div class="row">
        <label><input type="checkbox" id="toggle-tentacles" checked> Tentacles</label>
    </div>
    <div class="row">
        <label><input type="checkbox" id="toggle-core" checked> Core</label>
    </div>
    <div class="row">
        <label><input type="checkbox" id="toggle-glow"> Glow</label>
    </div>
</div>
```

### 3. HUD `#hud`

**Расположение:** Левый верхний угол

```html
<div id="hud">
    <h1>🧬 ETHER RESONANCE</h1>
    <div class="stats">
        Particles: <span id="particle-count">0</span><br>
        FPS: <span id="fps-display">0</span><br>
        Formula: <span id="formula-name">Original</span>
    </div>
</div>
```

### 4. Панель формул `#formulas`

**Расположение:** Правый нижний угол (рядом с layer-config)

```html
<div id="formulas">
    <div><span class="var">k</span> = x / <span id="fk">8</span> - 12.5</div>
    <div><span class="var">e</span> = <span class="func">cos</span>(<span class="var">k</span>) + <span class="func">sin</span>(y / <span id="fe">24</span>) + <span class="func">cos</span>(<span class="var">k</span> / 2)</div>
    <!-- ... остальные уравнения ... -->
</div>
```

---

## ⚡ ПРОИЗВОДИТЕЛЬНОСТЬ

### 1. FPS Counter

```javascript
let frameCount = 0;
let lastFpsTime = performance.now();
let fps = 0;

function updateFPS() {
    frameCount++;
    const now = performance.now();
    if (now - lastFpsTime >= 1000) {
        fps = frameCount;
        frameCount = 0;
        lastFpsTime = now;
        document.getElementById('fps-counter').textContent = fps;
        document.getElementById('fps-display').textContent = fps;
    }
}
```

### 2. Оптимизация рендера частиц

**ПЛОХО (каждый кадр):**
```javascript
for (let p of points) {
    const size = map(p.y, 0, GY*STEP, 2, 0.5);  // Вычисление в цикле!
    const alpha = map(p.y, 0, GY*STEP, 255, 100);
    ellipse(p.X, p.Y, size, size);
}
```

**ХОРОШО (пре-расчёт):**
```javascript
// В setup() один раз
let sidePointsWithProps = [];
for (let p of sidePoints) {
    sidePointsWithProps.push({
        x: p.x,
        y: p.y,
        baseSize: map(p.y, 0, GY*STEP, 2, 0.5),
        baseAlpha: map(p.y, 0, GY*STEP, 255, 100)
    });
}

// В draw() только рендер
for (let p of points) {
    ellipse(p.X, p.Y, p.baseSize, p.baseSize);
}
```

### 3. Trail Effect (шлейф частиц)

```javascript
// Вместо полной очистки
// background(0);

// Полупрозрачный фон для шлейфа
background(0, 50);  // 50 = прозрачность 20%

// Или использовать отдельный canvas для шлейфа
let trailCanvas = createGraphics(width, height);
trailCanvas.background(0, 30);
trailCanvas.image(mainCanvas, 0, 0);
```

---

## ⌨️ ГОРЯЧИЕ КЛАВИШИ

### Реализация в `keyPressed()`

```javascript
function keyPressed() {
    // Слои (1-5)
    if (key === '1') {
        showParticles = !showParticles;
        document.getElementById('toggle-particles').checked = showParticles;
    }
    if (key === '2') {
        showLines = !showLines;
        document.getElementById('toggle-lines').checked = showLines;
    }
    if (key === '3') {
        showTentacles = !showTentacles;
        document.getElementById('toggle-tentacles').checked = showTentacles;
    }
    if (key === '4') {
        showCore = !showCore;
        document.getElementById('toggle-core').checked = showCore;
    }
    if (key === '5') {
        showGlow = !showGlow;
        document.getElementById('toggle-glow').checked = showGlow;
        canvas.classList.toggle('glow-active', showGlow);
    }
    
    // Fullscreen
    if (key === 'f' || key === 'F' || key === 'а' || key === 'А') {
        toggleFullscreen();
    }
    
    // Reset rotation (R)
    if (key === 'r' || key === 'R' || key === 'к' || key === 'К') {
        resetRotation();
    }
    
    // Случайная формула (Space)
    if (keyCode === 32) {
        formulaVariant = floor(random(8));
        document.getElementById('formula-select').value = formulaVariant;
    }
}
```

---

## 💾 ПРЕСЕТЫ (LOCALSTORAGE)

### Сохранение настроек

```javascript
function savePreset(slot) {
    const preset = {
        P: { k: P.k, e: P.e, q: P.q },
        formulaVariant: formulaVariant,
        particleColorMode: particleColorMode,
        hueOffset: hueOffset,
        showGlow: showGlow,
        baseSize: baseSize,
        orgCount: orgCount,
        savedAt: new Date().toISOString()
    };
    localStorage.setItem(`etherPreset_${slot}`, JSON.stringify(preset));
    console.log(`Preset ${slot} saved!`);
}
```

### Загрузка настроек

```javascript
function loadPreset(slot) {
    const data = localStorage.getItem(`etherPreset_${slot}`);
    if (!data) {
        console.warn(`Preset ${slot} not found!`);
        return;
    }
    const preset = JSON.parse(data);
    
    // Восстановить параметры
    P.k = preset.P.k;
    P.e = preset.P.e;
    P.q = preset.P.q;
    formulaVariant = preset.formulaVariant;
    particleColorMode = preset.particleColorMode;
    hueOffset = preset.hueOffset;
    showGlow = preset.showGlow;
    baseSize = preset.baseSize;
    orgCount = preset.orgCount;
    
    // Обновить UI
    updateUIFromState();
    console.log(`Preset ${slot} loaded!`);
}
```

### UI для пресетов

```html
<div class="section">
    <div class="section-title">💾 Presets</div>
    <div class="row">
        <button onclick="savePreset(1)">💾 Save 1</button>
        <button onclick="loadPreset(1)">📂 Load 1</button>
    </div>
    <div class="row">
        <button onclick="savePreset(2)">💾 Save 2</button>
        <button onclick="loadPreset(2)">📂 Load 2</button>
    </div>
    <div class="row">
        <button onclick="savePreset(3)">💾 Save 3</button>
        <button onclick="loadPreset(3)">📂 Load 3</button>
    </div>
</div>
```

---

## 📤 ЭКСПОРТ КОДА

### Генерация кода симуляции

```javascript
function showExport() {
    const format = document.getElementById('export-format').value;
    let code = '';
    
    if (format === 'vanilla') {
        code = generateVanillaJS();
    } else if (format === 'react') {
        code = generateReact();
    } else if (format === 'module') {
        code = generateESModule();
    }
    
    document.getElementById('export-code').textContent = code;
    document.getElementById('export-panel').classList.add('active');
}

function generateVanillaJS() {
    return `// Ether Resonance — Vanilla JS Export
// Generated: ${new Date().toISOString()}

const P = { k: ${P.k.toFixed(2)}, e: ${P.e.toFixed(2)}, q: ${P.q.toFixed(2)} };
const formulaVariant = ${formulaVariant};

function calc(x, y, time, scale) {
    // ... формула ...
}

// Инициализация
function setup() {
    // ...
}

// Рендер
function draw() {
    // ...
}
`;
}

function copyExport() {
    const code = document.getElementById('export-code').textContent;
    navigator.clipboard.writeText(code);
    alert('Copied to clipboard!');
}

function downloadExport() {
    const code = document.getElementById('export-code').textContent;
    const blob = new Blob([code], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ether-resonance.js';
    a.click();
    URL.revokeObjectURL(url);
}
```

---

## 📝 ПРАВИЛА РАБОТЫ АГЕНТА 2

### 1. TDD Прежде Всего

```
1. Сначала тест (визуальная проверка в браузере)
2. Потом код (изменение рендера/UI)
3. Потом рефакторинг (оптимизация, документирование)
```

### 2. Визуальная Проверка

Перед коммитом проверить:
- [ ] Все слои переключаются корректно
- [ ] Цветовые режимы работают
- [ ] UI элементы отзывчивы
- [ ] FPS не падает ниже 55
- [ ] Горячие клавиши работают

### 3. Документирование

После каждого изменения:
- Обновить `VISUAL_LAYERS.md`
- Обновить `UI_CONTROLS.md`
- Добавить запись в `logs/CHANGELOG.md`
- Указать дату и версию

### 4. Взаимодействие с Агентом 1

- **Перед изменением:** Проверить `AGENTS_CHAT.md` на новые задачи
- **После изменения:** Написать отчёт в `AGENTS_CHAT.md`
- **Конфликты:** Обсудить в чате, не менять код Агента 1

---

## 🎯 ЗАДАЧИ АГЕНТА 2 (ПРИОРИТЕТЫ)

### P0 (Критично):
- [ ] Исправить FPS counter (обновлять каждую секунду)
- [ ] Добавить горячие клавиши (1-5 для слоёв)
- [ ] Пресеты форм (localStorage, 3 слота)

### P1 (Важно):
- [ ] Trail effect для частиц (полупрозрачный background)
- [ ] Улучшить glow (WebGL bloom или CSS filter)
- [ ] Цветные режимы (Plasma, Fire, Ice)

### P2 (Опционально):
- [ ] Миграция на Three.js + WebGL
- [ ] Редактор кода в браузере (Monaco Editor)
- [ ] Экспорт в React Component

---

## 🔗 СВЯЗАННЫЕ ФАЙЛЫ

| Файл | Описание |
|------|----------|
| `index.html` | Основной код (секции: рендер, UI, эффекты) |
| `VISUAL_LAYERS.md` | Документация слоёв |
| `UI_CONTROLS.md` | Элементы управления |
| `AGENTS_CHAT.md` | Коммуникация с Агентом 1 |
| `logs/CHANGELOG.md` | История изменений |

---

## 🎨 СТИЛЕВЫЕ ГАЙДЛАЙНЫ

### Цветовая палитра

```css
/* Основные цвета */
--cyan: #0ff;
--green: #0f8;
--blue: #0af;
--pink: #f8a;
--white: #fff;

/* Фоны */
--bg-dark: rgba(0, 10, 20, 0.7);
--bg-panel: rgba(0, 15, 25, 0.9);

/* Границы */
--border-cyan: rgba(0, 255, 255, 0.3);
--border-green: rgba(100, 255, 150, 0.35);
```

### Размеры шрифтов

```css
/* Заголовки */
h1 { font-size: 16px; }
h3 { font-size: 13px; }
h4 { font-size: 11px; }

/* Текст */
body { font-size: 12px; }
.stats { font-size: 10px; }
.formulas { font-size: 9px; }
```

### Анимации

```css
/* Плавные переходы */
button { transition: all 0.2s; }
button:hover {
    transform: translateY(-1px);
    box-shadow: 0 0 15px rgba(0, 255, 255, 0.4);
}

/* Пульсация */
@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
}
```

---

*Последнее обновление: 14.03.2026*  
*Версия документа: 1.0*
