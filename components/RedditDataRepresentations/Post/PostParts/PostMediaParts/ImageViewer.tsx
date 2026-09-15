import * as Clipboard from "expo-clipboard";
import { Image, ImageSource } from "expo-image";
import React, { useState, useContext } from "react";
import {
  Text,
  StyleSheet,
  View,
  TouchableHighlight,
  Platform,
} from "react-native";

import { DataModeContext } from "../../../../../contexts/SettingsContexts/DataModeContext";
import { ThemeContext } from "../../../../../contexts/SettingsContexts/ThemeContext";
import useMediaSharing, {
  getMediaURL,
  useMediaSaving,
} from "../../../../../utils/useMediaSharing";
import useContextMenu from "../../../../../utils/useContextMenu";
import { MediaViewerContext } from "../../../../../contexts/MediaViewerContext";
import { PostInteractionContext } from "../../../../../contexts/PostInteractionContext";
import { Post } from "../../../../../api/Posts";
import { PostDetail } from "../../../../../api/PostDetail";
import { useSafeAreaFrame } from "react-native-safe-area-context";
import NativeContextMenu, {
  NativeContextMenuAction,
} from "../../../../UI/NativeContextMenu";

export default function ImageViewer({
  images,
  aspectRatio,
  post,
}: {
  images: (string | ImageSource[])[];
  aspectRatio: number;
  post?: Post | PostDetail;
}) {
  const { currentDataMode } = useContext(DataModeContext);
  const { displayMedia } = useContext(MediaViewerContext);
  const { interactedWithPost } = useContext(PostInteractionContext);
  const shareMedia = useMediaSharing();
  const saveMedia = useMediaSaving();
  const showContextMenu = useContextMenu();
  const { width, height } = useSafeAreaFrame();

  const [loadLowData, setLoadLowData] = useState(currentDataMode === "lowData");

  const { theme } = useContext(ThemeContext);

  const numImgsToDisplay = loadLowData ? 1 : Math.min(2, images.length);

  const imgRatio = aspectRatio;
  const heightIfFullSize = width / imgRatio;
  const imgHeight = Math.min(height * 0.6, heightIfFullSize);

  /**
   * The long-press menu for a single image. The same ImageViewer renders post
   * images and the inline images in comment/post bodies, so both get this
   * exact menu. On iOS it is its own native context menu, which wins over the
   * post's or comment's menu wrapping it; on Android it's an action sheet from
   * the image's own long press, which likewise beats the row's.
   */
  const makeImageMenuActions = (
    img: string | ImageSource[],
  ): NativeContextMenuAction[] => [
    {
      label: "Share Image",
      handle: () => {
        shareMedia("image", img);
      },
    },
    {
      label: "Save Image",
      handle: () => {
        saveMedia("image", img);
      },
    },
    {
      label: "Copy Image Link",
      handle: () => {
        const url = getMediaURL(img);
        if (url) Clipboard.setStringAsync(url);
      },
    },
  ];

  const showImageMenu = async (img: string | ImageSource[]) => {
    const actions = makeImageMenuActions(img);
    const result = await showContextMenu({
      options: actions.map((action) => action.label),
    });
    actions.find((action) => action.label === result)?.handle();
  };

  return (
    <View
      style={[
        styles.imageViewerContainer,
        {
          height: numImgsToDisplay === 2 ? imgHeight / 2 : imgHeight,
        },
      ]}
    >
      {images.slice(0, numImgsToDisplay).map((img, index) => {
        const imgSrc =
          typeof img === "string" ? img : loadLowData ? [img[0]] : img;
        return (
          /**
           * Don't change the TouchableHighlight to TouchableWithoutFeedback, it
           * will break images in comments by making them offset weirdly. I
           * have no idea why.
           */
          <NativeContextMenu
            key={index}
            actions={makeImageMenuActions(img)}
            style={styles.touchableZone}
          >
            <TouchableHighlight
              activeOpacity={1}
              onPress={() => {
                setLoadLowData(false);
                interactedWithPost();
                displayMedia({
                  media: [
                    images.map((img) => ({ type: "image", source: img })),
                  ],
                  initialIndex: index,
                  getCurrentPost: () => post ?? null,
                });
              }}
              style={styles.touchableZone}
              underlayColor={theme.background}
              onLongPress={
                // iOS gets the native context menu above; the action sheet is
                // the Android long-press path.
                Platform.OS === "ios" ? undefined : () => showImageMenu(img)
              }
            >
              <Image
                style={[
                  styles.img,
                  {
                    height: numImgsToDisplay === 2 ? imgHeight / 2 : imgHeight,
                  },
                ]}
                recyclingKey={
                  typeof imgSrc === "string" ? imgSrc : imgSrc[0].uri
                }
                contentFit="contain"
                source={imgSrc}
                transition={250}
              />
            </TouchableHighlight>
          </NativeContextMenu>
        );
      })}
      {images.length >= 2 && (
        <View
          style={[
            styles.imageCountContainer,
            {
              backgroundColor: theme.background,
            },
          ]}
        >
          <Text
            style={[
              styles.imageCountText,
              {
                color: theme.text,
              },
            ]}
          >
            {images.length} IMAGES
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  imageViewerContainer: {
    flex: 1,
    flexDirection: "row",
  },
  touchableZone: {
    flex: 1,
  },
  img: {
    flex: 1,
  },
  imageCountContainer: {
    position: "absolute",
    borderRadius: 5,
    overflow: "hidden",
    margin: 5,
    right: 0,
    bottom: 0,
    opacity: 0.6,
  },
  imageCountText: {
    padding: 5,
  },
  gifContainer: {
    flex: 1,
    margin: 5,
    left: 0,
    bottom: 0,
    opacity: 0.6,
  },
  isGifContainer: {
    position: "absolute",
    borderRadius: 5,
    overflow: "hidden",
    margin: 5,
    left: 0,
    bottom: 0,
    opacity: 0.6,
  },
  isGifText: {
    padding: 5,
  },
});
