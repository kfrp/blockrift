import Core from "./core";
import Control from "./control";
import Player from "./player";
import Terrain from "./terrain";
import UI from "./ui";
import Audio from "./ui/audio";
import MultiplayerManager from "./multiplayer";
import * as THREE from "three";

const core = new Core();
const camera = core.camera;
const scene = core.scene;
const renderer = core.renderer;

const player = new Player();
const audio = new Audio(camera);

const terrain = new Terrain(scene, camera);

// Initialize multiplayer manager
const multiplayer = new MultiplayerManager(scene, camera, terrain);

// Get level from URL parameter or use "default"
// Example: http://localhost:5173/?level=world1
const urlParams = new URLSearchParams(window.location.search);
const level = urlParams.get("level") || "default";

// Connect to multiplayer server
multiplayer.connect(level).catch((error) => {
  console.error("Failed to connect to multiplayer server:", error);
});

const control = new Control(scene, camera, player, terrain, audio, multiplayer);

new UI(terrain, control);

// Position update interval (10 times per second)
// Only send updates when position or rotation has changed
let lastSentPosition = camera.position.clone();
let lastSentRotation = new THREE.Euler(
  camera.rotation.x,
  camera.rotation.y,
  camera.rotation.z
);

setInterval(() => {
  const currentPosition = camera.position;
  const currentRotation = camera.rotation;

  // Check if position changed (threshold: 0.1 units - about 1/10th of a block)
  const positionChanged =
    Math.abs(currentPosition.x - lastSentPosition.x) > 0.1 ||
    Math.abs(currentPosition.y - lastSentPosition.y) > 0.1 ||
    Math.abs(currentPosition.z - lastSentPosition.z) > 0.1;

  // Check if rotation changed (threshold: 0.05 radians - about 3 degrees)
  const rotationChanged =
    Math.abs(currentRotation.x - lastSentRotation.x) > 0.05 ||
    Math.abs(currentRotation.y - lastSentRotation.y) > 0.05 ||
    Math.abs(currentRotation.z - lastSentRotation.z) > 0.05;

  // Only send update if something changed
  if (positionChanged || rotationChanged) {
    multiplayer.sendPositionUpdate(
      currentPosition,
      new THREE.Euler(currentRotation.x, currentRotation.y, currentRotation.z)
    );

    // Update last sent values
    lastSentPosition.copy(currentPosition);
    lastSentRotation.set(
      currentRotation.x,
      currentRotation.y,
      currentRotation.z
    );
  }
}, 100);

// animation
(function animate() {
  requestAnimationFrame(animate);

  const delta = 1 / 60; // Approximate delta for 60 FPS

  control.update();
  terrain.update();
  multiplayer.update(delta);

  renderer.render(scene, camera);
})();
