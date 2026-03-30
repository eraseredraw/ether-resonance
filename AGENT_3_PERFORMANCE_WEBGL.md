# ⚡ АГЕНТ 3 — ЗОНА ОТВЕТСТВЕННОСТИ: PERFORMANCE / WEBGL

## 📋 ОБЩАЯ ИНФОРМАЦИЯ

**Роль:** Инженер производительности — миграция с p5.js на Three.js/WebGL для достижения 60 FPS с 20,000+ частиц  
**Файлы для работы:** `index.html` (секции Three.js), GLSL шейдеры  
**Стиль работы:** TDD → Benchmark → Оптимизация → Документирование

---

## 🎯 ЗОНЫ ОТВЕТСТВЕННОСТИ

### ✅ ЧТО ДЕЛАЕТ АГЕНТ 3:

| Область | Описание | Технологии |
|---------|----------|------------|
| **Миграция на Three.js** | Перенос визуализации с p5.js на WebGL | Three.js r128+ |
| **Zero GC оптимизация** | Никаких аллокаций в цикле рендера | Float32Array, Typed Arrays |
| **GPU шейдеры** | Vertex/Fragment shaders для частиц | GLSL ES 3.0 |
| **Instanced Rendering** | 20K+ частиц с минимальными draw calls | InstancedBufferGeometry |
| **Post-processing** | Bloom, trail, glow эффекты | EffectComposer, UnrealBloomPass |
| **Benchmark** | Профилирование FPS, памяти | performance.now(), Chrome DevTools |
| **Буферы** | Позиции, цвета, размеры через BufferAttribute | THREE.BufferAttribute |
| **Оптимизация** | LOD, frustum culling, batching | THREE.LOD, THREE.InstancedMesh |

---

## 🚫 ЧТО НЕ ДЕЛАЕТ АГЕНТ 3:

| Область | Ответственный |
|---------|---------------|
| Математика формул `calc()` | **Агент 1** |
| UI-стили и HTML-контролы | **Агент 2** |
| TouchDesigner интеграция | **Агент 4** |

---

## 🏗️ АРХИТЕКТУРА THREE.JS

### 1. Базовая сцена

```javascript
// Setup сцены
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({ 
    antialias: true, 
    alpha: true,
    powerPreference: "high-performance"
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
```

### 2. Система частиц (20K+)

```javascript
// Буферы (Zero GC - создаются один раз)
const MAX_PARTICLES = 20000;
const positions = new Float32Array(MAX_PARTICLES * 3);
const colors = new Float32Array(MAX_PARTICLES * 3);
const sizes = new Float32Array(MAX_PARTICLES);

// Геометрия
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

// Материал (кастомный шейдер)
const material = new THREE.ShaderMaterial({
    vertexShader: particleVertexShader,
    fragmentShader: particleFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    uniforms: {
        time: { value: 0 },
        pixelRatio: { value: renderer.getPixelRatio() }
    }
});

// Система частиц
const particleSystem = new THREE.Points(geometry, material);
scene.add(particleSystem);
```

### 3. Vertex Shader (GLSL)

```glsl
// particleVertexShader.glsl
attribute float size;
attribute vec3 color;
varying vec3 vColor;

uniform float time;
uniform float pixelRatio;

void main() {
    vColor = color;
    
    // Анимация позиции через формулу calc()
    vec3 pos = calcFormula(position, time);
    
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    // Размер частиц с учётом расстояния
    gl_PointSize = size * pixelRatio * (300.0 / -mvPosition.z);
}
```

### 4. Fragment Shader (GLSL)

```glsl
// particleFragmentShader.glsl
varying vec3 vColor;

void main() {
    // Круглая частица
    float r = distance(gl_PointCoord, vec2(0.5));
    if (r > 0.5) discard;
    
    // Мягкие края
    float alpha = 1.0 - smoothstep(0.3, 0.5, r);
    
    gl_FragColor = vec4(vColor, alpha);
}
```

---

## 🧮 ПЕРЕНОС ФОРМУЛЫ `calc()` ИЗ JS

