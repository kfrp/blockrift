# Design Document

## Overview

This design implements a polished loading experience for the sandbox game with two distinct phases:

1. **Asset Loading Phase**: Display a retro-style loading screen while critical assets (images, fonts) load
2. **Connection Phase**: Display the menu with a retro-style loading bar while connecting to the server

The design preserves all existing menu styles and focuses on timing control and new loading component designs that match the game's retro aesthetic.

## Architecture

### Loading Flow

```
Page Load
    ↓
[Asset Loading Screen] ← New retro loading screen
    ↓ (assets loaded)
[Menu Background + Title Visible]
    ↓
[Loading Bar] ← New retro loading bar (replaces buttons)
    ↓ (connection success)
[Menu Buttons Visible] ← Existing buttons
    ↓ (connection error)
[Error Modal] ← New retro error modal
```

### State Management

The loading system will use a simple state machine:

- **LOADING_ASSETS**: Initial state, loading screen visible
- **CONNECTING**: Assets loaded, loading bar visible
- **CONNECTED**: Connection successful, buttons visible
- **ERROR_CONNECTION**: Connection failed, error modal visible
- **ERROR_AUTH**: No username in response, auth error modal visible

## Components and Interfaces

### 1. Asset Loader

**Purpose**: Preload critical assets before showing the menu

**Implementation**:

```typescript
class AssetLoader {
  private assetsToLoad = [
    "/assets/menu2.png",
    "/assets/title5.png",
    "/assets/press.ttf",
  ];

  async loadAssets(): Promise<void> {
    const promises = this.assetsToLoad.map((asset) => this.loadAsset(asset));
    await Promise.all(promises);
  }

  private loadAsset(url: string): Promise<void> {
    if (url.endsWith(".ttf")) {
      return this.loadFont(url);
    } else {
      return this.loadImage(url);
    }
  }

  private loadImage(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = url;
    });
  }

  private loadFont(url: string): Promise<void> {
    // Use FontFace API to preload font
    const fontFace = new FontFace("BlockRift", `url(${url})`);
    return fontFace.load().then((loaded) => {
      document.fonts.add(loaded);
    });
  }
}
```

### 2. Loading Screen Component

**Purpose**: Full-screen retro loading overlay during asset loading

**HTML Structure**:

```html
<div class="loading-screen">
  <div class="loading-content">
    <div class="loading-text">Loading...</div>
    <div class="loading-spinner">
      <div class="spinner-block"></div>
      <div class="spinner-block"></div>
      <div class="spinner-block"></div>
    </div>
  </div>
</div>
```

**CSS Styling**:

```css
.loading-screen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: #1c1c1c;
  z-index: 9999;
  display: flex;
  justify-content: center;
  align-items: center;
}

.loading-content {
  text-align: center;
}

.loading-text {
  font-family: BlockRift, Avenir, Helvetica, Arial, sans-serif;
  font-size: 2rem;
  color: white;
  margin-bottom: 30px;
  text-shadow: 3px 3px 0px #000;
}

.loading-spinner {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.spinner-block {
  width: 20px;
  height: 20px;
  background-color: #955f44;
  border-left: 2px solid #a4a4a4;
  border-top: 2px solid #a4a4a4;
  border-bottom: 2px solid #545655;
  border-right: 2px solid #545655;
  box-shadow: 0 0 0 2px #787074;
  animation: bounce 0.6s infinite alternate;
}

.spinner-block:nth-child(2) {
  animation-delay: 0.2s;
}

.spinner-block:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes bounce {
  from {
    transform: translateY(0px);
  }
  to {
    transform: translateY(-15px);
  }
}

.loading-screen.hidden {
  display: none;
}
```

### 3. Connection Loading Bar Component

**Purpose**: Retro-style loading bar shown during server connection

**HTML Structure**:

```html
<div class="connection-loading-bar">
  <div class="loading-bar-text">Connecting...</div>
  <div class="loading-bar-container">
    <div class="loading-bar-fill"></div>
  </div>
</div>
```

**CSS Styling**:

```css
.connection-loading-bar {
  width: 200px;
  margin-bottom: 25px;
  text-align: center;
}

.loading-bar-text {
  font-family: BlockRift, Avenir, Helvetica, Arial, sans-serif;
  font-size: 1rem;
  color: white;
  margin-bottom: 10px;
  text-shadow: 2px 2px 0px #000;
}

.loading-bar-container {
  width: 200px;
  height: 20px;
  background-color: #3a3a3a;
  border-left: 2px solid #545655;
  border-top: 2px solid #545655;
  border-bottom: 2px solid #a4a4a4;
  border-right: 2px solid #a4a4a4;
  box-shadow: 0 0 0 2px #787074;
  overflow: hidden;
}

.loading-bar-fill {
  height: 100%;
  width: 0%;
  background-color: #218306;
  border-right: 2px solid #17cd07;
  animation: loadingPulse 1.5s ease-in-out infinite;
}

@keyframes loadingPulse {
  0% {
    width: 0%;
    background-color: #218306;
  }
  50% {
    width: 100%;
    background-color: #17cd07;
  }
  100% {
    width: 0%;
    background-color: #218306;
  }
}

.connection-loading-bar.hidden {
  display: none;
}
```

