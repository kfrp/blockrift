import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "redis";

describe("Player Persistence Functions", () => {
  let redisStore: ReturnType<typeof createClient>;

  beforeAll(async () => {
    redisStore = createClient();
    await redisStore.connect();
  });

  afterAll(async () => {
    await redisStore.quit();
  });

  it("should create and retrieve player data", async () => {
    const username = "TestPlayer";
    const level = "test-level";
    const key = `player:${username}:${level}`;

    // Initialize player data
    await redisStore.hSet(key, {
      score: "0",
      friends: JSON.stringify([]),
      friendedBy: JSON.stringify([]),
      lastActive: Date.now().toString(),
      totalUpvotesGiven: "0",
      totalUpvotesReceived: "0",
    });

    // Retrieve player data
    const data = await redisStore.hGetAll(key);
    const hashData = data as unknown as Record<string, string>;

    expect(parseInt(hashData.score, 10)).toBe(0);
    expect(JSON.parse(hashData.friends)).toEqual([]);
    expect(JSON.parse(hashData.friendedBy)).toEqual([]);

    // Cleanup
    await redisStore.del(key);
  });

  it("should track active players in a level", async () => {
    const username = "ActivePlayer";
    const level = "test-level";
    const key = `players:${level}`;

    // Add player to active set
    await redisStore.sAdd(key, username);

    // Check if player is active
    const isActive = await redisStore.sIsMember(key, username);
    expect(Boolean(isActive)).toBe(true);

    // Remove player from active set
    await redisStore.sRem(key, username);

    // Check if player is no longer active
    const isStillActive = await redisStore.sIsMember(key, username);
    expect(Boolean(isStillActive)).toBe(false);

    // Cleanup
    await redisStore.del(key);
  });

  it("should update player score atomically", async () => {
    const username = "ScorePlayer";
    const level = "test-level";
    const key = `player:${username}:${level}`;

    // Initialize player with score 0
    await redisStore.hSet(key, "score", "0");

    // Increment score
    const newScore = await redisStore.hIncrBy(key, "score", 10);
    expect(Number(newScore)).toBe(10);

    // Increment again
    const finalScore = await redisStore.hIncrBy(key, "score", 5);
    expect(Number(finalScore)).toBe(15);

    // Cleanup
    await redisStore.del(key);
  });

  it("should manage friend relationships", async () => {
    const player1 = "Player1";
    const player2 = "Player2";
    const level = "test-level";
    const key1 = `player:${player1}:${level}`;
    const key2 = `player:${player2}:${level}`;

    // Initialize both players
    await redisStore.hSet(key1, {
      friends: JSON.stringify([]),
      friendedBy: JSON.stringify([]),
    });
    await redisStore.hSet(key2, {
      friends: JSON.stringify([]),
      friendedBy: JSON.stringify([]),
    });

    // Player1 adds Player2 as friend
    const player1Friends = [player2];
    await redisStore.hSet(key1, "friends", JSON.stringify(player1Friends));

    // Player2's friendedBy should include Player1
    const player2FriendedBy = [player1];
    await redisStore.hSet(
      key2,
      "friendedBy",
      JSON.stringify(player2FriendedBy)
    );

    // Verify
    const p1Data = await redisStore.hGet(key1, "friends");
    const p2Data = await redisStore.hGet(key2, "friendedBy");

    expect(JSON.parse(p1Data?.toString() || "[]")).toEqual([player2]);
    expect(JSON.parse(p2Data?.toString() || "[]")).toEqual([player1]);

    // Cleanup
    await redisStore.del(key1);
    await redisStore.del(key2);
  });

  it("should add friend and update both player records", async () => {
    const player1 = "FriendAdder";
    const player2 = "FriendReceiver";
    const level = "test-level";
    const key1 = `player:${player1}:${level}`;
    const key2 = `player:${player2}:${level}`;

    // Initialize both players with empty friend lists
    await redisStore.hSet(key1, {
      score: "0",
      friends: JSON.stringify([]),
      friendedBy: JSON.stringify([]),
      lastActive: Date.now().toString(),
    });
    await redisStore.hSet(key2, {
      score: "0",
      friends: JSON.stringify([]),
      friendedBy: JSON.stringify([]),
      lastActive: Date.now().toString(),
    });

    // Simulate adding friend (what the endpoint does)
    // Player1 adds Player2 as friend
    const p1FriendsData = await redisStore.hGet(key1, "friends");
    const p1Friends: string[] = p1FriendsData
      ? JSON.parse(p1FriendsData.toString())
      : [];
    p1Friends.push(player2);
    await redisStore.hSet(key1, "friends", JSON.stringify(p1Friends));

    // Player2's friendedBy list should include Player1
    const p2FriendedByData = await redisStore.hGet(key2, "friendedBy");
    const p2FriendedBy: string[] = p2FriendedByData
      ? JSON.parse(p2FriendedByData.toString())
      : [];
    p2FriendedBy.push(player1);
    await redisStore.hSet(key2, "friendedBy", JSON.stringify(p2FriendedBy));

    // Verify both records updated
    const p1Data = await redisStore.hGet(key1, "friends");
    const p2Data = await redisStore.hGet(key2, "friendedBy");

    expect(JSON.parse(p1Data?.toString() || "[]")).toContain(player2);
    expect(JSON.parse(p2Data?.toString() || "[]")).toContain(player1);

    // Cleanup
    await redisStore.del(key1);
    await redisStore.del(key2);
  });

  it("should remove friend and update both player records", async () => {
    const player1 = "FriendRemover";
    const player2 = "FriendRemoved";
    const level = "test-level";
    const key1 = `player:${player1}:${level}`;
    const key2 = `player:${player2}:${level}`;

    // Initialize both players with existing friendship
    await redisStore.hSet(key1, {
      score: "0",
      friends: JSON.stringify([player2]),
      friendedBy: JSON.stringify([]),
      lastActive: Date.now().toString(),
    });
    await redisStore.hSet(key2, {
      score: "0",
      friends: JSON.stringify([]),
      friendedBy: JSON.stringify([player1]),
      lastActive: Date.now().toString(),
    });

    // Simulate removing friend (what the endpoint does)
    // Player1 removes Player2 from friends
    const p1FriendsData = await redisStore.hGet(key1, "friends");
    const p1Friends: string[] = p1FriendsData
      ? JSON.parse(p1FriendsData.toString())
      : [];
    const updatedP1Friends = p1Friends.filter((f) => f !== player2);
    await redisStore.hSet(key1, "friends", JSON.stringify(updatedP1Friends));

    // Player2's friendedBy list should no longer include Player1
    const p2FriendedByData = await redisStore.hGet(key2, "friendedBy");
    const p2FriendedBy: string[] = p2FriendedByData
      ? JSON.parse(p2FriendedByData.toString())
      : [];
    const updatedP2FriendedBy = p2FriendedBy.filter((f) => f !== player1);
    await redisStore.hSet(
      key2,
      "friendedBy",
      JSON.stringify(updatedP2FriendedBy)
    );

    // Verify both records updated
    const p1Data = await redisStore.hGet(key1, "friends");
    const p2Data = await redisStore.hGet(key2, "friendedBy");

    expect(JSON.parse(p1Data?.toString() || "[]")).not.toContain(player2);
    expect(JSON.parse(p2Data?.toString() || "[]")).not.toContain(player1);

    // Cleanup
    await redisStore.del(key1);
    await redisStore.del(key2);
  });

  it("should handle adding multiple friends", async () => {
    const player = "MultiPlayer";
    const friend1 = "Friend1";
    const friend2 = "Friend2";
    const friend3 = "Friend3";
    const level = "test-level";
    const playerKey = `player:${player}:${level}`;

    // Initialize player
    await redisStore.hSet(playerKey, {
      friends: JSON.stringify([]),
      friendedBy: JSON.stringify([]),
    });

    // Add multiple friends
    const friends = [friend1, friend2, friend3];
    await redisStore.hSet(playerKey, "friends", JSON.stringify(friends));

    // Verify
    const friendsData = await redisStore.hGet(playerKey, "friends");
    const retrievedFriends = JSON.parse(friendsData?.toString() || "[]");

    expect(retrievedFriends).toHaveLength(3);
    expect(retrievedFriends).toContain(friend1);
    expect(retrievedFriends).toContain(friend2);
    expect(retrievedFriends).toContain(friend3);

    // Cleanup
    await redisStore.del(playerKey);
  });

  it("should prevent duplicate friends", async () => {
    const player = "DupePlayer";
    const friend = "DupeFriend";
    const level = "test-level";
    const playerKey = `player:${player}:${level}`;

    // Initialize player
    await redisStore.hSet(playerKey, {
      friends: JSON.stringify([]),
    });

    // Add friend first time
    let friendsData = await redisStore.hGet(playerKey, "friends");
    let friends: string[] = friendsData
      ? JSON.parse(friendsData.toString())
      : [];

    if (!friends.includes(friend)) {
      friends.push(friend);
      await redisStore.hSet(playerKey, "friends", JSON.stringify(friends));
    }

    // Try to add same friend again
    friendsData = await redisStore.hGet(playerKey, "friends");
    friends = friendsData ? JSON.parse(friendsData.toString()) : [];

    if (!friends.includes(friend)) {
      friends.push(friend);
      await redisStore.hSet(playerKey, "friends", JSON.stringify(friends));
    }

    // Verify only one instance
    friendsData = await redisStore.hGet(playerKey, "friends");
    const finalFriends = JSON.parse(friendsData?.toString() || "[]");

    expect(finalFriends).toHaveLength(1);
    expect(finalFriends[0]).toBe(friend);

    // Cleanup
    await redisStore.del(playerKey);
  });

  it("should increment builder score and update sorted set", async () => {
    const builder = "BuilderPlayer";
    const level = "test-level";
    const builderKey = `player:${builder}:${level}`;
    const scoresKey = `scores:${level}`;

    // Initialize builder with score 0
    await redisStore.hSet(builderKey, {
      score: "0",
      totalUpvotesReceived: "0",
    });
    await redisStore.zAdd(scoresKey, { score: 0, value: builder });

    // Simulate upvote - increment score
    const newScore = await redisStore.hIncrBy(builderKey, "score", 1);
    await redisStore.zIncrBy(scoresKey, 1, builder);
    await redisStore.hIncrBy(builderKey, "totalUpvotesReceived", 1);

    // Verify score incremented
    expect(Number(newScore)).toBe(1);

    // Verify sorted set updated
    const scoreInSet = await redisStore.zScore(scoresKey, builder);
    expect(Number(scoreInSet)).toBe(1);

    // Verify totalUpvotesReceived incremented
    const upvotesData = await redisStore.hGet(
      builderKey,
      "totalUpvotesReceived"
    );
    expect(parseInt(upvotesData?.toString() || "0", 10)).toBe(1);

    // Cleanup
    await redisStore.del(builderKey);
    await redisStore.del(scoresKey);
  });

  it("should track upvotes given and received", async () => {
    const upvoter = "UpvoterPlayer";
    const builder = "BuilderPlayer";
    const level = "test-level";
    const upvoterKey = `player:${upvoter}:${level}`;
    const builderKey = `player:${builder}:${level}`;

    // Initialize both players
    await redisStore.hSet(upvoterKey, {
      score: "0",
      totalUpvotesGiven: "0",
      totalUpvotesReceived: "0",
    });
    await redisStore.hSet(builderKey, {
      score: "0",
      totalUpvotesGiven: "0",
      totalUpvotesReceived: "0",
    });

    // Simulate upvote
    await redisStore.hIncrBy(builderKey, "score", 1);
    await redisStore.hIncrBy(builderKey, "totalUpvotesReceived", 1);
    await redisStore.hIncrBy(upvoterKey, "totalUpvotesGiven", 1);

    // Verify upvoter's totalUpvotesGiven incremented
    const upvoterData = await redisStore.hGet(upvoterKey, "totalUpvotesGiven");
    expect(parseInt(upvoterData?.toString() || "0", 10)).toBe(1);

    // Verify builder's totalUpvotesReceived incremented
    const builderData = await redisStore.hGet(
      builderKey,
      "totalUpvotesReceived"
    );
    expect(parseInt(builderData?.toString() || "0", 10)).toBe(1);

    // Verify builder's score incremented
    const scoreData = await redisStore.hGet(builderKey, "score");
    expect(parseInt(scoreData?.toString() || "0", 10)).toBe(1);

    // Cleanup
    await redisStore.del(upvoterKey);
    await redisStore.del(builderKey);
  });

  it("should handle multiple upvotes correctly", async () => {
    const builder = "PopularBuilder";
    const level = "test-level";
    const builderKey = `player:${builder}:${level}`;
    const scoresKey = `scores:${level}`;

    // Initialize builder
    await redisStore.hSet(builderKey, {
      score: "0",
      totalUpvotesReceived: "0",
    });
    await redisStore.zAdd(scoresKey, { score: 0, value: builder });

    // Simulate 5 upvotes
    for (let i = 0; i < 5; i++) {
      await redisStore.hIncrBy(builderKey, "score", 1);
      await redisStore.zIncrBy(scoresKey, 1, builder);
      await redisStore.hIncrBy(builderKey, "totalUpvotesReceived", 1);
    }

    // Verify final score
    const scoreData = await redisStore.hGet(builderKey, "score");
    expect(parseInt(scoreData?.toString() || "0", 10)).toBe(5);

    // Verify sorted set
    const scoreInSet = await redisStore.zScore(scoresKey, builder);
    expect(Number(scoreInSet)).toBe(5);

    // Verify total upvotes received
    const upvotesData = await redisStore.hGet(
      builderKey,
      "totalUpvotesReceived"
    );
    expect(parseInt(upvotesData?.toString() || "0", 10)).toBe(5);

    // Cleanup
    await redisStore.del(builderKey);
    await redisStore.del(scoresKey);
  });

  it("should maintain leaderboard order in sorted set", async () => {
    const builder1 = "Builder1";
    const builder2 = "Builder2";
    const builder3 = "Builder3";
    const level = "test-level";
    const scoresKey = `scores:${level}`;

    // Initialize builders with different scores
    await redisStore.zAdd(scoresKey, [
      { score: 10, value: builder1 },
      { score: 25, value: builder2 },
      { score: 5, value: builder3 },
    ]);

    // Get top 3 builders (descending order)
    const topBuilders = await redisStore.zRangeWithScores(scoresKey, 0, 2, {
      REV: true,
    });

    // Verify order: builder2 (25), builder1 (10), builder3 (5)
    expect(topBuilders).toHaveLength(3);
    expect(topBuilders[0].value).toBe(builder2);
    expect(topBuilders[0].score).toBe(25);
    expect(topBuilders[1].value).toBe(builder1);
    expect(topBuilders[1].score).toBe(10);
    expect(topBuilders[2].value).toBe(builder3);
    expect(topBuilders[2].score).toBe(5);

    // Cleanup
    await redisStore.del(scoresKey);
  });
});
