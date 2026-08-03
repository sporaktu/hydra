# Focused-only playback (one feed video plays at a time)

At most one feed video plays at any moment: the [**Focused Post**](../../CONTEXT.md)
— the center-most video post that is fully on screen once scrolling has settled. Every
other video post renders a static poster (the post's preview thumbnail) with **no player
attached at all**. During a fast fling, nothing is Focused and nothing plays.

## Eligibility: fully on screen, with a buffer

A video may only play once its whole media box sits inside the viewport with
`AUTOPLAY_VIEWPORT_BUFFER` (4%) of the viewport height clear above and below it — half
a video hanging off a screen edge never plays, and playback starts a beat after the
video is properly in view rather than the instant a sliver of it appears. Of the videos
that qualify, the one nearest the center of the viewport is Focused.

This is decided from real geometry, not from viewability tokens: FlashList reports
which items are viewable, but a "viewable" item can be one pixel on screen, and it
reports indices rather than offsets. So each video cell registers a way to measure its
media box (`registerVideoRect` in `utils/FeedVideoFocus.ts`), and when scrolling settles
the scroller measures the viewable videos and compares them against the viewport in
window coordinates. The viewport excludes the navigation header and the tab bar, both of
which the feed scrolls underneath — a video behind the blurred tab bar is not on screen.

Because a video's position changes with every scroll event, not only when viewability
flips, scrolling itself (re)starts the settle debounce, and the decision runs when the
feed comes to rest. Measuring is asynchronous, so decisions carry a generation counter
and a stale one is dropped instead of committed.

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
