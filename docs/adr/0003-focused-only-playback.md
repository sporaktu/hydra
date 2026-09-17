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

## Amendment: mostly visible before playing

Originally any visible pixel made a video post eligible to be Focused, so a
video started playing the instant its top edge scrolled into view. Now a post
has to be *mostly visible* first — at least 70% of the post on screen, or, for
a post taller than the viewport, covering at least 60% of it (two FlashList
viewability configs whose union feeds the decision; see
`utils/FeedVideoFocus.ts`). Stopping is deliberately more lenient than
starting: a playing video keeps focus while any of it is on screen and no
mostly visible video replaces it, so nudging the feed doesn't flip it to its
Poster.

## Amendment: the fullscreen viewer owns playback

While the fullscreen viewer is open, only the video it is showing may play.
The feed underneath it still re-lays out (rotating the device changes every
post's height and the viewport's), and acting on those viewability changes
moved focus to whichever video was now center-most, which then started
playing under the viewer — audibly, with feed audio on. So the feed freezes
its Focused Post for as long as the viewer is up (`RedditDataScroller`), and
an inline player created underneath the viewer never starts on its own
(`Gallery/Video.tsx`); the viewer-closed handoff starts it. When the viewer
closes, the feed re-evaluates from its latest viewability, keeping a Focused
Post that is still on screen at all rather than briefly handing focus to
whatever is central in a layout that is about to rotate back.
