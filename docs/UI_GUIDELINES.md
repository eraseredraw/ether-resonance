# 🎨 UI GUIDELINES — Стандарты интерфейса

## 📐 Размеры и отступы

### Базовая сетка
```
Базовый отступ: 8px
Кратные отступы: 8, 16, 24, 32, 48, 64px
```

### Панели
| Панель | Позиция | Размер | Фон |
|--------|---------|--------|-----|
| `#ui` | top-left | auto | transparent |
| `#controls` | bottom-left | min-width 280px | `rgba(0,0,0,0.85)` |
| `#layer-config` | bottom-right (left of formulas) | min-width 140px | `rgba(0,0,0,0.85)` |
| `#formulas` | bottom-right | auto | `rgba(0,0,0,0.85)` |

### Отступы внутри панелей
```css
.panel {
    padding: 15px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.3);
}

.row {
    margin-bottom: 8px;
    gap: 12px;
}
```

---

## 🔤 Типографика

### Шрифты
```css
font-family: monospace;  /* Единый шрифт для всего */
```

### Размеры текста
| Элемент | Размер | Вес |
|---------|--------|-----|
| Заголовок (#ui) | 18px | normal |
| Заголовки панелей | 12px | normal, opacity 0.7 |
| Лейблы | 13px | normal |
| Формулы | 13px | normal |
| Кнопки | 12px | normal |

### Цвета текста
| Элемент | Цвет |
|---------|------|
| Основной текст | `#fff` |
| Вторичный текст | `#ccc` |
| Переменные в формулах | `#6af` |
| Неактивный текст | `rgba(255,255,255,0.5)` |

---

## 🎯 Интерактивные элементы

### Слайдеры (input range)
```css
input[type="range"] {
    width: 140px;
    height: 20px;
    cursor: pointer;
    filter: grayscale(100%);  /* Ч/б стиль */
}
```

**Логика:**
- Минимум: всегда виден
- Максимум: вычисляется нелинейно
- Шаг: 1 (целые значения)

### Чекбоксы (input checkbox)
```css
input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
}
```

**Размещение:**
- Слева от лейбла для тогглов слоёв
- Справа от лейбла для основных настроек

### Кнопки
```css
button {
    background: rgba(255,255,255,0.2);
    border: 1px solid rgba(255,255,255,0.5);
    padding: 8px 16px;
    margin: 4px;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s;
}

button:hover {
    background: rgba(255,255,255,0.4);
    border-color: #fff;
}
```

---

## 🌟 Эффекты

### Text shadow (заголовки)
```css
text-shadow: 0 0 10px rgba(255,255,255,0.5);
```

### Glow для canvas (опционально)
```css
canvas {
    filter: drop-shadow(0 0 15px rgba(255,255,255,0.5));
}
```

### Hover эффекты
```css
/* Кнопки */
button:hover {
    background: rgba(255,255,255,0.4);
}

/* Слайдеры */
input[type="range"]:hover {
    filter: grayscale(0%);
}
```

---

## 📱 Адаптивность

### Минимальные размеры
| Элемент | Мин. ширина |
|---------|-------------|
| `#controls` | 280px |
| `#layer-config` | 140px |
| `#formulas` | 250px |

### Поведение при resize
```javascript
function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    initOrganisms();  // Пересчитать позиции
}
```

### Мобильная версия (План)
- [ ] Сворачиваемые панели
- [ ] Тач-контролы для слайдеров
- [ ] Увеличенные кнопки (44px min)

---

## 🎛️ Компоненты UI

### Конфиг-панель слоёв
```html
<div id="layer-config">
    <div style="font-size: 12px; margin-bottom: 8px; opacity: 0.7;">
        LAYERS
    </div>
    <div class="row">
        <label><input type="checkbox" id="toggle-particles"> Particles</label>
    </div>
    <!-- ... другие слои ... -->
</div>
```

### Основная панель управления
```html
<div id="controls">
    <div class="row">
        <label>🖱️ Follow Mouse:</label>
        <input type="checkbox" id="follow">
    </div>
    <div class="row">
        <label>⏱️ Time Speed:</label>
        <input type="range" id="speed" min="0" max="100" value="30">
    </div>
    <!-- ... другие настройки ... -->
</div>
```

### Панель формул
```html
<div id="formulas">
    <div><span class="v">k</span> = x / <span id="fk">8</span> - 12.5</div>
    <!-- ... другие формулы ... -->
</div>
```

---

## 🎨 Цветовая палитра

### Основная
| Цвет | Hex | Использование |
|------|-----|---------------|
| Black | `#000` | Фон canvas |
| White | `#fff` | Текст, частицы |
| Gray | `#ccc` | Вторичный текст |

### Полупрозрачные
| Цвет | RGBA | Использование |
|------|------|---------------|
| Panel BG | `rgba(0,0,0,0.85)` | Фон панелей |
| Border | `rgba(255,255,255,0.3)` | Бордеры |
| Button | `rgba(255,255,255,0.2)` | Кнопки |
| Hover | `rgba(255,255,255,0.4)` | Hover эффект |

### Акценты
| Цвет | Hex | Использование |
|------|-----|---------------|
| Blue | `#6af` | Переменные в формулах |
| Green | `rgba(100,200,100,0.3)` | Border layer-config |

---

## ♿ Доступность

### Контраст
- Текст на фоне: минимум 4.5:1
- Интерактивные элементы: видимый focus

### Клавиатура
- Tab navigation между элементами
- Enter/Space для кнопок и чекбоксов

### ARIA (План)
- [ ] `aria-label` для иконок
- [ ] `aria-pressed` для тогглов
- [ ] `aria-valuenow` для слайдеров

---

*Последнее обновление: 10.03.2026*
