# Focused-only playback (one feed video plays at a time)

At most one feed video plays at any moment: the [**Focused Post**](../../CONTEXT.md)
— the center-most video post on screen once scrolling has settled. Every other video
post renders a static poster (the post's preview thumbnail) with **no player attached
at all**. During a fast fling, nothing is Focused and nothing plays.

This deliberately abandons the app's original behavior, where every mounted video
cell autoplayed muted simultaneously. That design had no concept of a "current"
video, which made two problems structural:

1. **The stale-video bug.** FlashList recycles cells; a recycled cell's shared player
   binding lands in a post-commit effect, so for one or more renders the cell showed
   the *previous* post's still-playing video — and the loading overlay is
   intentionally hidden while a player is playing, so nothing masked it. With
   focused-only playback the first render of any recycled cell is a poster, and
   non-focused players never play, so stale playing frames cannot appear.
2. **Player-pool pressure.** Up to ~12 simultaneous live players (the LRU cap exists
   because iOS degrades near ~16 AVPlayers, showing black tiles). Focused-only
   playback needs 1-2, turning the cap into a safety net instead of a hot path, and
   cutting decode CPU/battery/bandwidth for videos the user flings past.

It also makes feed audio coherent: "play sound for the video I'm looking at" only
has a meaning when exactly one video can play. The persistent feed-audio toggle
unmutes the Focused Post.

The trade-off accepted: off-center videos/GIF-videos sit still as posters until
centered — the feed is less "alive" than when everything animated at once. This is
the behavior of the official Reddit app, TikTok, and Instagram Reels, and was chosen
deliberately over the livelier multi-autoplay feel. (Actual animated `.gif` *images*
are rendered by `expo-image`, not a video player, and keep animating.)

## Consequences

- Do not reintroduce autoplay for non-focused cells (e.g. "just play the visible
  ones muted") — that resurrects both the recycle-race window and the player-pool
  pressure this decision exists to kill.
- The shared video player registry (ADR 0002) stays: it still deduplicates the
  inline↔fullscreen player. Focus decides *whether* a feed player plays; the
  registry decides *which instance* everyone attaches to.
- Resume-on-refocus is guaranteed by remembering positions per video key
  independently of player lifetime, since players may be released while unfocused.
