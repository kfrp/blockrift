/**
 * Friends endpoint handlers
 * Handles friend add/remove operations with global friendship hash updates and broadcasting
 */

import type {
  AddFriendRequest,
  AddFriendResponse,
  RemoveFriendRequest,
  RemoveFriendResponse,
} from "../types";
import {
  addGlobalFriend,
  removeGlobalFriend,
  getPlayerFriends,
  broadcastFriendshipUpdate,
} from "./helpers";

/**
 * Handle add friend request
 * Updates global friendship hashes and broadcasts to friend's active levels
 *
 * @param username - Username of the player adding the friend
 * @param level - Level identifier (used for logging, friendships are global)
 * @param friendUsername - Username of the friend being added
 * @returns Response with updated friends list
 */
export async function handleAddFriend(
  username: string,
  level: string,
  friendUsername: string
): Promise<AddFriendResponse> {
  console.log(`${username} attempting to add friend ${friendUsername}`);

  // Validate: can't add self
  if (username === friendUsername) {
    console.log(`${username} attempted to add self as friend`);
    return {
      ok: false,
      message: "Cannot add yourself as friend",
    };
  }

  try {
    // Add friend using global hash updates
    await addGlobalFriend(username, friendUsername);

    // Broadcast friendship update to friend's active levels
    await broadcastFriendshipUpdate(friendUsername, "added", username);

    // Get updated friends list from global hash
    const friends = await getPlayerFriends(username);

    console.log(`${username} successfully added ${friendUsername} as friend`);

    return {
      ok: true,
      friends,
      message: `Added ${friendUsername} as friend`,
    };
  } catch (error) {
    console.error("Failed to add friend:", error);
    return {
      ok: false,
      message: "Failed to add friend",
    };
  }
}

/**
 * Handle remove friend request
 * Updates global friendship hashes and broadcasts to friend's active levels
 *
 * @param username - Username of the player removing the friend
 * @param level - Level identifier (used for logging, friendships are global)
 * @param friendUsername - Username of the friend being removed
 * @returns Response with updated friends list
 */
export async function handleRemoveFriend(
  username: string,
  level: string,
  friendUsername: string
): Promise<RemoveFriendResponse> {
  console.log(`${username} attempting to remove friend ${friendUsername}`);

  try {
    // Remove friend using global hash updates
    await removeGlobalFriend(username, friendUsername);

    // Broadcast friendship update to friend's active levels
    await broadcastFriendshipUpdate(friendUsername, "removed", username);

    // Get updated friends list from global hash
    const friends = await getPlayerFriends(username);

    console.log(
      `${username} successfully removed ${friendUsername} from friends`
    );

    return {
      ok: true,
      friends,
      message: `Removed ${friendUsername} from friends`,
    };
  } catch (error) {
    console.error("Failed to remove friend:", error);
    return {
      ok: false,
      message: "Failed to remove friend",
    };
  }
}
