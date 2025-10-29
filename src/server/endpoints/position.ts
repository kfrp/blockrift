/**
 * Position update endpoint handler
 * Handles player position and rotation updates
 */

import type {
  Position,
  Rotation,
  ConnectedClient,
  PositionUpdateResponse,
} from "../types";

/**
 * Handle position update endpoint
 * @param username Player username
 * @param position Player position
 * @param rotation Player rotation
 * @param connectedClients Map of connected clients
 * @returns PositionUpdateResponse object
 */
export async function handlePositionUpdate(
  username: string,
  position: Position,
  rotation: Rotation,
  connectedClients: Map<string, ConnectedClient>
): Promise<PositionUpdateResponse> {
  // Find the client by username
  const client = connectedClients.get(username);

  if (!client) {
    throw new Error("Client not found");
  }

  // Update client position, rotation, and timestamp
  client.position = position;
  client.rotation = rotation;
  client.lastPositionUpdate = Date.now();

  return { ok: true };
}
