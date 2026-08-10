import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { useEffect, useRef } from "react";
import { Alert, AppState } from "react-native";

import KeyStore from "./KeyStore";
import RedditURL, { PageType } from "./RedditURL";
import { PageTypeToNavName } from "./PageTypeToNavName";
import {
  READ_CLIPBOARD_DEFAULT,
  READ_CLIPBOARD_KEY,
} from "../pages/SettingsPage/General/OpenInHydra";
import { AppNavigationProp } from "./navigationTypes";
import {
  NavigationContainerRef,
  StackActions,
  TabActions,
  useNavigation,
} from "@react-navigation/native";
import {
  getResolvedSharedPayloadsAsync,
  clearSharedPayloads,
} from "expo-sharing";

export default function useHandleIncomingURLs() {
  const navigation = useNavigation<NavigationContainerRef<AppNavigationProp>>();
  const isAsking = useRef(false);
  const navigationReady = navigation.isReady();

  /**
   * Shortened share links (/r/<sub>/s/<id>, /user/<name>/s/<id>) have to be
   * resolved before their page type means anything — a user share link looks
   * like a plain user page until the redirect is followed.
   */
  const handleURL = async (url: string) => {
    let resolvedURL = url;
    try {
      resolvedURL = (await new RedditURL(url).resolveURL()).toString();
    } catch (_e) {
      // Not a URL we can resolve, fall through to the page type check below
    }
    const pageType = RedditURL.getPageType(resolvedURL);
    if (pageType === PageType.UNKNOWN) {
      Alert.alert("Unknown URL", `The URL ${url} cannot be handled by Hydra.`);
      return;
    }
    navigation.dispatch(TabActions.jumpTo("Posts"));
    navigation.dispatch(
      StackActions.push(PageTypeToNavName[pageType], {
        url: resolvedURL,
      }),
    );
  };

  const handleDeepLink = (deepLink: string) => {
    if (!deepLink || !deepLink.toLowerCase().startsWith("hydra://openurl?url="))
      return;
    const url = deepLink.replace(/hydra:\/\/openurl\?url=/i, "");
    handleURL(url);
  };

  const handleClipboardURL = async () => {
    const canReadClipboard =
      KeyStore.getBoolean(READ_CLIPBOARD_KEY) ?? READ_CLIPBOARD_DEFAULT;
    if (!canReadClipboard) return;
    if (isAsking.current) return;
    isAsking.current = true;
    const clipboardURL = await Clipboard.getUrlAsync();
    if (!clipboardURL) return;
    try {
      new RedditURL(clipboardURL);
    } catch (_e) {
      // Not a Reddit URL Hydra can handle
      return;
    }
    Alert.alert(
      "Open Reddit URL?",
      `A Reddit URL was detected on your clipboard. Would you like to open it?\n\n ${clipboardURL}`,
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => {
            Clipboard.setUrlAsync("");
            isAsking.current = false;
          },
        },
        {
          text: "Open",
          onPress: () => {
            Clipboard.setUrlAsync("");
            handleURL(clipboardURL);
            isAsking.current = false;
          },
        },
      ],
    );
  };

  const handleSharedLink = async () => {
    const payloads = await getResolvedSharedPayloadsAsync();
    if (payloads.length === 0 || !payloads[0].contentUri) return;
    handleURL(payloads[0].contentUri);
    clearSharedPayloads();
  };

  useEffect(() => {
    if (!navigationReady) return;
    handleClipboardURL();
    handleSharedLink();
    const subscription = AppState.addEventListener(
      "change",
      async (nextAppState) => {
        if (nextAppState === "active") {
          handleClipboardURL();
          handleSharedLink();
        }
      },
    );
    return () => subscription.remove();
  }, [navigationReady]);

  useEffect(() => {
    const startupLinkHandler = () => {
      const deepLink = Linking.getLinkingURL();
      if (deepLink) {
        handleDeepLink(deepLink);
      }
    };
    navigation.addListener("ready", startupLinkHandler);
    const subscription = Linking.addEventListener("url", (event) => {
      handleDeepLink(event.url);
    });
    return () => {
      subscription.remove();
      navigation.removeListener("ready", startupLinkHandler);
    };
  }, []);
}
