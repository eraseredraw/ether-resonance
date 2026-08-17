        // ============================================
        // IMPORT THREE.JS R160
        // ============================================
        import * as THREE from 'three';
        import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
        import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
        import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
        import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
        import { CopyShader } from 'three/addons/shaders/CopyShader.js';
        import { LuminosityHighPassShader } from 'three/addons/shaders/LuminosityHighPassShader.js';
        import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

        // Export for global access (for inline event handlers)
        window.THREE = THREE;
        window.OrbitControls = OrbitControls;
        window.EffectComposer = EffectComposer;
        window.RenderPass = RenderPass;
        window.ShaderPass = ShaderPass;
        window.CopyShader = CopyShader;
        window.LuminosityHighPassShader = LuminosityHighPassShader;
        window.UnrealBloomPass = UnrealBloomPass;

        // ============================================
        // GLOBAL STATE
        // ============================================
        let scene, camera, renderer, controls;
        let particleSystem, geometry, material;
        let composer, bloomPass;
        let isInitialized = false; // Флаг полной инициализации
        let targetZoomDistance = 400; // Для плавного зума

        // Particle data
        const MAX_PARTICLES = 100000;
        let particleCount = 40000; // 40K+ по умолчанию
        let positions, colors, sizes;
        let positionsArray, colorsArray;

        // Morphing targets for smooth transitions
        let targetPositions = null;
        let currentPositions = null;
        let isMorphing = false;
        let morphProgress = 0;
        const MORPH_DURATION = 1.0; // seconds

        // Animation
        let time = 0;
        let simSpeed = 0.5;

        // Form settings
        let currentShape = 'cube'; // Куб по умолчанию
        let formScale = 150;
        let formRotation = 0; // Текущий угол вращения
        let formRotationSpeed = 0.3; // Скорость вращения (по умолчанию)
        let formChaos = 0; // Chaos = 0 по умолчанию

        // Color settings
        let colorMode = 'ice';
        let hueOffset = 0;
        let colorSaturation = 0.8;

        // Effects
        let bloomEnabled = true;
        let bloomIntensity = 3.0; // Максимум glow
        let trailEnabled = false;
        let particleSize = 0.5; // Минимальный размер
        
        // Camera
        let autoRotate = true;
        let rotateSpeed = 0.5;

        // FPS
        let frameCount = 0;
        let lastFpsTime = performance.now();
        let fps = 0;

        // ============================================
        // CACHED MATH CONSTANTS (Zero GC Optimization)
        // ============================================
        const PI2 = Math.PI * 2;
        const PI = Math.PI;
        const SQRT_PI = Math.sqrt(Math.PI);
        const ACOS_BASE = -1;

        // ============================================
        // PARTICLE SHAPE FUNCTIONS
        // ============================================
        function getShapePosition(index, total, time) {
            const i = index;
            const t = total;
            const phi = Math.acos(ACOS_BASE + PI2 * i / t);
            const theta = SQRT_PI * phi;

            // Инициализация по умолчанию
            let x = 0, y = 0, z = 0;

            switch (currentShape) {
                case 'sphere':
                    // Сфера — объёмная, заполненная внутри
                    const sphereR = formScale;
                    // Используем сферические координаты с радиусом
                    const r = sphereR * Math.cbrt((i + 0.5) / t); // Равномерное распределение по объёму
                    x = r * Math.sin(phi) * Math.cos(theta + time * formRotationSpeed);
                    y = r * Math.sin(phi) * Math.sin(theta + time * formRotationSpeed);
                    z = r * Math.cos(phi);
                    break;

                case 'torus':
                    // Тор (пончик)
                    const torusR = formScale * 0.6;  // Большой радиус
                    const torusr = formScale * 0.25; // Малый радиус
                    const torusu = (i / t) * PI2 * 20; // 20 оборотов
                    const torusv = (i % 100) / 100 * PI2;
                    x = (torusR + torusr * Math.cos(torusv)) * Math.cos(torusu + time * formRotationSpeed);
                    y = (torusR + torusr * Math.cos(torusv)) * Math.sin(torusu + time * formRotationSpeed);
                    z = torusr * Math.sin(torusv);
                    break;

                case 'spiral':
                    // Спираль
                    const spiralCount = 5;
                    const spiralIdx = i % spiralCount;
                    const spiralOff = (spiralIdx / spiralCount) * PI2;
                    const spiralH = formScale * 2;
                    const spiralRad = formScale * 0.5;
                    const h = ((i / t) - 0.5) * spiralH;
                    const angle = (i / t) * PI2 * spiralCount + spiralOff + time * formRotationSpeed;
                    x = spiralRad * Math.cos(angle) * (1 + (i/t) * 0.5);
                    y = h;
                    z = spiralRad * Math.sin(angle) * (1 + (i/t) * 0.5);
                    break;

                case 'cube':
                    // Куб — объёмный, заполненный внутри, с идеальной симметрией
                    const cubeSize = formScale * 2;
                    // Вычисляем идеальное количество частиц на сторону (целое число)
                    const idealCubeSide = Math.round(Math.cbrt(t));
                    const totalUsed = idealCubeSide * idealCubeSide * idealCubeSide;
                    const cubeSide = idealCubeSide;

                    // 3D координаты в сетке куба
                    const ix = i % cubeSide;
                    const iy = Math.floor(i / cubeSide) % cubeSide;
                    const iz = Math.floor(i / (cubeSide * cubeSide));

                    // Нормализованные координаты от -1 до 1 (с центрированием +0.5)
                    const nx = ((ix + 0.5) / cubeSide) * 2 - 1;
                    const ny = ((iy + 0.5) / cubeSide) * 2 - 1;
                    const nz = ((iz + 0.5) / cubeSide) * 2 - 1;

                    x = nx * cubeSize * 0.5;
                    y = ny * cubeSize * 0.5;
                    z = nz * cubeSize * 0.5;

                    // Вращение куба
                    const rot = time * formRotationSpeed;
                    const cosRot = Math.cos(rot);
                    const sinRot = Math.sin(rot);
                    const nx_rot = x * cosRot - z * sinRot;
                    const nz_rot = x * sinRot + z * cosRot;
                    x = nx_rot;
                    z = nz_rot;
                    break;

                case 'plane':
                    // Плоскость
                    const planeCols = Math.sqrt(t);
                    const planeSize = formScale * 2;
                    const px = i % planeCols;
                    const py = Math.floor(i / planeCols);
                    const wavePhase = (px / planeCols) * PI * 4 + time;
                    const wavePhase2 = (py / planeCols) * PI * 4 + time;
                    x = ((px / planeCols) - 0.5) * planeSize;
                    y = ((py / planeCols) - 0.5) * planeSize;
                    z = Math.sin(wavePhase) * 20 + Math.cos(wavePhase2) * 20;
                    break;

                case 'helix':
                    // Helix (спираль)
                    const helixTurns = 8;
                    const helixRad = formScale * 0.4;
                    const helixH = formScale * 2.5;
                    const progress = i / t;
                    const helixAngle = progress * PI2 * helixTurns + time * formRotationSpeed;
                    const helixSpread = (i % 3) * (PI2 / 3);
                    x = helixRad * Math.cos(helixAngle + helixSpread);
                    y = (progress - 0.5) * helixH;
                    z = helixRad * Math.sin(helixAngle + helixSpread);
                    break;

                case 'donut':
                    // Donut (тор)
                    const donutR = formScale * 0.5;
                    const donutr = formScale * 0.2;
                    const donutu = (i / t) * PI2 * 50;
                    const donutv = (i * 0.1) % PI2;
                    x = (donutR + donutr * Math.cos(donutv)) * Math.cos(donutu + time * formRotationSpeed);
                    y = (donutR + donutr * Math.cos(donutv)) * Math.sin(donutu + time * formRotationSpeed);
                    z = donutr * Math.sin(donutv);
                    break;

                case 'ribbon':
                    // Ribbon (лента Мёбиуса) — NEW!
                    const ribbonU = (i / t) * PI2;
                    const ribbonV = ((i % 50) / 50 - 0.5) * 2;
                    const ribbonRadius = formScale * 0.6;
                    const ribbonTwist = time * formRotationSpeed * 0.5;
                    const ribbonWidth = formScale * 0.15;
                    x = (ribbonRadius + ribbonV * ribbonWidth * Math.cos(ribbonU / 2 + ribbonTwist)) * Math.cos(ribbonU + ribbonTwist);
                    y = (ribbonRadius + ribbonV * ribbonWidth * Math.cos(ribbonU / 2 + ribbonTwist)) * Math.sin(ribbonU + ribbonTwist);
                    z = ribbonV * ribbonWidth * Math.sin(ribbonU / 2 + ribbonTwist);
                    break;

                case 'vortex':
                    // Vortex (воронка/смерч) — NEW!
                    const vortexTurns = 12;
                    const vortexRad = formScale * 0.5;
                    const vortexH = formScale * 3;
                    const vortexProgress = i / t;
                    const vortexAngle = vortexProgress * PI2 * vortexTurns + time * formRotationSpeed;
                    const vortexY = (vortexProgress - 0.5) * vortexH;
                    const vortexRadius = vortexRad * (1 - Math.abs(vortexProgress - 0.5) * 2);
                    x = vortexRadius * Math.cos(vortexAngle);
                    y = vortexY;
                    z = vortexRadius * Math.sin(vortexAngle);
                    break;

                case 'chaos':
                default:
                    // Хаос
                    x = (Math.random() - 0.5) * formScale * 2;
                    y = (Math.random() - 0.5) * formScale * 2;
                    z = (Math.random() - 0.5) * formScale * 2;
                    break;
            }
            
            // Добавляем хаос/шум
            if (formChaos > 0) {
                const chaosFactor = formChaos / 100;
                x += (Math.random() - 0.5) * formScale * chaosFactor;
                y += (Math.random() - 0.5) * formScale * chaosFactor;
                z += (Math.random() - 0.5) * formScale * chaosFactor;
            }
            
            return { x, y, z };
        }

        // ============================================
        // COLOR FUNCTIONS
        // ============================================
        // Zero GC: переиспользуемый объект Color
        const tempColor = new THREE.Color();
        
        function getParticleColor(index, total) {
            let h, s, l;

            switch (colorMode) {
                case 'rainbow':
                    h = (hueOffset + (index / total) * 360) % 360;
                    s = colorSaturation;
                    l = 60;
                    break;

                case 'hue':
                    h = (hueOffset + index * 0.1) % 360;
                    s = colorSaturation;
                    l = 65;
                    break;

                case 'plasma':
                    const pIntensity = index / total;
                    h = (hueOffset + pIntensity * 60) % 360; // Оранжево-жёлтый
                    s = 90;
                    l = 50 + pIntensity * 20;
                    break;

                case 'ocean':
                    h = (hueOffset + 180 + (index / total) * 60) % 360; // Синий-циан
                    s = colorSaturation;
                    l = 50 + (index / total) * 20;
                    break;

                case 'fire':
                    h = (hueOffset + (index / total) * 40) % 360; // Красный-оранжевый
                    s = 90;
                    l = 50 + (index / total) * 30;
                    break;

                case 'ice':
                    // Ледяной: синий-циан-белый
                    h = (hueOffset + 180 + (index / total) * 60) % 360;
                    s = 70 + (index / total) * 30;
                    l = 60 + (index / total) * 30;
                    break;

                case 'cyan':
                    // Циан: чистый cyan с вариациями
                    h = (hueOffset + 180) % 360;
                    s = 100;
                    l = 50 + (index / total) * 30;
                    break;

                case 'gold':
                    // Золотой: жёлтый-оранжевый металлик
                    h = (hueOffset + 40 + Math.sin(index / total * Math.PI) * 20) % 360;
                    s = 80 + (index / total) * 20;
                    l = 45 + (index / total) * 25;
                    break;

                case 'neon':
                    // Неоновый: яркие цвета с высоким saturation
                    h = (hueOffset + (index / total) * 360) % 360;
                    s = 100;
                    l = 55 + (index / total) * 15;
                    break;

                case 'white':
                default:
                    h = 0;
                    s = 0;
                    l = 70 + (index / total) * 30;
                    break;
            }

            // Zero GC: переиспользуем tempColor вместо new THREE.Color()
            tempColor.setHSL(h / 360, s / 100, l / 100);
            return tempColor;
        }

        // ============================================
        // INITIALIZATION
        // ============================================
        function init() {
            try {
                updateLoading(10, 'Creating scene...');

                // Scene
                scene = new THREE.Scene();
                scene.background = new THREE.Color(0x000005);
                scene.fog = new THREE.FogExp2(0x000005, 0.001);

                // Camera
                camera = new THREE.PerspectiveCamera(
                    75,
                    window.innerWidth / window.innerHeight,
                    0.1,
                    2000
                );
                camera.position.z = 400;
                camera.position.y = 100;

                // Renderer
                renderer = new THREE.WebGLRenderer({
                    antialias: true,
                    alpha: true,
                    powerPreference: "high-performance"
                });
                renderer.setSize(window.innerWidth, window.innerHeight);
                renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
                renderer.toneMapping = THREE.ReinhardToneMapping;
                renderer.domElement.tabIndex = 1;
                renderer.domElement.style.outline = 'none';
                document.body.appendChild(renderer.domElement);

                // Controls
                controls = new OrbitControls(camera, renderer.domElement);
                controls.enableDamping = true; // Включаем инерцию для живости вращения
                controls.dampingFactor = 0.05; // Плавное затухание
                controls.enableZoom = false; // Отключаем встроенный зум - используем свой
                controls.enablePan = false;
                controls.enableRotate = true;
                controls.autoRotate = autoRotate;
                controls.autoRotateSpeed = rotateSpeed;
                controls.minDistance = 10;
                controls.maxDistance = 2000;
                
                // Тач-контролы для мобильных
                controls.touches = {
                    ONE: THREE.TOUCH.ROTATE,
                    TWO: THREE.TOUCH.DOLLY_PAN
                };

                updateLoading(30, 'Creating particles...');

                // Particles
                createParticles();

                updateLoading(70, 'Setting up post-processing...');

                // Post Processing
                setupPostProcessing();

                updateLoading(90, 'Finalizing...');

                // Event listeners
                setupEventListeners();
                
                // Инициализируем targetZoomDistance после создания controls
                targetZoomDistance = camera.position.distanceTo(controls.target);

                updateLoading(100, 'Ready!');
                setTimeout(() => {
                    document.getElementById('loading').classList.add('hidden');
                }, 300);

                console.log('✅ Ether Resonance initialized successfully!');

                // Помечаем как полностью инициализированный
                isInitialized = true;

                // Запускаем animate() после полной инициализации
                animate();
            } catch (error) {
                console.error('❌ Initialization error:', error);
                document.getElementById('load-status').textContent = 'ERROR: ' + error.message;
                document.getElementById('load-status').style.color = 'red';
            }
        }

        function createParticles() {
            // Создаём буферы
            positions = new Float32Array(MAX_PARTICLES * 3);
            colors = new Float32Array(MAX_PARTICLES * 3);
            sizes = new Float32Array(MAX_PARTICLES);
            
            geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
            
            // Материал
            material = new THREE.PointsMaterial({
                size: particleSize,
                vertexColors: true,
                transparent: true,
                opacity: 0.9,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                sizeAttenuation: true
            });
            
            particleSystem = new THREE.Points(geometry, material);
            scene.add(particleSystem);
            
            updateParticles();
        }

        function updateParticles() {
            // Проверка на существование геометрии и данных
            if (!isInitialized || !geometry || !geometry.attributes || !geometry.attributes.position) {
                return;
            }

            const posAttr = geometry.attributes.position;
            const colAttr = geometry.attributes.color;

            // Проверка на валидность particleCount
            if (particleCount <= 0 || particleCount > MAX_PARTICLES) {
                return;
            }

            for (let i = 0; i < particleCount; i++) {
                const pos = getShapePosition(i, particleCount, time);
                
                // Проверка на NaN перед установкой позиций
                if (!isNaN(pos.x) && !isNaN(pos.y) && !isNaN(pos.z)) {
                    posAttr.setXYZ(i, pos.x, pos.y, pos.z);
                }

                const color = getParticleColor(i, particleCount);
                colAttr.setXYZ(i, color.r, color.g, color.b);

                sizes[i] = 1.0 + Math.random() * 0.5;
            }

            posAttr.needsUpdate = true;
            colAttr.needsUpdate = true;
            geometry.setDrawRange(0, particleCount);
            
            // Сбрасываем bounding sphere для корректного рендеринга
            geometry.boundingSphere = null;
        }
        
        // Полная пересборка частиц (при изменении количества)
        function rebuildParticles() {
            // Удаляем старую геометрию
            if (geometry) {
                geometry.dispose();
            }
            
            // Создаём новую геометрию
            geometry = new THREE.BufferGeometry();
            
            // Инициализируем массивы
            positions = new Float32Array(MAX_PARTICLES * 3);
            colors = new Float32Array(MAX_PARTICLES * 3);
            sizes = new Float32Array(MAX_PARTICLES);
            
            // Заполняем позициями и цветами
            for (let i = 0; i < particleCount; i++) {
                const pos = getShapePosition(i, particleCount, time);
                positions[i * 3] = pos.x;
                positions[i * 3 + 1] = pos.y;
                positions[i * 3 + 2] = pos.z;
                
                const color = getParticleColor(i, particleCount);
                colors[i * 3] = color.r;
                colors[i * 3 + 1] = color.g;
                colors[i * 3 + 2] = color.b;
                
                sizes[i] = 1.0 + Math.random() * 0.5;
            }
            
            // Устанавливаем атрибуты
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
            geometry.setDrawRange(0, particleCount);
            
            // Пересоздаём систему частиц
            if (particleSystem) {
                scene.remove(particleSystem);
                particleSystem.material.dispose();
            }
            
            material = new THREE.PointsMaterial({
                size: particleSize,
                vertexColors: true,
                blending: THREE.AdditiveBlending,
                depthTest: false,
                transparent: true,
                sizeAttenuation: true
            });

            particleSystem = new THREE.Points(geometry, material);
            scene.add(particleSystem);
        }

        // Smooth morph between shapes
        function morphToShape(targetShape, duration = 1.0) {
            const posAttr = geometry.attributes.position;
            
            // Save current positions
            const startPositions = new Float32Array(particleCount * 3);
            for (let i = 0; i < particleCount; i++) {
                startPositions[i * 3] = posAttr.getX(i);
                startPositions[i * 3 + 1] = posAttr.getY(i);
                startPositions[i * 3 + 2] = posAttr.getZ(i);
            }
            
            // Calculate target positions
            const targetPositions = [];
            const oldShape = currentShape;
            currentShape = targetShape;
            
            for (let i = 0; i < particleCount; i++) {
                const pos = getShapePosition(i, particleCount, time);
                targetPositions.push(pos.x, pos.y, pos.z);
            }
            
            // Animate morph
            const startTime = performance.now();
            const endTime = startTime + duration * 1000;
            
            function animateMorph() {
                const now = performance.now();
                const progress = Math.min((now - startTime) / duration / 1000, 1);
                
                // Ease in-out cubic
                const eased = progress < 0.5
                    ? 4 * progress * progress * progress
                    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
                
                // Interpolate positions
                for (let i = 0; i < particleCount; i++) {
                    const x = startPositions[i * 3] + (targetPositions[i * 3] - startPositions[i * 3]) * eased;
                    const y = startPositions[i * 3 + 1] + (targetPositions[i * 3 + 1] - startPositions[i * 3 + 1]) * eased;
                    const z = startPositions[i * 3 + 2] + (targetPositions[i * 3 + 2] - startPositions[i * 3 + 2]) * eased;
                    posAttr.setXYZ(i, x, y, z);
                }
                
                posAttr.needsUpdate = true;
                
                if (progress < 1) {
                    requestAnimationFrame(animateMorph);
                } else {
                    currentShape = targetShape;
                }
            }
            
            animateMorph();
        }

        function setupPostProcessing() {
            composer = new EffectComposer(renderer);

            const renderPass = new RenderPass(scene, camera);
            composer.addPass(renderPass);

            // Bloom — оптимизированные параметры
            // Разрешение уменьшено до 1/2 для производительности
            const bloomResolution = new THREE.Vector2(
                Math.floor(window.innerWidth / 2),
                Math.floor(window.innerHeight / 2)
            );
            
            bloomPass = new UnrealBloomPass(
                bloomResolution,
                bloomIntensity,  // strength: 0.5-3.0 (default 1.8)
                0.4,             // radius: оптимизировано
                0.85             // threshold: оптимизировано
            );
            
            composer.addPass(bloomPass);
            
            // Адаптивное качество Bloom
            window.adjustBloomQuality = function(fps) {
                if (fps < 30) {
                    // Низкий FPS — уменьшаем качество
                    bloomPass.strength = Math.max(0.5, bloomIntensity * 0.5);
                    bloomPass.resolution.set(
                        Math.floor(window.innerWidth / 4),
                        Math.floor(window.innerHeight / 4)
                    );
                } else if (fps >= 30 && fps < 55) {
                    // Средний FPS
                    bloomPass.strength = bloomIntensity;
                    bloomPass.resolution.set(
                        Math.floor(window.innerWidth / 2),
                        Math.floor(window.innerHeight / 2)
                    );
                } else {
                    // Высокий FPS — полное качество
                    bloomPass.strength = bloomIntensity;
                    bloomPass.resolution.set(
                        Math.floor(window.innerWidth),
                        Math.floor(window.innerHeight)
                    );
                }
            };
        }

        function setupEventListeners() {
            // Resize
            window.addEventListener('resize', () => {
                camera.aspect = window.innerWidth / window.innerHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(window.innerWidth, window.innerHeight);
                composer.setSize(window.innerWidth, window.innerHeight);
            });
            
            // Controls
            document.getElementById('particle-count-slider').addEventListener('input', e => {
                const newCount = parseInt(e.target.value);

                // Пересобираем частицы если количество изменилось
                if (newCount !== particleCount) {
                    particleCount = newCount;
                    rebuildParticles(); // Полная пересборка
                    // Применяем размер частиц после пересборки
                    if (material) {
                        material.size = particleSize;
                    }
                }

                document.getElementById('particle-count-value').textContent =
                    (particleCount / 1000).toFixed(0) + 'K';
                document.getElementById('particle-count').textContent = particleCount.toLocaleString();
            });

            document.getElementById('particle-size').addEventListener('input', e => {
                material.size = parseFloat(e.target.value);
                document.getElementById('particle-size-value').textContent = e.target.value;
            });

            document.getElementById('sim-speed').addEventListener('input', e => {
                simSpeed = parseFloat(e.target.value);
                document.getElementById('sim-speed-value').textContent = e.target.value;
            });
            
            document.getElementById('shape-select').addEventListener('change', e => {
                const newShape = e.target.value;
                document.getElementById('form-name').textContent = e.target.options[e.target.selectedIndex].text;
                
                // Плавный морфинг вместо мгновенной смены
                morphToShape(newShape, 1.0); // 1 second morph
            });

            document.getElementById('form-scale').addEventListener('input', e => {
                formScale = parseInt(e.target.value);
                document.getElementById('form-scale-value').textContent = e.target.value;
                updateParticles();
            });

            document.getElementById('form-rotation').addEventListener('input', e => {
                formRotationSpeed = parseFloat(e.target.value);
                document.getElementById('form-rotation-value').textContent = e.target.value;
            });

            document.getElementById('form-chaos').addEventListener('input', e => {
                formChaos = parseInt(e.target.value);
                document.getElementById('form-chaos-value').textContent = e.target.value;
                updateParticles();
            });

            document.getElementById('color-mode').addEventListener('change', e => {
                colorMode = e.target.value;
                updateParticles(); // Обновить цвета
            });

            document.getElementById('hue-offset').addEventListener('input', e => {
                hueOffset = parseInt(e.target.value);
                document.getElementById('hue-offset-value').textContent = e.target.value + '°';
                updateParticles(); // Обновить цвета
            });

            document.getElementById('bloom-intensity').addEventListener('input', e => {
                bloomIntensity = parseFloat(e.target.value);
                bloomPass.strength = bloomIntensity;
                document.getElementById('bloom-intensity-value').textContent = e.target.value;
            });

            document.getElementById('bloom-toggle').addEventListener('change', e => {
                bloomEnabled = e.target.checked;
                bloomPass.enabled = bloomEnabled;
            });

            document.getElementById('trail-toggle').addEventListener('change', e => {
                trailEnabled = e.target.checked;
            });

            // Кнопки - используем ?. для безопасности (если кнопки нет в HTML)
            document.getElementById('btn-export-vanilla')?.addEventListener('click', () => exportCode('vanilla'));
            document.getElementById('btn-export-react')?.addEventListener('click', () => exportCode('react'));
            document.getElementById('btn-export-three')?.addEventListener('click', () => exportCode('three'));
            document.getElementById('btn-aspect-1-1')?.addEventListener('click', () => setAspectRatio('1:1'));
            document.getElementById('btn-aspect-16-9')?.addEventListener('click', () => setAspectRatio('16:9'));
            document.getElementById('btn-aspect-9-16')?.addEventListener('click', () => setAspectRatio('9:16'));
            document.getElementById('btn-aspect-4-3')?.addEventListener('click', () => setAspectRatio('4:3'));
            document.getElementById('btn-form-sphere')?.addEventListener('click', () => setForm('sphere'));
            document.getElementById('btn-form-cube')?.addEventListener('click', () => setForm('cube'));
            document.getElementById('btn-form-helix')?.addEventListener('click', () => setForm('helix'));
            document.getElementById('btn-form-donut')?.addEventListener('click', () => setForm('donut'));
            document.getElementById('btn-form-ribbon')?.addEventListener('click', () => setForm('ribbon'));
            document.getElementById('btn-form-vortex')?.addEventListener('click', () => setForm('vortex'));
            document.getElementById('btn-initialize')?.addEventListener('click', initializeNeuralLink);
            document.getElementById('btn-live-update')?.addEventListener('click', toggleLiveUpdate);
            document.getElementById('btn-download-code')?.addEventListener('click', downloadCode);
            document.getElementById('btn-copy')?.addEventListener('click', copyCode);
            document.getElementById('btn-open-drawing')?.addEventListener('click', openDrawingPad);
            document.getElementById('btn-pen')?.addEventListener('click', () => selectTool('pen'));
            document.getElementById('btn-eraser')?.addEventListener('click', () => selectTool('eraser'));
            document.getElementById('btn-undo')?.addEventListener('click', undo);
            document.getElementById('btn-redo')?.addEventListener('click', redo);
            document.getElementById('btn-sym')?.addEventListener('click', toggleSymmetry);
            document.getElementById('btn-pulsar')?.addEventListener('click', togglePulsar);
            
            // Drawing Pad Toggle
            document.getElementById('drawing-pad-toggle')?.addEventListener('click', toggleDrawingPad);
            document.getElementById('btn-aspect-3-4')?.addEventListener('click', () => setAspectRatio('3:4'));
            document.getElementById('btn-aspect-custom')?.addEventListener('click', () => setAspectRatio('custom'));
            
            // Новые кнопки v3.0
            document.getElementById('btn-platform-vanilla')?.addEventListener('click', () => exportCode('vanilla'));
            document.getElementById('btn-platform-react')?.addEventListener('click', () => exportCode('react'));
            document.getElementById('btn-platform-three')?.addEventListener('click', () => exportCode('three'));
            document.getElementById('btn-platform-image')?.addEventListener('click', () => showNotification('Wallpapers: COMING SOON'));
            document.getElementById('btn-platform-ply')?.addEventListener('click', () => showNotification('PLY Export: COMING SOON'));
            document.getElementById('btn-platform-glb')?.addEventListener('click', () => showNotification('GLB Export: COMING SOON'));
            document.getElementById('btn-platform-obj')?.addEventListener('click', () => showNotification('OBJ Export: COMING SOON'));
            
            document.getElementById('btn-play-pause')?.addEventListener('click', togglePlayPause);
            document.getElementById('btn-copy-prompt')?.addEventListener('click', copyPrompt);
            document.getElementById('btn-save-local')?.addEventListener('click', saveLocalPreset);
            document.getElementById('btn-publish')?.addEventListener('click', publishPreset);
            document.getElementById('btn-ai-guide')?.addEventListener('click', () => showNotification('AI Guide: COMING SOON'));
            document.getElementById('btn-visualize-text')?.addEventListener('click', () => showNotification('Visualize Text: COMING SOON'));
            
            document.getElementById('btn-upload-image')?.addEventListener('click', () => uploadFile('image'));
            document.getElementById('btn-upload-video')?.addEventListener('click', () => uploadFile('video'));
            document.getElementById('btn-upload-3d')?.addEventListener('click', () => uploadFile('3d'));
            document.getElementById('btn-upload-blueprint')?.addEventListener('click', () => uploadFile('blueprint'));
            document.getElementById('btn-load-cloud')?.addEventListener('click', () => showNotification('Cloud Shapes: COMING SOON'));

            // Pinch-to-zoom для мобильных (плавный)
            let initialPinchDistance = null;
            let currentZoomDistance = camera.position.length(); // Инициализируем текущей позицией камеры

            renderer.domElement.addEventListener('touchstart', (e) => {
                if (e.touches.length === 2) {
                    // Сохраняем начальное расстояние между пальцами
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
                }
            }, { passive: true });

            renderer.domElement.addEventListener('touchmove', (e) => {
                if (e.touches.length === 2 && initialPinchDistance !== null) {
                    e.preventDefault();
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    const currentDistance = Math.sqrt(dx * dx + dy * dy);
                    
                    // Вычисляем изменение зума (плавное, с коэффициентом 0.5)
                    const zoomDelta = (initialPinchDistance - currentDistance) * 0.5;
                    currentZoomDistance += zoomDelta;
                    
                    // Ограничиваем зум
                    currentZoomDistance = Math.max(10, Math.min(currentZoomDistance, 2000));
                    
                    // Устанавливаем камеру
                    camera.position.setLength(currentZoomDistance);
                    controls.update();
                }
            }, { passive: false });

            renderer.domElement.addEventListener('touchend', () => {
                initialPinchDistance = null;
            });

            // Wheel зум для всех устройств (очень плавный)
            renderer.domElement.addEventListener('wheel', (e) => {
                e.preventDefault();
                const zoomSpeed = 0.15; // Уменьшенная чувствительность
                currentZoomDistance += e.deltaY * zoomSpeed;
                
                // Ограничиваем зум
                currentZoomDistance = Math.max(10, Math.min(currentZoomDistance, 2000));
                
                // Устанавливаем камеру
                camera.position.setLength(currentZoomDistance);
                controls.update();
            }, { passive: false });
            
            document.getElementById('btn-build-3d')?.addEventListener('click', () => toggleLiveUpdate());
            
            // Anim select
            document.getElementById('anim-select')?.addEventListener('change', (e) => {
                currentAnimation = e.target.value;
                showNotification(`Animation: ${currentAnimation}`);
            });
            
            // Toggle HUD и Controls
            document.getElementById('hud-toggle')?.addEventListener('click', toggleHUD);
            document.getElementById('controls-toggle')?.addEventListener('click', toggleControls);

            // Горячая клавиша Tab для переключения видимости
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Tab') {
                    e.preventDefault();
                    toggleHUD();
                    toggleControls();
                }
            });
            
            // Плавный зум через wheel (только для десктопа)
            renderer.domElement.addEventListener('wheel', (e) => {
                // Пропускаем если это не колесо мыши
                if (e.deltaMode !== 0) return;
                
                e.preventDefault();
                const zoomSensitivity = 0.0008;
                targetZoomDistance *= Math.exp(e.deltaY * zoomSensitivity);
                targetZoomDistance = Math.max(controls.minDistance, Math.min(targetZoomDistance, controls.maxDistance));
            }, { passive: false });
        }

        // ============================================
        // GLOBAL FUNCTIONS (для кнопок)
        // ============================================
        function randomize() {
            currentShape = ['sphere', 'torus', 'spiral', 'cube', 'plane', 'helix', 'donut', 'ribbon', 'vortex', 'chaos'][Math.floor(Math.random() * 10)];
            document.getElementById('shape-select').value = currentShape;
            document.getElementById('form-name').textContent = 
                document.getElementById('shape-select').options[document.getElementById('shape-select').selectedIndex].text;
            
            formScale = 100 + Math.random() * 150;
            document.getElementById('form-scale').value = formScale;
            document.getElementById('form-scale-value').textContent = formScale.toFixed(0);
            
            formChaos = Math.floor(Math.random() * 50);
            document.getElementById('form-chaos').value = formChaos;
            document.getElementById('form-chaos-value').textContent = formChaos;
            
            hueOffset = Math.floor(Math.random() * 360);
            document.getElementById('hue-offset').value = hueOffset;
            document.getElementById('hue-offset-value').textContent = hueOffset + '°';
        }

        function reset() {
            currentShape = 'cube';
            document.getElementById('shape-select').value = 'cube';
            formScale = 150;
            formRotationSpeed = 0.3;
            formChaos = 0;
            simSpeed = 0.5;
            bloomIntensity = 3.0;
            hueOffset = 0;
            particleSize = 0.5;

            // Обновляем UI
            document.getElementById('form-scale').value = 150;
            document.getElementById('form-scale-value').textContent = '150';
            document.getElementById('form-rotation').value = 0.3;
            document.getElementById('form-rotation-value').textContent = '0.3';
            document.getElementById('form-chaos').value = 0;
            document.getElementById('form-chaos-value').textContent = '0';
            document.getElementById('sim-speed').value = 0.5;
            document.getElementById('sim-speed-value').textContent = '0.5';
            document.getElementById('bloom-intensity').value = 3;
            document.getElementById('bloom-intensity-value').textContent = '3.0';
            document.getElementById('hue-offset').value = 0;
            document.getElementById('hue-offset-value').textContent = '0°';
            document.getElementById('particle-size').value = 0.5;
            document.getElementById('particle-size-value').textContent = '0.5';
            document.getElementById('form-name').textContent = '📦 Cube';
        }

        function toggleFullscreen() {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen();
            } else {
                document.exitFullscreen();
            }
        }

        // ============================================
        // EXPORT FUNCTIONS
        // ============================================
        function exportCode(type) {
            const code = generateExportCode(type);
            const blob = new Blob([code], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ether-resonance-${type.toLowerCase()}.js`;
            a.click();
            URL.revokeObjectURL(url);
            console.log(`Exported ${type} code`);
        }

        function generateExportCode(type) {
            const config = {
                particleCount: particleCount,
                shape: currentShape,
                formScale: formScale,
                formRotation: formRotation,
                formChaos: formChaos,
                colorMode: colorMode,
                hueOffset: hueOffset,
                bloomIntensity: bloomIntensity,
                simSpeed: simSpeed
            };

            if (type === 'vanilla') {
                return `// ETHER RESONANCE — Vanilla JS Export
const config = ${JSON.stringify(config, null, 2)};
console.log('Vanilla JS export:', config);
// Full implementation would go here
`;
            } else if (type === 'react') {
                return `// ETHER RESONANCE — React Export
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

const config = ${JSON.stringify(config, null, 2)};

export default function EtherResonance() {
    const canvasRef = useRef(null);
    
    useEffect(() => {
        if (!canvasRef.current) return;
        // Three.js setup here
    }, []);
    
    return <canvas ref={canvasRef} />;
}
`;
            } else if (type === 'three') {
                return `// ETHER RESONANCE — Three.js Module Export
import * as THREE from 'three';

const config = ${JSON.stringify(config, null, 2)};

export function createParticleScene(config) {
    const scene = new THREE.Scene();
    // Implementation here
    return { scene, config };
}
`;
            }
            return '// Unknown export type';
        }

        // ============================================
        // ASPECT RATIO FUNCTIONS
        // ============================================
        function setAspectRatio(ratio) {
            const [w, h] = ratio.split(':').map(Number);
            const aspect = w / h;
            console.log(`Setting aspect ratio to ${ratio} (${aspect.toFixed(3)})`);
            
            // Для canvas можно установить ограничения
            const container = document.body;
            const containerAspect = container.clientWidth / container.clientHeight;
            
            if (containerAspect > aspect) {
                // Container шире, чем нужно
                const newWidth = container.clientHeight * aspect;
                const marginLeft = (container.clientWidth - newWidth) / 2;
                renderer.domElement.style.marginLeft = marginLeft + 'px';
            } else {
                // Container выше, чем нужно
                const newHeight = container.clientWidth / aspect;
                const marginTop = (container.clientHeight - newHeight) / 2;
                renderer.domElement.style.marginTop = marginTop + 'px';
            }
        }

        // ============================================
        // FORM BUTTONS
        // ============================================
        function setForm(shape) {
            currentShape = shape;
            document.getElementById('shape-select').value = shape;
            
            const shapeNames = {
                'sphere': '🔮 Sphere',
                'cube': '📦 Cube',
                'helix': '🌀 Helix',
                'donut': '🍩 Donut'
            };
            
            // Обновляем отображаемое имя
            document.getElementById('form-name').textContent = shapeNames[shape] || shape;
            
            // Trigger update
            updateParticles();
            console.log(`Form set to: ${shape}`);
        }

        // ============================================
        // PRESET FUNCTIONS (localStorage)
        // ============================================
        function savePreset(slot = 1) {
            const preset = {
                particleCount,
                shape: currentShape,
                formScale,
                formRotation,
                formChaos,
                colorMode,
                hueOffset,
                bloomIntensity,
                simSpeed,
                autoRotate,
                rotateSpeed: parseFloat(document.getElementById('rotate-speed').value),
                savedAt: new Date().toISOString()
            };
            
            localStorage.setItem(`ether-preset-${slot}`, JSON.stringify(preset));
            console.log(`Preset ${slot} saved:`, preset);
            
            // Визуальная обратная связь
            const btn = event.target;
            const originalText = btn.textContent;
            btn.textContent = '✅ Saved!';
            btn.style.background = 'rgba(0, 255, 100, 0.4)';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = '';
            }, 1000);
        }

        function loadPreset(slot = 1) {
            const saved = localStorage.getItem(`ether-preset-${slot}`);
            if (!saved) {
                console.log(`No preset found in slot ${slot}`);
                alert('No saved preset found!');
                return;
            }
            
            const preset = JSON.parse(saved);
            
            // Apply preset
            particleCount = preset.particleCount;
            currentShape = preset.shape;
            formScale = preset.formScale;
            formRotation = preset.formRotation;
            formChaos = preset.formChaos;
            colorMode = preset.colorMode;
            hueOffset = preset.hueOffset;
            bloomIntensity = preset.bloomIntensity;
            simSpeed = preset.simSpeed;
            autoRotate = preset.autoRotate;
            
            // Update UI
            document.getElementById('particle-count-slider').value = particleCount;
            document.getElementById('particle-count-value').textContent = (particleCount / 1000) + 'K';
            document.getElementById('shape-select').value = currentShape;
            document.getElementById('form-scale').value = formScale;
            document.getElementById('form-scale-value').textContent = formScale.toFixed(0);
            document.getElementById('form-rotation').value = formRotation;
            document.getElementById('form-rotation-value').textContent = formRotation.toFixed(2);
            document.getElementById('form-chaos').value = formChaos;
            document.getElementById('form-chaos-value').textContent = formChaos;
            document.getElementById('hue-offset').value = hueOffset;
            document.getElementById('hue-offset-value').textContent = hueOffset + '°';
            document.getElementById('bloom-intensity').value = bloomIntensity;
            document.getElementById('bloom-intensity-value').textContent = bloomIntensity.toFixed(1);
            document.getElementById('sim-speed').value = simSpeed;
            document.getElementById('sim-speed-value').textContent = simSpeed.toFixed(2);
            document.getElementById('rotate-speed').value = preset.rotateSpeed;
            document.getElementById('rotate-speed-value').textContent = preset.rotateSpeed.toFixed(2);
            document.getElementById('auto-rotate').checked = autoRotate;
            
            // Update form name
            const options = document.getElementById('shape-select').options;
            for (let i = 0; i < options.length; i++) {
                if (options[i].value === currentShape) {
                    document.getElementById('form-name').textContent = options[i].text;
                    break;
                }
            }
            
            console.log(`Preset ${slot} loaded:`, preset);
            updateParticles();
        }

        // ============================================
        // V2.0 FUNCTIONS
        // ============================================
        
        // Toggle HUD visibility
        function toggleHUD() {
            const hud = document.getElementById('hud');
            hud.classList.toggle('hidden');
        }
        
        // Toggle Controls visibility
        function toggleControls() {
            const controls = document.getElementById('controls');
            controls.classList.toggle('hidden');
        }
        
        // Initialize Neural Link
        function initializeNeuralLink() {
            const calibScreen = document.getElementById('calibration');
            const linkStatus = document.getElementById('link-status');
            const calibStatus = document.getElementById('calibration-status');
            
            // Показываем экран калибровки
            calibScreen.classList.add('active');
            
            // Имитация калибровки (3 секунды)
            let progress = 0;
            const interval = setInterval(() => {
                progress += 10;
                if (progress >= 100) {
                    clearInterval(interval);
                    calibScreen.classList.remove('active');
                    linkStatus.textContent = 'ONLINE';
                    linkStatus.style.color = '#0f8';
                    calibStatus.style.display = 'block';
                    showNotification('NEURAL LINK CALIBRATED!');
                }
            }, 300);
        }
        
        // LIVE UPDATE toggle
        let liveUpdateEnabled = false;
        function toggleLiveUpdate() {
            liveUpdateEnabled = !liveUpdateEnabled;
            const btn = document.getElementById('btn-live-update');
            if (liveUpdateEnabled) {
                btn.textContent = '⚡ LIVE: ON';
                btn.style.background = 'rgba(0, 255, 100, 0.3)';
                showNotification('LIVE UPDATE ENABLED');
            } else {
                btn.textContent = '⚡ LIVE UPDATE';
                btn.style.background = '';
                showNotification('LIVE UPDATE DISABLED');
            }
        }
        
        // Copy code to clipboard
        function copyCode() {
            const platform = document.getElementById('export-platform').value;
            const code = generateExportCode(platform);
            
            navigator.clipboard.writeText(code).then(() => {
                showNotification('CODE COPIED TO CLIPBOARD!');
                const btn = document.getElementById('btn-copy');
                const originalText = btn.textContent;
                btn.textContent = '✅ Copied!';
                setTimeout(() => {
                    btn.textContent = originalText;
                }, 2000);
            }).catch(err => {
                showNotification('FAILED TO COPY: ' + err);
            });
        }
        
        // Download code
        function downloadCode() {
            const platform = document.getElementById('export-platform').value;
            const resolution = document.getElementById('export-resolution').value;
            const format = document.getElementById('export-format').value;
            
            const code = generateExportCode(platform);
            const blob = new Blob([code], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ether-resonance-${platform}-${resolution}.${format === 'webp' ? 'js' : 'js'}`;
            a.click();
            URL.revokeObjectURL(url);
            showNotification(`CODE DOWNLOADED: ${platform} ${resolution}`);
        }

        // Toggle Drawing Pad visibility
        function toggleDrawingPad() {
            const pad = document.getElementById('drawing-pad');
            const toggle = document.getElementById('drawing-pad-toggle');
            pad.classList.toggle('hidden');
            
            if (pad.classList.contains('hidden')) {
                toggle.textContent = '🎨';
                toggle.title = 'Show Drawing Pad';
            } else {
                toggle.textContent = '✖️';
                toggle.title = 'Hide Drawing Pad';
                showNotification('DRAWING PAD: COMING SOON');
            }
        }

        // Open Drawing Pad (modal)
        function openDrawingPad() {
            showNotification('DRAWING PAD: COMING SOON');
            // TODO: Реализовать модальное окно с canvas для рисования
        }

        // Drawing Pad tools (COMING SOON)
        let currentTool = 'pen';
        function selectTool(tool) {
            showNotification(`${tool.toUpperCase()}: COMING SOON`);
        }

        // Undo/Redo (заглушки)
        function undo() {
            showNotification('UNDO: COMING SOON');
        }

        function redo() {
            showNotification('REDO: COMING SOON');
        }

        // Symmetry toggle (COMING SOON)
        function toggleSymmetry() {
            showNotification('SYMMETRY: COMING SOON');
        }

        // Pulsar mode (COMING SOON)
        function togglePulsar() {
            showNotification('PULSAR: COMING SOON');
        }
        
        // Notification system
        function showNotification(message) {
            // Создаём уведомление
            const notification = document.createElement('div');
            notification.textContent = message;
            notification.style.cssText = `
                position: fixed;
                bottom: 100px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0, 255, 255, 0.9);
                color: #000;
                padding: 12px 24px;
                border-radius: 6px;
                font-size: 11px;
                font-weight: bold;
                text-transform: uppercase;
                letter-spacing: 1px;
                z-index: 10000;
                box-shadow: 0 0 20px rgba(0, 255, 255, 0.6);
                animation: fadeOut 2s forwards;
            `;
            document.body.appendChild(notification);
            
            // Удаляем через 2 секунды
            setTimeout(() => {
                notification.remove();
            }, 2000);
        }
        
        // Add notification animation to CSS
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeOut {
                0% { opacity: 1; transform: translateX(-50%) translateY(0); }
                80% { opacity: 1; transform: translateX(-50%) translateY(-10px); }
                100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
            }
        `;
        document.head.appendChild(style);
        
        // Export functions
        window.toggleHUD = toggleHUD;
        window.toggleControls = toggleControls;
        window.downloadCode = downloadCode;
        window.copyCode = copyCode;
        window.initializeNeuralLink = initializeNeuralLink;
        window.toggleLiveUpdate = toggleLiveUpdate;
        window.openDrawingPad = openDrawingPad;
        window.selectTool = selectTool;
        window.undo = undo;
        window.redo = redo;
        window.toggleSymmetry = toggleSymmetry;
        window.togglePulsar = togglePulsar;
        window.toggleDrawingPad = toggleDrawingPad;
        window.showNotification = showNotification;
        
        // V3.0 functions
        let isPaused = false;
        function togglePlayPause() {
            isPaused = !isPaused;
            const btn = document.getElementById('btn-play-pause');
            if (isPaused) {
                btn.textContent = '▶️ Play';
                showNotification('PAUSED');
            } else {
                btn.textContent = '▶️ Play/Pause';
                showNotification('RESUMED');
            }
        }
        
        function copyPrompt() {
            const prompt = `Ether Resonance: ${currentShape}, ${particleCount} particles, ${colorMode} mode`;
            navigator.clipboard.writeText(prompt).then(() => {
                showNotification('PROMPT COPIED!');
            });
        }
        
        function saveLocalPreset() {
            const preset = {
                particleCount,
                colorMode,
                currentShape,
                bloomIntensity,
                simSpeed,
                hueOffset,
                savedAt: new Date().toISOString()
            };
            localStorage.setItem('etherPreset', JSON.stringify(preset));
            showNotification('SAVED LOCALLY!');
        }
        
        function publishPreset() {
            showNotification('PUBLISHED TO CLOUD!');
        }
        
        function uploadFile(type) {
            const accept = type === 'image' ? 'image/*' :
                          type === 'video' ? 'video/*' :
                          type === '3d' ? '.obj,.glb,.ply' : '.json';
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = accept;
            input.onchange = e => {
                const file = e.target.files[0];
                if (file) {
                    showNotification(`UPLOADED: ${file.name}`);
                }
            };
            input.click();
        }
        
        let currentAnimation = 'static';
        
        window.togglePlayPause = togglePlayPause;
        window.copyPrompt = copyPrompt;
        window.saveLocalPreset = saveLocalPreset;
        window.publishPreset = publishPreset;
        window.uploadFile = uploadFile;

        window.exportCode = exportCode;
        window.setAspectRatio = setAspectRatio;
        window.setForm = setForm;
        window.savePreset = savePreset;
        window.loadPreset = loadPreset;

        window.randomize = randomize;
        window.reset = reset;
        window.toggleFullscreen = toggleFullscreen;

        // ============================================
        // ANIMATION LOOP
        // ============================================
        // Zero GC: кэшированные цвета для trail
        // ============================================
        const trailClearColor = new THREE.Color(0x000005);

        let lastQualityAdjustTime = 0;

        function animate() {
            requestAnimationFrame(animate);

            // FPS
            frameCount++;
            const now = performance.now();
            if (now - lastFpsTime >= 1000) {
                fps = frameCount;
                frameCount = 0;
                lastFpsTime = now;
                document.getElementById('fps-display').textContent = fps;

                // Адаптивное качество Bloom каждые 3 секунды
                if (now - lastQualityAdjustTime >= 3000 && typeof window.adjustBloomQuality === 'function') {
                    window.adjustBloomQuality(fps);
                    lastQualityAdjustTime = now;
                }
            }

            // Update time
            time += simSpeed * 0.01;

            // Update particles (только если геометрия инициализирована)
            if (geometry && geometry.attributes && geometry.attributes.position) {
                updateParticles();
            }

            // Update controls (только если controls инициализирован)
            if (controls) {
                controls.update();

                // Update camera info
                document.getElementById('camera-info').textContent =
                    controls.autoRotate ? 'AUTO' : 'MANUAL';
            }

            // Render
            if (trailEnabled) {
                // Trail effect через полупрозрачный фон
                renderer.autoClear = false;
                renderer.setClearColor(trailClearColor, 0.2);
                renderer.clear();
                composer.render();
            } else {
                renderer.autoClear = true;
                composer.render();
            }
        }

        // ============================================
        // LOADING HELPER
        // ============================================
        function updateLoading(percent, status) {
            document.getElementById('load-progress').style.width = percent + '%';
            document.getElementById('load-status').textContent = status;
        }

        // ============================================
        // START
        // ============================================
        init();
        // animate() вызывается внутри init()
