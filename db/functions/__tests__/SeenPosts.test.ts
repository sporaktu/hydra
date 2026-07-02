import type { Post } from "../../../api/Posts";
import {
  markPostSeen,
  markPostUnseen,
  subscribeToSeenChange,
} from "../SeenPosts";

// SeenPosts imports the drizzle db (db/index.ts), which opens a real SQLite
// connection at module load. Mock it with a chainable stub so markPostSeen /
// markPostUnseen can run without a database. The subscribe/emit logic under
// test is pure; the db is only exercised because those two functions await it
// before emitting.
jest.mock("../../index", () => {
  const execute = jest.fn(() => Promise.resolve());
  const chain: Record<string, jest.Mock> = {
    insert: jest.fn(() => chain),
    values: jest.fn(() => chain),
    onConflictDoNothing: jest.fn(() => chain),
    delete: jest.fn(() => chain),
    where: jest.fn(() => chain),
    execute,
  };
  return { __esModule: true, default: chain };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const db = require("../../index").default as Record<string, jest.Mock>;

const post = (id: string) => ({ id }) as unknown as Post;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("subscribeToSeenChange / emit", () => {
  it("notifies a subscriber with true when its post is marked seen", async () => {
    const listener = jest.fn();
    subscribeToSeenChange("post-seen", listener);

    await markPostSeen(post("post-seen"));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(true);
  });

  it("notifies a subscriber with false when its post is marked unseen", async () => {
    const listener = jest.fn();
    subscribeToSeenChange("post-unseen", listener);

    await markPostUnseen(post("post-unseen"));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(false);
  });

  it("notifies only the listeners for the post that changed", async () => {
    const listenerA = jest.fn();
    const listenerB = jest.fn();
    subscribeToSeenChange("post-a", listenerA);
    subscribeToSeenChange("post-b", listenerB);

    await markPostSeen(post("post-a"));

    expect(listenerA).toHaveBeenCalledWith(true);
    expect(listenerB).not.toHaveBeenCalled();
  });

  it("notifies every listener subscribed to the same post", async () => {
    const listener1 = jest.fn();
    const listener2 = jest.fn();
    subscribeToSeenChange("post-multi", listener1);
    subscribeToSeenChange("post-multi", listener2);

    await markPostSeen(post("post-multi"));

    expect(listener1).toHaveBeenCalledWith(true);
    expect(listener2).toHaveBeenCalledWith(true);
  });

  it("stops notifying after the returned unsubscribe function is called", async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToSeenChange("post-unsub", listener);

    unsubscribe();
    await markPostSeen(post("post-unsub"));

    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps the remaining listener working when one of several unsubscribes", async () => {
    const stays = jest.fn();
    const leaves = jest.fn();
    subscribeToSeenChange("post-partial", stays);
    const unsubscribeLeaves = subscribeToSeenChange("post-partial", leaves);

    unsubscribeLeaves();
    await markPostSeen(post("post-partial"));

    expect(leaves).not.toHaveBeenCalled();
    expect(stays).toHaveBeenCalledWith(true);
  });

  it("does not crash when a post changes after its last listener unsubscribed (map entry removed)", async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToSeenChange("post-cleanup", listener);
    unsubscribe();

    // No listeners remain for this id; emit must be a no-op, not a throw.
    await expect(markPostSeen(post("post-cleanup"))).resolves.toBeUndefined();
    await expect(markPostUnseen(post("post-cleanup"))).resolves.toBeUndefined();
    expect(listener).not.toHaveBeenCalled();
  });

  it("emits nothing for a post that was never subscribed to", async () => {
    await expect(
      markPostSeen(post("never-subscribed")),
    ).resolves.toBeUndefined();
  });

  it("tolerates the same listener being unsubscribed twice", async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToSeenChange("post-double-unsub", listener);

    unsubscribe();
    expect(() => unsubscribe()).not.toThrow();

    await markPostSeen(post("post-double-unsub"));
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("db interaction and emit ordering", () => {
  it("writes to the db before emitting on markPostSeen", async () => {
    const listener = jest.fn();
    subscribeToSeenChange("post-order-seen", listener);

    let resolveWrite: () => void = () => {};
    (db.execute as jest.Mock).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        }),
    );

    const pending = markPostSeen(post("post-order-seen"));

    // The db write has not resolved yet, so the listener must not have fired.
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(listener).not.toHaveBeenCalled();

    resolveWrite();
    await pending;

    expect(listener).toHaveBeenCalledWith(true);
  });

  it("issues a delete for markPostUnseen and then emits false", async () => {
    const listener = jest.fn();
    subscribeToSeenChange("post-order-unseen", listener);

    await markPostUnseen(post("post-order-unseen"));

    expect(db.delete).toHaveBeenCalledTimes(1);
    expect(db.where).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(false);
  });
});
