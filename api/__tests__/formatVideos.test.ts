// Mock native modules pulled in transitively via Posts → RedditApi → RedditCookies
jest.mock("@preeternal/react-native-cookie-manager", () => ({
  __esModule: true,
  default: { get: jest.fn(), set: jest.fn(), clearAll: jest.fn() },
}));

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import { formatVideos } from "../Posts";

jest.mock("../../utils/RedGifs", () => ({
  __esModule: true,
  default: {
    getMediaURL: jest.fn(),
    getVideoId: (u: string) => u.split(/watch\/|\?|#/)[1],
  },
}));

import Redgifs from "../../utils/RedGifs";

function child(url: string) {
  return { data: { url } };
}

describe("formatVideos redgifs lazy resolution", () => {
  it("flags redgifs videos for lazy resolution without calling getMediaURL", async () => {
    const videos = await formatVideos(child("https://www.redgifs.com/watch/abc"));
    expect(Redgifs.getMediaURL).not.toHaveBeenCalled();
    expect(videos).toHaveLength(1);
    expect(videos[0].needsResolution).toBe(true);
    expect(videos[0].source).toBe("https://www.redgifs.com/watch/abc");
    expect(videos[0].videoDownloadURL).toBe("https://www.redgifs.com/watch/abc");
  });

  it("does not flag imgur gifv videos", async () => {
    const videos = await formatVideos(
      child("https://i.imgur.com/xyz.gifv"),
    );
    expect(videos[0].needsResolution).toBeUndefined();
    expect(videos[0].source).toBe("https://i.imgur.com/xyz.mp4");
  });

  it("does not flag native reddit hls videos", async () => {
    const videos = await formatVideos({
      data: {
        media: {
          reddit_video: {
            hls_url: "https://v.redd.it/x/HLSPlaylist.m3u8",
            fallback_url: "https://v.redd.it/x/DASH_720.mp4",
          },
        },
      },
    });
    expect(videos[0].needsResolution).toBeUndefined();
  });
});
