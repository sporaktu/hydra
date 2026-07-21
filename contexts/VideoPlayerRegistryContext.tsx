import { createVideoPlayer, VideoPlayer, VideoSource } from "expo-video";
import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { VideoPlayerRegistry } from "../utils/VideoPlayerRegistry";

type RegistryContextValue = {
  acquire: (
    key: string,
    source: VideoSource,
    configure: (player: VideoPlayer) => void,
  ) => VideoPlayer;
  peek: (key: string) => VideoPlayer | null;
  release: (key: string) => void;
};

const VideoPlayerRegistryContext = createContext<RegistryContextValue | null>(
  null,
);

export function VideoPlayerRegistryProvider({ children }: PropsWithChildren) {
  // One registry for the whole app, stable across renders. createPlayer is
  // keyed but the source/configure for a NEW player are passed in via a ref
  // captured at the call site of acquire (see below).
  const pendingCreate = useRef<{
    source: VideoSource;
    configure: (player: VideoPlayer) => void;
  } | null>(null);

  const registryRef = useRef<VideoPlayerRegistry<VideoPlayer> | null>(null);
  if (registryRef.current === null) {
    registryRef.current = new VideoPlayerRegistry<VideoPlayer>({
      createPlayer: () => {
        const pending = pendingCreate.current;
        if (!pending) {
          throw new Error(
            "VideoPlayerRegistry.createPlayer called without a pending source",
          );
        }
        const player = createVideoPlayer(pending.source);
        pending.configure(player);
        return player;
      },
      releasePlayer: (player) => {
        player.release();
      },
    });
  }

  const registry = registryRef.current;

  const value = useRef<RegistryContextValue>({
    acquire: (key, source, configure) => {
      // Stash the source/configure so the registry's keyed createPlayer can
      // use them only when it actually creates (existing keys ignore these).
      pendingCreate.current = { source, configure };
      try {
        return registry.acquire(key);
      } finally {
        pendingCreate.current = null;
      }
    },
    peek: (key) => registry.peek(key),
    release: (key) => registry.release(key),
  }).current;

  return (
    <VideoPlayerRegistryContext.Provider value={value}>
      {children}
    </VideoPlayerRegistryContext.Provider>
  );
}

export function useSharedVideoPlayer(
  key: string,
  source: VideoSource | null,
  configure: (player: VideoPlayer) => void,
): VideoPlayer | null {
  const ctx = useContext(VideoPlayerRegistryContext);
  if (!ctx) {
    throw new Error(
      "useSharedVideoPlayer must be used within a VideoPlayerRegistryProvider",
    );
  }

  // Keep the latest configure without making it a dependency (it is only used
  // at create time, captured synchronously inside acquire).
  const configureRef = useRef(configure);
  configureRef.current = configure;

  const acquiredKeyRef = useRef<string | null>(null);
  // Track the acquired player in state so the consumer re-renders once it
  // exists. acquire() runs in an effect (after commit), so returning peek()
  // during render would stay null forever in the feed, where nothing else
  // triggers a re-render — leaving VideoView unmounted (black box + spinner).
  const [player, setPlayer] = useState<VideoPlayer | null>(null);

  useEffect(() => {
    if (source === null) {
      setPlayer(null);
      return;
    }
    const acquired = ctx.acquire(key, source, (p) => configureRef.current(p));
    acquiredKeyRef.current = key;
    setPlayer(acquired);
    return () => {
      if (acquiredKeyRef.current !== null) {
        ctx.release(acquiredKeyRef.current);
        acquiredKeyRef.current = null;
      }
    };
    // Re-acquire only when the key changes or source transitions null->set.
  }, [key, source === null]);

  return player;
}
