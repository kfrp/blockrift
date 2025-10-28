# Builders List UI Improvements Design Document

## Overview

This design document outlines the architecture for enhancing the builders list UI component. The improvements focus on:

1. **Removing redundant player score display** - Eliminate the separate score element to reduce clutter
2. **Repositioning to top-left** - Move from top-right to top-left for better layout
3. **Collapsible dropdown interface** - Add expand/collapse functionality to save screen space
4. **Scrollable content** - Support long lists of builders with smooth scrolling
5. **Highlight synchronization** - Visual feedback when a builder's blocks are highlighted
6. **Region-aware updates** - Refresh builders list when subscriptions change
7. **Friend management buttons** - Add/remove friends directly from the builders list

### Key Design Principles

1. **Minimal UI footprint**: Collapsed by default, showing only builder count
2. **Clear visual hierarchy**: Header clearly distinguishable from content
3. **Responsive interaction**: Smooth transitions and immediate feedback
4. **Performance**: Efficient DOM updates, avoid unnecessary re-renders
5. **Accessibility**: Keyboard navigation and clear visual states

## Architecture

### Component Structure

```
┌─────────────────────────────────────┐
│  Builders List Container            │
│  ┌───────────────────────────────┐  │
│  │  Header (clickable)           │  │
│  │  "Builders: 5" [▼]            │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │  Content (collapsible)        │  │
│  │  ┌─────────────────────────┐  │  │
│  │  │ Scrollable Area         │  │  │
│  │  │ [+] Alice               │  │  │
│  │  │ [✓] Bob (highlighted)   │  │  │
│  │  │ [+] Charlie             │  │  │
│  │  │     MyUsername          │  │  │
│  │  │ • ...                   │  │  │
│  │  └─────────────────────────┘  │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘

Legend:
[+] = Add friend button
[✓] = Friend (click to remove)
No button = Current player
```

### State Management

The builders list component will maintain the following state:

```typescript
interface BuildersListState {
  isExpanded: boolean; // Collapsed or expanded
  builders: string[]; // Array of usernames
  highlightedBuilder: string | null; // Currently highlighted builder
  totalCount: number; // Total number of builders
}
```

## Components and Interfaces

### 1. PlayerModeUI Modifications

#### 1.1 Remove Player Score Display

```typescript
class PlayerModeUI {
  // REMOVE this property
  // private playerScoreDisplay: HTMLDivElement;

  constructor(...) {
    // REMOVE player score creation
    // this.playerScoreDisplay = this.createPlayerScoreDisplay();

    // REMOVE player score append
    // document.body.appendChild(this.playerScoreDisplay);

    // REMOVE initial score update
    // this.updatePlayerScore();
  }

  // REMOVE these methods entirely
  // private createPlayerScoreDisplay(): HTMLDivElement { ... }
  // updatePlayerScore(): void { ... }

  destroy(): void {
    // REMOVE player score cleanup
    // this.playerScoreDisplay.remove();
  }
}
```

#### 1.2 Enhanced Builders List Container

```typescript
class PlayerModeUI {
  private buildersListContainer: HTMLDivElement;
  private isExpanded: boolean = false; // Start collapsed

  private createBuildersListContainer(): HTMLDivElement {
    const container = document.createElement("div");
    container.className = "builders-list collapsed";

    container.innerHTML = `
      <div class="builders-list-header">
        <span class="builders-count">Builders: 0</span>
        <span class="builders-toggle">▼</span>
      </div>
      <div class="builders-list-content">
        <div class="builders-list-scroll"></div>
      </div>
    `;

    // Add click handler for header
    const header = container.querySelector(".builders-list-header");
    header?.addEventListener("click", () => {
      this.toggleBuildersList();
    });

    return container;
  }

  private toggleBuildersList(): void {
    this.isExpanded = !this.isExpanded;

    if (this.isExpanded) {
      this.buildersListContainer.classList.remove("collapsed");
      this.buildersListContainer.classList.add("expanded");

      // Update toggle icon
      const toggle =
        this.buildersListContainer.querySelector(".builders-toggle");
      if (toggle) toggle.textContent = "▲";
    } else {
      this.buildersListContainer.classList.remove("expanded");
      this.buildersListContainer.classList.add("collapsed");

      // Update toggle icon
      const toggle =
        this.buildersListContainer.querySelector(".builders-toggle");
      if (toggle) toggle.textContent = "▼";

      // NEW: Clear any active highlights when collapsing
      this.builderRecognitionManager.clearHighlight();
      this.updateBuildersList(); // Refresh to remove highlight styling
    }
  }
}
```

