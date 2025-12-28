# 3D Gesture Controlled Gallery

A futuristic, interactive 3D gallery controlled by hand gestures using a webcam. Built with Three.js and MediaPipe.

## Advanced Features

- **Holographic Cards**: Cards feature physical material properties with iridescence and holographic light effects.
- **Depth Control**: Move your hand closer or further from the camera to control the 3D field of view and scene depth.
- **Glassmorphic HUD**: A semi-transparent, blurred UI that matches the futuristic aesthetic.
- **Neural Tracking Feedback**: Real-time visualization of the AI's hand skeleton tracking.
- **Dynamic Atmosphere**: A reactive starfield background and atmospheric fog.
- **Custom Interaction Engine**: Smoother swiping and pinching logic powered by a neural gesture recognizer.

## Usage Tips

- **Depth Control**: Watch how the scene zoom changes as you move your hand towards the lens.
- **Hologram Effect**: Rotate the carousel to see how the virtual lights play off the iridescence of the cards.
- **Initialization**: If "Accessing Neural Network" takes too long, ensure you have a stable internet connection for the AI models.

## Setup & Run

Due to browser security restrictions (CORS for loading images and Webcam access), this project **must be run on a local server**. It will not work by simply opening `index.html` in a file browser.

### Option 1: Using Python (Recommended for macOS/Linux)

1. Open a terminal in this directory.
2. Run the following command:
   ```bash
   python3 -m http.server
   ```
3. Open your browser and go to: `http://localhost:8000`

### Option 2: Using Node.js (npx)

1. Open a terminal in this directory.
2. Run:
   ```bash
   npx serve .
   ```
3. Open the URL shown (usually `http://localhost:3000`).

## Usage

1. **Allow Camera Access** when prompted.
2. Wait for "INITIALIZING SYSTEM..." to finish (loading AI models).
3. **Controls**:
   - **Navigate**: Move your open palm horizontally (swipe) to rotate the carousel.
   - **Select**: Bring your thumb and index finger together (pinch/click) to zoom in.
   - **Dissolve**: Close your hand into a fist, wait a moment, then quickly open it to dissolve the image into particles.

## Notes

- Ensure you have good lighting for better hand tracking.
- The system uses `MediaPipe` for hand tracking and `Three.js` for 3D rendering.
- All dependencies are loaded via CDN (requires internet connection).
