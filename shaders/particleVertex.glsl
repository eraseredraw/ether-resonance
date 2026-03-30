// particleVertex.glsl — Оптимизированный Vertex Shader
// ETHER RESONANCE — Агент 3 (Performance/WebGL)
// Версия: 4.1 — Оптимизация производительности

precision highp float;

// ============================================
// АТРИБУТЫ (из BufferGeometry)
// ============================================
attribute vec3 position;       // Базовая позиция
attribute vec3 color;          // Цвет частицы
attribute float size;          // Размер частицы

// ============================================
// UNIFORMS (из JavaScript)
// ============================================
uniform float uTime;           // Время анимации
uniform float uPixelRatio;     // Pixel ratio дисплея
uniform mat4 modelViewMatrix;  // Model-View матрица
uniform mat4 projectionMatrix; // Projection матрица

// Параметры формулы P = {k, e, q}
uniform float uPk;
uniform float uPe;
uniform float uPq;

// Вариант формулы (0-7)
uniform int uFormulaVariant;

// Дополнительные параметры
uniform float uScale;
uniform float uBaseSize;

// Позиция организма (смещение)
uniform vec2 uOrgPosition;

// ============================================
// VARYING (передача во fragment shader)
// ============================================
varying vec3 vColor;
varying float vIntensity;

// ============================================
// КОНСТАНТЫ (оптимизация вычислений)
// ============================================
const float PI = 3.14159265359;
const float TWO_PI = 6.28318530718;
const float HALF_PI = 1.57079632679;

// ============================================
// ФОРМУЛЫ CALC() — 8 ВАРИАНТОВ
// ============================================
// Оптимизация: предварительный расчёт общих выражений
// ============================================

// Formula 0 — Original
vec2 calcOriginal(vec2 pos, float time) {
    float x = pos.x;
    float y = pos.y;

    // Предварительный расчёт
    float k_base = x / uPk - 12.5;
    float cos_k = cos(k_base);
    float sin_y = sin(y / uPe);
    float cos_k2 = cos(k_base / 2.0);

    float k = k_base;
    float e = cos_k + sin_y + cos_k2;
    float d = abs(e);

    // Оптимизация: общий множитель
    float phase = 4.0 * d - 2.0 * time + y / 72.0;
    float q = x / 4.0 + uPq + d * k * (1.0 + cos(phase));
    float c = y * e / 594.0 - time / 8.0 + d / 6.0;

    float cos_c = cos(c);
    float sin_c = sin(c);
    float cos_c2 = cos(c / 2.0);

    float X = (q * cos_c + 200.0) * uScale;
    float Y = ((q / 2.0 + 99.0 * cos_c2) * sin_c + 6.0 * e + 200.0) * uScale;

    return vec2(X, Y);
}

// Formula 1 — Jellyfish
vec2 calcJellyfish(vec2 pos, float time) {
    float x = pos.x;
    float y = pos.y;

    float time_5 = time * 0.5;
    float pulse = sin(time_5) * 0.2 + 1.0;

    float k_base = x / uPk - 12.5;
    float k = k_base;
    float e = cos(k * 0.8) + sin(y / uPe) + cos(k / 2.0);
    float d = abs(e);

    float phase = 3.0 * d - 2.0 * time + y / 60.0;
    float q = x / 4.0 + uPq * pulse + d * k * (1.0 + cos(phase));
    float c = y * e / 550.0 - time / 7.0 + d / 5.0;

    float cos_c = cos(c);
    float sin_c = sin(c);
    float cos_c2 = cos(c / 2.0);

    float X = (q * cos_c + 220.0) * uScale;
    float Y = ((q / 2.0 + 100.0 * cos_c2) * sin_c + 7.0 * e + 220.0) * uScale;

    return vec2(X, Y);
}

