type RegistryEntry<P> = {
  player: P;
  refCount: number;
  releaseTimer: unknown | null;
  lastUsed: number;
};

type VideoPlayerRegistryOptions<P> = {
  createPlayer: (key: string) => P;
  releasePlayer: (player: P) => void;
  maxLivePlayers?: number;
  scheduleTick?: (fn: () => void) => unknown;
  cancelTick?: (handle: unknown) => void;
};

// iOS allows only ~16 simultaneous AVPlayers before new ones silently fail to
// decode (permanent black tiles). Stay well under that ceiling so a fast-scroll
// burst — where many cells acquire players before the off-screen ones finish
// their deferred release — can't push the live count over the hardware limit.
const DEFAULT_MAX_LIVE_PLAYERS = 8;

export class VideoPlayerRegistry<P> {
  private entries = new Map<string, RegistryEntry<P>>();
  private clock = 0;

  private readonly createPlayer: (key: string) => P;
  private readonly releasePlayer: (player: P) => void;
  private readonly maxLivePlayers: number;
  private readonly scheduleTick: (fn: () => void) => unknown;
  private readonly cancelTick: (handle: unknown) => void;

  constructor(options: VideoPlayerRegistryOptions<P>) {
    this.createPlayer = options.createPlayer;
    this.releasePlayer = options.releasePlayer;
    this.maxLivePlayers = options.maxLivePlayers ?? DEFAULT_MAX_LIVE_PLAYERS;
    this.scheduleTick = options.scheduleTick ?? ((fn) => setTimeout(fn, 0));
    this.cancelTick =
      options.cancelTick ??
      ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  acquire(key: string): P {
    const existing = this.entries.get(key);
    if (existing) {
      if (existing.releaseTimer !== null) {
        this.cancelTick(existing.releaseTimer);
        existing.releaseTimer = null;
      }
      existing.refCount += 1;
      existing.lastUsed = this.clock++;
      return existing.player;
    }
    this.evictIfOverCap();
    const player = this.createPlayer(key);
    this.entries.set(key, {
      player,
      refCount: 1,
      releaseTimer: null,
      lastUsed: this.clock++,
    });
    return player;
  }

  release(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.refCount = Math.max(0, entry.refCount - 1);
    if (entry.refCount > 0) return;
    if (entry.releaseTimer !== null) return; // already scheduled
    entry.releaseTimer = this.scheduleTick(() => {
      const current = this.entries.get(key);
      if (!current || current !== entry) return;
      current.releaseTimer = null;
      if (current.refCount > 0) return; // re-acquired before the tick
      this.releasePlayer(current.player);
      this.entries.delete(key);
    });
  }

  peek(key: string): P | null {
    return this.entries.get(key)?.player ?? null;
  }

  liveCount(): number {
    return this.entries.size;
  }

  private evictIfOverCap(): void {
    // A new player is about to be created, so reclaim until there is room for it
    // (size strictly below the cap). One eviction per acquire isn't enough under
    // fast scroll: deferred releases let several idle players linger in `entries`
    // at once, and if we only freed one the live AVPlayer count would creep past
    // the cap — and past the iOS hardware ceiling — until videos go black for good.
    // We can only reap idle entries (refCount 0). Off-screen cells that scrolled
    // away are idle here even when their release timer hasn't fired yet, so this
    // eagerly reaps the least-recently-used among them.
    while (this.entries.size >= this.maxLivePlayers) {
      let lruKey: string | null = null;
      let lruUsed = Infinity;
      for (const [key, entry] of this.entries) {
        if (entry.refCount === 0 && entry.lastUsed < lruUsed) {
          lruUsed = entry.lastUsed;
          lruKey = key;
        }
      }
      // Nothing idle left to reclaim — every remaining player is on-screen.
      if (lruKey === null) return;
      const victim = this.entries.get(lruKey)!;
      if (victim.releaseTimer !== null) {
        this.cancelTick(victim.releaseTimer);
      }
      this.releasePlayer(victim.player);
      this.entries.delete(lruKey);
    }
  }
}
