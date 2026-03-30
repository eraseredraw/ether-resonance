# 🎨 Визуальные слои

## Архитектура рендеринга

Каждый организм рисуется функцией `drawOrganism(cx, cy, time, scale)`.

Слои рендерятся последовательно (порядок важен!):

```
1. Частицы (particles)  — базовая форма
2. Линии (lines)        — связи между точками
3. Щупальца (tentacles) — внешние нити
4. Ядро (core)          — центральный свет
5. Свечение (glow)      — пост-эффект ⏳
```

## Слой 1: Частицы (particles)

**Текущая реализация:**
```javascript
if (showParticles) {
    let stepMultiplier = 100 / (particleDensity + 1);
    noStroke();
    for (let i = 0; i < sidePoints.length; i += Math.ceil(stepMultiplier)) {
        let p = sidePoints[i];
        let pt = calc(p.x * scale, p.y * scale, time, 1);
        let alpha = map(p.y, 0, GY * STEP, 255, 30);
        let size = map(p.y, 0, GY * STEP, 2.5, 0.5);
        
        // Y+ сторона
        fill(255, alpha);
        ellipse(cx + pt.X - 200 * scale, cy + pt.Y - 200 * scale, size, size);
        
        // Y- зеркало
        ellipse(cx + pt.X - 200 * scale, cy - (pt.Y - 200 * scale), size * 0.8, size * 0.8);
    }
}
```

### Параметры

| Параметр | Диапазон | Влияние |
|----------|----------|---------|
| `particleDensity` | 0–100 | Количество частиц (чем больше, тем меньше шаг) |
| `alpha` | 30–255 | Прозрачность (ярче в центре) |
| `size` | 0.5–2.5 | Размер (крупнее в центре) |

### Проблемы

1. **Расчёт в draw()** — `alpha` и `size` считаются каждый кадр
2. **Нет цвета** — только белый (255)
3. **Нет свечения** — частицы плоские

### Предложения по оптимизации

**Вариант 1: Предварительный расчёт**
```javascript
// В setup():
let cachedParticles = [];
for (let p of sidePoints) {
    cachedParticles.push({
        x: p.x,
        y: p.y,
        alpha: map(p.y, 0, GY * STEP, 255, 30),
        size: map(p.y, 0, GY * STEP, 2.5, 0.5)
    });
}

// В draw() — только рендер:
for (let cp of cachedParticles) {
    let pt = calc(cp.x * scale, cp.y * scale, time, 1);
    fill(255, cp.alpha);
    ellipse(...);
}
```

**Вариант 2: Off-screen буфер**
```javascript
let particleBuffer;

function setup() {
    particleBuffer = createGraphics(width, height);
    // Рендер частиц один раз на буфер
}

function draw() {
    image(particleBuffer, 0, 0);
}
```

## Слой 2: Линии (lines)

**Текущая реализация:**
```javascript
if (showLines) {
    stroke(255, 80);
    strokeWeight(0.5);
    let lineStep = Math.max(1, Math.floor(100 / (particleDensity + 1)));
    
    for (let yi = 0; yi <= GY; yi += lineStep) {
        let y = yi * STEP;
        
        // Y+ сторона
        beginShape();
        for (let xi = 0; xi <= GX * 2; xi += 2) {
            let x = (xi - GX) * STEP;
            let pt = calc(x * scale, y * scale, time, 1);
            vertex(cx + pt.X - 200 * scale, cy + pt.Y - 200 * scale);
        }
        endShape();
        
        // Y- зеркало
        beginShape();
        // ... аналогично
    }
}
```

### Параметры

| Параметр | Значение | Влияние |
|----------|----------|---------|
| `stroke` | 255, 80 | Белый, 30% прозрачность |
| `strokeWeight` | 0.5 | Толщина линии |
| `lineStep` | 1–5 | Шаг между линиями |

## Слой 3: Щупальца (tentacles)

**Текущая реализация:**
```javascript
if (showTentacles) {
    stroke(255, 60);
    strokeWeight(0.6);
    
    for (let i = 0; i < TENT_COUNT; i++) {
        let baseAngle = (i / TENT_COUNT) * TWO_PI;
        
        beginShape();
        for (let len = 0; len <= TENT_LEN; len += TENT_STEP) {
            let tx = Math.cos(baseAngle) * len * scale;
            let ty = Math.sin(baseAngle) * len * scale;
            
            // Волна
            let wave = Math.sin(len * 0.05 + time * 0.3) * (len * 0.2 * scale);
            
            // Перпендикулярное смещение
            let px = -Math.sin(baseAngle) * wave;
            let py = Math.cos(baseAngle) * wave;
            
            let alpha = map(len, 0, TENT_LEN, 60, 0);
            stroke(255, alpha);
            vertex(cx + tx + px, cy + ty + py);
        }
        endShape();
    }
}
```

### Параметры

| Параметр | Значение | Влияние |
|----------|----------|---------|
| `TENT_COUNT` | 30 | Количество щупалец |
| `TENT_LEN` | 120 | Длина щупальца |
| `TENT_STEP` | 6 | Шаг сегментов |
| `wave` | sin(len*0.05 + time*0.3) | Анимация волны |

## Слой 4: Ядро (core)

**Текущая реализация:**
```javascript
if (showCore) {
    noStroke();
    
    // Внешнее свечение
    fill(255, 40);
    ellipse(cx, cy, 25 * scale, 25 * scale);
    
    // Внутреннее ядро
    fill(255, 200);
    ellipse(cx, cy, 6 * scale, 6 * scale);
}
```

### Параметры

| Элемент | Размер | Прозрачность |
|---------|--------|--------------|
| Внешнее свечение | 25 * scale | 40/255 (16%) |
| Внутреннее ядро | 6 * scale | 200/255 (78%) |

## Слой 5: Свечение (glow) ⏳

**Планируемая реализация:**

```javascript
let showGlow = true;  // Новый флаг

if (showGlow) {
    // CSS filter или WebGL bloom
}
```

### Варианты реализации

**1. CSS filter (просто, но не настоящее свечение):**
```css
canvas {
    filter: drop-shadow(0 0 20px rgba(255, 255, 255, 0.5));
}
```

**2. WebGL + bloom shader (сложно, но красиво):**
```javascript
// Использовать p5.js WebGL renderer
function setup() {
    createCanvas(windowWidth, windowHeight, WEBGL);
}
```

**3. Пост-процессинг в 2D:**
```javascript
// Рендер в буфер, затем размытие и наложение
let glowBuffer = createGraphics(width, height);
// ... blur + additive blend
```

## Флаги слоёв

```javascript
let showParticles = true;   // Тоже 1
let showLines = true;       // ⏳ Предлагаем false по умолчанию
let showTentacles = true;
let showCore = true;
let showGlow = false;       // ⏳ Новый флаг
```

## Задачи для Агента 2

- [ ] Добавить тоггл для свечения (showGlow)
- [ ] Оптимизировать частицы (кэширование size/alpha)
- [ ] Добавить цветные частицы (HSL/градиент)
- [ ] Исправить нелинейность слайдера частиц
- [ ] Увеличить GUI (больше панелей, пресеты)