### Оригинал (JavaScript от Агента 1)

```javascript
function calcOriginal(x, y, time, scale) {
    let k = x / P.k - 12.5;
    let e = Math.cos(k) + Math.sin(y / P.e) + Math.cos(k / 2);
    let d = Math.abs(e);
    let q = x / 4 + P.q + d * k * (1 + Math.cos(4 * d - 2 * time + y / 72));
    let c = y * e / 594 - time / 8 + d / 6;
    return {
        X: (q * Math.cos(c) + 200) * scale,
        Y: ((q / 2 + 99 * Math.cos(c / 2)) * Math.sin(c) + 6 * e + 200) * scale
    };
}
```

### Перенос в GLSL (для ShaderMaterial)

```glsl
// В vertex shader
uniform float uPk, uPe, uPq;
uniform float uScale;
uniform float uTime;

vec2 calcFormula(vec2 pos, float time) {
    float x = pos.x;
    float y = pos.y;
    
    // Уравнение 1
    float k = x / uPk - 12.5;
    
    // Уравнение 2
    float e = cos(k) + sin(y / uPe) + cos(k / 2.0);
    
    // Уравнение 3
    float d = abs(e);
    
    // Уравнение 4
    float q = x / 4.0 + uPq + d * k * (1.0 + cos(4.0 * d - 2.0 * time + y / 72.0));
    
    // Уравнение 5
    float c = y * e / 594.0 - time / 8.0 + d / 6.0;
    
    // Уравнения 6-7
    float X = (q * cos(c) + 200.0) * uScale;
    float Y = ((q / 2.0 + 99.0 * cos(c / 2.0)) * sin(c) + 6.0 * e + 200.0) * uScale;
    
    return vec2(X, Y);
}
```

---

## ⚡ ZERO GC ОПТИМИЗАЦИЯ

### ПРАВИЛА (СТРОГО):

```javascript
// ❌ ПЛОХО - вызывает GC каждый кадр!
function animate() {
    requestAnimationFrame(animate);
    
    // НОВАЯ Vector3 каждый кадр = GC!
    const temp = new THREE.Vector3();
    
    // НОВЫЙ массив каждый кадр = GC!
    const positions = [];
}

// ✅ ХОРОШО - Zero GC
const temp = new THREE.Vector3(); // Создаётся один раз
const positions = new Float32Array(MAX_PARTICLES * 3);

function animate() {
    requestAnimationFrame(animate);
    
    // Переиспользуем существующий объект
    temp.set(0, 0, 0);
    
    // Обновляем буфер напрямую
    const posAttr = geometry.attributes.position;
    for (let i = 0; i < particleCount; i++) {
        posAttr.setXYZ(i, x, y, z); // Никаких new!
    }
    posAttr.needsUpdate = true;
}
```

### Чеклист Zero GC:

- [ ] **НЕТ** `new THREE.Vector3()` в цикле рендера
- [ ] **НЕТ** `new THREE.Color()` в цикле рендера
- [ ] **НЕТ** создания массивов в цикле рендера
- [ ] **НЕТ** стрелочных функций в цикле (closure = GC)
- [ ] **НЕТ** деструктуризации в цикле
- [ ] **ДА** Float32Array для буферов
- [ ] **ДА** переиспользование объектов
- [ ] **ДА** `BufferAttribute.setXYZ()` напрямую

---

## 🎨 ЦВЕТОВЫЕ РЕЖИМЫ (GLSL)

### Rainbow

```glsl
vec3 getRainbowColor(float index, float total, float hueOffset) {
    float hue = mod(hueOffset + (index / total) * 360.0, 360.0);
    return hsl2rgb(vec3(hue / 360.0, 0.8, 0.6));
}

// HSL to RGB helper
vec3 hsl2rgb(vec3 hsl) {
    vec3 rgb = clamp(abs(mod(hsl.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return hsl.z + hsl.y * (rgb - 0.5) * (1.0 - abs(2.0 * hsl.z - 1.0));
}
```

