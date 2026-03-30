// particleFragment.glsl — Оптимизированный Fragment Shader
// ETHER RESONANCE — Агент 3 (Performance/WebGL)
// Версия: 4.1 — Оптимизация производительности

precision highp float;

// ============================================
// VARYING (из vertex shader)
// ============================================
varying vec3 vColor;       // Цвет частицы
varying float vIntensity;  // Интенсивность

// ============================================
// UNIFORMS
// ============================================
uniform float uOpacity;    // Общая прозрачность

// ============================================
// КОНСТАНТЫ
// ============================================
const float POINT_RADIUS = 0.5;
const float SOFT_EDGE_START = 0.3;
const float SOFT_EDGE_END = 0.5;

// ============================================
// MAIN FRAGMENT SHADER
// ============================================
void main() {
    // Круглая форма частицы
    // Оптимизация: используем константы
    float r = distance(gl_PointCoord, vec2(0.5));

    // Отбрасываем пиксели за пределами круга
    if (r > POINT_RADIUS) discard;

    // Мягкие края (anti-aliasing)
    // Оптимизация: smoothstep с константами
    float alpha = 1.0 - smoothstep(SOFT_EDGE_START, SOFT_EDGE_END, r);

    // Применяем интенсивность и прозрачность
    alpha *= uOpacity * vIntensity;

    // Финальный цвет (RGBA)
    gl_FragColor = vec4(vColor, alpha);
}
