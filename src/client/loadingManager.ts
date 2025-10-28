/**
 * LoadingManager - Orchestrates the loading flow and state transitions
 * Handles asset loading, server connection, and error states
 */

import { AssetLoader } from "./assetLoader";

/**
 * Loading states for the game initialization flow
 */
enum LoadingState {
  LOADING_ASSETS = "LOADING_ASSETS",
  CONNECTING = "CONNECTING",
  CONNECTED = "CONNECTED",
  ERROR_CONNECTION = "ERROR_CONNECTION",
  ERROR_AUTH = "ERROR_AUTH",
}

/**
 * Connection data returned from the server
 */
interface ConnectionData {
  mode: "player" | "viewer";
  username: string;
  sessionId: string;
  level: string;
  terrainSeeds: {
    seed: number;
    treeSeed: number;
    stoneSeed: number;
    coalSeed: number;
  };
  spawnPosition: { x: number; y: number; z: number };
  initialChunks: Array<{
    chunkX: number;
    chunkZ: number;
    blocks: Array<any>;
  }>;
  players: Array<{
    username: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number };
  }>;
  playerData?: {
    score: number;
    friends: string[];
    friendedBy: string[];
  };
  message?: string;
  playerCount?: number;
}

/**
 * LoadingManager class - manages the game loading flow
 */
export class LoadingManager {
  private state: LoadingState = LoadingState.LOADING_ASSETS;
  private assetLoader: AssetLoader;

  // DOM element references
  private loadingScreen!: HTMLElement;
  private menuContainer!: HTMLElement;
  private menuButtons: HTMLElement[] = [];
  private connectionLoadingBar!: HTMLElement;
  private connectionErrorModal!: HTMLElement;
  private authErrorModal!: HTMLElement;

  constructor() {
    this.assetLoader = new AssetLoader();
    this.initializeElements();
    this.setupEventListeners();
  }

  /**
   * Initialize DOM element references
   */
  private initializeElements(): void {
    this.loadingScreen = document.querySelector(".loading-screen")!;
    this.menuContainer = document.querySelector(".menu")!;
    this.menuButtons = [
      document.querySelector("#play")!,
      document.querySelector("#setting")!,
      document.querySelector("#feature")!,
    ];
    this.connectionLoadingBar = document.querySelector(
      ".connection-loading-bar"
    )!;
    this.connectionErrorModal = document.querySelector(
      ".error-modal.connection-error"
    )!;
    this.authErrorModal = document.querySelector(".error-modal.auth-error")!;
  }

  /**
   * Setup event listeners for retry and close buttons
   */
  private setupEventListeners(): void {
    // Retry button for connection error
    const retryBtn =
      this.connectionErrorModal.querySelector(".error-retry-btn");
    retryBtn?.addEventListener("click", () => this.retryConnection());

    // Close button for auth error
    const closeBtn = this.authErrorModal.querySelector(".error-close-btn");
    closeBtn?.addEventListener("click", () => this.closeAuthError());
  }

  /**
   * Extract level from URL parameters
   */
  private getLevel(): string {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("level") || "default";
  }

  /**
   * Update the current loading state
   */
  private setState(newState: LoadingState): void {
    this.state = newState;
    this.updateUI();
  }

  /**
   * Update UI elements based on current state
   */
  private updateUI(): void {
    // Hide everything first
    this.loadingScreen.classList.add("hidden");
    this.connectionLoadingBar.classList.add("hidden");
    this.connectionErrorModal.classList.add("hidden");
    this.authErrorModal.classList.add("hidden");
    this.menuButtons.forEach((btn) => btn.classList.add("hidden"));

    // Show appropriate elements based on state
    switch (this.state) {
      case LoadingState.LOADING_ASSETS:
        this.loadingScreen.classList.remove("hidden");
        this.menuContainer.classList.add("hidden");
        break;

      case LoadingState.CONNECTING:
        this.menuContainer.classList.remove("hidden");
        this.connectionLoadingBar.classList.remove("hidden");
        break;

      case LoadingState.CONNECTED:
        this.menuContainer.classList.remove("hidden");
        this.menuButtons.forEach((btn) => btn.classList.remove("hidden"));
        break;

      case LoadingState.ERROR_CONNECTION:
        this.menuContainer.classList.remove("hidden");
        this.connectionErrorModal.classList.remove("hidden");
        break;

      case LoadingState.ERROR_AUTH:
        this.menuContainer.classList.remove("hidden");
        this.authErrorModal.classList.remove("hidden");
        break;
    }
  }

  /**
   * Connect to the game server
   * @returns Connection data on success
   * @throws Error on connection failure
   */
  private async connectToServer(): Promise<ConnectionData> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    // Check for stored username in localStorage
    const storedUsername = localStorage.getItem("username");
    const level = this.getLevel();

    // Build URL with username query param if available
    let url = "http://localhost:3000/api/connect";
    if (storedUsername) {
      url += `?username=${encodeURIComponent(storedUsername)}`;
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Connection failed: ${response.status}`);
      }

      const data: ConnectionData = await response.json();

      // Check for username in response
      if (!data.username) {
        this.setState(LoadingState.ERROR_AUTH);
        throw new Error("No username in response - authentication required");
      }

      // Store username in localStorage for future connections
      localStorage.setItem("username", data.username);

      // Success
      this.setState(LoadingState.CONNECTED);
      return data;
    } catch (error) {
      clearTimeout(timeoutId);

      if ((error as Error).name === "AbortError") {
        console.error("Connection timeout");
      } else {
        console.error("Connection error:", error);
      }

      this.setState(LoadingState.ERROR_CONNECTION);
      throw error;
    }
  }

  /**
   * Start the loading process
   * Orchestrates asset loading and server connection
   * @returns Connection data on success
   */
  async start(): Promise<ConnectionData> {
    try {
      // Phase 1: Load assets
      this.setState(LoadingState.LOADING_ASSETS);
      await this.assetLoader.loadAssets();

      // Phase 2: Connect to server
      this.setState(LoadingState.CONNECTING);
      const connectionData = await this.connectToServer();

      return connectionData;
    } catch (error) {
      console.error("Loading failed:", error);
      throw error;
    }
  }

  /**
   * Retry connection to server
   * Called when user clicks retry button in connection error modal
   */
  private retryConnection(): void {
    console.log("Retrying connection...");
    this.setState(LoadingState.CONNECTING);
    this.connectToServer().catch((error) => {
      console.error("Retry failed:", error);
      // Error state is already set in connectToServer
    });
  }

  /**
   * Close authentication error modal
   * Called when user clicks close button in auth error modal
   */
  private closeAuthError(): void {
    console.log("Closing auth error modal");
    this.authErrorModal.classList.add("hidden");
  }
}
