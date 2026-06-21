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