### 4. Error Modal Components

**Purpose**: Display connection and authentication errors in retro style

**HTML Structure**:

```html
<!-- Connection Error Modal -->
<div class="error-modal connection-error hidden">
  <div class="error-modal-content">
    <div class="error-modal-title">Connection Failed</div>
    <div class="error-modal-message">
      Could not connect to the game server.<br />Try again.
    </div>
    <button class="button error-retry-btn">Retry</button>
  </div>
</div>

<!-- Authentication Error Modal -->
<div class="error-modal auth-error hidden">
  <div class="error-modal-content">
    <div class="error-modal-title">Authentication Required</div>
    <div class="error-modal-message">Please log in to play</div>
    <button class="button error-close-btn">Close</button>
  </div>
</div>
```

**CSS Styling**:

```css
.error-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(0, 0, 0, 0.8);
  z-index: 1000;
  display: flex;
  justify-content: center;
  align-items: center;
}

.error-modal-content {
  width: 400px;
  padding: 30px;
  background-color: #727272;
  border-left: 3px solid #a4a4a4;
  border-top: 3px solid #a4a4a4;
  border-bottom: 3px solid #545655;
  border-right: 3px solid #545655;
  box-shadow: 0 0 0 3px black;
  text-align: center;
}

.error-modal-title {
  font-family: BlockRift, Avenir, Helvetica, Arial, sans-serif;
  font-size: 1.5rem;
  color: #ff6b6b;
  margin-bottom: 20px;
  text-shadow: 2px 2px 0px #000;
}

.error-modal-message {
  font-family: BlockRift, Avenir, Helvetica, Arial, sans-serif;
  font-size: 1.1rem;
  color: white;
  margin-bottom: 25px;
  line-height: 1.6;
}

.error-retry-btn,
.error-close-btn {
  /* Reuses existing .button styles */
  margin-bottom: 0;
}

.error-modal.hidden {
  display: none;
}
```

### 5. Loading Manager

**Purpose**: Orchestrate the loading flow and state transitions

**Implementation**:

```typescript
enum LoadingState {
  LOADING_ASSETS = "LOADING_ASSETS",
  CONNECTING = "CONNECTING",
  CONNECTED = "CONNECTED",
  ERROR_CONNECTION = "ERROR_CONNECTION",
  ERROR_AUTH = "ERROR_AUTH",
}

class LoadingManager {
  private state: LoadingState = LoadingState.LOADING_ASSETS;
  private assetLoader: AssetLoader;

  // DOM elements
  private loadingScreen: HTMLElement;
  private menuContainer: HTMLElement;
  private menuButtons: HTMLElement[];
  private connectionLoadingBar: HTMLElement;
  private connectionErrorModal: HTMLElement;
  private authErrorModal: HTMLElement;

  constructor() {
    this.assetLoader = new AssetLoader();
    this.initializeElements();
    this.setupEventListeners();
  }

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

  private setupEventListeners(): void {
    // Retry button for connection error
    const retryBtn =
      this.connectionErrorModal.querySelector(".error-retry-btn");
    retryBtn?.addEventListener("click", () => this.retryConnection());

    // Close button for auth error
    const closeBtn = this.authErrorModal.querySelector(".error-close-btn");
    closeBtn?.addEventListener("click", () => this.closeAuthError());
  }

  async start(): Promise<void> {
    // Phase 1: Load assets
    this.setState(LoadingState.LOADING_ASSETS);
    try {
      await this.assetLoader.loadAssets();
      this.setState(LoadingState.CONNECTING);

      // Phase 2: Connect to server
      await this.connectToServer();
    } catch (error) {
      console.error("Loading failed:", error);
      this.setState(LoadingState.ERROR_CONNECTION);
    }
  }

  private async connectToServer(): Promise<void> {
    try {
      const response = await fetch("http://localhost:3000/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: this.getLevel() }),
      });

      if (!response.ok) {
        throw new Error("Connection failed");
      }

      const data = await response.json();

      // Check for username
      if (!data.username) {
        this.setState(LoadingState.ERROR_AUTH);
        return;
      }

      // Success
      this.setState(LoadingState.CONNECTED);
      return data;
    } catch (error) {
      this.setState(LoadingState.ERROR_CONNECTION);
      throw error;
    }
  }

  private setState(newState: LoadingState): void {
    this.state = newState;
    this.updateUI();
  }

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

  private retryConnection(): void {
    this.setState(LoadingState.CONNECTING);
    this.connectToServer().catch(() => {
      // Error handling is done in connectToServer
    });
  }

  private closeAuthError(): void {
    // Just close the modal, keep showing menu
    this.authErrorModal.classList.add("hidden");
  }

  private getLevel(): string {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("level") || "default";
  }
}
```

## Data Models

### Loading State

