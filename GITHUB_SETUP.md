# 📤 ИНСТРУКЦИЯ ПО ПУБЛИКАЦИИ НА GITHUB

**Дата:** 25.03.2026

---

## 🎯 ВАРИАНТ 1: Отдельный репозиторий (рекомендуется)

### Шаг 1: Создать репозиторий на GitHub

1. Откройте https://github.com/new
2. Название: `ether-resonance`
3. Описание: "Интерактивная визуализация тригонометрических организмов на Three.js"
4. **НЕ** инициализировать (оставить пустым)
5. Нажать **Create repository**

### Шаг 2: Инициализировать git в папке ether-resonance

```bash
# Перейти в папку проекта
cd c:\Users\h04x\Projects\monitoring\ether-resonance

# Инициализировать git (если нет)
git init

# Добавить все файлы
git add .

# Сделать первый коммит
git commit -m "Initial commit: Ether Resonance v4.0

- Three.js WebGL визуализация (40K частиц @ 60 FPS)
- 8 математических формул
- Zero GC оптимизация
- Gzip сервер
- GLSL шейдеры
- Лаунчер с меню"
```

### Шаг 3: Привязать к удалённому репозиторию

```bash
# Заменить YOUR_USERNAME на ваш логин GitHub
git remote add origin https://github.com/YOUR_USERNAME/ether-resonance.git

# Проверить
git remote -v
```

### Шаг 4: Отправить на GitHub

```bash
# Отправить main ветку
git push -u origin main

# Если ветка называется master
git branch -M main
git push -u origin main
```

### Шаг 5: Проверить на GitHub

Откройте https://github.com/YOUR_USERNAME/ether-resonance

---

## 🎯 ВАРИАНТ 2: GitHub Pages (хостинг демо)

### После публикации (Вариант 1):

1. Откройте репозиторий на GitHub
2. **Settings** → **Pages**
3. **Source:** Deploy from branch
4. **Branch:** main → `/ (root)`
5. Нажать **Save**

Через 1-2 минуты сайт будет доступен:
```
https://YOUR_USERNAME.github.io/ether-resonance/
```

---

## 🎯 ВАРИАНТ 3: В составе существующего репозитория

Если хотите опубликовать весь `monitoring`:

```bash
# Перейти в корень
cd c:\Users\h04x\Projects\monitoring

# Добавить все изменения
git add .

# Коммит
git commit -m "Add ether-resonance optimization

- Gzip сервер (66% экономии трафика)
- Лаунчер с меню (run.bat)
- Оптимизированные шейдеры
- Zero GC оптимизация
- .gitignore, package.json"

# Отправить
git push
```

---

## 📝 РЕКОМЕНДАЦИИ

### Перед публикацией

1. **Проверить .gitignore:**
   ```bash
   git status
   # Убедиться, что нет лишних файлов
   ```

2. **Проверить README:**
   - Заменить `YOUR_USERNAME` на ваш логин
   - Добавить скриншот в `docs/screenshot.png`

3. **Тестировать:**
   ```bash
   run.bat
   # Проверить все режимы
   ```

### После публикации

1. **Добавить описание репозитория:**
   - Краткое описание
   - Ссылку на демо (GitHub Pages)
   - Теги: `threejs`, `webgl`, `visualization`, `particles`

2. **Создать релиз:**
   - https://github.com/YOUR_USERNAME/ether-resonance/releases/new
   - Tag version: `v4.0.0`
   - Описание: версия 4.0 с оптимизациями

3. **Добавить лицензию:**
   - ✅ Уже есть `LICENSE` (MIT)

---

## 🔧 КОМАНДЫ GIT

```bash
# Проверить статус
git status

# Добавить файлы
git add .

# Коммит
git commit -m "Описание изменений"

# Отправить
git push

# Получить обновления
git pull

# Посмотреть историю
git log --oneline
```

---

## 📊 СТРУКТУРА ДЛЯ GITHUB

```
ether-resonance/
├── 📄 README.md              # ✅ Главная страница
├── 📄 LICENSE                # ✅ Лицензия
├── 📄 package.json           # ✅ Зависимости
├── 🐍 server.py              # ✅ Сервер
├── 🪟 run.bat                # ✅ Лаунчер
├── 🪟 start-tunnel.bat       # ✅ Туннель
├── 🪟 tunnel.bat             # ✅ Туннель
│
├── 🌐 index-3d.html          # ✅ Основная страница
│
├── 📁 shaders/               # ✅ GLSL шейдеры
│   ├── particleVertex.glsl
│   └── particleFragment.glsl
│
├── 📁 docs/                  # 📚 Документация
├── 📁 logs/                  # 📊 Бенчмарки
└── 📁 .vscode/               # ⚙️ Настройки (опционально)
```

---

## ❓ ВОЗМОЖНЫЕ ПРОБЛЕМЫ

### 1. "fatal: remote origin already exists"

```bash
git remote remove origin
git remote add origin https://github.com/YOUR_USERNAME/ether-resonance.git
```

### 2. "failed to push some refs"

```bash
git pull origin main --allow-unrelated-histories
git push
```

### 3. "large files" (больше 100MB)

```bash
# Удалить большие файлы из истории
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch PATH_TO_LARGE_FILE" \
  --prune-empty --tag-name-filter cat -- --all

git push origin --force
```

---

## ✅ ЧЕКЛИСТ

- [ ] Создан репозиторий на GitHub
- [ ] Инициализирован git в папке
- [ ] Добавлены все файлы (`git add .`)
- [ ] Сделан коммит (`git commit -m "..."`)
- [ ] Привязан remote (`git remote add origin ...`)
- [ ] Отправлено на GitHub (`git push`)
- [ ] Проверено на GitHub
- [ ] Настроен GitHub Pages (опционально)
- [ ] Обновлён README с правильным username

---

**Готово! Проект опубликован на GitHub! 🎉**
