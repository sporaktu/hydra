# Lazy, in-memory-cached Redgifs resolution

Redgifs is the only media host Hydra integrates with that requires a per-video API
call to [resolve](../../CONTEXT.md) a post's watch-page URL into a playable `.mp4`.
Originally this resolution happened eagerly in `getPosts`, which formats every post
in a page with `Promise.all`. On Redgifs-heavy feeds (e.g. NSFW subreddits) that
fired a parallel burst of Redgifs API calls per page; after ~20–30 cumulative
resolutions Redgifs rate-limits by IP, and the old fallback returned the original
(unplayable) watch URL — baking a permanent "URL can't be resolved" black tile into
the post data, with no recovery.

We **resolve Redgifs lazily, at display time, not at fetch time.** `formatVideos`
emits the watch URL with a `needsResolution: true` flag; a shared hook used by both
the inline feed video and the fullscreen media viewer resolves on mount. This makes
roughly 5× fewer calls (only videos actually viewed) and spreads them over scroll
time, so the rate limit is essentially never hit.

All rate-limit handling is **centralized in `RedGifs.ts`**: a small concurrency cap,
bounded backoff with a longer shared cooldown on HTTP 429, and token refresh. The
view layer stays ignorant of Redgifs internals.

Resolved URLs are cached in an **in-memory map only — deliberately not persisted.**
Redgifs' resolved URLs are signed and expire (hours), so a persisted cache would
serve dead URLs on the next launch, reintroducing the black-tile bug. Staleness is
bounded to a session; if a cached URL expires mid-session and the player errors, the
entry is busted and re-resolved once. Playback failure *is* the expiry signal, so no
manual TTL is needed.

## Consequences

- A future contributor may notice Redgifs resolves differently (lazily, no persisted
  cache) from every other host, which resolve eagerly via deterministic URL rewriting.
  That inconsistency is intentional — see above. Do not "fix" it by resolving Redgifs
  eagerly or persisting the cache.