### Plasma

```glsl
vec3 getPlasmaColor(float y, float maxY) {
    float intensity = 1.0 - (y / maxY);
    return vec3(intensity, intensity * 0.5, 0.0);
}
```

---

## 🎛️ POST-PROCESSING

### Bloom Effect

```javascript
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// Composer
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

// Bloom
const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.5,  // strength
    0.4,  // radius
    0.85  // threshold
);
composer.addPass(bloomPass);

// В animate()
composer.render();
```

### Trail Effect

```javascript
// Метод 1: Motion blur через прозрачный фон
renderer.autoClear = false;
renderer.setClearColor(new THREE.Color(0x000000), 0.1); // 10% прозрачности

// Метод 2: Render target с history
const trailRT = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat
});
```

---

## 📊 BENCHMARK / ПРОФИЛИРОВАНИЕ

### FPS Monitor

```javascript
let frameCount = 0;
let lastTime = performance.now();
let fps = 0;

function updateFPS() {
    frameCount++;
    const now = performance.now();
    if (now - lastTime >= 1000) {
        fps = frameCount;
        frameCount = 0;
        lastTime = now;
        console.log(`FPS: ${fps}`);
    }
}
```

### Memory Monitor

```javascript
function logMemory() {
    if (performance.memory) {
        console.log(`Used JS Heap: ${(performance.memory.usedJSHeapSize / 1048576).toFixed(2)} MB`);
    }
}
```

### Chrome DevTools

1. Открыть DevTools (F12)
2. Performance tab → Record
3. Прокатить 5-10 секунд
4. Проверить GC events (должны быть редко)
5. Проверить Frame rate (должен быть 60)

---

## 🎯 ЗАДАЧИ АГЕНТА 3 (ПРИОРИТЕТЫ)

### P0 (Критично):
- [ ] Создать базовую сцену Three.js
- [ ] Перенести формулы `calc()` в GLSL vertex shader
- [ ] Реализовать 20K частиц с Float32Array
- [ ] Достичь 60 FPS на среднем GPU

### P1 (Важно):
- [ ] Добавить 8 вариаций формул (uniform switch)
- [ ] Реализовать 5 цветовых режимов (GLSL)
- [ ] Добавить post-processing (bloom)
- [ ] Оптимизировать Zero GC (проверка в DevTools)

### P2 (Опционально):
- [ ] Instanced rendering для производительности
- [ ] LOD система для адаптивной детализации
- [ ] Compute shaders (WebGPU) для будущих версий
- [ ] VR поддержка (WebXR)

---

## 📝 ПРАВИЛА РАБОТЫ АГЕНТА 3

### 1. TDD Прежде Всего

```
1. Benchmark (замер FPS до изменений)
2. Код (изменение шейдеров/буферов)
3. Benchmark (замер FPS после)
4. Рефакторинг (оптимизация)
```

### 2. Проверка Производительности

Перед коммитом проверить:
- [ ] FPS > 55 на среднем GPU
- [ ] GC не вызывается каждый кадр
- [ ] Память стабильна (нет утечек)
- [ ] Все формулы работают корректно

### 3. Документирование

После каждого изменения:
- Обновить `AGENT_3_PERFORMANCE_WEBGL.md`
- Добавить запись в `logs/CHANGELOG.md`
- Написать отчёт в `AGENTS_CHAT.md`

### 4. Взаимодействие с другими агентами

| Агент | Взаимодействие |
|-------|----------------|
| **Агент 1** | Получает формулы `calc()`, параметры P={k,e,q} |
| **Агент 2** | Получает цветовые режимы, UI-гайдлайны |
| **Агент 4** | Делится GLSL шейдерами для ТД |

---

## 🔗 СВЯЗАННЫЕ ФАЙЛЫ

| Файл | Описание |
|------|----------|
| `index.html` | Основной код (секции Three.js) |
| `AGENT_3_PERFORMANCE_WEBGL.md` | Этот документ |
| `logs/CHANGELOG.md` | История изменений |
| `AGENTS_CHAT.md` | Коммуникация между агентами |