// Formula 2 — Expanded
vec2 calcExpanded(vec2 pos, float time) {
    float x = pos.x;
    float y = pos.y;

    float k_base = x / (uPk * 0.8) - 10.0;
    float k = k_base;
    float e = cos(k) + sin(y / (uPe * 1.2)) + cos(k / 2.5);
    float d = abs(e);

    float phase = 3.5 * d - 2.5 * time + y / 65.0;
    float q = x / 3.5 + uPq * 1.3 + d * k * (1.0 + cos(phase));
    float c = y * e / 520.0 - time / 6.0 + d / 4.5;

    float cos_c = cos(c);
    float sin_c = sin(c);
    float cos_c2 = cos(c / 2.0);

    float X = (q * cos_c + 280.0) * uScale;
    float Y = ((q / 2.0 + 130.0 * cos_c2) * sin_c + 9.0 * e + 280.0) * uScale;

    return vec2(X, Y);
}

// Formula 3 — Compact
vec2 calcCompact(vec2 pos, float time) {
    float x = pos.x;
    float y = pos.y;

    float k_base = x / (uPk * 1.3) - 18.0;
    float k = k_base;
    float e = cos(k * 1.3) + sin(y / (uPe * 0.7)) + cos(k / 2.8);
    float d = abs(e);

    float phase = 5.5 * d - 3.5 * time + y / 100.0;
    float q = x / 5.5 + uPq * 0.6 + d * k * (1.0 + cos(phase));
    float c = y * e / 680.0 - time / 11.0 + d / 9.0;

    float cos_c = cos(c);
    float sin_c = sin(c);
    float cos_c2 = cos(c / 2.0);

    float X = (q * cos_c + 160.0) * uScale;
    float Y = ((q / 2.0 + 70.0 * cos_c2) * sin_c + 4.5 * e + 160.0) * uScale;

    return vec2(X, Y);
}

// Formula 4 — Spiral
vec2 calcSpiral(vec2 pos, float time) {
    float x = pos.x;
    float y = pos.y;

    float time_4 = time * 0.4;
    float time_3 = time * 0.3;
    float spiral = sin(time_4) * 0.35 + 1.0;
    float twist = cos(x / uPk / 3.0) * sin(time_3);

    float k_base = x / uPk - 12.5;
    float k = k_base;
    float e = cos(k) + sin(y / uPe) + cos(k / 2.0);
    float d = abs(e);

    float phase = 4.0 * d - 2.0 * time + y / 72.0;
    float q = x / 4.0 + uPq + d * k * (1.0 + cos(phase)) * spiral;
    float c = y * e / 594.0 - time / 8.0 + d / 6.0 + twist;

    float cos_c = cos(c);
    float sin_c = sin(c);
    float cos_c2 = cos(c / 2.0);

    float X = (q * cos_c + 200.0) * uScale;
    float Y = ((q / 2.0 + 99.0 * cos_c2) * sin_c + 6.0 * e + 200.0) * uScale;

    return vec2(X, Y);
}

// Formula 5 — Bloom
vec2 calcBloom(vec2 pos, float time) {
    float x = pos.x;
    float y = pos.y;

    float time_6 = time * 0.6;
    float bloom = sin(time_6) * 0.25 + 1.0;
    float petals = cos(x / uPk * 3.0) * bloom;

    float k_base = x / uPk - 12.5;
    float k = k_base;
    float e = cos(k * 0.9) + sin(y / uPe) + cos(k / 2.2);
    float d = abs(e);

    float phase = 4.0 * d - 2.0 * time + y / 72.0;
    float q = x / 4.0 + uPq * bloom + d * k * (1.0 + cos(phase)) + petals * 20.0;
    float c = y * e / 580.0 - time / 7.5 + d / 5.5;

    float cos_c = cos(c);
    float sin_c = sin(c);
    float cos_c2 = cos(c / 2.0);

    float X = (q * cos_c + 210.0) * uScale;
    float Y = ((q / 2.0 + 105.0 * cos_c2) * sin_c + 6.5 * e + 210.0) * uScale;

    return vec2(X, Y);
}

