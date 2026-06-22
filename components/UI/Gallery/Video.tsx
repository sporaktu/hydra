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
} from "../../../utils/videoWatchdog";

type VideoProps = {
  video: Post["videos"][number];
};

function Video({ video }: VideoProps) {
  const { theme } = useContext(ThemeContext);
  const { subscribeToVisibility } = useContext(MediaViewerContext);
  const progress = useRef(new Animated.Value(0)).current;

  const {
    uri: resolvedUri,
    status: resolveStatus,
    retry,
  } = useResolvedVideoSource(video.source, video.needsResolution);

  const player = useSharedVideoPlayer(
    video.source,
    resolvedUri ? VideoCache.makeCachedVideoSource(resolvedUri) : null,
    (player) => {
      player.audioMixingMode = "mixWithOthers";
      player.muted = true;
      player.loop = true;
      player.timeUpdateEventInterval = 1 / 15;
      player.bufferOptions = {
        maxBufferBytes: 1024 * 1024 * 5, // 5MB - Android only setting (prevents crashes)
      };
      player.play();
    },
  );

  // expo-video's player.status is a non-reactive getter, so reading it during
  // render gives a one-time snapshot. Subscribe to statusChange and mirror it
  // into state so the loading overlay actually clears once the shared player
  // becomes readyToPlay (otherwise the black "loading" tile covers the playing
  // video forever, since nothing else re-renders this component).
  const [playerStatus, setPlayerStatus] = useState(player?.status ?? null);
  useEffect(() => {
    if (!player) {
      setPlayerStatus(null);
      return;
    }
    setPlayerStatus(player.status);
    const sub = player.addListener("statusChange", (e) => {
      setPlayerStatus(e.status);
    });
    return () => sub.remove();
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

  // The feed always wants the player muted, looping, and playing — even if a
  // fullscreen viewer session left the SAME shared player unmuted or paused.
  // Re-run on status changes too: streaming sources (e.g. v.redd.it HLS) aren't
  // "readyToPlay" yet when the player is first acquired, so the configure-time
  // play() never starts them. Once they reach readyToPlay we (re-)issue play(),
  // otherwise they sit paused inline as a black box until tapped into fullscreen.
  useEffect(() => {
    if (!player) return;
    player.muted = true;
    player.loop = true;
    if (player.status === "readyToPlay" && !isViewerShowing.current) {
      player.play();
    }
  }, [player, playerStatus]);

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
  }, [
    playerStatus,
    video.needsResolution,
    resolveStatus,
    video.source,
    retry,
  ]);

  useEffect(() => {
    if (!player) return;
    const sub = player.addListener("timeUpdate", (e) => {
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
        player.muted = true;
        player.play();
      }
    });
  }, [player, subscribeToVisibility]);

  return (
    <View
      style={styles.videoContainer}
      // "none" lets feed taps pass through to open fullscreen; in the resolve-
      // error state switch to "box-none" so the retry tile's touch reaches its
      // child handler reliably on Android (a "none" parent can swallow it).
      pointerEvents={resolveStatus === "error" ? "box-none" : "none"}
    >
      {resolveStatus === "error" ? (
        <View style={styles.notReadyContainer} pointerEvents="auto">
          <Text style={styles.errorText} onPress={retry} suppressHighlighting>
            Couldn&apos;t load video. Tap to retry.
          </Text>
        </View>
      ) : resolveStatus === "loading" ? (
        <View style={styles.notReadyContainer}>
          <ActivityIndicator color={theme.text} />
        </View>
      ) : playerStatus === "error" ? (
        <View style={styles.notReadyContainer}>
          <Text style={styles.errorText}>Failed to load video</Text>
        </View>
      ) : player === null || playerStatus === "loading" ? (
        <View style={styles.notReadyContainer}>
          <ActivityIndicator color={theme.text} />
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
  errorText: {
    color: "white",
    textAlign: "center",
    margin: 10,
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