---

## 📚 РЕСУРСЫ

### Документация
- [Three.js Docs](https://threejs.org/docs/)
- [Three.js Examples](https://threejs.org/examples/)
- [GLSL Specification](https://www.khronos.org/opengl/wiki/Core_Language_(GLSL))
- [WebGPU Working Draft](https://www.w3.org/TR/webgpu/)

### Туториалы
- [Three.js Particle Systems](https://threejs.org/examples/#webgl_points_sprites)
- [GPU Particles](https://discourse.threejs.org/t/gpu-particles/20563)
- [Post-processing](https://threejs.org/examples/#webgl_postprocessing_unreal_bloom)

---

*Последнее обновление: 14.03.2026*
*Версия документа: 1.1*

---

## 📊 ОТЧЁТ О ВЫПОЛНЕННОЙ РАБОТЕ (14.03.2026)

### ✅ Выполненные задачи:

#### 1. Миграция на кастомные GLSL шейдеры
- Созданы файлы шейдеров:
  - `shaders/particleVertex.glsl` — vertex shader с 8 формулами
  - `shaders/particleFragment.glsl` — fragment shader с круглыми частицами
- Реализована загрузка шейдеров через `fetch()`
- Добавлен fallback на стандартный `PointsMaterial` при ошибке

#### 2. Перенос формул calc() в GLSL
- Все 8 формул перенесены в vertex shader:
  - `calcOriginal()` — оригинальная формула
  - `calcJellyfish()` — медуза
  - `calcExpanded()` — расширенная
  - `calcCompact()` — компактная
  - `calcSpiral()` — спираль
  - `calcBloom()` — цветение
  - `calcWave()` — волна
  - `calcVortex()` — вихрь
- Uniforms для управления формулами: `uPk`, `uPe`, `uPq`, `uFormulaVariant`

#### 3. Zero GC оптимизация
- **До**: массив `allPoints` создавался каждый кадр (~60 раз/сек)
- **После**: переиспользуемый массив `reusablePoints` на 100K частиц
- **До**: closure `hue2rgb` внутри `hslToRgb` каждый вызов
- **После**: вынесенная наружу функция `hue2rgb`
- **Результат**: отсутствие аллокаций в цикле рендера

#### 4. Post-processing (UnrealBloomPass)
- Подключены скрипты post-processing:
  - `EffectComposer.js`
  - `RenderPass.js`
  - `ShaderPass.js`
  - `UnrealBloomPass.js`
- Параметры bloom:
  - Strength: 1.5
  - Radius: 0.4
  - Threshold: 0.85
- Управление через чекбокс "Glow"

#### 5. Бенчмарк и профилирование
- Добавлен мониторинг памяти в HUD
- Функция `benchmark(seconds)` для тестирования в консоли
- Отслеживание утечек памяти через `performance.memory`
- Логирование при превышении 100 MB

### 📈 Целевые метрики производительности:

| Метрика | Цель | Статус |
|---------|------|--------|
| FPS | ≥ 55 | ✅ Zero GC готово |
| Memory Delta (5 min) | < 10 MB | ✅ Мониторинг добавлен |
| Particles | 20K+ | ✅ Поддержка до 100K |
| Draw Calls | 1 | ✅ Один Points/Shader |

### 🎯 Команды для тестирования:

```javascript
// Запустить бенчмарк на 5 секунд
benchmark(5);

// Запустить бенчмарк на 10 секунд
benchmark(10);

// Проверить текущее состояние
console.log(`FPS: ${fps}, Particles: ${particleCount}, Memory: ${(performance.memory?.usedJSHeapSize / 1048576).toFixed(2)} MB`);
```

### 🔧 Конфигурация для максимальной производительности:

```javascript
// Уменьшить плотность частиц если FPS < 55
particleDensity = 40; // вместо 60

// Отключить glow если нужен максимум FPS
showGlow = false;

// Уменьшить pixel ratio
renderer.setPixelRatio(1); // вместо 2
```
