/**
 * Global variable declarations for redis and realtime interfaces
 * These are set by the server implementation (mock or Reddit) during initialization
 * and used by endpoint handlers for data access and broadcasting
 */

import { RedisClient } from "@devvit/web/server";
import type { RealtimeInterface } from "./types";

/**
 * Global redis client instance
 * Set by mock server or Reddit server during initialization
 * Used by endpoint handlers for all database operations
 */
export let redis: RedisClient;

/**
 * Global realtime interface instance
 * Set by mock server or Reddit server during initialization
 * Used by endpoint handlers for all real-time broadcasts
 */
export let realtime: RealtimeInterface;

/**
 * Set the global redis client
 * Called once during server initialization
 * @param client Redis client instance (node-redis or Devvit's redis)
 */
export function setRedis(client: RedisClient): void {
  redis = client;
}

/**
 * Set the global realtime interface
 * Called once during server initialization
 * @param rt Realtime interface (mock WebSocket or Devvit's realtime API)
 */
export function setRealtime(rt: RealtimeInterface): void {
  realtime = rt;
}
