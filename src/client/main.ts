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

const control = new Control(scene, camera, player, terrain, audio, multiplayer);

const ui = new UI(terrain, control);

// Connect to multiplayer server
multiplayer
  .connect(level)
  .then(() => {
    // Update username label after connection
    ui.setUsername(multiplayer.getUsername());
  })
  .catch((error) => {
    console.error("Failed to connect to multiplayer server:", error);
    ui.setUsername("Connection Failed");
  });

// Position update interval (10 times per second)
// Only send updates when position or rotation has changed
let lastSentPosition = camera.position.clone();
let lastSentRotation = {
  x: camera.rotation.x,
  y: camera.rotation.y,
};

setInterval(() => {
  const currentPosition = camera.position;

  // Calculate yaw from camera's forward direction vector
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  const yaw = Math.atan2(direction.x, direction.z);

  const currentRotation = {
    x: camera.rotation.x,
    y: yaw,
  };

  const positionChanged = !currentPosition.equals(lastSentPosition);

  // A more robust way to check for rotation changes
  const rotationChanged =
    Math.abs(currentRotation.y - lastSentRotation.y) > 0.05;

  // Only send update if something changed
  if (positionChanged || rotationChanged) {
    // --- IMPROVEMENT ---
    // Pass currentRotation directly since it's already a THREE.Euler object
    multiplayer.sendPositionUpdate(currentPosition, currentRotation);

    // Update last sent values using the efficient .copy() method
    lastSentPosition.copy(currentPosition);
    lastSentRotation = currentRotation;
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
