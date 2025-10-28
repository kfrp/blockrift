# Requirements Document

## Introduction

This document specifies the requirements for a regional chat system in the voxel game. The system enables players to communicate with other players in their current region through text messages. Messages are displayed temporarily in the game UI and are scoped to the regional channel system already implemented for multiplayer synchronization.

## Glossary

- **Chat System**: The text-based communication feature that allows players to send and receive messages
- **Chat Input**: The text input field that appears when a player activates chat mode
- **Chat Display**: The message list shown in the bottom-left corner of the screen
- **Regional Channel**: The existing multiplayer channel system that groups players by geographic region (format: `region:{level}:{regionX}:{regionZ}`)
- **Chat Message**: A text communication containing the sender's username and message content
- **Message Lifetime**: The duration (60 seconds) that a message remains visible in the Chat Display
- **Message Queue**: The ordered list of up to 10 messages displayed to the player

## Requirements

### Requirement 1

**User Story:** As a player, I want to press the 'C' key to open a chat input, so that I can type and send messages to other players in my region

#### Acceptance Criteria

1. WHEN the player is in Player Mode and presses the 'C' key, THE Chat System SHALL display the Chat Input in the center of the screen
2. WHEN the player is in Viewer Mode and presses the 'C' key, THE Chat System SHALL NOT display the Chat Input
3. WHILE the Chat Input is visible, THE Chat System SHALL capture all keyboard input for the message text
4. WHILE the Chat Input is visible, THE Chat System SHALL prevent game controls from responding to keyboard input
5. WHEN the player presses the Enter key, THE Chat System SHALL send the message to the Regional Channel and close the Chat Input
6. WHEN the player presses the Escape key, THE Chat System SHALL close the Chat Input without sending a message

### Requirement 2

**User Story:** As a player, I want to see chat messages from other players in my region displayed in the bottom-left corner, so that I can read communications without blocking my view of the game

#### Acceptance Criteria

1. WHEN the player is in Player Mode, THE Chat Display SHALL be positioned in the bottom-left corner of the screen
2. WHEN the player is in Viewer Mode, THE Chat Display SHALL NOT be rendered or visible
3. THE Chat Display SHALL render messages with small font size to minimize screen obstruction
4. THE Chat Display SHALL wrap message text within a controlled maximum width of 300 pixels
5. WHEN a new Chat Message arrives, THE Chat System SHALL add it to the bottom of the Message Queue
6. WHEN a new Chat Message is added, THE Chat System SHALL push older messages upward in the display

### Requirement 3

**User Story:** As a player, I want chat messages to automatically disappear after one minute, so that old messages don't clutter my screen

#### Acceptance Criteria

1. WHEN a Chat Message is displayed, THE Chat System SHALL record the current timestamp
2. WHILE a Chat Message is visible, THE Chat System SHALL monitor elapsed time since the message was displayed
3. WHEN 60 seconds have elapsed since a Chat Message was displayed, THE Chat System SHALL remove the message from the Chat Display
4. THE Chat System SHALL remove expired messages without affecting the visibility of newer messages

### Requirement 4

**User Story:** As a player, I want the chat to show a maximum of 10 messages at once, so that the display remains manageable and doesn't overwhelm the screen

#### Acceptance Criteria

1. THE Chat System SHALL maintain a Message Queue with a maximum capacity of 10 messages
2. WHEN the Message Queue contains 10 messages and a new message arrives, THE Chat System SHALL remove the oldest message from the queue
3. THE Chat System SHALL display all messages currently in the Message Queue in chronological order

### Requirement 5

**User Story:** As a player, I want my chat messages to be sent only to players in my current region, so that communication is relevant to nearby players

#### Acceptance Criteria

1. WHEN the player sends a Chat Message, THE Chat System SHALL publish the message to the player's current Regional Channel
2. THE Chat System SHALL include the sender's username and message text in the published Chat Message
3. WHEN a Chat Message is received on the Regional Channel, THE Chat System SHALL display the message only if the receiving player is subscribed to that Regional Channel
4. THE Chat System SHALL use the existing Regional Channel subscription system without creating additional channels

### Requirement 6

**User Story:** As a player, I want to see who sent each chat message, so that I can identify the source of communications

#### Acceptance Criteria

1. THE Chat Display SHALL show the sender's username for each Chat Message
2. THE Chat Display SHALL format messages as "[username]: [message text]"
3. THE Chat Display SHALL distinguish the sender's username from the message text through visual formatting
