import { File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { useContext, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Share,
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
} from "react-native";
import { ImageSource } from "expo-image";

import URL from "./URL";
import { ModalContext } from "../contexts/ModalContext";
import { ThemeContext } from "../contexts/SettingsContexts/ThemeContext";

type MediaType = "image" | "video";
type MediaSource = string | ImageSource[];

/**
 * The URL worth sharing/saving/copying for a media source: a plain string as
 * is, or the last (highest resolution) entry of a resolution array.
 */
export function getMediaURL(mediaSource: MediaSource): string | undefined {
  return typeof mediaSource === "string"
    ? mediaSource
    : mediaSource.at(-1)?.uri;
}

async function downloadToCache(mediaUrl: string): Promise<File> {
  const fileName = new URL(mediaUrl).getBasePath().split("/").pop();
  const file = new File(`${Paths.cache.uri}/${fileName}`);
  if (file.exists) {
    file.delete();
  }
  await File.downloadFileAsync(mediaUrl, file);
  return file;
}

/**
 * Shared "Preparing…" modal + download for the share and save flows. Returns a
 * function that downloads the media, hands the cached file to `withFile`, and
 * cleans up, or null when a previous call is still in flight.
 */
function useMediaDownload() {
  const { setModal } = useContext(ModalContext);
  const { theme } = useContext(ThemeContext);

  const alreadyAsking = useRef(false);

  return async (
    type: MediaType,
    mediaSource: MediaSource,
    withFile: (file: File) => Promise<void>,
    onError: () => void,
  ) => {
    if (alreadyAsking.current) return;
    alreadyAsking.current = true;
    const mediaUrl = getMediaURL(mediaSource);
    if (!mediaUrl) {
      alreadyAsking.current = false;
      return;
    }
    try {
      setModal(
        <TouchableOpacity
          style={styles.modalContainer}
          onPress={() => setModal(null)}
          activeOpacity={0.9}
        >
          <View
            style={[
              styles.modal,
              {
                backgroundColor: theme.background,
                borderColor: theme.divider,
              },
            ]}
          >
            <Text
              style={[
                styles.title,
                {
                  color: theme.text,
                },
              ]}
            >
              Preparing {type === "image" ? "Image" : "Video"}...
            </Text>
            <ActivityIndicator size="small" />
          </View>
        </TouchableOpacity>,
      );
      const file = await downloadToCache(mediaUrl);
      setModal(null);
      try {
        await withFile(file);
      } finally {
        file.delete();
      }
    } catch (_e) {
      setModal(null);
      onError();
    }
    alreadyAsking.current = false;
  };
}

export default function useMediaSharing() {
  const download = useMediaDownload();

  return (type: MediaType, mediaSource: MediaSource) =>
    download(
      type,
      mediaSource,
      async (file) => {
        await Share.share({
          url: file.uri,
        });
      },
      () => Alert.alert("Error", `Failed to download ${type}`),
    );
}

/**
 * Saves an image or video straight into the photo library (asking for the
 * add-only photos permission the first time), so a long press can offer
 * "Save" without a trip through the share sheet.
 */
export function useMediaSaving() {
  const download = useMediaDownload();

  return async (type: MediaType, mediaSource: MediaSource) => {
    const permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) {
      Alert.alert(
        "Can't save to Photos",
        "Allow Hydra to add to your photo library in Settings to save media.",
      );
      return;
    }
    await download(
      type,
      mediaSource,
      async (file) => {
        await MediaLibrary.saveToLibraryAsync(file.uri);
        Alert.alert(`${type === "image" ? "Image" : "Video"} saved to Photos`);
      },
      () => Alert.alert("Error", `Failed to save ${type}`),
    );
  };
}

const styles = StyleSheet.create({
  modalContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  modal: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderRadius: 15,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 16,
    marginBottom: 10,
  },
});
