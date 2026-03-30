# 🎛️ Элементы управления

## Панель управления (#controls)

Расположение: левый нижний угол

### Чекбоксы

| ID | Переменная | Описание |
|----|------------|----------|
| `#follow` | `follow` | Следовать за мышью |

### Слайдеры

| ID | Переменная | Диапазон | По умолчанию | Проблема |
|----|------------|----------|--------------|----------|
| `#speed` | `ts` | 0–100 | 30 | ✅ OK |
| `#count` | `orgCount` | 1–5 | 3 | ✅ OK |
| `#size` | `orgSize` | 50–150 | 100 | ✅ OK |
| `#particles` | `particleDensity` | 0–100 | 60 | ⚠️ Нелинейный |
| `#pk` | `P.k` | 2–20 | 8 | ⚠️ Нелинейный |
| `#pe` | `P.e` | 5–50 | 24 | ⚠️ Нелинейный |
| `#pq` | `P.q` | 20–200 | 90 | ⚠️ Нелинейный |

### Кнопки

| Функция | Описание |
|---------|----------|
| `rnd()` | Случайная мутация параметров |
| `rst()` | Сброс к исходным значениям |

## Конфиг-панель слоёв (#layer-config)

Расположение: правый нижний угол (над формулами)

### Тогглы

| ID | Переменная | По умолчанию |
|----|------------|--------------|
| `#toggle-particles` | `showParticles` | ✅ true |
| `#toggle-lines` | `showLines` | ✅ true |
| `#toggle-tentacles` | `showTentacles` | ✅ true |
| `#toggle-core` | `showCore` | ✅ true |
| `#toggle-glow` | `showGlow` | ⏳ false (новый) |

## Панель формул (#formulas)

Расположение: правый нижний угол

Отображает текущие значения параметров в реальном времени:
- `k = x / <fk>`
- `e = cos(k) + sin(y / <fe>) + cos(k / 2)`
- `q = x / 4 + <fq> + ...`

## Проблемы UI/UX

### 1. Нелинейность ползунков

**Симптомы:**
- Тянешь 0→50 — огромные изменения
- Тянешь 50→100 — почти ничего не меняется

**Причина:** Параметры входят в формулы нелинейно:
- `P.k` и `P.e` — в знаменателе (обратная зависимость)
- `P.q` — линейная добавка, но влияет на множитель `q`

**Решение:**

```javascript
// Для P.k (обратная шкала)
document.getElementById('pk').addEventListener('input', function(e) {
    let value = e.target.value / 100;  // 0–1
    P.k = 2 + (18 * value);  // 2–20 линейно
    // ИЛИ экспоненциально:
    // P.k = 2 * Math.pow(10, value * Math.log10(10));
});

// Для P.e (обратная шкала)
document.getElementById('pe').addEventListener('input', function(e) {
    let value = e.target.value / 100;  // 0–1
    P.e = 5 + (45 * value);  // 5–50 линейно
});

// Для P.q (линейная, но с запасом)
document.getElementById('pq').addEventListener('input', function(e) {
    let value = e.target.value / 100;  // 0–1
    P.q = 20 + (180 * value);  // 20–200 линейно
});
```

### 2. Слайдер частиц

**Проблема:** `stepMultiplier = 100 / (particleDensity + 1)`

При `particleDensity = 0` → `stepMultiplier = 100` (очень мало частиц)
При `particleDensity = 100` → `stepMultiplier = ~1` (много частиц)

**Решение:** Использовать экспоненциальную шкалу:
```javascript
let stepMultiplier = Math.pow(100, 1 - particleDensity / 100);
```

## Предложения по улучшению GUI

### 1. Разделение панелей

```
#controls-left   — Основные настройки (слева)
#controls-right  — Параметры формул (справа)
#layer-config    — Слои (центр внизу)
#presets         — Пресеты (новая панель)
```

### 2. Пресеты

```javascript
let presets = [
    { name: "Default", P: {k: 8, e: 24, q: 90} },
    { name: "Wide", P: {k: 4, e: 48, q: 150} },
    { name: "Compact", P: {k: 12, e: 12, q: 60} }
];

function savePreset(slot) {
    localStorage.setItem(`preset_${slot}`, JSON.stringify(P));
}

function loadPreset(slot) {
    P = JSON.parse(localStorage.getItem(`preset_${slot}`));
}
```

### 3. Горячие клавиши

```javascript
document.addEventListener('keydown', function(e) {
    if (e.key === '1') showParticles = !showParticles;
    if (e.key === '2') showLines = !showLines;
    if (e.key === '3') showTentacles = !showTentacles;
    if (e.key === '4') showCore = !showCore;
    if (e.key === '5') showGlow = !showGlow;
    if (e.key === 'r') rst();
    if (e.key === 'e') rnd();
});
```

### 4. Индикатор FPS

```javascript
let fps = 0;
let frameCount = 0;
let lastTime = millis();

function draw() {
    frameCount++;
    if (millis() - lastTime >= 1000) {
        fps = frameCount;
        frameCount = 0;
        lastTime = millis();
    }
    // Отображать в UI
}
```

## Задачи для Агента 2

- [ ] Добавить тоггл свечения (#toggle-glow)
- [ ] Исправить нелинейность всех ползунков
- [ ] Добавить панель пресетов
- [ ] Добавить горячие клавиши
- [ ] Добавить индикатор FPS
- [ ] Разделить панели (левая/правая)
