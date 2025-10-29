/**
 * Upvote endpoint handler
 * Handles upvoting builders with fire-and-forget pattern
 */

import { redis } from "../globals";
import type { UpvoteResponse } from "../types";

/**
 * Handle upvote endpoint
 * Implements fire-and-forget pattern for snappy UX
 * @param username Player username who is upvoting
 * @param level Level identifier
 * @param builderUsername Username of the builder being upvoted
 * @returns UpvoteResponse object (immediate response)
 */
export async function handleUpvote(
  username: string,
  level: string,
  builderUsername: string
): Promise<UpvoteResponse> {
  // Return immediate success response (fire-and-forget pattern)
  const response: UpvoteResponse = {
    ok: true,
    message: "Upvote processing",
  };

  // Asynchronously process upvote (don't await)
  processUpvote(username, level, builderUsername).catch((error) => {
    console.error("Failed to process upvote:", error);
    // In production, this would be sent to error tracking service
  });

  return response;
}

/**
 * Process upvote asynchronously
 * Increments builder's score and updates leaderboard
 * @param username Player username who is upvoting
 * @param level Level identifier
 * @param builderUsername Username of the builder being upvoted
 */
async function processUpvote(
  username: string,
  level: string,
  builderUsername: string
): Promise<void> {
  // Validate: can't upvote self
  if (username === builderUsername) {
    throw new Error("Cannot upvote yourself");
  }

  // Validate: builder must exist
  const builderKey = `player:${builderUsername}:${level}`;
  const builderExists = await redis.exists(builderKey);

  if (!builderExists) {
    throw new Error("Builder not found");
  }

  // Atomic increment builder's score in Redis hash
  const newScore = await redis.hIncrBy(builderKey, "score", 1);

  // Update leaderboard sorted set
  await redis.zIncrBy(`scores:${level}`, 1, builderUsername);

  // Increment totalUpvotesReceived counter for builder
  await redis.hIncrBy(builderKey, "totalUpvotesReceived", 1);

  // Increment totalUpvotesGiven counter for upvoter
  const upvoterKey = `player:${username}:${level}`;
  await redis.hIncrBy(upvoterKey, "totalUpvotesGiven", 1);

  console.log(
    `${builderUsername} upvoted by ${username}, new score: ${newScore}`
  );
}
