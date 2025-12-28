import { ChristmasTree } from './christmas_tree.js?v=macaron16';

const THREE = window.THREE;
const TWEEN = window.TWEEN;

export class SceneController {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = new THREE.Scene();
        this.baseClearColor = 0xfbf7ff;
        this.treeClearColor = 0xf9efff;
        this.scene.fog = new THREE.FogExp2(this.baseClearColor, 0.012);
        
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.z = 10;
        this.camera.position.y = 0.5;
        this.cameraTarget = new THREE.Vector3(0, 0, 0);
        this.treeZoomTargetZ = 22;
        this._treeZoomRawZ = this.treeZoomTargetZ;
        this._treeCameraTweening = false;
        this._treeExitTimer = null;

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(this.baseClearColor, 1);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.35;
        this.renderer.physicallyCorrectLights = true;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        this.cards = [];
        this.carouselGroup = new THREE.Group();
        this.scene.add(this.carouselGroup);
        this.cardBackTexture = this.createCardBackTexture();
        
        this.selectedIndex = 0;
        this.isZoomed = false;
        this.particles = null;
        this.isDissolving = false;
        
        // Heart Mode State
        this.isHeartMode = false;
        this.heartSystem = null;
        
        // Tree Mode State
        this.isTreeMode = false;
        this.loadedTextures = [];
        this.christmasTree = new ChristmasTree(this, this.loadedTextures);

        this.setupLights();
        this.setupBackground();
        this.isIntroActive = true;
        this._introTimeoutId = null;
        this._introDissolveTween = null;
        this._introMesh = null;
        this._introStart = null;
        this._introEnd = null;
        this._introCubeSize = 0.06;
        this._introTmpObject = new THREE.Object3D();
        this._cardDissolveStart = null;
        this._cardDissolveDuration = 5200;
        this._cardDissolveOpacityStart = 0.85;
        this.carouselGroup.visible = false;
        this.carouselGroup.scale.set(0, 0, 0);
        this.scrollVelocity = 0;
        this.scrollForce = 0;
        this.isInteracting = false;
        this.initIntro();
        this.loadTextures();
        
