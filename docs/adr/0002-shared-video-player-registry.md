# Shared video player registry (one instance per video)

A video's player lifetime is bound to the **video**, not to the component that
renders it. A registry provider owns a `Map<videoKey, player>` (keyed by the
*pre-resolution* source URL plus gallery index, so the key is stable even as a
Redgifs source [resolves](../../CONTEXT.md)); a shared hook returns the existing
player or creates one, and every `VideoView` — inline feed and fullscreen viewer
alike — *attaches* to that single instance.

This deliberately abandons the idiomatic expo-video pattern of calling
`useVideoPlayer()` per component. Under that pattern, tapping a feed video opened the
fullscreen viewer with a *second* `useVideoPlayer()` instance, and rotating the
device remounted a component keyed on orientation, creating a *third* — three players
for one video, doubling cached memory and losing playback position on every
transition. Binding the player to the video instead means the feed and viewer point
at the same player (no reload, position preserved on tap), and rotation re-attaches a
fresh `VideoView` to the still-living player at its current frame (no reload on
rotate) — so the orientation-keyed remounts in the media viewer can stay.

Per-surface differences are applied **on attach**, not at creation: the feed attaches
muted with a buffer cap; the viewer attaches unmuted with `seekTolerance`; entering
fullscreen auto-unmutes. The feed video already pauses while the viewer is open, so
there is no contention over who drives the shared player.

## Player lifetime

Reference-counted by attached `VideoView`s, with **deferred release**: when the count
hits zero the player is released on the next tick *only if* it is still zero. The
deferral bridges the brief unmount→remount gap during a tap or rotation (which would
otherwise destroy-and-recreate the player), while still freeing memory promptly when
a video truly scrolls off-screen. A small hard-cap LRU acts as a safety backstop.

## Consequences

- Do not "simplify" video playback back to per-component `useVideoPlayer()`. That
  reintroduces the triple-instance bug this registry exists to kill.
- `DismountWhenBackgrounded` now *detaches* rather than destroys; the refcount path
  reaps the player. Backgrounding mid-playback still loses fullscreen position on
  return — unchanged from prior behavior, out of scope here.
