// `@expo/metro-runtime` MUST be the first import to ensure Fast Refresh works
// on web.
import "@expo/metro-runtime";
import "expo-dev-client";

import { ActionSheetProvider } from "@expo/react-native-action-sheet";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import * as Sentry from "@sentry/react-native";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { registerRootComponent } from "expo";
import { useFonts } from "expo-font";
import { SplashScreen } from "expo-router";
import React, { useEffect, useState } from "react";
import { AppState, InteractionManager, LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { enableFreeze } from "react-native-screens";
import * as ExpoOrientation from "expo-screen-orientation";

import Tabs from "./tabs";
import SubscribeToHydra from "../components/Modals/SubscribeToHydra";
import { AccountProvider } from "../contexts/AccountContext";
import { InboxProvider } from "../contexts/InboxContext";
import { MediaViewerProvider } from "../contexts/MediaViewerContext";
import { ModalProvider } from "../contexts/ModalProvider";
import NavigationProvider from "../contexts/NavigationContext";
import { SettingsProvider } from "../contexts/SettingsContexts";
import { SubredditProvider } from "../contexts/SubredditContext";
import { SubscriptionsProvider } from "../contexts/SubscriptionsContext";
import db from "../db";
import { doDBMaintenance } from "../db/functions/Maintenance";
import migrations from "../drizzle/migrations";
import { ERROR_REPORTING_STORAGE_KEY } from "../pages/SettingsPage/Privacy";
import KeyStore from "../utils/KeyStore";
import { TabScrollProvider } from "../contexts/TabScrollContext";
import { StartupModalProvider } from "../contexts/StartupModalContext";
import { VideoPlayerRegistryProvider } from "../contexts/VideoPlayerRegistryContext";
import { modifyStat, Stat } from "../db/functions/Stats";
import { ActionSheetBgProvider } from "../contexts/ActionSheetBgProvider";
import VideoCache from "../utils/VideoCache";

LogBox.ignoreLogs([
  "Require cycle: ",
  "Constants.manifest has been deprecated in favor of Constants.expoConfig.",
  `Constants.platform.ios.model has been deprecated in favor of expo-device's Device.modelName property. This API will be removed in SDK 45.`,
]);

// Default to true if not set
const reportingAllowed =
  KeyStore.getBoolean(ERROR_REPORTING_STORAGE_KEY) !== false;

Sentry.init({
  dsn: "https://0a53bc725058aa44bf7aa771f5bcda05@o4508377723174912.ingest.us.sentry.io/4508377726582784",
  debug: false,
  enabled: !__DEV__ && reportingAllowed,

  // Disable app hang tracking because it's bugged when asking for permissions
  // https://stackoverflow.com/a/79085057
  enableAppHangTracking: false,
});

SplashScreen.preventAutoHideAsync();

// Tells non visble tabs and screens to not rerender in the background
enableFreeze(true);

ExpoOrientation.lockAsync(ExpoOrientation.OrientationLock.PORTRAIT_UP);

function RootLayout() {
  const { success: migrationsComplete, error } = useMigrations(db, migrations);

  const [fontsLoaded, _fontsError] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  // The video cache can only be cleared while no video components are
  // mounted, so a requested clear must finish before the first render. This
  // is a synchronous key check that resolves immediately unless the user
  // actually requested a clear, so it doesn't meaningfully delay startup.
  const [videoCacheReady, setVideoCacheReady] = useState(false);
  useEffect(() => {
    VideoCache.clearCacheIfRequested().then(() => setVideoCacheReady(true));
  }, []);

  useEffect(() => {
    if (migrationsComplete) {
      // DB maintenance (pruning old rows past their caps) does not need to
      // finish before the UI is usable, so defer it until after startup
      // interactions instead of blocking the first render on it.
      InteractionManager.runAfterInteractions(() => {
        doDBMaintenance();
      });
      modifyStat(Stat.APP_LAUNCHES, 1);
      modifyStat(Stat.APP_FOREGROUNDS, 1);
      const appStateChangeListener = AppState.addEventListener(
        "change",
        (state) => {
          if (state === "active") {
            modifyStat(Stat.APP_FOREGROUNDS, 1);
          }
        },
      );
      return () => {
        appStateChangeListener.remove();
      };
    }
  }, [migrationsComplete]);

  return (
    migrationsComplete &&
    fontsLoaded &&
    videoCacheReady && (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AccountProvider>
            <SubscriptionsProvider>
              <SettingsProvider>
                <TabScrollProvider>
                  <NavigationProvider>
                    <ActionSheetProvider>
                      <ActionSheetBgProvider>
                        <InboxProvider>
                          <ModalProvider>
                            <VideoPlayerRegistryProvider>
                              <MediaViewerProvider>
                                <SubredditProvider>
                                  <StartupModalProvider>
                                    <SubscribeToHydra />
                                    <Tabs />
                                  </StartupModalProvider>
                                </SubredditProvider>
                              </MediaViewerProvider>
                            </VideoPlayerRegistryProvider>
                          </ModalProvider>
                        </InboxProvider>
                      </ActionSheetBgProvider>
                    </ActionSheetProvider>
                  </NavigationProvider>
                </TabScrollProvider>
              </SettingsProvider>
            </SubscriptionsProvider>
          </AccountProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    )
  );
}

const App = Sentry.wrap(RootLayout);

export default App;

registerRootComponent(App);