#### 1.3 Enhanced updateBuildersList Method

```typescript
class PlayerModeUI {
  updateBuildersList(): void {
    const builders = this.builderRecognitionManager.getBuilders();
    const highlightedBuilder =
      this.builderRecognitionManager.getHighlightedBuilder();

    // Update count in header
    const countEl = this.buildersListContainer.querySelector(".builders-count");
    if (countEl) {
      countEl.textContent = `Builders: ${builders.length}`;
    }

    // Update content (only if expanded)
    const scrollContainer = this.buildersListContainer.querySelector(
      ".builders-list-scroll"
    ) as HTMLDivElement;

    if (!scrollContainer) return;

    if (builders.length === 0) {
      scrollContainer.innerHTML =
        '<div class="no-builders">No builders nearby</div>';
      return;
    }

    // Render builder list WITHOUT block counts
    scrollContainer.innerHTML = builders
      .map((builder) => {
        const isHighlighted = builder.username === highlightedBuilder;
        const highlightClass = isHighlighted ? "highlighted" : "";

        return `
          <div class="builder-item ${highlightClass}">
            <span class="builder-name" data-username="${builder.username}">
              ${builder.username}
            </span>
            <button 
              class="upvote-btn ${this.getUpvoteClass(builder.username)}" 
              data-username="${builder.username}"
              title="${this.getUpvoteTitle(builder.username)}"
            >
              ⬆
            </button>
          </div>
        `;
      })
      .join("");

    // Add click handlers for builder names
    scrollContainer.querySelectorAll(".builder-name").forEach((element) => {
      element.addEventListener("click", () => {
        const username = element.getAttribute("data-username");
        if (username) {
          this.builderRecognitionManager.toggleBuilderHighlight(username);
          // Re-render to update highlight state
          this.updateBuildersList();
        }
      });
    });

    // Add click handlers for upvote buttons
    scrollContainer.querySelectorAll(".upvote-btn").forEach((element) => {
      element.addEventListener("click", async () => {
        const username = element.getAttribute("data-username");
        if (username) {
          await this.handleUpvote(username);
        }
      });
    });
  }

  private getUpvoteClass(username: string): string {
    const canUpvote = this.upvoteManager.canUpvote(username);
    return canUpvote.allowed ? "" : "upvote-disabled";
  }

  private getUpvoteTitle(username: string): string {
    const canUpvote = this.upvoteManager.canUpvote(username);
    return canUpvote.allowed ? "Upvote" : canUpvote.reason;
  }
}
```

### 2. BuilderRecognitionManager Modifications

#### 2.1 Include Current Player in Builders List

```typescript
class BuilderRecognitionManager {
  updateBuilders(): void {
    const currentUsername = this.playerModeManager.getUsername();
    const builderCounts = new Map<string, number>();

    // Count blocks per builder in custom blocks
    for (const block of this.terrain.customBlocks) {
      if (!block.placed) continue;
      if (!block.username) continue;

      // CHANGE: Include current player's blocks
      const count = builderCounts.get(block.username) || 0;
      builderCounts.set(block.username, count + 1);
    }

    // Convert to array and sort by block count
    this.currentBuilders = Array.from(builderCounts.entries())
      .map(([username, blockCount]) => ({ username, blockCount }))
      .sort((a, b) => b.blockCount - a.blockCount);
    // REMOVE: .slice(0, 10) - show all builders, let scrolling handle overflow

    console.log(
      `BuilderRecognitionManager: Updated builders list (${this.currentBuilders.length} builders)`
    );

    // Clear highlights if highlighted builder is no longer in list
    if (
      this.highlightedBuilder &&
      !this.currentBuilders.find((b) => b.username === this.highlightedBuilder)
    ) {
      this.clearHighlight();
    }

    // Trigger UI update
    this.renderBuildersUI();
  }
}
```

