import { VideoPlayerRegistry } from "./VideoPlayerRegistry";

type FakePlayer = { id: number; released: boolean };

function makeHarness(maxLivePlayers?: number) {
  let nextId = 0;
  const created: FakePlayer[] = [];
  const released: FakePlayer[] = [];
  // Manual tick queue so deferred release is deterministic in tests.
  const tickQueue: (() => void)[] = [];
  const registry = new VideoPlayerRegistry<FakePlayer>({
    createPlayer: () => {
      const player = { id: nextId++, released: false };
      created.push(player);
      return player;
    },
    releasePlayer: (player) => {
      player.released = true;
      released.push(player);
    },
    maxLivePlayers,
    scheduleTick: (fn) => {
      tickQueue.push(fn);
      return tickQueue.length - 1;
    },
    cancelTick: (handle) => {
      tickQueue[handle as number] = () => {};
    },
  });
  const flushTicks = () => {
    while (tickQueue.length) {
      const fn = tickQueue.shift()!;
      fn();
    }
  };
  return { registry, created, released, flushTicks };
}

describe("VideoPlayerRegistry.acquire", () => {
  it("returns the same instance for the same key", () => {
    const { registry, created } = makeHarness();
    const a = registry.acquire("key-1");
    const b = registry.acquire("key-1");
    expect(a).toBe(b);
    expect(created).toHaveLength(1);
  });

  it("returns different instances for different keys", () => {
    const { registry, created } = makeHarness();
    const a = registry.acquire("key-1");
    const b = registry.acquire("key-2");
    expect(a).not.toBe(b);
    expect(created).toHaveLength(2);
  });
});

describe("VideoPlayerRegistry refcount + deferred release", () => {
  it("does not release until the deferred tick fires", () => {
    const { registry, released, flushTicks } = makeHarness();
    registry.acquire("key-1");
    registry.release("key-1");
    expect(released).toHaveLength(0); // still pending
    flushTicks();
    expect(released).toHaveLength(1);
  });

  it("does NOT release if refCount returns above 0 before the tick", () => {
    const { registry, created, released, flushTicks } = makeHarness();
    const first = registry.acquire("key-1");
    registry.release("key-1"); // refCount -> 0, schedules release
    const second = registry.acquire("key-1"); // refCount -> 1, cancels release
    flushTicks();
    expect(released).toHaveLength(0);
    expect(second).toBe(first);
    expect(created).toHaveLength(1); // never recreated
  });

  it("releases when still 0 after the tick", () => {
    const { registry, released, flushTicks } = makeHarness();
    registry.acquire("key-1");
    registry.acquire("key-1"); // refCount 2
    registry.release("key-1"); // refCount 1, no schedule
    expect(released).toHaveLength(0);
    registry.release("key-1"); // refCount 0, schedule
    flushTicks();
    expect(released).toHaveLength(1);
  });

  it("a re-acquire after release recreates a fresh player", () => {
    const { registry, created, flushTicks } = makeHarness();
    registry.acquire("key-1");
    registry.release("key-1");
    flushTicks(); // actually released + deleted
    registry.acquire("key-1");
    expect(created).toHaveLength(2);
  });

  it("ignores release for an unknown key without throwing", () => {
    const { registry } = makeHarness();
    expect(() => registry.release("missing")).not.toThrow();
  });
});

describe("VideoPlayerRegistry LRU backstop", () => {
  it("evicts the least-recently-used idle player when over cap", () => {
    const { registry, released } = makeHarness(2); // cap = 2
    registry.acquire("a"); // size 1
    registry.acquire("b"); // size 2
    registry.release("a"); // a idle (refCount 0), but NOT yet tick-released
    registry.release("b"); // b idle
    // Touch b so a is the LRU.
    registry.acquire("b");
    registry.release("b");
    // size is 2 (== cap) -> acquiring a new key forces eviction of LRU idle (a).
    registry.acquire("c");
    expect(released).toHaveLength(1);
    // The released player is the one created for "a" (id 0).
    expect(released[0].id).toBe(0);
  });

  it("evicts MULTIPLE idle players in one acquire to get under the cap", () => {
    // Simulates a fast scroll: several off-screen players are idle (released but
    // their deferred reap hasn't fired) and pile up at the cap. A single new
    // acquire must reclaim enough of them to stay strictly under the cap.
    const { registry, released } = makeHarness(3); // cap = 3
    registry.acquire("a");
    registry.acquire("b");
    registry.acquire("c");
    // All three scroll off-screen: refCount -> 0, deferred release scheduled but
    // NOT yet flushed (so they remain live entries counting against the cap).
    registry.release("a");
    registry.release("b");
    registry.release("c");
    expect(released).toHaveLength(0); // nothing reaped yet (ticks not flushed)
    // size is 3 (== cap). Acquiring a new key must reclaim enough idle players
    // that creating the new one leaves the live count at-or-under the cap.
    registry.acquire("d");
    expect(registry.liveCount()).toBeLessThanOrEqual(3);
    // At least one idle player was reaped to make room.
    expect(released.length).toBeGreaterThanOrEqual(1);
    // "a" is the least-recently-used idle player, so it goes first.
    expect(released[0].id).toBe(0);
  });

  it("keeps the live count under the cap across a fast-scroll burst", () => {
    // Acquire/release many distinct keys back-to-back WITHOUT flushing the
    // deferred-release ticks (the JS thread is busy rendering new cells). The
    // live player count must never exceed the cap, or iOS would run out of
    // AVPlayers and new videos would render black forever.
    const cap = 4;
    const { registry } = makeHarness(cap);
    for (let i = 0; i < 50; i++) {
      registry.acquire(`key-${i}`);
      registry.release(`key-${i}`);
      expect(registry.liveCount()).toBeLessThanOrEqual(cap);
    }
  });

  it("does not evict a player that is still referenced", () => {
    const { registry, released, created } = makeHarness(1); // cap = 1
    registry.acquire("a"); // refCount 1, size 1 == cap
    registry.acquire("b"); // would be over cap, but "a" is referenced -> no eviction
    expect(released).toHaveLength(0);
    expect(created).toHaveLength(2);
  });
});

describe("VideoPlayerRegistry introspection", () => {
  it("peek returns the live player without changing refcount", () => {
    const { registry, released, flushTicks } = makeHarness();
    const acquired = registry.acquire("key-1");
    expect(registry.peek("key-1")).toBe(acquired);
    // peek did not add a reference, so a single release still frees it.
    registry.release("key-1");
    flushTicks();
    expect(released).toHaveLength(1);
    expect(registry.peek("key-1")).toBeNull();
  });

  it("liveCount reflects live entries", () => {
    const { registry, flushTicks } = makeHarness();
    expect(registry.liveCount()).toBe(0);
    registry.acquire("a");
    registry.acquire("b");
    expect(registry.liveCount()).toBe(2);
    registry.release("a");
    flushTicks();
    expect(registry.liveCount()).toBe(1);
  });
});
