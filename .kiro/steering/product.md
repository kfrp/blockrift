---
inclusion: always
---

# Product Overview

This is a sandbox voxel game built with Three.js and TypeScript, designed to run on Reddit's Devvit platform. The game features block placement/destruction, infinite procedurally-generated terrain, multiplayer support, and mobile-friendly controls.

## Current Development Focus

The project is actively being converted to support multiplayer using Redis pub/sub and Devvit's realtime API. A mock server implementation allows rapid local development before deploying to Reddit.

## Key Features

- Voxel-based gameplay (place/destroy blocks)
- Infinite procedurally-generated terrain with trees
- Multiplayer synchronization (in progress)
- Game save/load functionality
- Sound effects and background music
- Mobile touch controls (joystick)
- Block selection and inventory system

## Target Platform

The game will run in Reddit's Devvit webview environment. The current codebase uses mock implementations of Devvit's realtime API for local development, which will be swapped with actual Devvit imports (`@devvit/web/client` and `@devvit/web/server`) when deploying to production.
