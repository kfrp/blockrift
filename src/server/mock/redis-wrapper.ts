/**
 * Redis Wrapper
 * Wraps node-redis client methods to match Devvit's RedisClient behavior
 */

import type { RedisClientType as NodeRedisClient } from "redis";

/**
 * Wrapper that makes node-redis behave like Devvit's RedisClient
 */
export function wrapNodeRedis(client: NodeRedisClient) {
  // Store original methods
  const originalHSet = client.hSet.bind(client);
  const originalZAdd = client.zAdd.bind(client);
  const originalZIncrBy = client.zIncrBy.bind(client);
  const originalHDel = client.hDel.bind(client);

  // Override hSet to handle Devvit's object format
  (client as any).hSet = async (key: string, data: Record<string, string>) => {
    return await originalHSet(key, data);
  };

  // Override zAdd to convert Devvit format to node-redis format
  (client as any).zAdd = async (
    key: string,
    ...members: Array<{ member: string; score: number }>
  ) => {
    const nodeRedisMembers = members.map((m) => ({
      score: m.score,
      value: m.member,
    }));
    return await originalZAdd(key, nodeRedisMembers);
  };

  // Override zIncrBy to swap parameter order (Devvit: key, member, increment vs node-redis: key, increment, member)
  (client as any).zIncrBy = async (
    key: string,
    member: string,
    increment: number
  ) => {
    return await originalZIncrBy(key, increment, member);
  };

  // Override hDel to accept array (node-redis already supports this)
  (client as any).hDel = async (key: string, fields: string[]) => {
    return await originalHDel(key, fields);
  };

  return client;
}
