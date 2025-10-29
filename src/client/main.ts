import ENDPOINTS from "./utils/endpoints";
window.ENDPOINTS = ENDPOINTS;
import Core from "./core/core";
import Control from "./core/control";
import Player from "./player/player";
import Terrain from "./terrain";
import UI from "./ui";
import Audio from "./ui/audio";
import MultiplayerManager from "./state/multiplayer";
import { ChatManager } from "./ui/chatManager";
import { ChatUI } from "./ui/chatUI";
import { LoadingManager } from "./utils/loadingManager";
import { ChunkBasedPositionManager } from "./state/positionManager";
import * as THREE from "three";

// Initialize loading manager and start loading process
const loadingManager = new LoadingManager();

loadingManager
  .start()
  .then((connectionData) => {
    // Initialize game with connection data
    initializeGame(connectionData);
  })
  .catch((error) => {
    console.error("Failed to initialize game:", error);
  });

/**
 * Initialize the game with connection data from the server
 */
function initializeGame(connectionData: any) {
  const core = new Core();
  const camera = core.camera;
  const scene = core.scene;
  const renderer = core.renderer;

  const player = new Player();
  const audio = new Audio(camera);

  const terrain = new Terrain(scene, camera);

  // Create a temporary multiplayer instance to get playerModeManager
  // This is needed because playerModeManager is created inside MultiplayerManager
  const tempMultiplayer = new MultiplayerManager(
    scene,
    camera,
    terrain,
    null as any
  );
  const playerModeManager = tempMultiplayer.getPlayerModeManager();

  // Initialize ChatUI (will receive chatManager reference after it's created)
  let chatUI: ChatUI;

  // Initialize ChatManager with playerModeManager and callback
  const chatManager = new ChatManager(playerModeManager, () =>
    chatUI?.updateChatDisplay()
  );

  // Initialize ChatUI with chatManager and playerModeManager
  chatUI = new ChatUI(chatManager, playerModeManager);

  // Initialize multiplayer manager with chatManager
  const multiplayer = new MultiplayerManager(
    scene,
    camera,
    terrain,
    chatManager
  );

  // Transfer the playerModeManager instance to the real multiplayer
  // This ensures the same instance is used across all components
  (multiplayer as any).playerModeManager = playerModeManager;

  const control = new Control(
    scene,
    camera,
    player,
    terrain,
    audio,
    multiplayer,
    chatUI
  );

  const ui = new UI(terrain, control);

  // Connect to multiplayer server with connection data
  multiplayer
    .connect(connectionData.level, connectionData)
    .then(() => {
      // Update username label after connection
      ui.setUsername(multiplayer.getUsername());

      // Initialize player mode UI
      ui.initializePlayerModeUI(multiplayer);
    })
    .catch((error) => {
      console.error("Failed to connect to multiplayer server:", error);
      ui.setUsername("Connection Failed");
    });

  // Chunk-based position updates (only send when crossing chunk boundaries)
  const positionManager = new ChunkBasedPositionManager(
    multiplayer.getUsername(),
    connectionData.level
  );

  // animation
  (function animate() {
    requestAnimationFrame(animate);

    const delta = 1 / 60; // Approximate delta for 60 FPS

    control.update();
    terrain.update();
    multiplayer.update(delta);

    // Check for chunk-based position updates
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    const yaw = Math.atan2(direction.x, direction.z);
    const currentRotation = {
      x: camera.rotation.x,
      y: yaw,
    };
    positionManager.checkPosition(camera.position, currentRotation);

    renderer.render(scene, camera);
  })();
}