### 3. Friend Management Integration

#### 3.1 Update Builder Item HTML Structure

The builder item HTML needs to include a friend button to the left of the username:

```typescript
class PlayerModeUI {
  updateBuildersList(): void {
    const builders = this.builderRecognitionManager.getBuilders();
    const highlightedBuilder =
      this.builderRecognitionManager.getHighlightedBuilder();
    const currentUsername = this.playerModeManager.getUsername();
    const friends = this.playerModeManager.getFriends();

    // ... existing code for count update ...

    // Render builder list WITH friend buttons
    scrollContainer.innerHTML = builders
      .map((builder) => {
        const isHighlighted = builder.username === highlightedBuilder;
        const highlightClass = isHighlighted ? "highlighted" : "";
        const isCurrentPlayer = builder.username === currentUsername;
        const isFriend = friends.includes(builder.username);

        // Friend button HTML (only for other players)
        let friendButton = "";
        if (!isCurrentPlayer) {
          if (isFriend) {
            friendButton = `
              <button 
                class="friend-btn friend-btn-active" 
                data-username="${builder.username}"
                title="Remove friend"
              >
                ✓
              </button>
            `;
          } else {
            friendButton = `
              <button 
                class="friend-btn" 
                data-username="${builder.username}"
                title="Add as friend"
              >
                +
              </button>
            `;
          }
        }

        return `
          <div class="builder-item ${highlightClass}">
            ${friendButton}
            <span class="builder-name" data-username="${builder.username}">
              ${builder.username}
            </span>
            <button 
              class="upvote-btn ${this.getUpvoteClass(builder.username)}" 
              data-username="${builder.username}"
              title="${this.getUpvoteTitle(builder.username)}"
            >
              ⬆
            </button>
          </div>
        `;
      })
      .join("");

    // Add click handlers for builder names
    scrollContainer.querySelectorAll(".builder-name").forEach((element) => {
      element.addEventListener("click", () => {
        const username = element.getAttribute("data-username");
        if (username) {
          this.builderRecognitionManager.toggleBuilderHighlight(username);
          this.updateBuildersList();
        }
      });
    });

    // Add click handlers for friend buttons
    scrollContainer.querySelectorAll(".friend-btn").forEach((element) => {
      element.addEventListener("click", async (e) => {
        e.stopPropagation(); // Prevent triggering builder name click
        const username = element.getAttribute("data-username");
        if (username) {
          await this.handleFriendToggle(username);
        }
      });
    });

    // Add click handlers for upvote buttons
    scrollContainer.querySelectorAll(".upvote-btn").forEach((element) => {
      element.addEventListener("click", async (e) => {
        e.stopPropagation(); // Prevent triggering builder name click
        const username = element.getAttribute("data-username");
        if (username) {
          await this.handleUpvote(username);
        }
      });
    });
  }

  /**
   * Handle friend button click (add or remove)
   */
  private async handleFriendToggle(username: string): Promise<void> {
    const friends = this.playerModeManager.getFriends();
    const isFriend = friends.includes(username);

    if (isFriend) {
      // Remove friend
      await this.playerModeManager.removeFriend(username);
    } else {
      // Add friend
      await this.playerModeManager.addFriend(username);
    }

    // Update UI to reflect change (optimistic update already happened in PlayerModeManager)
    this.updateBuildersList();
  }
}
```

#### 3.2 CSS Styles for Friend Buttons

