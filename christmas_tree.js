
const THREE = window.THREE;
const TWEEN = window.TWEEN;

export class ChristmasTree {
    constructor(sceneController, textures) {
        this.controller = sceneController;
        this.scene = sceneController.scene;
        this.textures = textures || [];
        this.group = new THREE.Group();
        this.scene.add(this.group);
        this.group.visible = false;
        this.group.position.set(0, 0.8, 0);
        
        this.state = 'CHAOS'; // CHAOS, FORMING, FORMED, DISSOLVING
        this.progress = 0;
        this.rotationSpeed = 0;
        this._formTween = null;
        this._dissolveTween = null;
        this._scaleTween = null;
        this._dissolveTimeoutId = null;
        
        // Configuration
        this.treeHeight = 15;
        this.treeRadius = 6;
        this.foliageCount = 18000;
        this.ornamentCount = 200;
        this.polaroids = [];
        
        this.initFoliage();
        this.initOrnaments();
        this.initPolaroids();
        this.initBase();
        this.initLights();
        this.initFairyLights();
        this.initGarland();

        this.initSurroundParticles();
    }
    
    initFoliage() {
        // Shader Material for efficient interpolation
        const geometry = new THREE.BufferGeometry();
        
        const chaosPos = [];
        const targetPos = [];
        const colors = [];
        const sizes = [];
        const randomness = [];
        
        const colorGreen = new THREE.Color(0x004225); // Deep Emerald
        const colorGold = new THREE.Color(0xFFD700); // Gold
        
        for (let i = 0; i < this.foliageCount; i++) {
            // Chaos: Random Sphere
            const r = 20 * Math.cbrt(Math.random());
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            
            const cx = r * Math.sin(phi) * Math.cos(theta);
            const cy = r * Math.sin(phi) * Math.sin(theta);
            const cz = r * Math.cos(phi);
            
            chaosPos.push(cx, cy, cz);
            
            // Target: Cone
            // h from -5 to 10
            const h = Math.random() * this.treeHeight; // 0 to 15
            const coneRatio = 1 - (h / this.treeHeight); // 1 at bottom, 0 at top
            const rad = this.treeRadius * coneRatio;
            
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * rad;
            
            const tx = radius * Math.cos(angle);
            const ty = h - this.treeHeight/2; // Center vertically
            const tz = radius * Math.sin(angle);
            
            targetPos.push(tx, ty, tz);
            
            // Color
            const isGold = Math.random() < 0.1; // 10% Gold tips
            const c = isGold ? colorGold : colorGreen;
            // Add variation
            const varC = c.clone().multiplyScalar(0.8 + Math.random() * 0.4);
            colors.push(varC.r, varC.g, varC.b);
            
            sizes.push(Math.random());
            randomness.push(Math.random(), Math.random(), Math.random());
        }
        
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(chaosPos, 3));
        geometry.setAttribute('aTargetPos', new THREE.Float32BufferAttribute(targetPos, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
        geometry.setAttribute('aRandom', new THREE.Float32BufferAttribute(randomness, 3));
        
        // Custom Shader
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uProgress: { value: 0 }, // 0 = Chaos, 1 = Formed
                uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
                uSize: { value: 135.0 } // Base size
            },
            vertexShader: `
                uniform float uTime;
                uniform float uProgress;
                uniform float uPixelRatio;
                uniform float uSize;
                
                attribute vec3 color;
                attribute vec3 aTargetPos;
                attribute float aSize;
                attribute vec3 aRandom;
                
                varying vec3 vColor;
                
                void main() {
                    vColor = color;
                    
                    // Mix Positions
                    vec3 pos = mix(position, aTargetPos, uProgress);
                    
                    // Add noise/wind movement when formed
                    if (uProgress > 0.8) {
                        float noise = sin(uTime * 2.0 + pos.y) * 0.1;
                        pos.x += noise;
                        pos.z += noise;
                    }
                    
                    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                    
                    gl_PointSize = uSize * aSize * uPixelRatio * (1.0 / -mvPosition.z);
                }
            `,
            fragmentShader: `
                uniform float uTime;
                varying vec3 vColor;
                
                void main() {
                    // Circular particle
                    vec2 uv = gl_PointCoord - 0.5;
                    float dist = length(uv);
                    if (dist > 0.5) discard;
                    
                    // Soft glow edge
                    float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
                    float twinkle = 0.75 + 0.25 * sin(uTime * 1.8 + vColor.g * 11.0 + vColor.r * 7.0);
                    alpha *= twinkle;
                    
                    gl_FragColor = vec4(vColor * (0.9 + 0.25 * twinkle), alpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        
        this.foliage = new THREE.Points(geometry, material);
        this.group.add(this.foliage);
    }
    
    initOrnaments() {
        // Instanced Mesh for Balls (Red/Gold)
        // We will animate them in CPU for simplicity of InstancedMesh usage
        const geometry = new THREE.IcosahedronGeometry(0.3, 1);
        const material = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            vertexColors: true,
            metalness: 0.9,
            roughness: 0.12,
            clearcoat: 1,
            clearcoatRoughness: 0.08,
            emissive: 0x220000,
            emissiveIntensity: 0.4
        });
        
        this.ornaments = new THREE.InstancedMesh(geometry, material, this.ornamentCount);
        this.ornaments.castShadow = true;
        this.ornaments.receiveShadow = true;
        
        // Store dual positions in userData
        this.ornamentData = [];
        
        for (let i = 0; i < this.ornamentCount; i++) {
            // Chaos
            const cx = (Math.random() - 0.5) * 30;
            const cy = (Math.random() - 0.5) * 30;
            const cz = (Math.random() - 0.5) * 30;
            
            // Target (Surface of cone)
            const h = Math.random() * (this.treeHeight - 2);
            const coneRatio = 1 - (h / this.treeHeight);
            const rad = this.treeRadius * coneRatio;
            const angle = Math.random() * Math.PI * 2;
            
            const tx = rad * Math.cos(angle);
            const ty = h - this.treeHeight/2;
            const tz = rad * Math.sin(angle);
            
            const colorType = Math.random();
            let color = new THREE.Color(0xff0000); // Red
            if (colorType > 0.6) color = new THREE.Color(0xffd700); // Gold
            else if (colorType > 0.9) color = new THREE.Color(0xc0c0c0); // Silver
            
            this.ornaments.setColorAt(i, color);
            
            this.ornamentData.push({
                chaos: new THREE.Vector3(cx, cy, cz),
                target: new THREE.Vector3(tx, ty, tz),
                current: new THREE.Vector3(cx, cy, cz),
                scale: 0.5 + Math.random() * 0.5
            });
            
            // Set initial matrix
            const dummy = new THREE.Object3D();
            dummy.position.set(cx, cy, cz);
            dummy.updateMatrix();
            this.ornaments.setMatrixAt(i, dummy.matrix);
        }
        
        this.group.add(this.ornaments);
    }
    
    initPolaroids() {
        if (!this.textures || this.textures.length === 0) {
            this.polaroids = [];
            return;
        }
        
        // Clear existing if any
        if (this.polaroids && this.polaroids.length > 0) {
            this.polaroids.forEach(p => this.group.remove(p));
        }
        
        // Reuse textures from scene
        // 10 photos
        this.polaroids = [];
        const photoW = 1.45;
        const photoH = 1.95;
        const photoGeo = new THREE.PlaneGeometry(photoW, photoH);
        
        for (let i = 0; i < 10; i++) {
            const texture = this.textures[i % this.textures.length];
            const mat = new THREE.MeshStandardMaterial({ 
                map: texture, 
                side: THREE.DoubleSide,
                roughness: 0.9,
                metalness: 0,
                emissive: 0xffffff,
                emissiveIntensity: 0.12
            });
            const mesh = new THREE.Mesh(photoGeo, mat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            
            // Add white border
            const borderGeo = new THREE.PlaneGeometry(photoW * 1.14, photoH * 1.18);
            const borderMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
            const border = new THREE.Mesh(borderGeo, borderMat);
            border.position.z = -0.01;
            border.receiveShadow = true;
            mesh.add(border);
            
            // Positions
            const h = 2.5 + Math.random() * 7.5; // Middle of tree
            const coneRatio = 1 - (h / this.treeHeight);
            const rad = (this.treeRadius * coneRatio) + 0.9; // Slightly outside
            const angle = (i / 10) * Math.PI * 2; // Distributed around
            
            const tx = rad * Math.cos(angle);
            const ty = h - this.treeHeight/2;
            const tz = rad * Math.sin(angle);
            
            mesh.userData = {
                chaos: new THREE.Vector3((Math.random()-0.5)*40, (Math.random()-0.5)*40, (Math.random()-0.5)*40),
                target: new THREE.Vector3(tx, ty, tz),
                targetRot: new THREE.Euler((Math.random() - 0.5) * 0.18, -angle + Math.PI/2, (Math.random() - 0.5) * 0.08), // Face outward
                current: new THREE.Vector3(),
                rotVelocity: new THREE.Vector3(Math.random()*0.1, Math.random()*0.1, 0)
            };
            
            this.group.add(mesh);
            this.polaroids.push(mesh);
        }
    }
    
    initBase() {
        const trunkGeo = new THREE.CylinderGeometry(0.45, 0.8, 3.2, 18);
        const trunkMat = new THREE.MeshStandardMaterial({
            color: 0x3a2417,
            roughness: 0.9,
            metalness: 0
        });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = -this.treeHeight / 2 + 1.6;
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        this.group.add(trunk);
        this.trunk = trunk;
        
        const starGeo = new THREE.IcosahedronGeometry(0.85, 1);
        const starMat = new THREE.MeshPhysicalMaterial({
            color: 0xffe38a,
            metalness: 0.2,
            roughness: 0.15,
            clearcoat: 1,
            clearcoatRoughness: 0.1,
            emissive: 0xffc84a,
            emissiveIntensity: 2.2
        });
        const star = new THREE.Mesh(starGeo, starMat);
        star.position.y = this.treeHeight / 2 + 1.0;
        star.castShadow = true;
        this.group.add(star);
        this.star = star;
        
        const glowCanvas = document.createElement('canvas');
        glowCanvas.width = 64;
        glowCanvas.height = 64;
        const glowCtx = glowCanvas.getContext('2d');
        const grad = glowCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, 'rgba(255, 240, 200, 1)');
        grad.addColorStop(0.35, 'rgba(255, 210, 120, 0.55)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        glowCtx.fillStyle = grad;
        glowCtx.fillRect(0, 0, 64, 64);
        
        const starGlowMap = new THREE.CanvasTexture(glowCanvas);
        const starGlowMat = new THREE.SpriteMaterial({
            map: starGlowMap,
            color: 0xffdd88,
            transparent: true,
            blending: THREE.AdditiveBlending,
            opacity: 0.9
        });
        const starGlow = new THREE.Sprite(starGlowMat);
        starGlow.position.copy(star.position);
        starGlow.scale.set(7, 7, 1);
        this.group.add(starGlow);
        this.starGlow = starGlow;
    }
    
    initLights() {
        const ambient = new THREE.AmbientLight(0xfff5e6, 0.25);
        this.group.add(ambient);
        this.ambient = ambient;
        
        const key = new THREE.SpotLight(0xffd1a3, 90, 80, Math.PI / 7, 0.55, 1.2);
        key.position.set(10, 18, 14);
        key.castShadow = true;
        key.shadow.mapSize.width = 2048;
        key.shadow.mapSize.height = 2048;
        key.shadow.bias = -0.0002;
        key.shadow.normalBias = 0.03;
        key.target.position.set(0, 2, 0);
        this.group.add(key);
        this.group.add(key.target);
        this.key = key;
        
        const fill = new THREE.PointLight(0x7ad7ff, 22, 60);
        fill.position.set(-12, 10, 10);
        this.group.add(fill);
        this.fill = fill;
        
        const rim = new THREE.DirectionalLight(0xffffff, 1.2);
        rim.position.set(-10, 14, -18);
        this.group.add(rim);
        this.rim = rim;
    }
    
    initFairyLights() {
        const count = 700;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const phases = new Float32Array(count);
        
        const warm = new THREE.Color(0xffe2b8);
        const red = new THREE.Color(0xff3b30);
        const green = new THREE.Color(0x34c759);
        const palette = [warm, red, green];
        
        for (let i = 0; i < count; i++) {
            const h = Math.random() * (this.treeHeight - 1);
            const coneRatio = 1 - (h / this.treeHeight);
            const rad = (this.treeRadius * coneRatio) * (0.75 + Math.random() * 0.2) + 0.15;
            const ang = h * 1.65 + Math.random() * 0.8;
            
            const x = rad * Math.cos(ang);
            const y = h - this.treeHeight / 2 + (Math.random() - 0.5) * 0.25;
            const z = rad * Math.sin(ang);
            
            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;
            
            const c = palette[i % palette.length].clone().lerp(new THREE.Color(0xffffff), Math.random() * 0.35);
            colors[i * 3] = c.r;
            colors[i * 3 + 1] = c.g;
            colors[i * 3 + 2] = c.b;
            
            phases[i] = Math.random() * Math.PI * 2;
        }
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
        
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
                uSize: { value: 34.0 }
            },
            vertexShader: `
                uniform float uTime;
                uniform float uPixelRatio;
                uniform float uSize;
                
                attribute vec3 color;
                attribute float aPhase;
                
                varying vec3 vColor;
                varying float vFlicker;
                
                void main() {
                    vColor = color;
                    vFlicker = 0.45 + 0.55 * sin(uTime * 4.0 + aPhase);
                    
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                    
                    gl_PointSize = uSize * uPixelRatio * (1.0 / -mvPosition.z);
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                varying float vFlicker;
                
                void main() {
                    vec2 uv = gl_PointCoord - 0.5;
                    float dist = length(uv);
                    if (dist > 0.5) discard;
                    
                    float core = 1.0 - smoothstep(0.0, 0.18, dist);
                    float halo = 1.0 - smoothstep(0.18, 0.5, dist);
                    
                    float alpha = (core * 0.95 + halo * 0.35) * vFlicker;
                    gl_FragColor = vec4(vColor, alpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        
        const lights = new THREE.Points(geometry, material);
        this.group.add(lights);
        this.fairyLights = lights;
    }
    
    initGarland() {
        const turns = 6.5;
        const points = [];
        const segments = 260;
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const h = t * (this.treeHeight - 1.2) + 0.3;
            const coneRatio = 1 - (h / this.treeHeight);
            const rad = (this.treeRadius * coneRatio) * 0.95 + 0.25;
            const ang = t * Math.PI * 2 * turns;
            const x = rad * Math.cos(ang);
            const y = h - this.treeHeight / 2;
            const z = rad * Math.sin(ang);
            points.push(new THREE.Vector3(x, y, z));
        }
        
        const curve = new THREE.CatmullRomCurve3(points);
        const geo = new THREE.TubeGeometry(curve, 320, 0.06, 10, false);
        const mat = new THREE.MeshStandardMaterial({
            color: 0xd4af37,
            roughness: 0.38,
            metalness: 0.2,
            emissive: 0x4a2a00,
            emissiveIntensity: 0.22
        });
        const garland = new THREE.Mesh(geo, mat);
        garland.castShadow = true;
        garland.receiveShadow = true;
        this.group.add(garland);
        this.garland = garland;
    }
    
    initGlow() {
        // Create procedural glow texture
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.22, 'rgba(255, 240, 200, 0.50)');
        gradient.addColorStop(0.55, 'rgba(255, 200, 120, 0.16)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);
        
        const map = new THREE.CanvasTexture(canvas);
        
        const material = new THREE.SpriteMaterial({ 
            map: map, 
            color: 0xffffff, 
            transparent: true, 
            blending: THREE.AdditiveBlending,
            opacity: 0.22
        });
        const sprite = new THREE.Sprite(material);
        sprite.position.y = -this.treeHeight / 2 - 0.2;
        sprite.scale.set(24, 24, 1);
        this.group.add(sprite);
    }

    initSurroundParticles() {
        const count = 3200;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        const seeds = new Float32Array(count);
        const types = new Float32Array(count);

        const cA = new THREE.Color(0xffffff);
        const cB = new THREE.Color(0xbde0fe);
        const cC = new THREE.Color(0xffafcc);

        for (let i = 0; i < count; i++) {
            const y = (Math.random() - 0.5) * 26;
            const baseR = 4.0 + Math.sqrt(Math.random()) * 12.0;
            const ang = Math.random() * Math.PI * 2;
            const x = Math.cos(ang) * baseR;
            const z = Math.sin(ang) * baseR;

            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;

            const t = Math.random();
            const col = cA.clone().lerp(cB, Math.random() * 0.45).lerp(cC, Math.random() * 0.18);
            const s = 0.65 + Math.random() * 0.55 + (t > 0.78 ? 0.55 : 0);
            colors[i * 3] = col.r * s;
            colors[i * 3 + 1] = col.g * s;
            colors[i * 3 + 2] = col.b * s;

            sizes[i] = (t > 0.78 ? 0.95 : 0.55) + Math.random() * 0.75;
            seeds[i] = Math.random() * Math.PI * 2;
            types[i] = t;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
        geometry.setAttribute('aType', new THREE.BufferAttribute(types, 1));

        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
                uSize: { value: 14.0 }
            },
            vertexShader: `
                uniform float uTime;
                uniform float uPixelRatio;
                uniform float uSize;

                attribute float aSize;
                attribute float aSeed;
                attribute float aType;

                varying vec3 vColor;
                varying float vTwinkle;

                void main() {
                    vColor = color;
                    float star = step(0.78, aType);
                    float speed = mix(0.55 + 0.45 * fract(aSeed * 0.37), 0.06, star);
                    float band = 26.0;
                    vec3 p = position;
                    p.y = mod(p.y - uTime * speed + band * 0.5, band) - band * 0.5;
                    float swirl = (0.10 + 0.05 * star) * sin(uTime * 0.8 + aSeed * 6.0 + position.y * 0.12);
                    p.x += swirl;
                    p.z -= swirl * 0.85;
                    vTwinkle = mix(0.72 + 0.28 * sin(uTime * (2.6 + aSize * 0.8) + aSeed), 0.85 + 0.15 * sin(uTime * 1.7 + aSeed), star);
                    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
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
                    float a = (core * 0.92 + halo * 0.38) * vTwinkle;
                    gl_FragColor = vec4(vColor, a);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            vertexColors: true
        });

        const particles = new THREE.Points(geometry, material);
        particles.position.y = 0.2;
        this.group.add(particles);
        this.surroundParticles = particles;
    }
    
    show() {
        if (this.state === 'FORMED') return;
        this.group.visible = true;
        this.state = 'FORMING';
        this.group.scale.setScalar(0.92);
        
        if (this._dissolveTween) {
            this._dissolveTween.stop();
            this._dissolveTween = null;
        }
        if (this._formTween) this._formTween.stop();
        if (this._scaleTween) this._scaleTween.stop();

        this._formTween = new TWEEN.Tween(this)
            .to({ progress: 1 }, 2500)
            .easing(TWEEN.Easing.Elastic.Out)
            .onUpdate(() => {
                this.updateFoliage();
                this.updateOrnaments();
                this.updatePolaroids();
            })
            .onComplete(() => {
                this.state = 'FORMED';
                this._formTween = null;
            })
            .start();
            
        this._scaleTween = new TWEEN.Tween(this.group.scale)
            .to({ x: 1, y: 1, z: 1 }, 1600)
            .easing(TWEEN.Easing.Cubic.Out)
            .onComplete(() => {
                this._scaleTween = null;
            })
            .start();
            
        // Reset rotation
        this.group.rotation.y = 0;
    }
    
    hide() {
        if (this._dissolveTimeoutId) {
            clearTimeout(this._dissolveTimeoutId);
            this._dissolveTimeoutId = null;
        }
        if (this._formTween) {
            this._formTween.stop();
            this._formTween = null;
        }
        if (this._scaleTween) {
            this._scaleTween.stop();
            this._scaleTween = null;
        }
        if (this._dissolveTween) {
            this._dissolveTween.stop();
            this._dissolveTween = null;
        }
        this.group.visible = false;
        this.progress = 0;
        this.state = 'CHAOS';
    }
    
    dissolve() {
        if (this.state === 'CHAOS') return false;
        if (this.state === 'DISSOLVING') {
            if (this._dissolveTimeoutId) {
                clearTimeout(this._dissolveTimeoutId);
                this._dissolveTimeoutId = null;
            }
            if (this._dissolveTween) {
                this._dissolveTween.stop();
                this._dissolveTween = null;
            }
            this.hide();
            if (this.controller && typeof this.controller.showCarousel === 'function') {
                this.controller.showCarousel();
            }
            return true;
        }
        this.state = 'DISSOLVING';
        
        if (this._formTween) {
            this._formTween.stop();
            this._formTween = null;
        }
        if (this._scaleTween) {
            this._scaleTween.stop();
            this._scaleTween = null;
        }
        if (this._dissolveTween) this._dissolveTween.stop();
        if (this._dissolveTimeoutId) {
            clearTimeout(this._dissolveTimeoutId);
            this._dissolveTimeoutId = null;
        }

        this._dissolveTween = new TWEEN.Tween(this)
            .to({ progress: 0 }, 1000)
            .easing(TWEEN.Easing.Cubic.In)
            .onUpdate(() => {
                this.updateFoliage();
                this.updateOrnaments();
                this.updatePolaroids();
            })
            .onComplete(() => {
                this.hide();
                this._dissolveTween = null;
                if (this._dissolveTimeoutId) {
                    clearTimeout(this._dissolveTimeoutId);
                    this._dissolveTimeoutId = null;
                }
                if (this.controller && typeof this.controller.showCarousel === 'function') {
                    this.controller.showCarousel();
                }
            })
            .start();

        this._dissolveTimeoutId = setTimeout(() => {
            if (this.state !== 'DISSOLVING') return;
            if (this._dissolveTween) {
                this._dissolveTween.stop();
                this._dissolveTween = null;
            }
            this.hide();
            if (this.controller && typeof this.controller.showCarousel === 'function') {
                this.controller.showCarousel();
            }
        }, 3000);
            
        return true;
    }
    
    rotate(velocity) {
        // Continuous rotation
        this.rotationSpeed = velocity * 0.1;
    }
    
    update(delta) {
        if (!this.group.visible) return;
        
        // Foliage Shader
        this.foliage.material.uniforms.uTime.value += delta;
        this.foliage.material.uniforms.uProgress.value = this.progress;

        if (this.surroundParticles && this.surroundParticles.material && this.surroundParticles.material.uniforms) {
            this.surroundParticles.material.uniforms.uTime.value += delta;
        }
        
        if (this.fairyLights) {
            this.fairyLights.material.uniforms.uTime.value += delta;
        }
        
        if (this.starGlow) {
            const t = this.foliage.material.uniforms.uTime.value;
            const pulse = 0.88 + 0.18 * Math.sin(t * 1.6);
            this.starGlow.material.opacity = 0.75 * pulse;
            this.starGlow.scale.setScalar(7.0 * pulse);
        }
        
        if (this.garland) {
            const t = this.foliage.material.uniforms.uTime.value;
            this.garland.material.emissiveIntensity = 1.05 + 0.35 * Math.sin(t * 1.2);
        }
        
        // Rotation Physics
        if (Math.abs(this.rotationSpeed) > 0.001) {
            this.group.rotation.y += this.rotationSpeed;
            this.rotationSpeed *= 0.95; // Damping
        }
    }
    
    updateFoliage() {
        // Handled by shader uniforms
    }
    
    updateOrnaments() {
        const dummy = new THREE.Object3D();
        
        for (let i = 0; i < this.ornamentCount; i++) {
            const data = this.ornamentData[i];
            
            // Lerp
            data.current.lerpVectors(data.chaos, data.target, this.progress);
            
            dummy.position.copy(data.current);
            dummy.scale.setScalar(data.scale * this.progress); // Scale up from 0
            dummy.rotation.y = (i * 0.17) + this.group.rotation.y * 0.25;
            dummy.updateMatrix();
            
            this.ornaments.setMatrixAt(i, dummy.matrix);
        }
        this.ornaments.instanceMatrix.needsUpdate = true;
    }
    
    updatePolaroids() {
        if (!this.polaroids || this.polaroids.length === 0) return;
        for (let i = 0; i < this.polaroids.length; i++) {
            const p = this.polaroids[i];
            const data = p.userData;
            
            p.position.lerpVectors(data.chaos, data.target, this.progress);
            
            // Rotate from random to target
            if (this.progress < 0.9) {
                p.rotation.x += data.rotVelocity.x;
                p.rotation.y += data.rotVelocity.y;
            } else {
                // Snap to target rotation
                p.rotation.x = THREE.MathUtils.lerp(p.rotation.x, data.targetRot.x, 0.1);
                p.rotation.y = THREE.MathUtils.lerp(p.rotation.y, data.targetRot.y, 0.1);
                p.rotation.z = THREE.MathUtils.lerp(p.rotation.z, data.targetRot.z, 0.1);
            }
        }
    }
}