```typescript
enum LoadingState {
  LOADING_ASSETS = "LOADING_ASSETS",
  CONNECTING = "CONNECTING",
  CONNECTED = "CONNECTED",
  ERROR_CONNECTION = "ERROR_CONNECTION",
  ERROR_AUTH = "ERROR_AUTH",
}
```

### Asset Configuration

```typescript
interface AssetConfig {
  url: string;
  type: "image" | "font";
}

const REQUIRED_ASSETS: AssetConfig[] = [
  { url: "/assets/menu2.png", type: "image" },
  { url: "/assets/title5.png", type: "image" },
  { url: "/assets/press.ttf", type: "font" },
];
```

## Integration Points

### 1. main.ts Integration

The loading manager needs to be initialized before the game starts:

```typescript
// At the top of main.ts
import { LoadingManager } from "./loadingManager";

const loadingManager = new LoadingManager();

// Start loading process
loadingManager
  .start()
  .then((connectionData) => {
    // Initialize game with connection data
    initializeGame(connectionData);
  })
  .catch((error) => {
    console.error("Failed to initialize game:", error);
  });

function initializeGame(connectionData: any) {
  // Existing game initialization code
  const core = new Core();
  const camera = core.camera;
  // ... rest of initialization
}
```

### 2. Multiplayer Manager Integration

The connection logic needs to be extracted from MultiplayerManager to LoadingManager:

- LoadingManager handles initial `/api/connect` call
- MultiplayerManager receives connection data as parameter
- MultiplayerManager.connect() becomes MultiplayerManager.initialize(connectionData)

### 3. UI Integration

The existing UI class needs minor updates:

- Remove "Connecting..." initial username label text
- Set username only after successful connection
- Handle connection state from LoadingManager

## Error Handling

### Asset Loading Errors

**Scenario**: Image or font fails to load

**Handling**:

- Retry loading the failed asset up to 3 times
- If still failing, show connection error modal (treat as fatal)
- Log detailed error to console for debugging

### Connection Errors

**Scenario**: Network error, server down, timeout

**Handling**:

- Show connection error modal with retry button
- Retry button calls `connectToServer()` again
- No automatic retry to avoid hammering the server

### Authentication Errors

**Scenario**: Response succeeds but no username field

**Handling**:

- Show authentication error modal
- Close button dismisses modal but keeps menu visible
- User cannot proceed to play without authentication

### Timeout Handling

Add timeout to connection request:

```typescript
private async connectToServer(): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

  try {
    const response = await fetch('http://localhost:3000/api/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: this.getLevel() }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    // ... rest of handling
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.error('Connection timeout');
    }
    this.setState(LoadingState.ERROR_CONNECTION);
    throw error;
  }
}
```

## Testing Strategy

### Manual Testing

1. **Asset Loading Phase**

   - Verify loading screen appears immediately on page load
   - Verify loading animation plays smoothly
   - Verify menu appears after assets load
   - Test with throttled network to see loading screen longer

2. **Connection Phase**

   - Verify loading bar appears after assets load
   - Verify loading bar animation plays
   - Verify buttons appear after successful connection
   - Test with server down to trigger error modal

3. **Error Scenarios**

   - Test connection error modal by stopping server
   - Test retry button functionality
   - Test auth error modal by modifying server response
   - Test timeout by adding delay to server

4. **Visual Consistency**
   - Verify retro styling matches existing buttons
   - Verify borders and colors match game aesthetic
   - Test on different screen sizes
   - Verify animations are smooth

### Integration Testing

1. **Full Flow Test**

   - Start from page load
   - Verify each phase transitions correctly
   - Verify game initializes properly after connection
   - Verify no console errors

2. **State Transition Test**
   - Test all state transitions
   - Verify UI updates correctly for each state
   - Verify no visual glitches during transitions

## Performance Considerations

### Asset Loading Optimization

- Use `Promise.all()` to load assets in parallel
- Preload critical assets only (menu2.png, title5.png, press.ttf)
- Other assets (textures, sounds) load in background after menu appears

### Animation Performance

- Use CSS animations instead of JavaScript for better performance
- Use `transform` and `opacity` for animations (GPU accelerated)
- Avoid layout thrashing by batching DOM updates

### Memory Management

- Clean up loading screen elements after connection succeeds
- Remove event listeners when no longer needed
- Dispose of temporary Image objects after loading

## Migration Path

### Phase 1: Add Loading Components

- Add HTML structure for loading screen, loading bar, and error modals
- Add CSS styling for all new components
- No functional changes yet

### Phase 2: Implement Asset Loader

- Create AssetLoader class
- Test asset loading in isolation
- Verify fonts and images load correctly

### Phase 3: Implement Loading Manager

- Create LoadingManager class
- Implement state machine
- Wire up UI updates

### Phase 4: Integrate with main.ts

- Move connection logic from MultiplayerManager to LoadingManager
- Update main.ts to use LoadingManager
- Test full flow

### Phase 5: Polish and Testing

- Fine-tune animations
- Test error scenarios
- Verify visual consistency
- Performance testing