```css
.friend-btn {
  width: 20px;
  height: 20px;
  padding: 0;
  margin-right: 6px;
  background-color: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 3px;
  color: white;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.friend-btn:hover {
  background-color: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.5);
  transform: scale(1.1);
}

.friend-btn-active {
  background-color: rgba(23, 205, 7, 0.3);
  border-color: #17cd07;
  color: #17cd07;
}

.friend-btn-active:hover {
  background-color: rgba(23, 205, 7, 0.4);
}

/* Update builder-item to use flexbox for proper alignment */
.builder-item {
  display: flex;
  align-items: center;
  padding: 6px 8px;
  margin: 2px 0;
  background-color: hsla(0, 0%, 15%, 0.7);
  border: 1px solid rgb(100, 100, 100);
  transition: background-color 0.2s ease;
}
```

### 4. Multiplayer Manager Modifications

#### 4.1 Update Builders List on Subscription Changes

```typescript
class MultiplayerManager {
  // Add method to handle subscription updates
  private async updateRegionalSubscriptions(
    playerChunkX: number,
    playerChunkZ: number
  ): Promise<void> {
    await this.chunkStateManager.updateSubscriptions(
      playerChunkX,
      playerChunkZ,
      (broadcastData) => this.handleMessage(broadcastData)
    );

    // NEW: Update builders list after subscription changes
    this.builderRecognitionManager.updateBuilders();
    this.triggerUIUpdate();
  }

  // Call this method when player position changes significantly
  private checkPlayerMovement(): void {
    const playerChunkX = Math.floor(
      this.player.position.x / this.terrain.chunkSize
    );
    const playerChunkZ = Math.floor(
      this.player.position.z / this.terrain.chunkSize
    );

    // Check if player moved to a new chunk
    if (
      playerChunkX !== this.currentChunk.x ||
      playerChunkZ !== this.currentChunk.z
    ) {
      this.currentChunk = { x: playerChunkX, z: playerChunkZ };

      // Update subscriptions and builders list
      this.updateRegionalSubscriptions(playerChunkX, playerChunkZ);
    }
  }
}
```

## Data Models

### BuilderInfo Interface

```typescript
// MODIFY existing interface
export interface BuilderInfo {
  username: string;
  blockCount: number; // Keep for internal sorting, but don't display
  score?: number; // Keep for score updates
}
```

## Error Handling

### Edge Cases

1. **Empty builders list**: Display "No builders nearby" message
2. **Single builder (current player)**: Show player's own name
3. **Very long usernames**: Truncate with ellipsis in CSS
4. **Rapid toggling**: Debounce toggle events to prevent animation issues
5. **Highlight during collapse**: Maintain highlight state when toggling

### Error States

1. **Failed to load builders**: Log error, show cached list
2. **Highlight mesh creation fails**: Log error, continue without highlight
3. **DOM element not found**: Log error, skip update

## Testing Strategy

### Unit Tests

1. **PlayerModeUI**:

   - Test builders list creation with correct structure
   - Test toggle functionality (collapsed ↔ expanded)
   - Test builder count display updates
   - Test highlight class application
   - Test upvote button state rendering

2. **BuilderRecognitionManager**:
   - Test builder counting includes current player
   - Test builder sorting by block count
   - Test highlight state management
   - Test builders list updates on chunk changes

### Integration Tests

1. **UI Integration**:

   - Test builders list updates when blocks are placed/removed
   - Test builders list updates when subscriptions change
   - Test highlight synchronization between manager and UI
   - Test scroll behavior with many builders

2. **Multiplayer Integration**:
   - Test builders list updates when moving to new regions
   - Test builders list updates when other players place blocks
   - Test builders list updates when receiving score broadcasts

### Visual Tests

1. **Layout**:

   - Verify top-left positioning
   - Verify collapsed state shows only header
   - Verify expanded state shows scrollable list
   - Verify highlight styling is visible

