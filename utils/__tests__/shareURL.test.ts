/**
 * `Share.share` only honors the `url` field on iOS; on Android that field is
 * dropped, which used to leave the share sheet with no link so recipients fell
 * back to the base reddit.com page. `shareURL` fixes that by moving the link
 * into `message` on Android. These tests pin the per-platform payload so the
 * regression can't come back.
 */
import { Platform, Share } from "react-native";

import shareURL from "../shareURL";

jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
  Share: { share: jest.fn().mockResolvedValue({ action: "sharedAction" }) },
}));

const shareMock = Share.share as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

const POST_URL =
  "https://www.reddit.com/r/HydraApp/comments/abc123/some_post_title/";

it("shares via `url` on iOS so the rich link preview is preserved", () => {
  Platform.OS = "ios";
  shareURL(POST_URL);
  expect(shareMock).toHaveBeenCalledWith({ url: POST_URL });
});

it("shares via `message` on Android since `url` is ignored there", () => {
  Platform.OS = "android";
  shareURL(POST_URL);
  expect(shareMock).toHaveBeenCalledWith({ message: POST_URL });
});
