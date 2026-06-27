import { useEvent, useEventListener } from "expo";
import { VideoView } from "expo-video";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import {
  useSafeAreaFrame,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import DismountWhenBackgrounded from "../../Other/DismountWhenBackgrounded";
import VideoCache from "../../../utils/VideoCache";
import Redgifs from "../../../utils/RedGifs";
import { useResolvedVideoSource } from "../../../utils/useResolvedVideoSource";
import { useSharedVideoPlayer } from "../../../contexts/VideoPlayerRegistryContext";
import { isVideoVisuallyReady } from "../../../utils/videoOverlayState";
import { Post } from "../../../api/Posts";

export type VideoItem = {
  type: "video";
  source: Post["videos"][number];
};

type MediaVideoProps = {
  source: Post["videos"][number];
  focused: boolean;
  overlayOpacity: Animated.Value;
  setIsScrollLocked: (isScrollLocked: boolean) => void;
};

const PLAYBACK_RATES = [0.5, 1, 1.5, 2];

function MediaVideo(props: MediaVideoProps) {
  const { source } = props;
  const { width, height } = useSafeAreaFrame();

  const {
    uri: resolvedUri,
    status: resolveStatus,
    retry,
  } = useResolvedVideoSource(source.source, source.needsResolution);

  const player = useSharedVideoPlayer(
    source.source,
    resolvedUri ? VideoCache.makeCachedVideoSource(resolvedUri) : null,
    (player) => {
      player.audioMixingMode = "mixWithOthers";
      player.loop = true;
      player.timeUpdateEventInterval = 1 / 15;
      player.seekTolerance = {
        toleranceBefore: 0.1,
        toleranceAfter: 0.1,
      };
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

  // C's resolution-error tap-to-retry tile lives here in the wrapper, since the
  // inner content component requires a non-null player.
  if (resolveStatus === "error") {
    return (
      <View style={[styles.container, { width, height }]}>
        <View style={styles.notReadyContainer}>
          <TouchableOpacity onPress={retry}>
            <Text style={styles.errorText}>
              Couldn&apos;t load video. Tap to retry.
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!player) {
    return (
      <View style={[styles.container, { width, height }]}>
        <View style={styles.notReadyContainer}>
          <ActivityIndicator color="white" />
        </View>
      </View>
    );
  }

  return (
    <MediaVideoContent
      {...props}
      player={player}
      retry={retry}
      resolveStatus={resolveStatus}
    />
  );
}

function MediaVideoContent(
  props: MediaVideoProps & {
    player: import("expo-video").VideoPlayer;
    retry: () => void;
    resolveStatus: "loading" | "ready" | "error";
  },
) {
  const { source, focused, overlayOpacity, player, retry, resolveStatus } =
    props;
  const { width, height } = useSafeAreaFrame();
  const { top: safeAreaTop, left: safeAreaLeft } = useSafeAreaInsets();

  const touchStart = useRef({
    x: 0,
    y: 0,
    videoTime: 0,
    initiallyPlaying: player.playing,
    isSkimming: false,
  });

  const [isPlaying, setIsPlaying] = useState(player.playing);
  const [status, setStatus] = useState(player.status);
  const [currentTime, setCurrentTime] = useState(player.currentTime);
  const [error, setError] = useState<string | null>(null);

  // expo-video's player.status/.playing/.currentTime are non-reactive getters,
  // and this viewer reuses the SAME shared player as the inline feed. For a
  // recycled player the loading->readyToPlay transition almost always fires in
  // the gap between this component's render-time snapshot and its effect-time
  // event subscription, so the event is missed and never repeats. Worse, a
  // shared player observed in the wild can sit at status "loading" FOREVER while
  // actually playing (currentTime advancing) — so status must never alone gate
  // the overlay. Re-read the live readiness signals on (re)mount to close that
  // race; isVideoVisuallyReady() then hides the overlay off playing/currentTime.
  useEffect(() => {
    setStatus(player.status);
    setIsPlaying(player.playing);
    setCurrentTime(player.currentTime);
  }, [player]);

  const dimensions = {
    width: player.videoTrack?.size.width ?? 0,
    height: player.videoTrack?.size.height ?? 0,
  };

  const aspectRatio = dimensions.width / dimensions.height;

  const progress = useRef(new Animated.Value(0)).current;

  const playbackRate = useEvent(player, "playbackRateChange")?.playbackRate;

  const animationFrameRequest = useRef<number | null>(null);

  const panThroughVideo = (deltaX: number, deltaY: number) => {
    if (!touchStart.current.isSkimming) {
      if (Math.abs(deltaX) > 20 && Math.abs(deltaY) < 30) {
        touchStart.current.x += deltaX;
        touchStart.current.y += deltaY;
        touchStart.current.isSkimming = true;
        player.scrubbingModeOptions = {
          scrubbingModeEnabled: true,
        };
        player.pause();
        props.setIsScrollLocked(true);
      }
      return;
    }
    if (animationFrameRequest.current) {
      cancelAnimationFrame(animationFrameRequest.current);
    }
    animationFrameRequest.current = requestAnimationFrame(() => {
      const videoChange = deltaX / (width / player.duration);
      player.currentTime = touchStart.current.videoTime + videoChange;
    });
  };

  useEventListener(player, "statusChange", (e) => {
    if (e.status !== "loading") {
      setStatus(e.status);
      setError(e.error?.message ?? null);
    }
  });

  useEventListener(player, "playingChange", (e) => {
    if (touchStart.current.isSkimming) {
      return;
    }
    const newIsPlaying = e.isPlaying;
    if (newIsPlaying !== isPlaying) {
      setIsPlaying(newIsPlaying);
    }
    // A playing player has by definition decoded a frame — capture the live
    // currentTime so the readiness gate flips even if no timeUpdate has fired.
    setCurrentTime(player.currentTime);
  });

  useEventListener(player, "timeUpdate", (e) => {
    // Mirror the first advance past frame 0 into state (once) so the overlay's
    // readiness gate clears even when statusChange/playingChange were missed for
    // this recycled cell.
    if (e.currentTime > 0) {
      setCurrentTime((prev) => (prev > 0 ? prev : e.currentTime));
    }
    progress.setValue(e.currentTime / player.duration);
  });

  useEffect(() => {
    player.seekTolerance = {
      toleranceBefore: 0.1,
      toleranceAfter: 0.1,
    };
    if (focused) {
      // The shared player is created by the inline feed with
      // audioMixingMode "mixWithOthers" + muted, which leaves the iOS audio
      // session in a mixing state that isn't activated until a play/mute
      // change races through — so fullscreen audio started seconds late and
      // broke after a seek or after closing and reopening. Forcing "doNotMix"
      // here makes expo-video activate the audio session immediately and keep
      // it active across seeks/reopens.
      player.audioMixingMode = "doNotMix";
      player.muted = false;
      player.play();
      player.volume = 1;
    } else {
      // Hand the player back to the inline feed's mixing/muted behavior.
      player.audioMixingMode = "mixWithOthers";
      player.pause();
      player.volume = 0;
    }
  }, [focused, player]);

  useEffect(() => {
    return () => {
      if (animationFrameRequest.current) {
        cancelAnimationFrame(animationFrameRequest.current);
        animationFrameRequest.current = null;
      }
    };
  }, []);

  const hasBustedStaleCache = useRef(false);
  useEffect(() => {
    if (
      error &&
      source.needsResolution &&
      resolveStatus === "ready" &&
      !hasBustedStaleCache.current
    ) {
      hasBustedStaleCache.current = true;
      Redgifs.clearCached(Redgifs.getVideoId(source.source));
      retry();
    }
  }, [error, source.needsResolution, resolveStatus, source.source, retry]);

  return (
    <View
      style={[styles.container, { width, height }]}
      onTouchStart={(e) => {
        touchStart.current = {
          x: e.nativeEvent.pageX,
          y: e.nativeEvent.pageY,
          videoTime: player.currentTime,
          initiallyPlaying: player.playing,
          isSkimming: false,
        };
      }}
      onTouchMove={(e) => {
        const deltaX = e.nativeEvent.pageX - touchStart.current.x;
        const deltaY = e.nativeEvent.pageY - touchStart.current.y;
        panThroughVideo(deltaX, deltaY);
      }}
      onTouchEnd={() => {
        if (
          touchStart.current.initiallyPlaying &&
          touchStart.current.isSkimming
        ) {
          if (animationFrameRequest.current) {
            cancelAnimationFrame(animationFrameRequest.current);
          }
          player.play();
        }
        player.scrubbingModeOptions = {
          scrubbingModeEnabled: false,
        };
        touchStart.current = {
          x: 0,
          y: 0,
          videoTime: 0,
          initiallyPlaying: player.playing,
          isSkimming: false,
        };
        props.setIsScrollLocked(false);
      }}
    >
      {resolveStatus === "error" ? (
        <View style={styles.notReadyContainer}>
          <TouchableOpacity onPress={retry}>
            <Text style={styles.errorText}>
              Couldn&apos;t load video. Tap to retry.
            </Text>
          </TouchableOpacity>
        </View>
      ) : resolveStatus === "loading" ? (
        <View style={styles.notReadyContainer}>
          <ActivityIndicator color="white" />
        </View>
      ) : error ? (
        <View style={styles.notReadyContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : !isVideoVisuallyReady({
          playerStatus: status,
          isPlaying,
          currentTime,
        }) ? (
        // Gate on the robust readiness signal, never on status alone: a shared,
        // recycled player can stay at status "loading" forever while actually
        // playing, which previously left this black box covering a good video.
        <View style={styles.notReadyContainer}>
          <ActivityIndicator color="white" />
        </View>
      ) : null}
      <View
        style={[
          styles.videoContainer,
          { width, height: Math.min(height, width / aspectRatio) },
        ]}
      >
        <VideoView
          player={player}
          style={[styles.video, { width }]}
          contentFit="contain"
          nativeControls={false}
          allowsVideoFrameAnalysis={false}
        />
        <Animated.View
          style={[
            styles.playButtonContainer,
            {
              opacity: overlayOpacity,
            },
          ]}
          onTouchStart={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <TouchableOpacity
            style={styles.playButton}
            onPress={() => {
              if (isPlaying) {
                player.pause();
              } else {
                player.play();
              }
            }}
          >
            {isPlaying ? (
              <FontAwesome name="pause" size={24} color="white" />
            ) : (
              <FontAwesome
                name="play"
                size={24}
                color="white"
                style={styles.playButtonIcon}
              />
            )}
          </TouchableOpacity>
        </Animated.View>
        <View style={styles.progressBarBackground} />
        <Animated.View
          style={[
            styles.progressBar,
            {
              transform: [
                {
                  scaleX: progress,
                },
              ],
            },
          ]}
        />
      </View>
      <Animated.View
        style={[
          styles.playbackRateContainer,
          {
            top: safeAreaTop + 10,
            left: safeAreaLeft + 10,
            opacity: overlayOpacity,
          },
        ]}
        onTouchStart={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <TouchableOpacity
          style={styles.playbackRateButton}
          onPress={() => {
            const currentIndex = PLAYBACK_RATES.indexOf(playbackRate ?? 1);
            const newIndex = (currentIndex + 1) % PLAYBACK_RATES.length;
            player.playbackRate = PLAYBACK_RATES[newIndex];
          }}
        >
          <Text style={{ color: "white" }}>{playbackRate ?? 1}x</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

export default function MediaVideoWrapper(props: MediaVideoProps) {
  return (
    <DismountWhenBackgrounded>
      <MediaVideo {...props} />
    </DismountWhenBackgrounded>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
  },
  videoContainer: {
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
    flex: 1,
  },
  playButtonContainer: {
    position: "absolute",
    top: "50%",
    left: "50%",
  },
  playButton: {
    borderRadius: 100,
    padding: 15,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    transform: [{ translateX: "-50%" }, { translateY: "-50%" }],
  },
  playButtonIcon: {
    marginRight: -5,
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
    backgroundColor: "#ccc",
  },
  playbackRateContainer: {
    position: "absolute",
    left: 10,
  },
  playbackRateButton: {
    borderRadius: 100,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(100, 100, 100, 0.5)",
    width: 40,
    aspectRatio: 1,
  },
});
