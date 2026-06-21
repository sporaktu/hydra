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
