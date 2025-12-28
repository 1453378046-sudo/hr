export class GestureController {
    constructor(callbacks) {
        this.callbacks = callbacks;
        this.video = document.getElementById('webcam');
        this.canvasElement = document.getElementById('output_canvas');
        this.canvasCtx = this.canvasElement.getContext('2d');
        this.statusText = document.getElementById('status-text');
        this.startBtn = document.getElementById('start-btn');
        
        this.hands = null;
        this.camera = null;
        this.isLoaded = false;
        
        // Interaction state
        this.lastPalmX = null;
        this.isPinching = false;
        this.wasFist = false;
        this.isThumbUp = false;
        this.isHeartPose = false;
        this.heartDebounceTimer = 0;
        this.gestureCooldown = false;

        this.init();
    }

    async init() {
        try {
            this.statusText.innerText = "正在初始化 AI...";
            const isCoarsePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
            const ua = navigator.userAgent || '';
            const isMobileUA = /Android|iPhone|iPad|iPod/i.test(ua);
            this._requiresUserGesture = isCoarsePointer || isMobileUA;
            const locateFile = (file) => `assets/mediapipe/${file}`;
            
            // Check if Hands is loaded
            if (typeof Hands === 'undefined') {
                console.warn("MediaPipe Hands not loaded yet, waiting...");
                // Simple retry mechanism if script is deferred but not yet executed
                await new Promise(resolve => {
                    const check = setInterval(() => {
                        if (typeof Hands !== 'undefined') {
                            clearInterval(check);
                            resolve();
                        }
                    }, 100);
                });
            }

            // Initialize MediaPipe Hands
            this.hands = new Hands({
                locateFile
            });

            this.hands.setOptions({
                maxNumHands: 1,
                modelComplexity: 0,
                minDetectionConfidence: 0.3,
                minTrackingConfidence: 0.3
            });

            this.hands.onResults(this.onResults.bind(this));

            this.statusText.innerText = "加载模型...";
            const preflightFiles = [
                'hands_solution_simd_wasm_bin.wasm',
                'hands_solution_simd_wasm_bin.js',
                'hands_solution_packed_assets.data',
                'hand_landmark_lite.tflite',
                'hands.binarypb'
            ];
            try {
                await Promise.all(preflightFiles.map(async (file) => {
                    const url = locateFile(file);
                    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
                    if (!res.ok) throw new Error(`${res.status} ${url}`);
                }));
            } catch (e) {
                this.statusText.innerText = "模型资源加载失败，请检查网络后重试";
                this.startBtn.innerText = "重试";
                this.startBtn.style.display = "block";
                this.startBtn.onclick = () => location.reload();
                return;
            }

            const initTimeoutMs = 20000;
            await Promise.race([
                this.hands.initialize(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Hands initialize timeout')), initTimeoutMs))
            ]);
            
            this.isLoaded = true;
            if (!navigator.mediaDevices?.getUserMedia) {
                this.statusText.innerText = "当前浏览器不支持摄像头";
                this.startBtn.style.display = "none";
                return;
            }
            if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
                this.statusText.innerText = "需要 https 或 localhost 才能启用摄像头";
                this.startBtn.style.display = "none";
                return;
            }

            if (this._requiresUserGesture) {
                this.statusText.innerText = "点击授权摄像头";
                this.startBtn.innerText = "启用摄像头";
                this.startBtn.style.display = "block";
                this.startBtn.onclick = async () => {
                    this.startBtn.disabled = true;
                    this.statusText.innerText = "正在申请摄像头权限...";
                    try {
                        await this.startVideoStream();
                        this.startBtn.style.display = "none";
                    } finally {
                        this.startBtn.disabled = false;
                    }
                };
                return;
            }

            this.statusText.innerText = "启动摄像头...";
            this.startBtn.style.display = "none";
            await this.startVideoStream();

        } catch (error) {
            console.error("Gesture Init Error:", error);
            this.statusText.innerText = "系统初始化失败";
            this.startBtn.style.display = "block";
        }
    }

    async startVideoStream() {
        try {
            let stream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: 'user',
                        width: { ideal: 640 },
                        height: { ideal: 480 }
                    },
                    audio: false
                });
            } catch (_) {
                stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            }
            this.video.srcObject = stream;
            try {
                await this.video.play();
            } catch (_) {
                this.startBtn.style.display = 'block';
                this.startBtn.onclick = async () => {
                    try {
                        await this.video.play();
                        this.startBtn.style.display = 'none';
                    } catch (e) {
                        console.error('Video play failed after user gesture:', e);
                    }
                };
            }
            await new Promise(resolve => {
                if (this.video.videoWidth > 0 && this.video.videoHeight > 0) {
                    resolve();
                    return;
                }
                this.video.addEventListener('loadedmetadata', () => resolve(), { once: true });
            });
            this.video.addEventListener('loadedmetadata', () => {
                if (this.canvasElement) {
                    this.canvasElement.width = this.video.videoWidth;
                    this.canvasElement.height = this.video.videoHeight;
                }
            }, { once: true });
            
            // Hide overlay only after video plays, but status text remains until first hand detected
            const overlay = document.getElementById('status-overlay');
            // We keep overlay visible but change text to prompt user
            this.statusText.innerText = "请在摄像头前挥手...";
            
            // Start Detection Loop
            this._isSendingFrame = false;
            const loop = async () => {
                if (this.hands && this.video.readyState >= 2 && this.video.videoWidth > 0 && this.video.videoHeight > 0) {
                    if (!this._isSendingFrame) {
                        this._isSendingFrame = true;
                        try {
                            await this.hands.send({ image: this.video });
                        } catch (e) {
                            console.error("Hands send error:", e);
                        } finally {
                            this._isSendingFrame = false;
                        }
                    }
                }
                requestAnimationFrame(loop);
            };
            requestAnimationFrame(loop);
            
            // Remove overlay after a short delay to reveal scene
            setTimeout(() => {
                if (overlay) {
                    overlay.style.opacity = '0';
                    setTimeout(() => { overlay.style.display = 'none'; }, 500);
                }
            }, 1500);

        } catch (err) {
            console.error('Native camera start failed:', err);
            this.statusText.innerText = '无法访问摄像头，点击重试';
            this.startBtn.innerText = '重试';
            this.startBtn.style.display = 'block';
            this.startBtn.onclick = async () => {
                this.startBtn.disabled = true;
                this.statusText.innerText = "正在申请摄像头权限...";
                try {
                    await this.startVideoStream();
                    this.startBtn.style.display = "none";
                } finally {
                    this.startBtn.disabled = false;
                }
            };
        }
    }

    // Removed dynamic loadMediaPipe function as we use script tags now

    onResults(results) {
        // Clear canvas
        this.canvasCtx.save();
        this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        
        // Reset watchdog on every successful result
        // (Assuming watchdog timer logic is external or we simplify)
        
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            if (!Array.isArray(landmarks) || landmarks.length < 21 || !landmarks[0] || !landmarks[4] || !landmarks[8]) {
                this.callbacks.onHandLost?.();
                const cursor = document.getElementById('hand-cursor');
                if (cursor) cursor.style.opacity = '0';
                this.canvasCtx.restore();
                return;
            }
            
            // Draw skeleton
            drawConnectors(this.canvasCtx, landmarks, HAND_CONNECTIONS, {color: '#00ffff', lineWidth: 2});
            drawLandmarks(this.canvasCtx, landmarks, {color: '#ffffff', lineWidth: 1, radius: 2});

            // Update Cursor on Screen
            this.updateScreenCursor(landmarks);

            // Process interactions immediately
            // Removed async/await or throttling inside here to ensure instant callback
            this.processInteractions(landmarks);
        } else {
            this.callbacks.onHandLost?.();
            const cursor = document.getElementById('hand-cursor');
            if (cursor) cursor.style.opacity = '0';
        }
        this.canvasCtx.restore();
    }

    updateScreenCursor(landmarks) {
        // Optimize: Only update if position changed significantly
        // And use transform3d for hardware accel
        const point = landmarks?.[8]; 
        const cursor = document.getElementById('hand-cursor');
        
        if (cursor) {
            if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
                cursor.style.opacity = '0';
                return;
            }
            cursor.style.opacity = '1';
            const x = (1 - point.x) * window.innerWidth; 
            const y = point.y * window.innerHeight;
            
            // Direct style update is fast enough for single element, but ensure it's on a layer
            cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        }
    }

    processInteractions(landmarks) {
        if (!Array.isArray(landmarks) || landmarks.length < 21) return;
        const required = [0, 4, 5, 6, 8, 9, 10, 12, 14, 16, 17, 20];
        for (let i = 0; i < required.length; i++) {
            const p = landmarks[required[i]];
            if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
        }

        const wrist = landmarks[0];
        const now = Date.now();

        const thumbTip = landmarks[4];
        const indexTipPinch = landmarks[8];
        const pinchDist = Math.hypot(thumbTip.x - indexTipPinch.x, thumbTip.y - indexTipPinch.y);
        const isPinchingNow = pinchDist < 0.05;

        // Calculate average fingertip position
        const fingerTipsIndices = [8, 12, 16, 20];
        let avgTipX = 0;
        let avgTipY = 0;
        fingerTipsIndices.forEach(i => {
            avgTipX += landmarks[i].x;
            avgTipY += landmarks[i].y;
        });
        avgTipX /= 4;
        avgTipY /= 4;

        // Check if hand is "Open" (fingers extended) to distinguish from Fist/Pinch
        // Avg distance from wrist
        const avgDist = fingerTipsIndices.reduce((s, i) => s + Math.hypot(landmarks[i].x - wrist.x, landmarks[i].y - wrist.y), 0) / 4;
        const isExtended = avgDist > 0.25; // Hand is reasonably open
        const isFist = avgDist < 0.22;

        // 1. Palm Dragging (Open Hand)
        // Logic: 
        // - Track Palm Center (Wrist or Average of key points)
        // - Calculate Delta X (Change in position)
        // - Apply Force based on Delta
        // - Only if hand is Open and NOT Pinching

        // Mirror X for screen coordinates (1 - x)
        // 0 = Left Edge, 1 = Right Edge
        const screenX = 1 - wrist.x;

        // Initialize smoothing if needed
        if (this._smoothedPalmX === undefined) {
            this._smoothedPalmX = screenX;
        }

        // Smooth the input
        // Lerp factor: 0.2 (Very smooth/laggy) to 0.8 (Responsive/jittery)
        // 0.5 is a good balance for dragging
        this._smoothedPalmX = this._smoothedPalmX * 0.6 + screenX * 0.4;

        // Calculate Delta
        // If this is the first frame of interaction, delta is 0
        if (this._lastSmoothedPalmX === undefined) {
            this._lastSmoothedPalmX = this._smoothedPalmX;
        }
        
        const deltaX = this._smoothedPalmX - this._lastSmoothedPalmX;
        this._lastSmoothedPalmX = this._smoothedPalmX;

        // Determine State
        // Open Hand: fingers extended (isExtended)
        // Pinching: isPinchingNow
        // Fist: isFist
        
        // Priority: Pinch > Fist > Open
        // Actually, Pinch and Fist are discrete triggers (Click/Back)
        // Dragging is continuous.
        // We shouldn't drag if pinching or fist.
        
        const isInteracting = isPinchingNow || isFist;
        const canDrag = isExtended && !isInteracting;

        if (canDrag) {
            // Apply Scroll
            // Sensitivity Factor
            // Moving hand 10% of screen -> Scroll ? cards
            // Try 40.0 to counteract the 0.08 multiplier in main.js
            // Target: Full screen swipe (1.0) -> ~3.2 cards movement
            const sensitivity = 40.0;
            
            // Invert delta because Drag Right (Screen X increases) -> Content Moves Right -> Index Decreases
            // But we want "Natural" scrolling?
            // If I pull Right -> Content moves Right -> I see Left items.
            // Index decreases.
            // So velocity should be negative.
            // deltaX > 0 (Right move) -> velocity < 0.
            
            // Deadzone for very small movements (optional, prevents drift)
            // But for 1:1 drag, we might not want deadzone, just smoothing.
            // Let's add a tiny deadzone to allow "Stopping" without jitter.
            const deadzone = 0.001; 
            let velocity = 0;
            
            if (Math.abs(deltaX) > deadzone) {
                velocity = -deltaX * sensitivity;
            }
            
            this.callbacks.onScroll?.(velocity);
        } else {
            // If not dragging, stop scroll
            // Reset tracking logic? 
            // If we stop dragging, we should send 0 or end scroll?
            // scene.releaseScroll() handles inertia.
            // But if we just stopped moving hand (delta=0), we send 0.
            // If we are in Fist/Pinch mode, we should NOT send scroll commands.
            // Let onScrollEnd handle it.
            this.callbacks.onScrollEnd?.();
            
            // Should we reset the smoother to avoid jump when returning to open hand?
            // Yes, if we lose "canDrag" state, reset the "last" tracker so next Open Hand starts fresh.
            // Actually, we should keep tracking X if hand is visible, to avoid jump?
            // No, if I make a fist, move hand, then open... I don't want a huge jump.
            // So I should update _lastSmoothedPalmX even if not dragging?
            // Yes, tracking should follow hand regardless of state, so Delta is always "since last frame".
            // But if I move while in Fist, I don't want that movement to register as scroll.
            // So when I open hand, Delta should be 0.
            // So _lastSmoothedPalmX should be reset to current when entering Drag state?
            // Or just update it continuously.
        }

        if (canDrag) {
            const palmSpan =
                Math.hypot(landmarks[5].x - landmarks[17].x, landmarks[5].y - landmarks[17].y) +
                Math.hypot(landmarks[0].x - landmarks[9].x, landmarks[0].y - landmarks[9].y);

            if (this._smoothedPalmSpan === undefined) this._smoothedPalmSpan = palmSpan;
            this._smoothedPalmSpan = this._smoothedPalmSpan * 0.85 + palmSpan * 0.15;

            if (this._lastSmoothedPalmSpan === undefined) this._lastSmoothedPalmSpan = this._smoothedPalmSpan;

            const deltaSpan = this._smoothedPalmSpan - this._lastSmoothedPalmSpan;
            this._lastSmoothedPalmSpan = this._smoothedPalmSpan;

            const spanDeadzone = 0.0012;
            if (Math.abs(deltaSpan) > spanDeadzone) {
                const zoomVelocity = Math.max(-1.25, Math.min(1.25, deltaSpan * 220));
                this.callbacks.onZoom?.(zoomVelocity);
            } else {
                this.callbacks.onZoom?.(0);
            }
        } else {
            this._lastSmoothedPalmSpan = undefined;
            this.callbacks.onZoom?.(0);
        }
        
        // 2. Pinch (Thumb tip to Index tip) - Select
        if (isPinchingNow && !this.isPinching) {
            this.callbacks.onClick?.();
        }
        this.isPinching = isPinchingNow;

        // 3. Fist Detection - Back / Dissolve
        if (isFist && !this.wasFist) {
             this.callbacks.onFist?.();
        }
        this.wasFist = isFist;
        
        this.lastPalmX = wrist.x; // Legacy, kept for reference if needed
        this.lastTimestamp = now;

        // 5. Heart Gesture Detection (Finger Heart: Thumb & Index crossed)
        // Check if Thumb Tip (4) is close to Index Tip (8)
        // AND Index is not fully extended (curled slightly)
        // AND Thumb is overlapping Index X/Y
        
        // Simplified "Finger Heart":
        // 1. Thumb Tip (4) close to Index Tip (8) (Distance check)
        // 2. Index Tip (8) is NOT fully extended (y > 6 approx, or just relative to wrist)
        // Actually, Finger Heart is basically a pinch but with fingers crossed.
        // Let's rely on a specific pinch-like pose but check orientation?
        // Or simpler: Just use the standard "Pinch" as Heart trigger if held for a moment?
        // No, Pinch is for click.
        
        // Let's use "Thumb and Index Crossed"
        // Check X distance between Thumb Tip and Index Tip is small
        // Check Y distance is small
        // AND check if Index PIP (6) is higher than Index Tip (8)? No, Index is curled.
        
        // Let's try: Thumb Tip (4) x > Index Tip (8) x (Crossed)
        // (Assuming right hand, mirror view... complex)
        
        // Let's go with a robust geometric shape:
        // Thumb Tip (4) and Index Tip (8) are VERY close ( < 0.05 )
        // AND Middle Finger (12) is EXTENDED (to differentiate from pinch/grab where all fingers curl)
        // "Pinch with Middle Finger Up" -> effectively "Finger Heart" visually or "OK" sign.
        // This is easy to do and detect.
        
        const thumbIndexDist = Math.hypot(landmarks[4].x - landmarks[8].x, landmarks[4].y - landmarks[8].y);
        const isThumbIndexClose = thumbIndexDist < 0.05;
        const isMiddleStraight = landmarks[12].y < landmarks[10].y; // Middle finger up
        
        // Debounce state
        if (!this.heartDebounceTimer) this.heartDebounceTimer = 0;
        
        if (isThumbIndexClose && isMiddleStraight) {
             // Increment timer
             this.heartDebounceTimer++;
             
             // Require ~10 frames (0.5s at 20fps) of holding to trigger
             if (this.heartDebounceTimer > 10) {
                 if (!this.isHeartPose) {
                     this.callbacks.onHeart?.();
                     this.isHeartPose = true;
                 }
             }
        } else {
            this.heartDebounceTimer = 0;
            this.isHeartPose = false;
        }

        // 6. Thumb Up Detection (Tree Mode)
        // Thumb Tip (4) is significantly higher (lower Y) than other finger tips
        // And other fingers are curled (Tip Y > PIP Y)
        const thumbTipY = landmarks[4].y;
        const indexTipY = landmarks[8].y;
        const middleTipY = landmarks[12].y;
        const ringTipY = landmarks[16].y;
        const pinkyTipY = landmarks[20].y;
        
        const isThumbHighest = (thumbTipY < indexTipY - 0.1) && 
                               (thumbTipY < middleTipY - 0.1);
                               
        const areOthersCurled = (landmarks[8].y > landmarks[6].y) && 
                                (landmarks[12].y > landmarks[10].y) &&
                                (landmarks[16].y > landmarks[14].y);
                                
        if (isThumbHighest && areOthersCurled) {
             if (!this.isThumbUp) {
                 // Trigger once
                 this.callbacks.onThumbUp?.();
                 this.isThumbUp = true;
             }
        } else {
            this.isThumbUp = false;
        }
    }
}
