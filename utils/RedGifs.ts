import KeyStore from "./KeyStore";
import safeFetch from "./safeFetch";

type RedGifUrls = {
  sd: string;
  hd?: string;
  poster?: string;
  thumbnail?: string;
  vthumbnail?: string;
  silent?: string;
  html: string;
  file_url?: string;
  embed_url?: string;
};

type RedGifGif = {
  id: string;
  createDate?: number;
  hasAudio: boolean;
  width: number;
  height: number;
  likes: number;
  tags: string[];
  verified: boolean;
  views?: number;
  duration: number;
  published: boolean;
  urls: RedGifUrls;
  userName: string;
  type: number;
  avgColor: string;
  canBoost?: boolean;
  contentType?: string;
  cta?: string | null;
  description?: string | null;
  folders?: unknown | null;
  gallery?: string | null;
  hideHome?: boolean;
  hideTrending?: boolean;
  hls?: boolean;
  niches?: string[];
  sexuality?: string[];
  promoted?: unknown | null;
};

type RedGifUser = {
  creationtime?: number;
  description?: string | null;
  followers: number;
  following: number;
  gifs: number;
  name?: string | null;
  profileImageUrl?: string | null;
  profileUrl?: string | null;
  publishedCollections?: number;
  publishedGifs: number;
  status?: string;
  subscription: number;
  url: string;
  username: string;
  verified: boolean;
  views: number;
  poster?: string;
  preview?: string;
  thumbnail?: string;
  premium?: {
    subscription_outbound_link: string | null;
  };
  studio?: boolean;
  socialUrl1?: string | null;
  socialUrl2?: string | null;
  socialUrl3?: string | null;
  socialUrl4?: string | null;
  socialUrl5?: string | null;
  socialUrl6?: string | null;
  socialUrl7?: string | null;
  socialUrl8?: string | null;
  socialUrl9?: string | null;
  socialUrl10?: string | null;
  socialUrl11?: string | null;
  socialUrl12?: string | null;
  socialUrl13?: string | null;
  socialUrl14?: string | null;
  socialUrl15?: string | null;
  socialUrl16?: string | null;
  socialUrl17?: string | null;
  socialUrl18?: string | null;
};

type RedGifNiche = {
  id: string;
  name: string;
  description?: string | null;
  cover?: string;
  thumbnail?: string;
  gifs: number;
  subscribers: number;
  owner?: string;
  rules?: string;
};

type RedGifResponse = {
  gif: RedGifGif;
  user?: RedGifUser;
  niches?: RedGifNiche[];
};

const MAX_CONCURRENT_RESOLUTIONS = 2;

type QueuedWaiter = {
  signal?: AbortSignal;
  resolve: () => void;
  reject: (err: unknown) => void;
};

let activeResolutions = 0;
const resolutionQueue: QueuedWaiter[] = [];

// Visible-first scheduling: take the most-recently-queued waiter (LIFO). On a
// fast scroll the currently-visible post is the newest request, so it jumps
// ahead of the backlog of already-scrolled-past posts instead of starving
// behind them with only MAX_CONCURRENT_RESOLUTIONS slots. Skip any waiter whose
// caller already scrolled away (signal aborted) so it never burns a slot.
function takeNextWaiter(): QueuedWaiter | null {
  while (resolutionQueue.length > 0) {
    const waiter = resolutionQueue.pop()!;
    if (waiter.signal?.aborted) {
      waiter.reject(new RedgifsAbortError());
      continue;
    }
    return waiter;
  }
  return null;
}

function acquireSlot(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new RedgifsAbortError());
  }
  if (activeResolutions < MAX_CONCURRENT_RESOLUTIONS) {
    activeResolutions++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const waiter: QueuedWaiter = {
      signal,
      resolve: () => {
        activeResolutions++;
        resolve();
      },
      reject,
    };
    // If the caller scrolls away while queued, drop it so it never takes a slot.
    signal?.addEventListener(
      "abort",
      () => {
        const idx = resolutionQueue.indexOf(waiter);
        if (idx !== -1) {
          resolutionQueue.splice(idx, 1);
          reject(new RedgifsAbortError());
        }
      },
      { once: true },
    );
    resolutionQueue.push(waiter);
  });
}

function releaseSlot(): void {
  activeResolutions--;
  const next = takeNextWaiter();
  if (next) {
    next.resolve();
  }
}

export class RedgifsResolutionError extends Error {
  constructor(message = "Failed to resolve Redgifs media URL") {
    super(message);
    this.name = "RedgifsResolutionError";
  }
}

