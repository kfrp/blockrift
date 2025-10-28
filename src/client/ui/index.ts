import Bag from "./bag";
import Terrain from "../terrain";
import Control from "../control";
import Joystick from "./joystick";
import { isMobile } from "../utils";
import * as THREE from "three";
import PlayerModeUI from "./playerModeUI";
import type MultiplayerManager from "../multiplayer";

export default class UI {
  playerModeUI: PlayerModeUI | null = null;

  constructor(terrain: Terrain, control: Control) {
    this.bag = new Bag();
    this.joystick = new Joystick(control);

    this.crossHair.className = "cross-hair";
    this.crossHair.innerHTML = "+";
    document.body.appendChild(this.crossHair);

    // Create username label (initially empty, will be set after connection)
    this.usernameLabel.className = "username-label";
    this.usernameLabel.innerHTML = "";
    document.body.appendChild(this.usernameLabel);

    // play
    this.play?.addEventListener("click", () => {
      if (this.play?.innerHTML === "Play") {
        this.onPlay();
      }
      !isMobile && control.control.lock();
    });

    // save load - disabled in multiplayer mode
    this.save?.addEventListener("click", () => {
      console.log(
        "Save/Load disabled in multiplayer mode - world state is managed by server"
      );
      // In multiplayer mode, the server manages world state
      // Local save/load is not supported
      !isMobile && control.control.lock();
    });

    // guide
    this.feature?.addEventListener("click", () => {
      this.features?.classList.remove("hidden");
    });
    this.back?.addEventListener("click", () => {
      this.features?.classList.add("hidden");
    });

    // setting
    this.setting?.addEventListener("click", () => {
      this.settings?.classList.remove("hidden");
    });
    this.settingBack?.addEventListener("click", () => {
      this.settings?.classList.add("hidden");
    });

    // render distance
    this.distanceInput?.addEventListener("input", (e: Event) => {
      if (this.distance && e.target instanceof HTMLInputElement) {
        this.distance.innerHTML = `Render Distance: ${e.target.value}`;
      }
    });

    // fov
    this.fovInput?.addEventListener("input", (e: Event) => {
      if (this.fov && e.target instanceof HTMLInputElement) {
        this.fov.innerHTML = `Field of View: ${e.target.value}`;
        control.camera.fov = parseInt(e.target.value);
        control.camera.updateProjectionMatrix();
      }
    });

    // music
    this.musicInput?.addEventListener("input", (e: Event) => {
      if (this.fov && e.target instanceof HTMLInputElement) {
        const disabled = e.target.value === "0";
        control.audio.disabled = disabled;
        this.music!.innerHTML = `Music: ${disabled ? "Off" : "On"}`;
      }
    });

    // apply settings
    this.settingBack?.addEventListener("click", () => {
      if (this.distanceInput instanceof HTMLInputElement) {
        terrain.distance = parseInt(this.distanceInput.value);
        terrain.maxCount =
          (terrain.distance * terrain.chunkSize * 2 + terrain.chunkSize) ** 2 +
          500;

        terrain.initBlocks();
        terrain.generate();
        terrain.scene.fog = new THREE.Fog(
          0x87ceeb,
          1,
          terrain.distance * 24 + 24
        );
      }
    });

    // menu and fullscreen
    document.body.addEventListener("keydown", (e: KeyboardEvent) => {
      // menu
      if (e.key === "e" && document.pointerLockElement) {
        !isMobile && control.control.unlock();
      }

      // fullscreen
      if (e.key === "f") {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          document.body.requestFullscreen();
        }
      }
    });

    // exit
    this.exit?.addEventListener("click", () => {
      this.onExit();
    });

    // play / pause handler
    document.addEventListener("pointerlockchange", () => {
      if (document.pointerLockElement) {
        this.onPlay();
      } else {
        this.onPause();
      }
    });

