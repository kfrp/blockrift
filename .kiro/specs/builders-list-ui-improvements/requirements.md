# Requirements Document

## Introduction

This feature enhances the builders list UI to improve usability and visual clarity. The improvements include removing the redundant player score display, repositioning the builders list to the top-left corner, implementing a collapsible dropdown interface to save screen space, adding scrollability for long lists, and highlighting builder names when their blocks are highlighted in the game world.

## Glossary

- **Builders List**: A UI component that displays usernames of players who have placed blocks in the current region, along with their block counts
- **Player Score Display**: A separate UI element showing the current player's own score
- **Builder Highlight**: A visual effect that highlights all blocks placed by a specific builder when their name is clicked
- **Dropdown State**: The expanded or collapsed state of the builders list
- **Builder Count**: The total number of builders currently displayed in the list
- **Scrollable Container**: A UI container that allows vertical scrolling when content exceeds available space

## Requirements

### Requirement 1

**User Story:** As a player, I want the builders list to not show my own score separately, so that my username is visible and the UI is less cluttered

#### Acceptance Criteria

1. WHEN the game UI initializes, THE Builders List SHALL NOT display a separate player score element
2. THE Builders List SHALL display the current player's username in the builders list alongside other builders
3. THE Builders List SHALL NOT display individual block counts for each builder
4. THE Game Client SHALL NOT subscribe to score broadcast channels
5. THE Game Server SHALL NOT broadcast score updates via WebSocket channels
6. THE Game Server SHALL continue to track and persist player scores in the database for future use

### Requirement 2

**User Story:** As a player, I want the builders list positioned at the top-left corner, so that it doesn't interfere with other right-side UI elements

#### Acceptance Criteria

1. WHEN the game UI renders, THE Builders List SHALL be positioned at the top-left corner of the viewport
2. THE Builders List SHALL maintain a fixed position of 10 pixels from the left edge
3. THE Builders List SHALL maintain a fixed position of 10 pixels from the top edge

### Requirement 3

**User Story:** As a player, I want the builders list to be collapsible with a dropdown interface, so that I can save screen space when I don't need to see the full list

#### Acceptance Criteria

1. WHEN the builders list is collapsed, THE Builders List SHALL display only a header showing "Builders: [number]" where number is the total builder count
2. WHEN the user clicks on the collapsed header, THE Builders List SHALL expand to show the full list of builders
3. WHEN the user clicks on the expanded header, THE Builders List SHALL collapse to show only the header
4. WHEN the builders list is expanded, THE Builders List SHALL display all builder names without individual block counts
5. THE Builders List SHALL persist its expanded or collapsed state during gameplay until the user toggles it

### Requirement 4

**User Story:** As a player, I want the builders list to be scrollable, so that I can view all builders even when there are more than can fit on screen

#### Acceptance Criteria

1. WHEN the builders list content exceeds 300 pixels in height, THE Builders List SHALL display a vertical scrollbar
2. WHEN the user scrolls within the builders list, THE Builders List SHALL allow viewing of all builder entries
3. THE Builders List SHALL maintain smooth scrolling behavior with mouse wheel and touch gestures
4. WHEN the builders list is collapsed, THE Builders List SHALL NOT display any scrollbar

### Requirement 5

**User Story:** As a player, I want to see which builder's blocks are currently highlighted, so that I can easily associate highlighted blocks with the correct player

#### Acceptance Criteria

1. WHEN a builder's blocks are highlighted in the game world, THE Builders List SHALL apply a distinct visual highlight to that builder's name entry
2. WHEN no builder's blocks are highlighted, THE Builders List SHALL display all builder names without special highlighting
3. WHEN the user clicks a different builder's name, THE Builders List SHALL remove the highlight from the previous builder and apply it to the newly selected builder
4. THE Builders List SHALL use a contrasting color (such as bright green) to highlight the selected builder's name
5. THE Builders List SHALL apply a background color change to the entire builder item row when highlighted
6. WHEN the user clicks the builders list header to collapse the list, THE Builders List SHALL clear any active block highlights in the game world

### Requirement 6

**User Story:** As a player, I want the builders list to have a compact size, so that it takes up minimal screen space while remaining readable

#### Acceptance Criteria

1. WHEN the builders list is collapsed, THE Builders List SHALL have a width of 180 pixels
2. WHEN the builders list is expanded, THE Builders List SHALL have a maximum width of 220 pixels
3. THE Builders List SHALL use a font size of 0.85rem for builder names to maintain readability while being compact
4. THE Builders List SHALL maintain consistent padding and spacing that balances compactness with usability

### Requirement 7

**User Story:** As a player, I want the builders list to update when I move to new regions, so that I always see builders who have placed blocks in my current area

#### Acceptance Criteria

1. WHEN the player moves to a new region and regional subscriptions are updated, THE Builders List SHALL refresh to show builders in the newly subscribed regions
2. WHEN new chunks are loaded into the state buffer, THE Builders List SHALL update to include builders from those chunks
3. THE Builders List SHALL remove builders from the display when their regions are unsubscribed due to player movement
4. THE Builders List SHALL update within 500 milliseconds of subscription changes to provide timely information

### Requirement 8

**User Story:** As a player, I want to add other builders as friends directly from the builders list, so that I can easily collaborate with them

#### Acceptance Criteria

1. WHEN the builders list displays builder names, THE Builders List SHALL show a "+" button to the left of each builder name except the current player's name
2. WHEN the user hovers over the "+" button, THE Builders List SHALL display a tooltip with the text "Add as friend"
3. WHEN the user clicks the "+" button, THE Builders List SHALL send a friend addition request to the server
4. WHEN a friend addition request is sent, THE Builders List SHALL optimistically update the button to show a checkmark icon
5. WHEN the server confirms the friend addition, THE Builders List SHALL maintain the checkmark icon
6. WHEN the server rejects the friend addition, THE Builders List SHALL revert the button to show the "+" icon

### Requirement 9

**User Story:** As a player, I want to see which builders are already my friends in the builders list, so that I know who I'm collaborating with

#### Acceptance Criteria

1. WHEN a builder in the list is already a friend, THE Builders List SHALL display a checkmark icon instead of the "+" button
2. WHEN the user hovers over the checkmark icon, THE Builders List SHALL display a tooltip with the text "Remove friend"
3. THE Builders List SHALL determine friend status using the friends list from the PlayerModeManager
4. WHEN the friends list is updated, THE Builders List SHALL refresh to show the current friend status for all builders

### Requirement 10

**User Story:** As a player, I want to remove friends directly from the builders list, so that I can manage my collaborations easily

#### Acceptance Criteria

1. WHEN the user clicks the checkmark icon for a friend, THE Builders List SHALL send a friend removal request to the server
2. WHEN a friend removal request is sent, THE Builders List SHALL optimistically update the button to show the "+" icon
3. WHEN the server confirms the friend removal, THE Builders List SHALL maintain the "+" icon
4. THE Builders List SHALL use the existing PlayerModeManager friend management methods for all friend operations
