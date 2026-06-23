import packageJson from './package.json';

// Identity is env-overridable so a fork can point builds at its own Expo
// project / Apple bundle id (set these in the hydra-cci CircleCI context — see
// docs/ci/circleci-testflight-setup.md) without editing or merge-conflicting
// this file. `projectId` has no upstream fallback: when EAS_PROJECT_ID is unset
// (e.g. the bootstrap run) it stays undefined so `eas init` creates a fresh
// project under EXPO_OWNER instead of trying to link the inaccessible upstream
// project.
const projectId = process.env.EAS_PROJECT_ID;
const owner = process.env.EXPO_OWNER ?? "dmilin";
const iosBundleIdentifier = process.env.IOS_BUNDLE_ID ?? "com.dmilin.hydra";
const androidPackage = process.env.ANDROID_PACKAGE ?? "com.dmilin.hydra";
const IS_DEV = process.env.APP_VARIANT === 'development';

module.exports = {
  expo: {
    name: "Hydra",
    slug: "hydra",
    version: packageJson.version,
    runtimeVersion: {
      policy: 'appVersion',
    },
    icon: "./assets/images/icon.png",
    scheme: "hydra",
    userInterfaceStyle: "automatic",
    splash: {
      image: "./assets/images/splash.png",
      resizeMode: "contain",
      backgroundColor: "#000000"
    },
    assetBundlePatterns: [
      "**/*"
    ],
    ios: {
      appStoreUrl: "https://apps.apple.com/us/app/hydra-for-reddit/id6478089063",
      supportsTablet: true,
      bundleIdentifier: iosBundleIdentifier,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: androidPackage,
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#000000"
      }
    },
    web: {
      bundler: "metro",
      favicon: "./assets/images/favicon.png"
    },
    ...(projectId ? { extra: { eas: { projectId } } } : {}),
    owner,
    plugins: [
      "expo-router",
      [
        'expo-media-library', {
          savePhotosPermission: 'Allow $(PRODUCT_NAME) to save photos and videos to your library.',
        }
      ],
      "@sentry/react-native/expo",
      [
        'expo-image-picker', {
          "photosPermission": "$(PRODUCT_NAME) accesses your photos to upload images.",
        }
      ],
      "expo-notifications",
      [
        "expo-alternate-app-icons",
        [
          {
            "name": "cerberus",
            "ios": "./assets/images/custom_icons/cerberus.png",
            "android": {
              "foregroundImage": "./assets/images/custom_icons/cerberus.png",
              "backgroundColor": "#FFFFFF",
            },
          },
          {
            "name": "hail_hydra",
            "ios": "./assets/images/custom_icons/hail_hydra.png",
            "android": {
              "foregroundImage": "./assets/images/custom_icons/hail_hydra.png",
              "backgroundColor": "#FFFFFF",
            },
          },
          {
            "name": "hail_hydra_dark",
            "ios": "./assets/images/custom_icons/hail_hydra_dark.png",
            "android": {
              "foregroundImage": "./assets/images/custom_icons/hail_hydra_dark.png",
              "backgroundColor": "#000000",
            },
          },
        ]
      ],
      [
        "expo-sharing",
        {
          "ios": {
            "enabled": true,
            "activationRule": {
              "supportsWebUrlWithMaxCount": 1,
            }
          },
        }
      ],
      [
        "expo-screen-orientation",
        {
          "initialOrientation": "DEFAULT"
        }
      ],
      "expo-font",
      "expo-image",
      "expo-secure-store",
      "expo-sqlite",
      "expo-video",
      "expo-web-browser",
    ],
    ...(projectId ? {
      updates: {
        url: `https://u.expo.dev/${projectId}`,
        fallbackToCacheTimeout: 5000,
      }
    } : {})
  }
}
