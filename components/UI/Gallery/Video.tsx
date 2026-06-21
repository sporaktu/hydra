import { VideoView } from "expo-video";
import { useContext, useEffect, useRef } from "react";
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

  // The feed always wants the player muted, looping, and playing — even if a
  // fullscreen viewer session left the SAME shared player unmuted or paused.
  useEffect(() => {
    if (!player) return;
    player.muted = true;
    player.loop = true;
    if (player.status === "readyToPlay") {
      player.play();
    }
  }, [player]);

  const hasBustedStaleCache = useRef(false);
  useEffect(() => {
    if (
      player?.status === "error" &&
      video.needsResolution &&
      resolveStatus === "ready" &&
      !hasBustedStaleCache.current
    ) {
      hasBustedStaleCache.current = true;
      Redgifs.clearCached(Redgifs.getVideoId(video.source));
      retry();
    }
  }, [
    player?.status,
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
      ) : player?.status === "error" ? (
        <View style={styles.notReadyContainer}>
          <Text style={styles.errorText}>Failed to load video</Text>
        </View>
      ) : player === null || player.status === "loading" ? (
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