// Formula 6 — Wave
vec2 calcWave(vec2 pos, float time) {
    float x = pos.x;
    float y = pos.y;

    float time_35 = time * 0.35;
    float time_2 = time * 0.2;
    float wave = sin(time_35) * 0.3;
    float flow = sin(y / 50.0 + time_2) * 15.0;

    float k_base = x / uPk - 11.0;
    float k = k_base;
    float e = cos(k * 0.85) + sin(y / (uPe * 1.1)) + cos(k / 1.9);
    float d = abs(e);

    float phase = 3.8 * d - 1.8 * time + y / 68.0;
    float q = x / 4.2 + uPq + d * k * (1.0 + cos(phase)) + flow;
    float c = y * e / 570.0 - time / 7.2 + d / 5.2 + wave;

    float cos_c = cos(c);
    float sin_c = sin(c);
    float cos_c2 = cos(c / 2.0);

    float X = (q * cos_c + 205.0) * uScale;
    float Y = ((q / 2.0 + 102.0 * cos_c2) * sin_c + 6.2 * e + 205.0) * uScale;

    return vec2(X, Y);
}

// Formula 7 — Vortex
vec2 calcVortex(vec2 pos, float time) {
    float x = pos.x;
    float y = pos.y;

    float time_7 = time * 0.7;
    float time_5 = time * 0.5;
    float vortex = sin(time_7) * 0.4 + 1.0;
    float swirl = sin(x / uPk / 2.0 + time_5) * cos(y / 80.0) * 25.0;

    float k_base = x / uPk - 12.5;
    float k = k_base;
    float e = cos(k * 1.1) + sin(y / (uPe * 0.9)) + cos(k / 2.1);
    float d = abs(e);

    float phase = 4.2 * d - 2.3 * time + y / 70.0;
    float q = x / 3.8 + uPq * vortex + d * k * (1.0 + cos(phase)) + swirl;
    float c = y * e / 560.0 - time / 6.8 + d / 4.8;

    float cos_c = cos(c);
    float sin_c = sin(c);
    float cos_c2 = cos(c / 2.0);

    float X = (q * cos_c + 215.0) * uScale;
    float Y = ((q / 2.0 + 108.0 * cos_c2) * sin_c + 6.8 * e + 215.0) * uScale;

    return vec2(X, Y);
}

// ============================================
// ГЛАВНЫЙ КАЛЬКУЛЯТОР ФОРМУЛ
// ============================================
vec2 calcFormula(vec2 pos, float time) {
    // Оптимизация: unrolled switch для производительности
    if (uFormulaVariant == 0) return calcOriginal(pos, time);
    if (uFormulaVariant == 1) return calcJellyfish(pos, time);
    if (uFormulaVariant == 2) return calcExpanded(pos, time);
    if (uFormulaVariant == 3) return calcCompact(pos, time);
    if (uFormulaVariant == 4) return calcSpiral(pos, time);
    if (uFormulaVariant == 5) return calcBloom(pos, time);
    if (uFormulaVariant == 6) return calcWave(pos, time);
    if (uFormulaVariant == 7) return calcVortex(pos, time);

    // По умолчанию — Original
    return calcOriginal(pos, time);
}

// ============================================
// MAIN VERTEX SHADER
// ============================================
void main() {
    // Сохраняем цвет
    vColor = color;
    vIntensity = 1.0;

    // Применяем формулу к позиции
    vec2 formulaPos = calcFormula(position.xy, uTime);

    // Позиция с учётом формулы и позиции организма
    vec3 transformed = vec3(
        formulaPos.x + uOrgPosition.x - 200.0 * uScale,
        formulaPos.y + uOrgPosition.y - 200.0 * uScale,
        position.z
    );

    // Преобразование в клип-пространство
    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Размер частиц с учётом перспективы
    // Оптимизация: выносим константу
    gl_PointSize = size * uPixelRatio * (300.0 / -mvPosition.z);
}
