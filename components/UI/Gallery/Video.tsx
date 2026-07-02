import { VideoView } from "expo-video";
import { useContext, useEffect, useRef, useState } from "react";
import {
  Animated,
  AppState,
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
} from "react-native";
import { ThemeContext } from "../../../contexts/SettingsContexts/ThemeContext";
import { MediaViewerContext } from "../../../contexts/MediaViewerContext";
import DismountWhenBackgrounded from "../../Other/DismountWhenBackgrounded";
import VideoCache from "../../../utils/VideoCache";
import { Post } from "../../../api/Posts";
import Redgifs from "../../../utils/RedGifs";
import { useResolvedVideoSource } from "../../../utils/useResolvedVideoSource";
import { useSharedVideoPlayer } from "../../../contexts/VideoPlayerRegistryContext";
import {
  shouldArmReloadWatchdog,
  nextReloadDelayMs,
  MAX_RELOAD_ATTEMPTS,
} from "../../../utils/videoWatchdog";
import { getVideoOverlayState } from "../../../utils/videoOverlayState";
import {
  getRememberedPlaybackPosition,
  rememberPlaybackPosition,
} from "../../../utils/FeedVideoFocus";

type VideoProps = {
  video: Post["videos"][number];
  /**
   * When true (the Focused Post with feed audio on), the player plays unmuted
   * and interrupts background audio. Defaults to muted feed behavior.
   */
  audioEnabled?: boolean;
  /**
   * Poster shown inside the loading overlay instead of a bare black tile, so
   * a focus-gained video crossfades from its thumbnail rather than flashing
   * black (see docs/specs/02-focused-video-playback.md).
   */
  poster?: React.ReactNode;
};

