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
    const videos = await formatVideos(
      child("https://www.redgifs.com/watch/abc"),
    );
    expect(Redgifs.getMediaURL).not.toHaveBeenCalled();
    expect(videos).toHaveLength(1);
    expect(videos[0].needsResolution).toBe(true);
    expect(videos[0].source).toBe("https://www.redgifs.com/watch/abc");
    expect(videos[0].videoDownloadURL).toBe(
      "https://www.redgifs.com/watch/abc",
    );
  });

  it("does not flag imgur gifv videos", async () => {
    const videos = await formatVideos(child("https://i.imgur.com/xyz.gifv"));
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

describe("formatVideos resolution selection", () => {
  const previewVariants = {
    preview: {
      images: [
        {
          variants: {
            mp4: {
              source: { url: "https://i.redd.it/full.mp4", width: 1920 },
              resolutions: [
                { url: "https://i.redd.it/small.mp4", width: 320 },
                { url: "https://i.redd.it/preview.mp4", width: 640 },
              ],
            },
          },
        },
      ],
    },
  };

  it("uses the full-size preview mp4 source instead of a downscaled resolution", async () => {
    const videos = await formatVideos({ data: previewVariants });
    expect(videos).toHaveLength(1);
    expect(videos[0].source).toBe("https://i.redd.it/full.mp4");
    expect(videos[0].videoDownloadURL).toBe("https://i.redd.it/full.mp4");
  });

  it("falls back to the largest downscaled mp4 when there is no source", async () => {
    const videos = await formatVideos({
      data: {
        preview: {
          images: [
            {
              variants: {
                mp4: {
                  resolutions: [
                    { url: "https://i.redd.it/small.mp4", width: 320 },
                    { url: "https://i.redd.it/preview.mp4", width: 640 },
                  ],
                },
              },
            },
          ],
        },
      },
    });
    expect(videos[0].source).toBe("https://i.redd.it/preview.mp4");
  });

  it("uses the reddit_video mp4 fallback when there is no hls playlist", async () => {
    const videos = await formatVideos({
      data: {
        media: {
          reddit_video: { fallback_url: "https://v.redd.it/x/DASH_1080.mp4" },
        },
        ...previewVariants,
      },
    });
    expect(videos).toHaveLength(1);
    expect(videos[0].source).toBe("https://v.redd.it/x/DASH_1080.mp4");
  });

  it("prefers full-size gallery item videos over a post-level preview variant", async () => {
    const videos = await formatVideos({
      data: {
        ...previewVariants,
        gallery_data: {
          items: [{ media_id: "b" }, { media_id: "a" }],
        },
        media_metadata: {
          a: {
            id: "a",
            p: [{ u: "https://preview.redd.it/a-preview.jpg" }],
            s: { mp4: "https://i.redd.it/a-full.mp4" },
          },
          b: {
            id: "b",
            p: [{ u: "https://preview.redd.it/b-preview.jpg" }],
            s: { mp4: "https://i.redd.it/b-full.mp4" },
          },
        },
      },
    });
    expect(videos.map((video) => video.source)).toEqual([
      "https://i.redd.it/b-full.mp4",
      "https://i.redd.it/a-full.mp4",
    ]);
  });

  it("falls through to the preview variant when a gallery has no videos", async () => {
    const videos = await formatVideos({
      data: {
        ...previewVariants,
        gallery_data: { items: [{ media_id: "a" }] },
        media_metadata: {
          a: {
            id: "a",
            p: [{ u: "https://preview.redd.it/a-preview.jpg" }],
            s: { u: "https://i.redd.it/a-full.jpg" },
          },
        },
      },
    });
    expect(videos).toHaveLength(1);
    expect(videos[0].source).toBe("https://i.redd.it/full.mp4");
  });
});
