import {
  clearVideoCacheAsync,
  getCurrentVideoCacheSize,
  VideoSource,
  setVideoCacheSizeAsync,
} from "expo-video";
import { Alert } from "react-native";
import KeyStore from "./KeyStore";
import URL from "./URL";

const VIDEO_CACHE_CLEAR_REQUESTED_KEY = "videoCacheClearRequested";

const MAX_VIDEO_DISK_CACHE_SIZE = 1024 * 1024 * 1024; // 1GB

setVideoCacheSizeAsync(MAX_VIDEO_DISK_CACHE_SIZE);

export default class VideoCache {
  static getCacheSize(): number {
    return getCurrentVideoCacheSize();
  }

  /**
   * Need to clear on startup because the cache cannot be cleared when any
   * video components are mounted.
   */
  static async requestCacheClear(): Promise<void> {
    KeyStore.set(VIDEO_CACHE_CLEAR_REQUESTED_KEY, true);
    Alert.alert("The video cache will be cleared next time you restart Hydra.");
  }

  static async clearCacheIfRequested(): Promise<void> {
    if (KeyStore.getBoolean(VIDEO_CACHE_CLEAR_REQUESTED_KEY)) {
      try {
        await clearVideoCacheAsync();
      } catch (_e) {}
      KeyStore.set(VIDEO_CACHE_CLEAR_REQUESTED_KEY, false);
    }
  }

  static makeCachedVideoSource(uri: string): VideoSource {
    const basePath = new URL(uri).getBasePath();
    // expo-video's cache derives the cached file's extension (and therefore the
    // MIME type it hands to AVFoundation) from the URL path. Reddit serves some
    // videos as an mp4 transcode behind a `.gif` path (e.g.
    // preview.redd.it/<id>.gif?format=mp4), so caching would store the mp4 bytes
    // under a .gif extension and AVFoundation would fail to decode it (the video
    // sits loading forever as a black box). HLS playlists likewise can't be
    // cached. In both cases, skip caching so the player fetches directly and
    // infers the real type from the HTTP Content-Type.
    const isCacheable =
      !basePath.endsWith(".m3u8") && !basePath.endsWith(".gif");
    return {
      uri,
      useCaching: isCacheable,
    };
  }
}