export class RedgifsAbortError extends Error {
  constructor(message = "Redgifs resolution aborted") {
    super(message);
    this.name = "RedgifsAbortError";
  }
}

const REDGIFS_TOKEN_STORAGE_KEY = "redgifsToken";

const NORMAL_COOLDOWN_MS = 1_000;
const RATE_LIMIT_COOLDOWN_MS = 30_000;
const MAX_BACKOFF_ATTEMPTS = 3;

let cooldownUntil = 0;

function now(): number {
  return Date.now();
}

function armCooldown(ms: number): void {
  cooldownUntil = Math.max(cooldownUntil, now() + ms);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCooldown(): Promise<void> {
  const remaining = cooldownUntil - now();
  if (remaining > 0) {
    await sleep(remaining);
  }
}

const resolvedUrlCache = new Map<string, string>();

export default class Redgifs {
  static getVideoId(url: string): string {
    return url.split(/watch\/|\?|#/)[1];
  }

  static async getMediaURL(url: string, signal?: AbortSignal): Promise<string> {
    const videoId = Redgifs.getVideoId(url);
    const cached = resolvedUrlCache.get(videoId);
    if (cached) {
      return cached;
    }
    await acquireSlot(signal);
    try {
      // Re-check cache: another queued caller for the same id may have resolved it.
      const cachedAfterWait = resolvedUrlCache.get(videoId);
      if (cachedAfterWait) {
        return cachedAfterWait;
      }
      return await Redgifs.resolveWithRetry(videoId, signal);
    } finally {
      releaseSlot();
    }
  }

  private static async resolveWithRetry(
    videoId: string,
    signal?: AbortSignal,
  ): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_BACKOFF_ATTEMPTS; attempt++) {
      // A 429 arms a 30s cooldown that pauses ALL resolutions. Don't hold our
      // slot through that wait if the caller already scrolled away — bail so a
      // currently-visible post can take the slot instead of starving behind us.
      if (signal?.aborted) throw new RedgifsAbortError();
      await waitForCooldown();
      if (signal?.aborted) throw new RedgifsAbortError();
      let token = Redgifs.getStoredToken();
      if (!token) {
        token = await Redgifs.refreshStoredToken();
      }
      try {
        const res = await safeFetch(
          `https://api.redgifs.com/v2/gifs/${videoId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "User-Agent": "Hydra",
            },
          },
        );
        if (res.status === 429) {
          armCooldown(RATE_LIMIT_COOLDOWN_MS);
          lastError = new RedgifsResolutionError("Redgifs rate limited (429)");
          continue;
        }
        if (!res.ok) {
          armCooldown(NORMAL_COOLDOWN_MS * (attempt + 1));
          lastError = new RedgifsResolutionError(
            `Redgifs responded ${res.status}`,
          );
          await Redgifs.refreshStoredToken();
          continue;
        }
        const json = (await res.json()) as RedGifResponse;
        const resolved = json.gif.urls.hd ?? json.gif.urls.sd;
        resolvedUrlCache.set(videoId, resolved);
        return resolved;
      } catch (e) {
        lastError = e;
        armCooldown(NORMAL_COOLDOWN_MS * (attempt + 1));
        await Redgifs.refreshStoredToken();
      }
    }
    throw lastError instanceof RedgifsResolutionError
      ? lastError
      : new RedgifsResolutionError(String(lastError));
  }

  static getStoredToken() {
    return KeyStore.getString(REDGIFS_TOKEN_STORAGE_KEY);
  }

  static async refreshStoredToken(): Promise<string> {
    const token = await safeFetch("https://api.redgifs.com/v2/auth/temporary", {
      headers: {
        "User-Agent": "Hydra",
      },
    })
      .then((res) => res.json())
      .then((json) => json.token);
    KeyStore.set(REDGIFS_TOKEN_STORAGE_KEY, token);
    return token;
  }

  static clearCached(videoId: string): void {
    resolvedUrlCache.delete(videoId);
  }

  /** Test-only: wipe the in-memory cache between tests. */
  static clearAllCachedForTests(): void {
    resolvedUrlCache.clear();
  }

  /** Test-only: get remaining cooldown ms. */
  static getCooldownRemainingForTests(): number {
    return Math.max(0, cooldownUntil - Date.now());
  }

  /** Test-only: reset the shared cooldown state. */
  static resetCooldownForTests(): void {
    cooldownUntil = 0;
  }
}
