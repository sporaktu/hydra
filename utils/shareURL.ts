import { Platform, Share, ShareAction } from "react-native";

/**
 * Shares a URL through the native share sheet.
 *
 * React Native's `Share.share` only honors the `url` field on iOS. On Android
 * the `url` field is silently dropped, so a call like `Share.share({ url })`
 * hands the share sheet an empty payload and recipients fall back to the base
 * reddit.com page instead of the actual link. Putting the link in `message`
 * makes Android share the real URL, while iOS keeps `url` for its rich link
 * preview.
 */
export default function shareURL(url: string): Promise<ShareAction> {
  return Share.share(Platform.OS === "ios" ? { url } : { message: url });
}