    // disable context menu
    document.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });

    // fallback lock handler
    document.querySelector("canvas")?.addEventListener("click", (e: Event) => {
      e.preventDefault();
      !isMobile && control.control.lock();
    });
  }

  bag: Bag;
  joystick: Joystick;

  menu = document.querySelector(".menu");
  crossHair = document.createElement("div");
  usernameLabel = document.createElement("div");

  // buttons
  play = document.querySelector("#play");
  control = document.querySelector("#control");
  setting = document.querySelector("#setting");
  feature = document.querySelector("#feature");
  back = document.querySelector("#back");
  exit = document.querySelector("#exit");
  save = document.querySelector("#save");

  // modals
  saveModal = document.querySelector(".save-modal");
  loadModal = document.querySelector(".load-modal");
  settings = document.querySelector(".settings");
  features = document.querySelector(".features");

  // settings
  distance = document.querySelector("#distance");
  distanceInput = document.querySelector("#distance-input");

  fov = document.querySelector("#fov");
  fovInput = document.querySelector("#fov-input");

  music = document.querySelector("#music");
  musicInput = document.querySelector("#music-input");

  settingBack = document.querySelector("#setting-back");

  onPlay = () => {
    isMobile && this.joystick.init();
    this.menu?.classList.add("hidden");
    this.menu?.classList.remove("start");
    this.play && (this.play.innerHTML = "Resume");
    this.crossHair.classList.remove("hidden");
    this.feature?.classList.add("hidden");

    // Hide the big viewer mode notification when entering gameplay
    if (this.playerModeUI) {
      this.playerModeUI.hideViewerModeNotification();
    }
  };

  onPause = () => {
    /*    this.menu?.classList.remove("hidden");
    this.crossHair.classList.add("hidden");
    this.save && (this.save.innerHTML = "Save and Exit");*/

    // Show the big viewer mode notification when returning to menu
    if (this.playerModeUI && this.playerModeUI.isViewerMode()) {
      this.playerModeUI.showViewerModeNotification();
    }
  };

  onExit = () => {
    this.menu?.classList.add("start");
    this.play && (this.play.innerHTML = "Play");
    this.save && (this.save.innerHTML = "Load Game");
    this.feature?.classList.remove("hidden");

    // Show the big viewer mode notification when returning to menu
    if (this.playerModeUI && this.playerModeUI.isViewerMode()) {
      this.playerModeUI.showViewerModeNotification();
    }
  };

  onSave = () => {
    this.saveModal?.classList.remove("hidden");
    setTimeout(() => {
      this.saveModal?.classList.add("show");
    });
    setTimeout(() => {
      this.saveModal?.classList.remove("show");
    }, 1000);

    setTimeout(() => {
      this.saveModal?.classList.add("hidden");
    }, 1350);
  };

  onLoad = () => {
    this.loadModal?.classList.remove("hidden");
    setTimeout(() => {
      this.loadModal?.classList.add("show");
    });
    setTimeout(() => {
      this.loadModal?.classList.remove("show");
    }, 1000);

    setTimeout(() => {
      this.loadModal?.classList.add("hidden");
    }, 1350);
  };

  setUsername = (username: string) => {
    this.usernameLabel.innerHTML = username;
  };

  updateUsernameLabel = (username: string, isViewerMode: boolean) => {
    if (isViewerMode) {
      this.usernameLabel.innerHTML = `<span style="color: #ff6b6b; font-weight: bold;">VIEWER</span> | ${username}`;
    } else {
      this.usernameLabel.innerHTML = username;
    }
  };

  /**
   * Initialize player mode UI after multiplayer connection
   */
  initializePlayerModeUI = (multiplayer: MultiplayerManager) => {
    const playerModeManager = multiplayer.getPlayerModeManager();
    const builderRecognitionManager =
      multiplayer.getBuilderRecognitionManager();
    const upvoteManager = multiplayer.getUpvoteManager();

    this.playerModeUI = new PlayerModeUI(
      playerModeManager,
      builderRecognitionManager,
      upvoteManager
    );

    // Show viewer mode notification if in viewer mode (only in menu)
    if (playerModeManager.isViewerMode()) {
      this.playerModeUI.showViewerModeNotification();
      // Update username label to show viewer mode indicator
      const username = playerModeManager.getUsername();
      this.updateUsernameLabel(username, true);
    }

    // Update UI with initial player count from connection
    this.playerModeUI.updateBuildersList(multiplayer.getPlayerCount());

    // Set up UI update callback in multiplayer manager
    multiplayer.setUIUpdateCallback(() => {
      if (this.playerModeUI) {
        this.playerModeUI.updateFriendsList();
        this.playerModeUI.updateBuildersList(multiplayer.getPlayerCount());
      }
    });

    // Set up block removal feedback callback
    multiplayer.setBlockRemovalFeedbackCallback((message: string) => {
      if (this.playerModeUI) {
        this.playerModeUI.showBlockRemovalFeedback(message);
      }
    });

    // Add keyboard shortcut to toggle friends list (F key when not in pointer lock)
    document.body.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "F" && !document.pointerLockElement && this.playerModeUI) {
        this.playerModeUI.toggleFriendsList();
      }
    });
  };

  /**
   * Get player mode UI instance
   */
  getPlayerModeUI = (): PlayerModeUI | null => {
    return this.playerModeUI;
  };
}