function Video({ video, audioEnabled = false, poster }: VideoProps) {
  const { theme } = useContext(ThemeContext);
  const { subscribeToVisibility } = useContext(MediaViewerContext);
  const progress = useRef(new Animated.Value(0)).current;

  const {
    uri: resolvedUri,
    status: resolveStatus,
    retry,
  } = useResolvedVideoSource(video.source, video.needsResolution);

  // Keep the latest audio preference readable from long-lived
  // callbacks/cleanups without resubscribing them.
  const audioEnabledRef = useRef(audioEnabled);
  audioEnabledRef.current = audioEnabled;

  const player = useSharedVideoPlayer(
    video.source,
    resolvedUri ? VideoCache.makeCachedVideoSource(resolvedUri) : null,
    (player) => {
      player.audioMixingMode = audioEnabledRef.current
        ? "doNotMix"
        : "mixWithOthers";
      player.muted = !audioEnabledRef.current;
      player.loop = true;
      player.timeUpdateEventInterval = 1 / 15;
      player.bufferOptions = {
        maxBufferBytes: 1024 * 1024 * 5, // 5MB - Android only setting (prevents crashes)
      };
      player.play();
    },
  );

  // expo-video's player.status / .playing / .currentTime are non-reactive
  // getters, so reading them during render gives a one-time snapshot. Mirror the
  // live readiness signals into state so the opaque black "loading" overlay
  // actually clears once the shared player is showing frames — otherwise the
  // black tile covers the playing video forever (nothing else re-renders this
  // component). We subscribe to BOTH statusChange AND playingChange: a recycled
  // FlashList cell often mounts on top of a player that is ALREADY playing, so
  // the loading -> readyToPlay statusChange already fired before we subscribed
  // and never repeats. playingChange + a synchronous read of the live status /
  // playing / currentTime on mount guarantee we observe the real state.
  const [playerStatus, setPlayerStatus] = useState(player?.status ?? null);
  const [isPlaying, setIsPlaying] = useState(player?.playing ?? false);
  const [currentTime, setCurrentTime] = useState(player?.currentTime ?? 0);
  useEffect(() => {
    if (!player) {
      setPlayerStatus(null);
      setIsPlaying(false);
      setCurrentTime(0);
      return;
    }
    // Read the player's CURRENT live state immediately on (re)mount instead of
    // waiting for a future event that may never come for an already-ready cell.
    setPlayerStatus(player.status);
    setIsPlaying(player.playing);
    setCurrentTime(player.currentTime);
    const statusSub = player.addListener("statusChange", (e) => {
      setPlayerStatus(e.status);
    });
    const playingSub = player.addListener("playingChange", (e) => {
      setIsPlaying(e.isPlaying);
      // A playing player has, by definition, decoded a frame — capture the live
      // currentTime so the overlay's readiness gate flips even if no timeUpdate
      // has fired yet.
      setCurrentTime(player.currentTime);
    });
    return () => {
      statusSub.remove();
      playingSub.remove();
    };
  }, [player]);

  // When a stale cached redgifs URL is busted and re-resolved, the shared player
  // still holds the old source (the registry key is unchanged), so swap the source
  // on the live player. Skip the first application — the registry created the
  // player with the current resolvedUri at acquire time.
  const lastReplacedUri = useRef<string | null>(null);
  useEffect(() => {
    if (!player || !resolvedUri) return;
    if (lastReplacedUri.current === null) {
      lastReplacedUri.current = resolvedUri;
      return;
    }
    if (lastReplacedUri.current !== resolvedUri) {
      lastReplacedUri.current = resolvedUri;
      player.replace(VideoCache.makeCachedVideoSource(resolvedUri));
    }
  }, [player, resolvedUri]);

  // Tracks whether the fullscreen viewer is currently open for this shared
  // player, so the "always play" effect below doesn't fight the viewer (which
  // pauses the inline feed playback while it owns the player).
  const isViewerShowing = useRef(false);

  // The feed always wants the player looping and playing (muted unless this
  // is the Focused Post with feed audio on) — even if a fullscreen viewer
  // session left the SAME shared player in another state.
  // Re-run on status changes too: streaming sources (e.g. v.redd.it HLS) aren't
  // "readyToPlay" yet when the player is first acquired, so the configure-time
  // play() never starts them. Once they reach readyToPlay we (re-)issue play(),
  // otherwise they sit paused inline as a black box until tapped into fullscreen.
  useEffect(() => {
    if (!player) return;
    player.muted = !audioEnabled;
    player.audioMixingMode = audioEnabled ? "doNotMix" : "mixWithOthers";
    player.loop = true;
    if (player.status === "readyToPlay" && !isViewerShowing.current) {
      player.play();
    }
  }, [player, playerStatus, audioEnabled]);

  // Resume where this video left off (positions survive player release — see
  // FeedVideoFocus). Only seek a fresh player still at the start; a player
  // that stayed alive in the registry already carries its position.
  const hasRestoredPosition = useRef(false);
  useEffect(() => {
    hasRestoredPosition.current = false;
  }, [player, video.source]);
  useEffect(() => {
    if (!player || hasRestoredPosition.current) return;
    if (playerStatus !== "readyToPlay") return;
    hasRestoredPosition.current = true;
    const remembered = getRememberedPlaybackPosition(video.source);
    if (remembered > 0 && player.currentTime < 0.05) {
      player.currentTime = remembered;
    }
  }, [player, playerStatus, video.source]);

  // On unmount (focus lost, scrolled away, app backgrounded): remember the
  // position and stop playback. Without the pause, a refcount-0 player kept
  // alive by the registry's LRU would keep playing invisibly — silent when
  // muted, but audible with feed audio on. Skip while the fullscreen viewer
  // owns the player (it manages playback itself and stays mounted).
  useEffect(() => {
    if (!player) return;
    return () => {
      try {
        if (player.currentTime > 0) {
          rememberPlaybackPosition(video.source, player.currentTime);
        }
        if (!isViewerShowing.current) {
          player.muted = true;
          player.pause();
        }
      } catch {
        // The registry may have already released the player; nothing to do.
      }
    };
  }, [player, video.source]);

  // Self-healing watchdog for stuck on-screen players. During a fast fling the
  // registry churns players faster than iOS asynchronously frees the underlying
  // AVPlayer decoders, so the REAL live-decoder count can momentarily exceed the
  // ~16 hardware ceiling even though the registry's logical count is capped at
  // 12. A player created in that window comes up black and never reaches
  // readyToPlay on its own. Since this component only renders while its cell is
  // mounted (on/near screen), a stuck player here means a visible black box.
  // Reload it with the same source after a short delay — by then the fling has
  // settled and decoders are free, so the reload succeeds. Bounded + backed off
  // so it never thrashes.
  const reloadAttempts = useRef(0);
  useEffect(() => {
    if (!player || !resolvedUri) return;
    // Healthy: clear the watchdog and reset the budget.
    if (playerStatus === "readyToPlay") {
      reloadAttempts.current = 0;
      return;
    }
    if (
      !shouldArmReloadWatchdog({
        playerStatus,
        resolveStatus,
        hasPlayerAndSource: true,
        attempts: reloadAttempts.current,
      })
    ) {
      return;
    }
    // Stuck (loading / idle / error) while visible — arm a watchdog.
    const delay = nextReloadDelayMs(reloadAttempts.current);
    const timer = setTimeout(() => {
      // Re-check: only reload if still not ready (status is a live getter).
      if (player.status === "readyToPlay") {
        reloadAttempts.current = 0;
        return;
      }
      reloadAttempts.current += 1;
      try {
        player.replace(VideoCache.makeCachedVideoSource(resolvedUri));
        if (!isViewerShowing.current) player.play();
      } catch {
        // Player may have been released by the registry as the cell scrolled
        // off; the next mount will re-acquire a fresh one. Nothing to do.
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [player, playerStatus, resolvedUri, resolveStatus]);

  const hasBustedStaleCache = useRef(false);
  useEffect(() => {
    if (
      playerStatus === "error" &&
      video.needsResolution &&
      resolveStatus === "ready" &&
      !hasBustedStaleCache.current
    ) {
      hasBustedStaleCache.current = true;
      Redgifs.clearCached(Redgifs.getVideoId(video.source));
      retry();
    }
  }, [playerStatus, video.needsResolution, resolveStatus, video.source, retry]);

  useEffect(() => {
    if (!player) return;
    const sub = player.addListener("timeUpdate", (e) => {
      // Mirror the very first advance past frame 0 into state (once) so the
      // overlay's readiness gate clears even if statusChange/playingChange were
      // both missed for this recycled cell. Guarded so we don't re-render the
      // component 15x/sec for the rest of playback.
      if (e.currentTime > 0) {
        setCurrentTime((prev) => (prev > 0 ? prev : e.currentTime));
      }
      if (!player.duration) return;
      progress.setValue(e.currentTime / player.duration);
    });
    return () => sub.remove();
  }, [player, progress]);

  useEffect(() => {
    if (!player) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && player.status === "readyToPlay") {
        player.play();
      }
    });
    return () => subscription.remove();
  }, [player]);

  useEffect(() => {
    if (!player) return;
    return subscribeToVisibility((isShowing) => {
      isViewerShowing.current = isShowing;
      if (isShowing) {
        player.pause();
      } else {
        player.muted = !audioEnabledRef.current;
        player.play();
      }
    });
  }, [player, subscribeToVisibility]);

  const overlay = getVideoOverlayState({
    resolveStatus,
    playerStatus,
    hasPlayer: player !== null,
    isPlaying,
    currentTime,
    reloadAttempts: reloadAttempts.current,
    maxReloadAttempts: MAX_RELOAD_ATTEMPTS,
  });

  return (
    <View
      style={styles.videoContainer}
      // "none" lets feed taps pass through to open fullscreen; when the overlay
      // is tappable (resolve-error retry) switch to "box-none" so the retry
      // tile's touch reaches its child handler reliably on Android (a "none"
      // parent can swallow it).
      pointerEvents={
        overlay.kind !== "hidden" && overlay.tappable ? "box-none" : "none"
      }
    >
      {overlay.kind !== "hidden" ? (
        // One overlay, always self-explanatory: it shows the EXACT current state
        // (resolving / loading / no player / stalled+retry / error) so the tile
        // is never a featureless black box. Critically, getVideoOverlayState
        // returns "hidden" the instant the player is actually playing / has a
        // frame / is readyToPlay, so this can never cover a working video.
        <View
          style={styles.notReadyContainer}
          pointerEvents={overlay.tappable ? "auto" : "none"}
        >
          {poster && overlay.kind !== "resolveError" && (
            // The Poster fills the tile under the diagnostic spinner/text so a
            // focus-gained video shows its thumbnail (not a black box) until
            // the player has a real frame, at which point the whole overlay
            // (poster included) is removed by the readiness gate above.
            <View style={styles.posterContainer} pointerEvents="none">
              {poster}
            </View>
          )}
          {overlay.tappable ? (
            <Text
              style={styles.diagnosticText}
              onPress={retry}
              suppressHighlighting
            >
              {overlay.message}
            </Text>
          ) : (
            <>
              {overlay.kind !== "playerError" && (
                <ActivityIndicator
                  color={theme.text}
                  style={styles.diagnosticSpinner}
                />
              )}
              <Text style={styles.diagnosticText}>{overlay.message}</Text>
            </>
          )}
        </View>
      ) : null}
      {player && (
        <VideoView
          player={player}
          style={styles.video}
          contentFit="contain"
          nativeControls={false}
          allowsVideoFrameAnalysis={false}
        />
      )}
      <View
        style={[
          styles.progressBarBackground,
          { backgroundColor: theme.background },
        ]}
      />
      <Animated.View
        style={[
          styles.progressBar,
          {
            backgroundColor: theme.subtleText,
            transform: [
              {
                scaleX: progress,
              },
            ],
          },
        ]}
      />
    </View>
  );
}

export default function VideoPlayerWrapper(props: VideoProps) {
  return (
    <DismountWhenBackgrounded>
      <Video {...props} />
    </DismountWhenBackgrounded>
  );
}

const styles = StyleSheet.create({
  videoContainer: {
    width: "100%",
    flex: 1,
    position: "relative",
    overflow: "hidden",
  },
  notReadyContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "black",
    zIndex: 1,
  },
  posterContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  diagnosticText: {
    color: "white",
    textAlign: "center",
    marginHorizontal: 16,
    fontSize: 13,
    opacity: 0.85,
  },
  diagnosticSpinner: {
    marginBottom: 8,
  },
  video: {
    width: "100%",
    flex: 1,
  },
  progressBarBackground: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    height: 2,
    backgroundColor: "black",
  },
  progressBar: {
    position: "absolute",
    bottom: 0,
    width: "200%",
    left: "-100%",
    height: 2,
  },
});
