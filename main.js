import { SceneController } from './scene.js?v=macaron20';
import { GestureController } from './gesture.js?v=macaron20';

document.addEventListener('DOMContentLoaded', () => {
    const setAppHeight = () => {
        const h = window.innerHeight || document.documentElement.clientHeight || 0;
        document.documentElement.style.setProperty('--app-height', `${h}px`);
    };
    setAppHeight();
    window.addEventListener('resize', setAppHeight, { passive: true });
    window.addEventListener('orientationchange', setAppHeight, { passive: true });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', setAppHeight, { passive: true });
    }

    // HUD Helper
    const hudMessage = document.getElementById('hud-message');
    const updateHud = (msg) => {
        if (hudMessage) {
            hudMessage.innerText = msg;
            hudMessage.style.textShadow = "0 10px 35px rgba(28, 22, 45, 0.14)";
        }
    };

    // Initialize Scene
    const scene = new SceneController('canvas-container');

    // Initialize Gestures with callbacks
    const gesture = new GestureController({
        onScroll: (velocity) => {
            if (scene.isIntroActive) return;
            // velocity here is a normalized signed force: [-1, 1]
            const direction = velocity < 0 ? '左' : '右';
            const intensity = Math.abs(velocity).toFixed(2);
            updateHud(`滑动：${direction} ${intensity}`);
            
            if (scene.isTreeMode) {
                scene.rotateTree(velocity);
            } else {
                scene.applyScrollForce(velocity * 0.08);
            }
        },
        onHover: () => {
            // Removed explicit hover logic
        },
        onScrollEnd: () => {
            if (scene.isIntroActive) return;
            scene.releaseScroll();
            // Tree doesn't need explicit release as it uses velocity decay
        },
        onZoom: (velocity) => {
            if (scene.isIntroActive) return;
            if (scene.isTreeMode) {
                scene.zoomTree(velocity);
            }
        },
        onSwipe: () => {},
        
        onClick: () => {
            if (scene.isIntroActive) return;
            console.log('Click detected');
            updateHud('捏合：选择');
            if (!scene.isZoomed && !scene.isTreeMode) {
                scene.selectCard();
            } 
            // Note: We removed the resetView from click.
            // Reset is now handled by "Fist" gesture.
        },
        onFist: () => {
            if (scene.isIntroActive) return;
            console.log('Fist detected');
            updateHud('握拳：返回 / 消散');
            
            // Logic:
            // If zoomed in (Photo mode) -> Dissolve/Close
            if (scene.isTreeMode) {
                scene.dissolveTree();
            } else if (scene.isZoomed) {
                scene.dissolveCard();
            } else if (scene.isHeartMode) {
                // If Heart Mode -> Dissolve Heart and Show Cards
                scene.hideHeart();
            }
        },
        onHeart: () => {
            if (scene.isIntroActive) return;
            console.log('Heart/Love Sign detected');
            updateHud('比心：爱心模式');
            if (!scene.isHeartMode && !scene.isZoomed && !scene.isTreeMode) {
                scene.showHeart();
            }
        },
        onThumbUp: () => {
            if (scene.isIntroActive) return;
            console.log('Thumb Up detected');
            updateHud('点赞：圣诞树');
            if (!scene.isTreeMode && !scene.isZoomed && !scene.isHeartMode) {
                scene.showChristmasTree();
            }
        },
        onDepth: (size) => {
            // size is approx 0.05 to 0.3
            // Optional: Show depth bar or value
            // scene.setHandDepth(size);
        },
        onHandLost: () => {
            // updateHud('请将手放入镜头');
        }
    });

    // Handle window resize
    window.addEventListener('resize', () => {
        // Scene handles its own resize listener
    });
});