        window.addEventListener('resize', this.onResize.bind(this));
        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }

    _finishCardDissolveInstant() {
        this.isDissolving = false;
        this._cardDissolveStart = null;

        let index = Math.round(this.selectedIndex);
        index = (index % 10 + 10) % 10;
        const card = this.cards.find(c => c.userData.index === index);

        if (card) {
            const ud = card.userData;
            if (ud._flipTween) {
                ud._flipTween.stop();
                ud._flipTween = null;
            }
            if (ud._posTween) {
                ud._posTween.stop();
                ud._posTween = null;
            }
            if (ud._rotTween) {
                ud._rotTween.stop();
                ud._rotTween = null;
            }
            if (ud._scaleTween) {
                ud._scaleTween.stop();
                ud._scaleTween = null;
            }
            if (ud.face) ud.face.rotation.y = 0;
            ud.isPhoto = false;
            ud.mesh.material.opacity = 0;
            ud.back.material.opacity = 1;
            ud.border.material.opacity = 0.25;
            card.visible = true;
        }

        for (let i = 0; i < this.cards.length; i++) {
            const c = this.cards[i];
            const f = c?.userData?._fadeTweens;
            if (Array.isArray(f)) {
                f.forEach(t => t?.stop?.());
            }
            if (c?.userData) c.userData._fadeTweens = null;
        }

        this.isZoomed = false;

        if (this.particles) {
            if (this.particles.parent) this.particles.parent.remove(this.particles);
            this.particles.geometry.dispose();
            this.particles.material.dispose();
            this.particles = null;
        }

        this.updateCardsLayout();
    }

    initIntro() {
        const instanceCount = 15000;
        const text = '你好，mxm';
        const mask = this._createIntroTextMask(text, instanceCount);
        if (!mask || !mask.points || mask.points.length === 0) {
            this.isIntroActive = false;
            this.carouselGroup.visible = true;
            this.carouselGroup.scale.set(1, 1, 1);
            return;
        }

        const { points, step, bounds } = mask;
        const widthPx = Math.max(1, bounds.maxX - bounds.minX + 1);
        const heightPx = Math.max(1, bounds.maxY - bounds.minY + 1);

        const targetWidth = 9.4;
        const targetHeight = 4.2;
        const scale = Math.min(targetWidth / widthPx, targetHeight / heightPx);
        const cubeSize = Math.max(0.03, step * scale * 0.9);
        this._introCubeSize = cubeSize;

        const geo = new THREE.BoxGeometry(1, 1, 1);
        const mat = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 1,
            vertexColors: true,
            toneMapped: false
        });

        const mesh = new THREE.InstancedMesh(geo, mat, instanceCount);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;

        const start = new Float32Array(instanceCount * 3);
        const end = new Float32Array(instanceCount * 3);

        const centerX = (bounds.minX + bounds.maxX) * 0.5;
        const centerY = (bounds.minY + bounds.maxY) * 0.5;

        const palette = [
            new THREE.Color('#ffcad4'),
            new THREE.Color('#bde0fe'),
            new THREE.Color('#cdb4db'),
            new THREE.Color('#a7f3d0'),
            new THREE.Color('#ffe5b4'),
            new THREE.Color('#fde2e4')
        ];

        const tmp = this._introTmpObject;
        for (let i = 0; i < instanceCount; i++) {
            const p = points[i];
            const x = (p.x - centerX) * scale + (Math.random() - 0.5) * cubeSize * 0.22;
            const y = (centerY - p.y) * scale + (Math.random() - 0.5) * cubeSize * 0.22;
            const z = (Math.random() - 0.5) * 0.25;

            start[i * 3] = x;
            start[i * 3 + 1] = y;
            start[i * 3 + 2] = z;

            const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).normalize();
            const dist = 3.2 + Math.random() * 7.5;
            end[i * 3] = x + dir.x * dist;
            end[i * 3 + 1] = y + dir.y * dist;
            end[i * 3 + 2] = z + dir.z * dist;

            tmp.position.set(x, y, z);
            tmp.rotation.set(0, 0, 0);
            tmp.scale.set(cubeSize, cubeSize, cubeSize);
            tmp.updateMatrix();
            mesh.setMatrixAt(i, tmp.matrix);

            const c = palette[i % palette.length];
            mesh.setColorAt(i, c);
        }

        if (mesh.instanceColor) {
            mesh.instanceColor.needsUpdate = true;
        }
        mesh.instanceMatrix.needsUpdate = true;

        this._introMesh = mesh;
        this._introStart = start;
        this._introEnd = end;
        this.scene.add(mesh);

        this._introTimeoutId = window.setTimeout(() => {
            this.startIntroDissolve();
        }, 5000);
    }

    _createIntroTextMask(text, instanceCount) {
        const canvas = document.createElement('canvas');
        canvas.width = 2400;
        canvas.height = 720;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        const attempt = (fontSize, step) => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#000000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            let fs = fontSize;
            ctx.font = `900 ${fs}px system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", sans-serif`;
            const metrics = ctx.measureText(text);
            const safeW = canvas.width * 0.86;
            const safeH = canvas.height * 0.76;
            const mW = metrics.width;
            const mH = (metrics.actualBoundingBoxAscent || 0) + (metrics.actualBoundingBoxDescent || 0);
            if ((mW > safeW && mW > 1) || (mH > safeH && mH > 1)) {
                const kW = mW > 1 ? safeW / mW : 1;
                const kH = mH > 1 ? safeH / mH : 1;
                const k = Math.min(kW, kH);
                fs = Math.max(10, Math.floor(fs * k));
                ctx.font = `900 ${fs}px system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", sans-serif`;
            }
            ctx.fillText(text, canvas.width / 2, canvas.height / 2);

            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = img.data;

            const points = [];
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;

            for (let y = 0; y < canvas.height; y += step) {
                for (let x = 0; x < canvas.width; x += step) {
                    const a = data[(y * canvas.width + x) * 4 + 3];
                    if (a > 25) {
                        points.push({ x, y });
                        if (x < minX) minX = x;
                        if (y < minY) minY = y;
                        if (x > maxX) maxX = x;
                        if (y > maxY) maxY = y;
                    }
                }
            }

            if (points.length === 0) return null;
            return { points, step, bounds: { minX, minY, maxX, maxY } };
        };

        const configs = [
            { fontSize: 250, step: 6 },
            { fontSize: 260, step: 5 },
            { fontSize: 270, step: 4 },
            { fontSize: 280, step: 3 },
            { fontSize: 300, step: 2 },
            { fontSize: 320, step: 1 }
        ];

        let best = null;
        for (const cfg of configs) {
            const res = attempt(cfg.fontSize, cfg.step);
            if (!res) continue;
            best = res;
            if (res.points.length >= instanceCount) break;
        }
        if (!best) return null;

        const points = best.points;
        if (points.length > instanceCount) {
            for (let i = points.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const tmp = points[i];
                points[i] = points[j];
                points[j] = tmp;
            }
            best.points = points.slice(0, instanceCount);
        } else if (points.length < instanceCount) {
            const base = points.slice();
            while (points.length < instanceCount) {
                const p = base[Math.floor(Math.random() * base.length)];
                points.push({ x: p.x, y: p.y });
            }
            best.points = points;
        }

        return best;
    }

    startIntroDissolve() {
        if (!this.isIntroActive) return;
        if (!this._introMesh || !this._introStart || !this._introEnd) {
            this._finishIntro();
            return;
        }
        if (this._introTimeoutId) {
            clearTimeout(this._introTimeoutId);
            this._introTimeoutId = null;
        }
        if (this._introDissolveTween) {
            this._introDissolveTween.stop();
            this._introDissolveTween = null;
        }

        const state = { t: 0 };
        this._introDissolveTween = new TWEEN.Tween(state)
            .to({ t: 1 }, 2600)
            .easing(TWEEN.Easing.Cubic.InOut)
            .onUpdate(() => {
                this._applyIntroDissolve(state.t);
            })
            .onComplete(() => {
                this._introDissolveTween = null;
                this._finishIntro();
            })
            .start();
    }

    _applyIntroDissolve(t) {
        const mesh = this._introMesh;
        if (!mesh) return;
        const start = this._introStart;
        const end = this._introEnd;
        if (!start || !end) return;

        const tmp = this._introTmpObject;
        const s = this._introCubeSize * (1 - t * 0.65);
        for (let i = 0; i < mesh.count; i++) {
            const idx = i * 3;
            const x = start[idx] + (end[idx] - start[idx]) * t;
            const y = start[idx + 1] + (end[idx + 1] - start[idx + 1]) * t;
            const z = start[idx + 2] + (end[idx + 2] - start[idx + 2]) * t;
            tmp.position.set(x, y, z);
            tmp.scale.set(s, s, s);
            tmp.updateMatrix();
            mesh.setMatrixAt(i, tmp.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.material.opacity = Math.max(0, 1 - t);
    }

    _finishIntro() {
        if (this._introTimeoutId) {
            clearTimeout(this._introTimeoutId);
            this._introTimeoutId = null;
        }
        if (this._introDissolveTween) {
            this._introDissolveTween.stop();
            this._introDissolveTween = null;
        }

        if (this._introMesh) {
            this.scene.remove(this._introMesh);
            this._introMesh.geometry.dispose();
            this._introMesh.material.dispose();
        }

        this._introMesh = null;
        this._introStart = null;
        this._introEnd = null;

        this.isIntroActive = false;
        this.scrollVelocity = 0;
        this.scrollForce = 0;
        this.isInteracting = false;

        this.carouselGroup.visible = true;
        this.carouselGroup.scale.set(0, 0, 0);
        new TWEEN.Tween(this.carouselGroup.scale)
            .to({ x: 1, y: 1, z: 1 }, 1000)
            .easing(TWEEN.Easing.Elastic.Out)
            .start();
    }

    createHeartSystem() {
        // High-end Fluid Particle Heart
        // Optimize: Reduce particle count for initial load if performance is issue
        // But let's keep quality and just create it once.
        // Wait, creating 20k particles with complex shader compilation at start might lag.
        // We are already lazy creating it in showHeart().
        // Let's check showHeart.
        
        // ... (existing particle creation logic)
        const particleCount = 15000; // Reduced slightly from 20k for balance
        // ...

        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const sizes = new Float32Array(particleCount);
        const randomness = new Float32Array(particleCount * 3);
        
        // Cyberpunk Palette: Neon Pink, Electric Blue, Ultraviolet
        const colorCore = new THREE.Color(0xff0066); // Neon Pink
        const colorOuter = new THREE.Color(0x00f3ff); // Cyan/Electric Blue
        
        for (let i = 0; i < particleCount; i++) {
            // Layered Heart Structure
            // Layer 1: Dense Core (Classic Heart)
            // Layer 2: Orbital Rings / Magnetic Field Lines
            
            const t = Math.random() * Math.PI * 2;
            const u = Math.random(); 
            const layer = Math.random(); // 0-1
            
            let x, y, z;
            let r, g, b;
            let pSize = Math.random();
            
            if (layer < 0.6) {
                // Inner Core (60% particles)
                // Volumetric Heart
                // x = 16sin^3(t)
                x = 16 * Math.pow(Math.sin(t), 3);
                y = 13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t);
                z = (Math.random() - 0.5) * 6; 
                
                // Volume filling
                const scale = Math.pow(u, 1/3); // Cube root for uniform volume
                x *= scale;
                y *= scale;
                z *= scale;
                
                // Color: Deep Pink/Red gradient
                const c = colorCore.clone().lerp(new THREE.Color(0xaa00aa), Math.random() * 0.5);
                r = c.r; g = c.g; b = c.b;
                
            } else {
                // Outer Shell / Energy Field (40% particles)
                // Spiral / Vortex effect around the heart shape
                // We expand the heart shape and add spiral noise
                
                const t2 = t + Math.random() * 0.5; // Offset
                x = 16 * Math.pow(Math.sin(t2), 3);
                y = 13 * Math.cos(t2) - 5 * Math.cos(2*t2) - 2 * Math.cos(3*t2) - Math.cos(4*t2);
                z = (Math.random() - 0.5) * 15; // Wide Z spread for field
                
                // Expand outward
                const expansion = 1.2 + Math.random() * 0.5;
                x *= expansion;
                y *= expansion;
                
                // Color: Cyan/Blue Energy
                const c = colorOuter.clone();
                r = c.r; g = c.g; b = c.b;
                pSize *= 0.6; // Finer particles for halo
            }

            // Global Scale
            const sizeScale = 0.35;
            x *= sizeScale;
            y *= sizeScale;
            z *= sizeScale;

            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;
            
            randomness[i * 3] = Math.random();
            randomness[i * 3 + 1] = Math.random();
            randomness[i * 3 + 2] = Math.random();
            
            colors[i * 3] = r;
            colors[i * 3 + 1] = g;
            colors[i * 3 + 2] = b;
            
            sizes[i] = pSize;
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('aRandom', new THREE.BufferAttribute(randomness, 3));
        
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
                uSize: { value: 180.0 }
            },
            vertexShader: `
                uniform float uTime;
                uniform float uPixelRatio;
                uniform float uSize;
                
                attribute float aSize;
                attribute vec3 aRandom;
                varying vec3 vColor;
                varying float vAlpha;
                
                void main() {
                    vec3 pos = position;
                    float time = uTime * 1.5;
                    
                    // Complex Field Motion
                    // Core beats, Shell swirls
                    
                    float dist = length(pos);
                    
                    // Heartbeat (Rhythmic expansion)
                    // Sharp beat: exp(-5 * x) type shape
                    float beat = sin(time * 3.0);
                    float beatMag = smoothstep(0.0, 1.0, beat) * 0.05;
                    pos *= (1.0 + beatMag);
                    
                    // Vortex / Swirl
                    // Rotate based on height (Y) and time
                    float angle = time * 0.5 + pos.y * 0.2;
                    float s = sin(angle);
                    float c = cos(angle);
                    
                    // Apply rotation mainly to outer shell (further particles)
                    if (dist > 3.0) {
                        float tx = pos.x * c - pos.z * s;
                        float tz = pos.x * s + pos.z * c;
                        pos.x = tx;
                        pos.z = tz;
                    }
                    
                    // Noise flow
                    pos.x += sin(time * 2.0 + aRandom.y * 10.0) * 0.05;
                    pos.y += cos(time * 2.0 + aRandom.x * 10.0) * 0.05;
                    
                    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                    
                    gl_PointSize = uSize * aSize * uPixelRatio;
                    gl_PointSize *= (1.0 / -mvPosition.z);
                    
                    vColor = color;
                    
                    // Distance fade
                    vAlpha = 1.0;
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                varying float vAlpha;
                
                void main() {
                    // Soft glow particle
                    vec2 center = gl_PointCoord - 0.5;
                    float dist = length(center);
                    float alpha = 0.05 / dist; // Hyperbolic glow falloff
                    
                    // Core brightness
                    if (dist < 0.1) alpha += 0.5;
                    
                    // Cap alpha
                    alpha = min(alpha, 1.0);
                    
                    gl_FragColor = vec4(vColor, alpha * vAlpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            vertexColors: true
        });
        
        const heart = new THREE.Points(geometry, material);
        heart.rotation.x = Math.PI; 
        heart.rotation.z = Math.PI; 
        
        return heart;
    }

    showHeart() {
        if (this.isIntroActive) return;
        this.isHeartMode = true;
        
        // Hide Carousel
        new TWEEN.Tween(this.carouselGroup.scale)
            .to({ x: 0, y: 0, z: 0 }, 800)
            .easing(TWEEN.Easing.Back.In)
            .start();
            
        // Create Heart if not exists
        if (!this.heartSystem) {
            this.heartSystem = this.createHeartSystem();
            this.scene.add(this.heartSystem);
        }
        
        this.heartSystem.visible = true;
        this.heartSystem.scale.set(0, 0, 0);
        this.heartSystem.rotation.z = Math.PI; // Fix orientation
        
        new TWEEN.Tween(this.heartSystem.scale)
            .to({ x: 1, y: 1, z: 1 }, 1000)
            .easing(TWEEN.Easing.Elastic.Out)
            .start();
            
        // Enhance background
        new TWEEN.Tween(this.stars.material)
            .to({ size: 0.18, opacity: 0.35 }, 1000)
            .start();
    }
    
    hideHeart() {
        if (this.isIntroActive) return;
        this.isHeartMode = false;
        
        // Dissolve Heart (Scale down + Fade)
        new TWEEN.Tween(this.heartSystem.scale)
            .to({ x: 4, y: 4, z: 4 }, 500) // Explode outward visually
            .easing(TWEEN.Easing.Cubic.In)
            .start();
            
        new TWEEN.Tween(this.heartSystem.material.uniforms.uSize)
            .to({ value: 0 }, 500)
            .onComplete(() => {
                this.heartSystem.visible = false;
                this.heartSystem.material.uniforms.uSize.value = 150.0; // Reset
            })
            .start();
            
        // Show Carousel
        new TWEEN.Tween(this.carouselGroup.scale)
            .to({ x: 1, y: 1, z: 1 }, 1000)
            .delay(200)
            .easing(TWEEN.Easing.Elastic.Out)
            .start();
            
        // Reset background
        new TWEEN.Tween(this.stars.material)
            .to({ size: 0.12, opacity: 0.22 }, 1000)
            .start();
    }

    // --- Christmas Tree Mode ---
    
    showChristmasTree() {
        if (this.isIntroActive) return;
        if (this.isTreeMode) return;
        this.isTreeMode = true;
        this.isZoomed = true; // Lock scroll
        this.treeZoomTargetZ = 20.5;
        this._treeZoomRawZ = this.treeZoomTargetZ;
        this._treeCameraTweening = true;
        if (this.baseBg) this.baseBg.visible = false;
        if (this.treeBg) this.treeBg.visible = true;
        this.renderer.setClearColor(this.treeClearColor, 1);
        this.scene.fog.color.setHex(this.treeClearColor);
        this.scene.fog.density = 0.014;
        
        // Hide Carousel
        new TWEEN.Tween(this.carouselGroup.scale)
            .to({ x: 0, y: 0, z: 0 }, 1000)
            .easing(TWEEN.Easing.Back.In)
            .onComplete(() => {
                this.carouselGroup.visible = false;
                this.christmasTree.show();
            })
            .start();
            
        // Move Camera for better view
        new TWEEN.Tween(this.camera.position)
            .to({ y: 5.7, z: 20.5 }, 1500)
            .easing(TWEEN.Easing.Cubic.InOut)
            .onComplete(() => {
                this.treeZoomTargetZ = this.camera.position.z;
                this._treeCameraTweening = false;
            })
            .start();
            
        new TWEEN.Tween(this.cameraTarget)
            .to({ y: 1.2 }, 1500)
            .easing(TWEEN.Easing.Cubic.InOut)
            .start();
    }
    
    rotateTree(velocity) {
        if (this.isIntroActive) return;
        if (this.isTreeMode) {
            this.christmasTree.rotate(velocity);
        }
    }

    zoomTree(velocity) {
        if (this.isIntroActive) return;
        if (!this.isTreeMode) return;
        if (!Number.isFinite(velocity)) return;
        const v = THREE.MathUtils.clamp(velocity, -1.25, 1.25);
        this._treeZoomRawZ = THREE.MathUtils.clamp(this._treeZoomRawZ - v * 1.25, 14, 34);
    }
    
    dissolveTree() {
        if (this.isIntroActive) return;
        if (!this.isTreeMode) return;
        
        const started = this.christmasTree.dissolve();
        if (!started) {
            this.christmasTree.hide();
            this.showCarousel();
            return;
        }
        
        if (this._treeExitTimer) {
            clearTimeout(this._treeExitTimer);
        }
        this._treeExitTimer = setTimeout(() => {
            if (this.isTreeMode) {
                this.christmasTree.hide();
                this.showCarousel();
            }
        }, 1800);
    }
    
    showCarousel() {
        this.isTreeMode = false;
        this.isZoomed = false;
        this._treeCameraTweening = true;
        if (this._treeExitTimer) {
            clearTimeout(this._treeExitTimer);
            this._treeExitTimer = null;
        }
        if (this.baseBg) this.baseBg.visible = true;
        if (this.treeBg) this.treeBg.visible = false;
        this.renderer.setClearColor(this.baseClearColor, 1);
        this.scene.fog.color.setHex(this.baseClearColor);
        this.scene.fog.density = 0.012;
        
        // Reset Camera
        new TWEEN.Tween(this.camera.position)
            .to({ y: 0.5, z: 10 }, 1500)
            .easing(TWEEN.Easing.Cubic.InOut)
            .onComplete(() => {
                this._treeCameraTweening = false;
                this.treeZoomTargetZ = this.camera.position.z;
                this._treeZoomRawZ = this.treeZoomTargetZ;
            })
            .start();
            
        new TWEEN.Tween(this.cameraTarget)
            .to({ y: 0 }, 1200)
            .easing(TWEEN.Easing.Cubic.InOut)
            .start();
            
        this.carouselGroup.visible = true;
        this.carouselGroup.scale.set(0, 0, 0);
        
        new TWEEN.Tween(this.carouselGroup.scale)
            .to({ x: 1, y: 1, z: 1 }, 1000)
            .easing(TWEEN.Easing.Elastic.Out)
            .start();
            
        if (this.stars && this.stars.material) {
            this.stars.material.opacity = 0.22;
        }
    }

    loadTextures() {
        const textureLoader = new THREE.TextureLoader();
        const photoPaths = [
            'assets/f054f11482dad3a3392e536626e868ba.JPG',
            'assets/e2bbf041c99bbaf710ccfa27dbccdfcf.JPG',
            'assets/bb3bf73cbdb59410b2a248cea142ab94.JPG',
            'assets/54806a41fb0710de2a4baaf5ea0557f6.JPG',
            'assets/8218c3688827c3bef84b82816ccff57d.JPG',
            'assets/695c3b49c3f08cd859f27cc7d5b736d3.JPG',
            'assets/82d0dcc34ca649f8457533af4b566b34.JPG',
            'assets/73ecb4c063e01b0afe151c9d7609320a.JPG',
            'assets/4b2f115cbc28eb5e5561e5e910029750.JPG',
            'assets/1e0f52207fb5b5815d12cb966357de30.JPG'
        ];
        const total = photoPaths.length;
        let loadedCount = 0;

        for (let i = 0; i < total; i++) {
            const path = photoPaths[i];
            textureLoader.load(
                path,
                (texture) => {
                    texture.colorSpace = THREE.SRGBColorSpace;
                    this.loadedTextures.push(texture);
                    this.createCard(texture, i, total, 6);
                    loadedCount++;
                    if (loadedCount === total) {
                        // All loaded
                        console.log('All textures loaded');
                        // Update tree if it needs them
                        if (this.christmasTree) {
                             this.christmasTree.initPolaroids();
                        }
                    }
                },
                undefined,
                (err) => {
                    console.error(`Error loading texture ${path}`, err);
                    // Create placeholder if fails
                    const canvas = document.createElement('canvas');
                    canvas.width = 512;
                    canvas.height = 768;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#333';
                    ctx.fillRect(0, 0, 512, 768);
                    ctx.fillStyle = '#fff';
                    ctx.font = '40px Arial';
                    ctx.fillText(`Image ${i + 1}`, 100, 384);
                    const placeholder = new THREE.CanvasTexture(canvas);
                    this.createCard(placeholder, i, total, 6);
                }
            );
        }
    }

    setupBackground() {
        this.baseBg = new THREE.Group();
        this.treeBg = new THREE.Group();
        this.scene.add(this.baseBg);
        this.scene.add(this.treeBg);

        const treeGradientMat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uTop: { value: new THREE.Color(0xffe5ec) },
                uMid: { value: new THREE.Color(0xe0fbfc) },
                uBottom: { value: new THREE.Color(0xede7ff) }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float uTime;
                uniform vec3 uTop;
                uniform vec3 uMid;
                uniform vec3 uBottom;
                varying vec2 vUv;
                void main() {
                    float y = clamp(vUv.y, 0.0, 1.0);
                    float t = smoothstep(0.0, 1.0, y);
                    vec3 col = mix(uBottom, uTop, t);
                    float midBand = exp(-pow((y - 0.55) / 0.18, 2.0));
                    col = mix(col, uMid, midBand * 0.85);
                    vec2 p = vUv - vec2(0.2 + 0.05 * sin(uTime * 0.15), 0.85);
                    float blob = exp(-dot(p, p) * 6.0);
                    col += (uTop - col) * blob * 0.18;
                    float grain = (sin((vUv.x + uTime * 0.03) * 420.0) * sin((vUv.y - uTime * 0.02) * 360.0)) * 0.5 + 0.5;
                    col += (grain - 0.5) * 0.012;
                    gl_FragColor = vec4(col, 1.0);
                }
            `,
            depthWrite: false,
            depthTest: false,
            transparent: false
        });

        const treeGradient = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), treeGradientMat);
        treeGradient.position.set(0, 0, -220);
        treeGradient.renderOrder = -10;
        this.treeBg.add(treeGradient);
        this.treeGradient = treeGradient;

        const baseStarCount = 1800;
        const baseStarGeo = new THREE.BufferGeometry();
        const baseStarPos = new Float32Array(baseStarCount * 3);
        for (let i = 0; i < baseStarCount; i++) {
            const r = 120 * Math.cbrt(Math.random());
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            baseStarPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            baseStarPos[i * 3 + 1] = r * Math.cos(phi);
            baseStarPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        }
        baseStarGeo.setAttribute('position', new THREE.BufferAttribute(baseStarPos, 3));
        const baseStarMat = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.06,
            transparent: true,
            opacity: 0.18,
            depthWrite: false,
            blending: THREE.NormalBlending
        });
        const baseStars = new THREE.Points(baseStarGeo, baseStarMat);
        this.baseBg.add(baseStars);
        this.stars = baseStars;

        const treeStarCount = 6500;
        const treeStarGeo = new THREE.BufferGeometry();
        const treeStarPos = new Float32Array(treeStarCount * 3);
        const treeStarCol = new Float32Array(treeStarCount * 3);
        const treeStarSize = new Float32Array(treeStarCount);
        const treeStarPhase = new Float32Array(treeStarCount);

        const sA = new THREE.Color(0x9fd6ff);
        const sB = new THREE.Color(0xffc7a8);
        for (let i = 0; i < treeStarCount; i++) {
            const r = 190 * Math.cbrt(Math.random());
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            treeStarPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            treeStarPos[i * 3 + 1] = r * Math.cos(phi);
            treeStarPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

            const c = sA.clone().lerp(sB, Math.random() * 0.35).multiplyScalar(0.6 + Math.random() * 0.9);
            treeStarCol[i * 3] = c.r;
            treeStarCol[i * 3 + 1] = c.g;
            treeStarCol[i * 3 + 2] = c.b;

            treeStarSize[i] = 0.55 + Math.random() * 0.95;
            treeStarPhase[i] = Math.random() * Math.PI * 2;
        }

        treeStarGeo.setAttribute('position', new THREE.BufferAttribute(treeStarPos, 3));
        treeStarGeo.setAttribute('color', new THREE.BufferAttribute(treeStarCol, 3));
        treeStarGeo.setAttribute('aSize', new THREE.BufferAttribute(treeStarSize, 1));
        treeStarGeo.setAttribute('aPhase', new THREE.BufferAttribute(treeStarPhase, 1));

        const treeStarMat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
                uSize: { value: 16.0 }
            },
            vertexShader: `
                uniform float uTime;
                uniform float uPixelRatio;
                uniform float uSize;
                
                attribute vec3 color;
                attribute float aSize;
                attribute float aPhase;
                
                varying vec3 vColor;
                varying float vTwinkle;
                
                void main() {
                    vColor = color;
                    vTwinkle = 0.55 + 0.45 * sin(uTime * (1.4 + aSize * 0.6) + aPhase);
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                    gl_PointSize = uSize * aSize * uPixelRatio * (1.0 / -mvPosition.z);
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                varying float vTwinkle;
                
                void main() {
                    vec2 uv = gl_PointCoord - 0.5;
                    float d = length(uv);
                    if (d > 0.5) discard;
                    float core = 1.0 - smoothstep(0.0, 0.18, d);
                    float halo = 1.0 - smoothstep(0.18, 0.5, d);
                    float a = (core * 0.95 + halo * 0.35) * vTwinkle;
                    gl_FragColor = vec4(vColor, a);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        const treeStars = new THREE.Points(treeStarGeo, treeStarMat);
        this.treeBg.add(treeStars);
        this.treeStars = treeStars;

        const treeDustCount = 2200;
        const treeDustGeo = new THREE.BufferGeometry();
        const treeDustPos = new Float32Array(treeDustCount * 3);
        for (let i = 0; i < treeDustCount; i++) {
            treeDustPos[i * 3] = (Math.random() - 0.5) * 55;
            treeDustPos[i * 3 + 1] = (Math.random() - 0.5) * 35;
            treeDustPos[i * 3 + 2] = (Math.random() - 0.5) * 55;
        }
        treeDustGeo.setAttribute('position', new THREE.BufferAttribute(treeDustPos, 3));
        const treeDustMat = new THREE.PointsMaterial({
            color: 0xbad8ff,
            size: 0.035,
            transparent: true,
            opacity: 0.16,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const treeDust = new THREE.Points(treeDustGeo, treeDustMat);
        treeDust.position.z = 8;
        this.treeBg.add(treeDust);
        this.treeDust = treeDust;

        this.baseBg.visible = true;
        this.treeBg.visible = false;
    }

    setupLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
        this.scene.add(ambientLight);

        const spotLight = new THREE.SpotLight(0xffffff, 3.0, 120, Math.PI / 6, 0.6, 1.2);
        spotLight.position.set(0, 9, 12);
        spotLight.castShadow = true;
        spotLight.shadow.mapSize.width = 1024;
        spotLight.shadow.mapSize.height = 1024;
        this.scene.add(spotLight);

        const pointLight = new THREE.PointLight(0xffb3c1, 1.4, 60);
        pointLight.position.set(-5, 5, 5);
        this.scene.add(pointLight);

        const pointLight2 = new THREE.PointLight(0xa0f4ff, 1.1, 70);
        pointLight2.position.set(6, 3.5, 8);
        this.scene.add(pointLight2);
        
        // --- Physics State ---
        this.scrollVelocity = 0;
        this.scrollForce = 0;
        this.isInteracting = false;
        this.lastTime = 0;
    }

    setHandDepth(size) {
        // Hand size typically 0.05 to 0.3
        // Map to camera Z position for "Depth Control"
        const targetZ = 10 - (size - 0.1) * 20; 
        this.camera.position.z += (targetZ - this.camera.position.z) * 0.1;
    }

    createCardBackTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 768;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;

        const bg = ctx.createLinearGradient(0, 0, w, h);
        bg.addColorStop(0, '#FFE5EC');
        bg.addColorStop(0.5, '#E0FBFC');
        bg.addColorStop(1, '#EDE7FF');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);

        const inset = 34;
        const radius = 30;
        const roundRect = (x, y, rw, rh, r) => {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + rw, y, x + rw, y + rh, r);
            ctx.arcTo(x + rw, y + rh, x, y + rh, r);
            ctx.arcTo(x, y + rh, x, y, r);
            ctx.arcTo(x, y, x + rw, y, r);
            ctx.closePath();
        };

        roundRect(inset, inset, w - inset * 2, h - inset * 2, radius);
        ctx.fillStyle = 'rgba(255,255,255,0.78)';
        ctx.fill();
        ctx.lineWidth = 9;
        ctx.strokeStyle = 'rgba(255,255,255,0.96)';
        ctx.stroke();

        const colors = ['#FFAFCC', '#BDE0FE', '#A7F3D0', '#FDE68A', '#C4B5FD'];
        const step = 62;
        for (let y = inset + 56; y < h - inset - 56; y += step) {
            for (let x = inset + 56; x < w - inset - 56; x += step) {
                const ci = ((x / step + y / step) | 0) % colors.length;
                const a = (ci % 2 === 0) ? '66' : '55';
                ctx.fillStyle = colors[ci] + a;
                ctx.beginPath();
                ctx.arc(x, y, 9 + (ci % 3) * 3, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = 'rgba(255,255,255,0.55)';
                ctx.beginPath();
                ctx.arc(x + 4, y - 4, 2.4, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        const sheen = ctx.createLinearGradient(inset, inset, w - inset, h - inset);
        sheen.addColorStop(0, 'rgba(255,255,255,0.38)');
        sheen.addColorStop(0.4, 'rgba(255,255,255,0.12)');
        sheen.addColorStop(1, 'rgba(255,255,255,0.0)');
        ctx.fillStyle = sheen;
        ctx.beginPath();
        ctx.ellipse(w * 0.22, h * 0.18, 230, 170, -0.4, 0, Math.PI * 2);
        ctx.fill();

        const cx = w * 0.5;
        const cy = h * 0.5;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillRect(-86, -10, 172, 20);
        ctx.fillRect(-10, -86, 20, 172);
        ctx.restore();

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        return texture;
    }

    createCard(texture, index, total, radius) {
        const cardGroup = new THREE.Group();
        const faceGroup = new THREE.Group();
        cardGroup.add(faceGroup);

        const cardGeo = new THREE.PlaneGeometry(3.5, 5);

        const backMat = new THREE.MeshStandardMaterial({
            map: this.cardBackTexture,
            roughness: 0.68,
            metalness: 0,
            emissive: 0xffffff,
            emissiveIntensity: 0.38,
            transparent: true,
            opacity: 1,
            side: THREE.DoubleSide
        });
        const backMesh = new THREE.Mesh(cardGeo, backMat);
        backMesh.position.z = -0.012;
        faceGroup.add(backMesh);

        const photoMat = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 0,
            color: 0xffffff,
            side: THREE.DoubleSide,
            toneMapped: false
        });
        const photoMesh = new THREE.Mesh(cardGeo, photoMat);
        photoMesh.position.z = 0.012;
        faceGroup.add(photoMesh);

        const edges = new THREE.EdgesGeometry(cardGeo);
        const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 });
        const border = new THREE.LineSegments(edges, lineMat);
        border.position.z = 0.02;
        faceGroup.add(border);
        
        // --- 3. Tech Overlay (Grid or scanlines) ---
        // We can simulate this with a second plane slightly in front
        // For simplicity, just the border and tinted photo is good for "Tech Card".

        // Store references in userData for animation
        cardGroup.userData = { 
            index: index,
            texture: texture,
            originalPos: new THREE.Vector3(),
            originalRot: new THREE.Euler(),
            isPhoto: false, // State tracker
            mesh: photoMesh,
            back: backMesh,
            border: border,
            face: faceGroup
        };

        this.carouselGroup.add(cardGroup);
        this.cards.push(cardGroup);
        this.cards.sort((a, b) => a.userData.index - b.userData.index);
        this.updateCardsLayout();
    }

    // Apply continuous force (Acceleration)
    applyScrollForce(force) {
        if (this.isIntroActive) return;
        if (this.isZoomed || this.isHeartMode) return; // Disable scroll in heart mode
        this.scrollForce = force; 
        this.isInteracting = true;
    }

    releaseScroll() {
        if (this.isIntroActive) return;
        this.scrollForce = 0;
        this.isInteracting = false;
    }
    
    hoverScroll() {
        if (this.isIntroActive) return;
        if (this.isZoomed) return;
        this.isInteracting = true; // Prevent snapping
        this.scrollForce = 0;
        this.scrollVelocity *= 0.8; // Strong braking
    }
    
    handleScroll(velocity) {
        if (this.isIntroActive) return;
        if (this.isZoomed) return;
        
        // Continuous update without tween
        this.selectedIndex += velocity;
        
        // Removed dynamic flip
        // this.flipOffset = velocity * Math.PI * 2; 
        
        this.updateCardsLayout();
        
        // Cancel any pending snap
        if (this.snapTween) {
            this.snapTween.stop();
            this.snapTween = null;
        }
    }
    
    snapToGrid() {
        if (this.isIntroActive) return;
        if (this.isZoomed) return;
        
        // Snap to nearest integer
        const targetIndex = Math.round(this.selectedIndex);
        const currentVal = this.selectedIndex;
        
        // Smooth snap
        this.snapTween = new TWEEN.Tween({ idx: currentVal })
            .to({ idx: targetIndex }, 400)
            .easing(TWEEN.Easing.Back.Out)
            .onUpdate((obj) => {
                this.selectedIndex = obj.idx;
                this.updateCardsLayout();
            })
            .onComplete(() => {
                // Normalize
                this.selectedIndex = (Math.round(this.selectedIndex) % 10 + 10) % 10;
                this.updateCardsLayout();
                this.snapTween = null;
            })
            .start();
    }

    rotateCarousel(direction, speedFactor = 1) { 
        // Legacy method kept for fallback or removed usage
    }

    updateCardsLayout() {
        const total = 10;
        const radius = 6; 
        const zDepth = 4; 
        const activeIndex = (Math.round(this.selectedIndex) % total + total) % total;
        
        for (let i = 0; i < this.cards.length; i++) {
            const card = this.cards[i];
            
            let diff = (i - this.selectedIndex);
            while (diff > total / 2) diff -= total;
            while (diff < -total / 2) diff += total;
            
            const spacing = 2.5;
            const x = diff * spacing; 
            const z = -Math.abs(diff) * 2; 
            
            // Base Rotation only (Face slightly center)
            let rotY = diff * -0.3; 
            
            const scale = Math.max(0.6, 1 - Math.abs(diff) * 0.15);
            const opacity = Math.max(0.2, 1 - Math.abs(diff) * 0.3);
            
            card.position.set(x, 0, z);
            card.rotation.set(0, rotY, 0);
            card.scale.set(scale, scale, scale);
            
            // Apply opacity to children
            if (!card.userData.isPhoto) {
                card.userData.back.material.opacity = opacity * 0.95;
                card.userData.mesh.material.opacity = 0;
                card.userData.border.material.opacity = opacity * 0.35;
            } else {
                if (card.userData.index === activeIndex) {
                    card.userData.mesh.material.opacity = 1;
                    card.userData.back.material.opacity = 0;
                    card.userData.border.material.opacity = 0;
                } else {
                    card.userData.back.material.opacity = opacity * 0.95;
                    card.userData.mesh.material.opacity = 0;
                    card.userData.border.material.opacity = opacity * 0.35;
                }
            }
            
            // Update "Original" for zoom reset
            card.userData.originalPos.copy(card.position);
            card.userData.originalRot.copy(card.rotation);
            
            card.visible = Math.abs(diff) < 4; 
        }
    }


    selectCard() {
        if (this.isIntroActive) return;
        if (this.isZoomed) return;
        this.isZoomed = true;

        // Ensure index is within bounds and normalized
        // selectedIndex might be float due to physics
        // Round it to get the target card
        let index = Math.round(this.selectedIndex);
        // Normalize to 0-9
        index = (index % 10 + 10) % 10;
        
        // Find the card with this index in userData
        // cards array is sorted by index initially, but might be safer to find
        const card = this.cards.find(c => c.userData.index === index);
        
        if (!card) {
            console.error("Card not found for index:", index);
            this.isZoomed = false;
            return;
        }
        
        // Transition to Photo Mode
        card.userData.isPhoto = true;
        if (card.userData.face) card.userData.face.rotation.y = 0;
        card.userData.mesh.material.opacity = 0;
        card.userData.back.material.opacity = 1;
        card.userData.border.material.opacity = 0.15;

        if (card.userData._flipTween) card.userData._flipTween.stop();
        card.userData._flipTween = new TWEEN.Tween({ t: 0 })
            .to({ t: 1 }, 600)
            .easing(TWEEN.Easing.Cubic.InOut)
            .onUpdate((o) => {
                const t = o.t;
                if (card.userData.face) card.userData.face.rotation.y = t * Math.PI;
                const photoAlpha = THREE.MathUtils.clamp((t - 0.48) / 0.22, 0, 1);
                card.userData.mesh.material.opacity = photoAlpha;
                card.userData.back.material.opacity = 1 - photoAlpha;
                card.userData.border.material.opacity = (1 - photoAlpha) * 0.12;
            })
            .onComplete(() => {
                card.userData._flipTween = null;
                card.userData.mesh.material.opacity = 1;
                card.userData.back.material.opacity = 0;
                card.userData.border.material.opacity = 0;
            })
            .start();

        if (card.userData._posTween) card.userData._posTween.stop();
        card.userData._posTween = new TWEEN.Tween(card.position)
            .to({ x: 0, y: 0, z: 2 }, 1000) // Move to center front
            .easing(TWEEN.Easing.Cubic.Out)
            .start();
            
        if (card.userData._rotTween) card.userData._rotTween.stop();
        card.userData._rotTween = new TWEEN.Tween(card.rotation)
            .to({ x: 0, y: 0, z: 0 }, 1000) // Face forward
            .easing(TWEEN.Easing.Cubic.Out)
            .start();
            
        if (card.userData._scaleTween) card.userData._scaleTween.stop();
        card.userData._scaleTween = new TWEEN.Tween(card.scale)
            .to({ x: 1.5, y: 1.5, z: 1.5 }, 1000) // Scale up
            .easing(TWEEN.Easing.Cubic.Out)
            .start();
            
        // Fade out others
        this.cards.forEach(c => {
            if (c !== card) {
                if (c.userData._fadeTweens && Array.isArray(c.userData._fadeTweens)) {
                    c.userData._fadeTweens.forEach(t => t?.stop?.());
                }
                const t1 = new TWEEN.Tween(c.userData.mesh.material).to({ opacity: 0 }, 500).start();
                const t2 = new TWEEN.Tween(c.userData.border.material).to({ opacity: 0 }, 500).start();
                const t3 = new TWEEN.Tween(c.userData.back.material).to({ opacity: 0 }, 500).start();
                c.userData._fadeTweens = [t1, t2, t3];
            }
        });
    }
    
    resetView() {
        if (this.isIntroActive) return;
        if (!this.isZoomed) return;
        
        let index = Math.round(this.selectedIndex);
        index = (index % 10 + 10) % 10;
        const card = this.cards.find(c => c.userData.index === index);
        
        if (!card) return;
        
        // Restore layout for all
        this.updateCardsLayout(); 
        
        // Revert to Card Mode
        card.userData.isPhoto = false;
        if (card.userData._flipTween) {
            card.userData._flipTween.stop();
            card.userData._flipTween = null;
        }
        if (card.userData.face) card.userData.face.rotation.y = 0;
        card.userData.mesh.material.opacity = 0;
        card.userData.back.material.opacity = 1;
        card.userData.border.material.opacity = 0.25;

        // But we want smooth animation back.
        // Simple hack: Animate 'card' back to its calculated slot in updateCardsLayout
        // But updateCardsLayout snaps everything.
        
        // Let's re-run updateCardsLayout to ensure correct "original" positions are set in userData (they are).
        // Then animate current card to that.
        
        const targetPos = card.userData.originalPos;
        const targetRot = card.userData.originalRot;
        
        new TWEEN.Tween(card.position)
            .to({ x: targetPos.x, y: targetPos.y, z: targetPos.z }, 800)
            .easing(TWEEN.Easing.Cubic.Out)
            .start();

        new TWEEN.Tween(card.scale)
            .to({ x: 1, y: 1, z: 1 }, 800) // Assuming center scale is 1
            .start();

        new TWEEN.Tween(card.rotation)
            .to({ x: targetRot.x, y: targetRot.y, z: targetRot.z }, 800)
            .easing(TWEEN.Easing.Cubic.Out)
            .onComplete(() => {
                this.isZoomed = false;
                if(this.particles) {
                    this.scene.remove(this.particles);
                    this.particles = null;
                    card.visible = true;
                }
                // Fade others back in
                this.updateCardsLayout(); // Will reset opacities
            })
            .start();
            
        // Fade others in
        // We can just rely on updateCardsLayout being called or animate opacity.
    }

    dissolveCard() {
        if (this.isIntroActive) return;
        if (!this.isZoomed || this.isDissolving) return;
        
        let index = Math.round(this.selectedIndex);
        index = (index % 10 + 10) % 10;
        const card = this.cards.find(c => c.userData.index === index);
        
        if (!card || !card.visible) return; // Already dissolved

        if (card.userData._flipTween) {
            card.userData._flipTween.stop();
            card.userData._flipTween = null;
        }
        if (card.userData._posTween) {
            card.userData._posTween.stop();
            card.userData._posTween = null;
        }
        if (card.userData._rotTween) {
            card.userData._rotTween.stop();
            card.userData._rotTween = null;
        }
        if (card.userData._scaleTween) {
            card.userData._scaleTween.stop();
            card.userData._scaleTween = null;
        }
        
        const texture = card.userData.texture;
        const img = texture.image;
        
        // Use the mesh inside the group
        const mesh = card.userData.mesh;
        
        // Create canvas to read pixel data
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        // Downsample for performance (e.g. 100x150 particles)
        const cols = 80;
        const rows = 120;
        const width = 3;
        const height = 4.5;
        
        const particleCount = cols * rows;
        const geometry = new THREE.BufferGeometry();
        // Removed heavy instantiation here
        // The heart system is created only when needed in showHeart()
        // But the previous code block was inside createHeartSystem which is called by showHeart.
        // So Lazy Loading is already partially there.
        // However, shader compilation can cause a hitch on first show.
        // We can compile shader asynchronously or pre-compile?
        // WebGLRenderer.compile() can help.
        
        // Let's optimize the particle count and shader complexity slightly.
        // Particle count reduced to 15000 above.
        
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const velocities = new Float32Array(particleCount * 3);
        const sizes = new Float32Array(particleCount);
        const seeds = new Float32Array(particleCount);
        
        let data;
        try {
            data = ctx.getImageData(0, 0, img.width, img.height).data;
        } catch(e) {
            console.warn("Cannot access image data (CORS?). Using random colors.");
        }

        const pastelA = [1.0, 175 / 255, 204 / 255];
        const pastelB = [189 / 255, 224 / 255, 254 / 255];
        const pastelC = [167 / 255, 243 / 255, 208 / 255];

        let i = 0;
        for (let ix = 0; ix < cols; ix++) {
            for (let iy = 0; iy < rows; iy++) {
                const x = (ix / cols) * width - width / 2;
                const y = (iy / rows) * height - height / 2;
                
                // Position
                positions[i * 3] = x;
                positions[i * 3 + 1] = y; // Flip Y if needed
                positions[i * 3 + 2] = 0;
                
                const gx = cols <= 1 ? 0 : ix / (cols - 1);
                const gy = rows <= 1 ? 0 : iy / (rows - 1);
                const mac1r = pastelA[0] + (pastelB[0] - pastelA[0]) * gx;
                const mac1g = pastelA[1] + (pastelB[1] - pastelA[1]) * gx;
                const mac1b = pastelA[2] + (pastelB[2] - pastelA[2]) * gx;
                const macr = mac1r + (pastelC[0] - mac1r) * (gy * 0.35);
                const macg = mac1g + (pastelC[1] - mac1g) * (gy * 0.35);
                const macb = mac1b + (pastelC[2] - mac1b) * (gy * 0.35);

                // Color
                if (data) {
                    // Map grid to image coordinates
                    const imgX = Math.floor((ix / cols) * img.width);
                    const imgY = Math.floor(((rows - iy - 1) / rows) * img.height); // Flip Y for texture
                    const stride = (imgY * img.width + imgX) * 4;

                    let r = data[stride] / 255;
                    let g = data[stride + 1] / 255;
                    let b = data[stride + 2] / 255;

                    const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
                    const boost = 1.0 + (1 - luma) * 0.25;
                    r = Math.min(1, r * boost + 0.02);
                    g = Math.min(1, g * boost + 0.02);
                    b = Math.min(1, b * boost + 0.02);

                    const mix = 0.22;
                    colors[i * 3] = r + (macr - r) * mix;
                    colors[i * 3 + 1] = g + (macg - g) * mix;
                    colors[i * 3 + 2] = b + (macb - b) * mix;
                } else {
                    colors[i * 3] = macr;
                    colors[i * 3 + 1] = macg;
                    colors[i * 3 + 2] = macb;
                }
                
                // Random velocity for explosion
                velocities[i * 3] = (Math.random() - 0.5) * 0.14;
                velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.14;
                velocities[i * 3 + 2] = Math.random() * 0.20 + 0.08;

                sizes[i] = 0.75 + Math.random() * 0.95;
                seeds[i] = Math.random() * Math.PI * 2;
                
                i++;
            }
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
        
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
                uSize: { value: 18.0 }
            },
            vertexShader: `
                uniform float uTime;
                uniform float uPixelRatio;
                uniform float uSize;

                attribute float aSize;
                attribute float aSeed;

                varying vec3 vColor;
                varying float vTwinkle;

                void main() {
                    vColor = color;
                    vTwinkle = 0.75 + 0.25 * sin(uTime * 10.0 + aSeed);
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                    gl_PointSize = uSize * aSize * uPixelRatio * (1.0 / -mvPosition.z);
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                varying float vTwinkle;

                void main() {
                    vec2 uv = gl_PointCoord - 0.5;
                    float d = length(uv);
                    if (d > 0.5) discard;
                    float core = 1.0 - smoothstep(0.0, 0.16, d);
                    float halo = 1.0 - smoothstep(0.16, 0.5, d);
                    float edge = smoothstep(0.12, 0.5, d);
                    vec3 outline = vec3(0.18, 0.12, 0.26);
                    vec3 col = mix(vColor, outline, edge * 0.72);
                    float a = (core * 0.78 + halo * 0.28) * vTwinkle;
                    gl_FragColor = vec4(col, a);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.NormalBlending,
            vertexColors: true
        });
        
        this.particles = new THREE.Points(geometry, material);
        this.particles.material.opacity = this._cardDissolveOpacityStart;
        
        // Attach to group to match rotation
        // We need to place it exactly where the card is.
        // The card is inside the group.
        // We can just hide the card and add particles as a child of the card?
        // If we add as child of card, and card is hidden... children might be hidden too?
        // No, card.visible = false hides children too usually? No, it doesn't propagate to children in Three.js unless traversing.
        // But to be safe, let's add to card's parent (group) and copy transform.
        
        this.particles.position.copy(card.position);
        this.particles.rotation.copy(card.rotation);
        this.particles.scale.copy(card.scale);
        
        // If the card was zoomed, it was moved/rotated.
        // We need to ensure particles match that state.
        
        this.carouselGroup.add(this.particles);
        this.particles.userData = { velocities: velocities };
        
        card.visible = false;
        this.isDissolving = true;
        this._cardDissolveStart = performance.now();
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate(time) {
        requestAnimationFrame(this.animate);
        TWEEN.update(time);
        
        // Physics Loop (Frame Independent ideally, but using delta)
        const dt = (time - this.lastTime) / 1000 || 0.016;
        this.lastTime = time;

        const tSec = time / 1000;
        if (this.baseBg && this.baseBg.visible && this.stars) {
            this.stars.rotation.y += dt * 0.01;
        }
        if (this.treeBg && this.treeBg.visible) {
            if (this.treeGradient && this.treeGradient.material && this.treeGradient.material.uniforms) {
                this.treeGradient.material.uniforms.uTime.value = tSec;
            }
            if (this.treeStars && this.treeStars.material && this.treeStars.material.uniforms) {
                this.treeStars.material.uniforms.uTime.value = tSec;
                this.treeStars.rotation.y += dt * 0.006;
                this.treeStars.rotation.x += dt * 0.002;
            }
            if (this.treeDust) {
                this.treeDust.rotation.y -= dt * 0.02;
            }
        }
        
        if (!this.isZoomed) {
            // Physics Constants - Tuned for Silky Smoothness
            const FRICTION = 0.95; // Higher friction = more "weighty" feel (0.92 -> 0.95)
            const SPRING = 8.0; // Stronger spring for snappier lock-on (5.0 -> 8.0)
            const MASS = 1.0; 
            
            // 1. Apply Input Force (Acceleration)
            // Force = Mass * Acceleration -> Acc = Force / Mass
            // Input force is typically small (0.01 to 0.1)
            this.scrollVelocity += (this.scrollForce / MASS);
            
            // 2. Apply Friction (Damping)
            this.scrollVelocity *= FRICTION;
            
            // 3. Apply Spring Snap (when not interacting)
            if (!this.isInteracting && Math.abs(this.scrollForce) < 0.001) {
                const current = this.selectedIndex;
                const target = Math.round(current);
                const dist = target - current;
                
                // Spring force proportional to distance
                // Hooke's Law: F = -k * x
                const springForce = dist * SPRING * dt;
                this.scrollVelocity += springForce;
                
                // Snap stop threshold
                if (Math.abs(dist) < 0.001 && Math.abs(this.scrollVelocity) < 0.001) {
                    this.selectedIndex = target;
                    this.scrollVelocity = 0;
                }
            }
            
            // 4. Update Position
            this.selectedIndex += this.scrollVelocity;
            
            // 5. Update Visual Tilt (based on velocity)
            // Removed Flip Effect as requested for pure smooth scroll
            this.flipOffset = 0;
            
            // Normalize selectedIndex to keep it manageable (optional, but good for precision)
            // But doing modulo every frame might mess up the spring snap if near boundary?
            // Scene logic handles large numbers, but let's wrap periodically to avoid float precision issues eventually.
            // Only wrap if settled? No, updateCardsLayout handles wrapping visually.
            // But selectedIndex grows indefinitely. 
            // Let's wrap it nicely when "settled" or just keep it. 
            // For stability, let's keep it unbounded and only wrap in layout.
            
            this.updateCardsLayout();
        }
        
        // Update heart shader
        if (this.heartSystem && this.heartSystem.visible) {
            this.heartSystem.material.uniforms.uTime.value = time / 1000;
        }

        // Update Christmas Tree
        if (this.christmasTree) {
            this.christmasTree.update(dt);
        }

        if (this.isTreeMode && !this._treeCameraTweening) {
            this.treeZoomTargetZ += (this._treeZoomRawZ - this.treeZoomTargetZ) * 0.08;
            this.camera.position.z += (this.treeZoomTargetZ - this.camera.position.z) * 0.10;
        }

        this.camera.lookAt(this.cameraTarget);
        this.renderer.render(this.scene, this.camera);
        
        // Particle animation
        if (this.particles && this.isDissolving) {
            const positions = this.particles.geometry.attributes.position.array;
            const velocities = this.particles.userData.velocities;
            if (this._cardDissolveStart == null) this._cardDissolveStart = time;
            const t = Math.min(1, (time - this._cardDissolveStart) / this._cardDissolveDuration);
            const step = dt * 60;
            const damp = Math.pow(0.988, step);
            
            for (let i = 0; i < positions.length / 3; i++) {
                positions[i * 3] += velocities[i * 3] * step;
                positions[i * 3 + 1] += velocities[i * 3 + 1] * step;
                positions[i * 3 + 2] += velocities[i * 3 + 2] * step;

                velocities[i * 3 + 1] -= 0.00035 * step;
                velocities[i * 3] *= damp;
                velocities[i * 3 + 1] *= damp;
                velocities[i * 3 + 2] *= damp;
            }
            
            this.particles.geometry.attributes.position.needsUpdate = true;
            if (this.particles.material.uniforms && this.particles.material.uniforms.uTime) {
                this.particles.material.uniforms.uTime.value = time / 1000;
            }
            this.particles.material.opacity = this._cardDissolveOpacityStart * (1 - t);
            
            if (t >= 1) {
                this._finishCardDissolveInstant();
            }
        }
    }
}