2. **Interactions**:
   - Verify smooth expand/collapse transitions
   - Verify scroll behavior with mouse wheel
   - Verify click handlers work correctly
   - Verify highlighted builder is visually distinct

## CSS Styling

### Layout and Positioning

```css
.builders-list {
  position: fixed;
  left: 10px; /* Changed from right: 10px */
  top: 10px; /* Changed from top: 60px */
  width: 180px; /* Reduced from 220px */
  background-color: hsla(0, 0%, 11%, 0.85);
  border: 2px solid rgb(141, 139, 139);
  color: white;
  z-index: 10;
  transition: all 0.3s ease;
}

.builders-list.expanded {
  width: 220px;
}
```

### Header Styling

```css
.builders-list-header {
  padding: 8px 12px;
  background-color: hsla(0, 0%, 20%, 0.9);
  font-weight: bold;
  border-bottom: 1px solid rgb(141, 139, 139);
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  user-select: none;
}

.builders-list-header:hover {
  background-color: hsla(0, 0%, 25%, 0.9);
}

.builders-count {
  font-size: 0.9rem;
}

.builders-toggle {
  font-size: 0.8rem;
  transition: transform 0.3s ease;
}
```

### Content Styling

```css
.builders-list-content {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease;
}

.builders-list.expanded .builders-list-content {
  max-height: 300px;
}

.builders-list-scroll {
  max-height: 300px;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px;
}

/* Custom scrollbar */
.builders-list-scroll::-webkit-scrollbar {
  width: 6px;
}

.builders-list-scroll::-webkit-scrollbar-track {
  background: hsla(0, 0%, 15%, 0.5);
}

.builders-list-scroll::-webkit-scrollbar-thumb {
  background: hsla(0, 0%, 40%, 0.8);
  border-radius: 3px;
}

.builders-list-scroll::-webkit-scrollbar-thumb:hover {
  background: hsla(0, 0%, 50%, 0.9);
}

/* Alternative: Manual scroll with arrows (if native scrolling is problematic) */
.builders-list-scroll-arrows {
  display: none; /* Show only if needed */
}

.scroll-arrow {
  text-align: center;
  padding: 4px;
  background-color: hsla(0, 0%, 20%, 0.9);
  cursor: pointer;
  user-select: none;
  font-size: 0.8rem;
}

.scroll-arrow:hover {
  background-color: hsla(0, 0%, 30%, 0.9);
}

.scroll-arrow.disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
```

### Builder Item Styling

```css
.builder-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 8px;
  margin: 2px 0;
  background-color: hsla(0, 0%, 15%, 0.7);
  border: 1px solid rgb(100, 100, 100);
  transition: background-color 0.2s ease;
}

.builder-item:hover {
  background-color: hsla(0, 0%, 25%, 0.9);
}

.builder-item.highlighted {
  background-color: hsla(120, 100%, 25%, 0.8);
  border: 1px solid #17cd07;
}

.builder-name {
  cursor: pointer;
  flex: 1;
  font-size: 0.85rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.builder-item.highlighted .builder-name {
  color: #17cd07;
  font-weight: bold;
}

.builder-name:hover {
  color: #17cd07;
}
```

### Collapsed State

```css
.builders-list.collapsed .builders-list-content {
  display: none;
}
```

## Performance Considerations

### Optimization Strategies

1. **Debounced Updates**: Avoid updating builders list on every frame
2. **Efficient DOM Updates**: Only update changed elements, not entire list
3. **Virtual Scrolling**: Consider for lists with 100+ builders (future enhancement)
4. **Event Delegation**: Use single event listener for all builder items
5. **CSS Transitions**: Use GPU-accelerated properties (transform, opacity)

### Memory Management

1. **Cleanup Highlights**: Dispose Three.js meshes when clearing highlights
2. **Remove Event Listeners**: Clean up on component destroy
3. **Limit Builder Count**: Consider capping at 50-100 builders for performance

## Migration Path

### Phase 1: Remove Player Score Display

