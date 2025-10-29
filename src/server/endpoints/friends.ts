/**
 * Friends endpoint handlers
 * Handles friend add/remove operations with global friendship hash updates and broadcasting
 */

import type {
  AddFriendResponse,
  RemoveFriendResponse,
  ConnectedClient,
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
 * @param friendUsername - Username of the friend being added
 * @param connectedClients - Map of currently connected clients (for efficient broadcast)
 * @returns Response with updated friends list
 */
export async function handleAddFriend(
  username: string,
  friendUsername: string,
  connectedClients?: Map<string, ConnectedClient>
): Promise<AddFriendResponse> {
  // Validate: can't add self
  if (username === friendUsername) {
    return {
      ok: false,
      message: "Cannot add yourself as friend",
    };
  }

  try {
    // Add friend using global hash updates
    await addGlobalFriend(username, friendUsername);

    // Broadcast friendship update to friend's active levels
    await broadcastFriendshipUpdate(
      friendUsername,
      "added",
      username,
      connectedClients
    );

    // Get updated friends list from global hash
    const friends = await getPlayerFriends(username);

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
 * @param friendUsername - Username of the friend being removed
 * @param connectedClients - Map of currently connected clients (for efficient broadcast)
 * @returns Response with updated friends list
 */
export async function handleRemoveFriend(
  username: string,
  friendUsername: string,
  connectedClients?: Map<string, ConnectedClient>
): Promise<RemoveFriendResponse> {
  try {
    // Remove friend using global hash updates
    await removeGlobalFriend(username, friendUsername);

    // Broadcast friendship update to friend's active levels
    await broadcastFriendshipUpdate(
      friendUsername,
      "removed",
      username,
      connectedClients
    );

    // Get updated friends list from global hash
    const friends = await getPlayerFriends(username);

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