1. Remove player score DOM element
2. Remove related CSS
3. Remove update methods
4. Test UI layout

### Phase 2: Reposition and Restructure

1. Update CSS positioning (left: 10px, top: 10px)
2. Add header with count and toggle icon
3. Wrap content in scrollable container
4. Test layout and positioning

### Phase 3: Implement Collapse/Expand

1. Add state management for expanded/collapsed
2. Implement toggle functionality
3. Add CSS transitions
4. Test interaction

### Phase 4: Add Scrolling

1. Set max-height on scroll container
2. Add custom scrollbar styling
3. Test with various builder counts
4. Test scroll performance

### Phase 5: Implement Highlight Sync

1. Add highlighted class to builder items
2. Update styling for highlighted state
3. Sync with BuilderRecognitionManager
4. Test highlight toggling

### Phase 6: Add Region-Aware Updates

1. Hook into subscription update events
2. Call updateBuilders on subscription changes
3. Test with player movement
4. Verify performance

## Scrolling Implementation Notes

The design supports two scrolling approaches:

### Approach 1: Native Browser Scrolling (Preferred)

- Use standard CSS `overflow-y: auto` on the scroll container
- Browser handles all scroll events automatically
- Custom scrollbar styling via `::-webkit-scrollbar` pseudo-elements
- Works well in most contexts, including Three.js overlays

### Approach 2: Manual Scroll with Arrows (Fallback)

If native scrolling proves difficult in the Three.js context:

- Add up/down arrow buttons above and below the list
- Track scroll position manually with JavaScript
- Show/hide arrows based on scroll position (top/bottom)
- Implement click handlers to scroll by fixed increments
- Display visual indicator (scrollbar) to show relative position

```typescript
// Manual scroll implementation (if needed)
class PlayerModeUI {
  private scrollPosition: number = 0;
  private readonly SCROLL_INCREMENT = 40; // pixels per click

  private scrollUp(): void {
    this.scrollPosition = Math.max(
      0,
      this.scrollPosition - this.SCROLL_INCREMENT
    );
    this.updateScrollPosition();
  }

  private scrollDown(): void {
    const maxScroll = this.getMaxScrollPosition();
    this.scrollPosition = Math.min(
      maxScroll,
      this.scrollPosition + this.SCROLL_INCREMENT
    );
    this.updateScrollPosition();
  }

  private updateScrollPosition(): void {
    const scrollContainer = this.buildersListContainer.querySelector(
      ".builders-list-scroll"
    );
    if (scrollContainer) {
      scrollContainer.scrollTop = this.scrollPosition;
    }
    this.updateScrollArrows();
  }

  private updateScrollArrows(): void {
    const upArrow =
      this.buildersListContainer.querySelector(".scroll-arrow-up");
    const downArrow =
      this.buildersListContainer.querySelector(".scroll-arrow-down");

    if (upArrow) {
      upArrow.classList.toggle("disabled", this.scrollPosition === 0);
    }

    if (downArrow) {
      const maxScroll = this.getMaxScrollPosition();
      downArrow.classList.toggle("disabled", this.scrollPosition >= maxScroll);
    }
  }

  private getMaxScrollPosition(): number {
    const scrollContainer = this.buildersListContainer.querySelector(
      ".builders-list-scroll"
    );
    if (!scrollContainer) return 0;
    return scrollContainer.scrollHeight - scrollContainer.clientHeight;
  }
}
```

**Recommendation**: Start with Approach 1 (native scrolling). Only implement Approach 2 if there are specific issues with mouse wheel events being captured by Three.js.

## Future Enhancements

1. **Search/Filter**: Add search box to filter builders by name
2. **Sorting Options**: Allow sorting by name, score, or recent activity
3. **Builder Profiles**: Show additional info on hover (score, blocks placed, etc.)
4. **Animations**: Add smooth animations for builder list changes
5. **Keyboard Navigation**: Support arrow keys for navigation
6. **Accessibility**: Add ARIA labels and screen reader support
