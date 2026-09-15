# Hydra

Hydra is a Reddit client. It browses Reddit's public content without an API key, talking directly to `www.reddit.com` JSON endpoints, and represents Reddit posts, comments, and the media they link to.

## Language

**Resolve**:
To derive a directly-playable/viewable media URL from a post or an external host's page URL (e.g. turning a Redgifs *watch-page* URL into its `.mp4` URL). Some hosts resolve by deterministic URL rewriting (Imgur `.gifv`→`.mp4`); others require an API call (Redgifs).
_Avoid_: fetch, load, get (those describe transport, not the watch-page → media-URL derivation).

**Focused Post**:
The single post that currently owns video playback privileges in a feed — the center-most *mostly visible* video post on screen once scrolling has settled (a video barely scrolled into view is not eligible). At most one post is Focused at a time; during a fast fling, no post is Focused. When the feed-audio toggle is on, the Focused Post plays with audio.
_Avoid_: active post, current post, visible post (many posts are visible; only one is Focused).

**Poster**:
The static preview image a video post shows whenever it is not the Focused Post — the post's thumbnail, with a play indicator. A post showing its Poster has no video player attached.
_Avoid_: placeholder, thumbnail (a Poster is specifically the stand-in for an unfocused video, not any small image).

**Tapped Video**:
A video the user opened deliberately, by tapping it into the fullscreen viewer, as opposed to one the feed autoplays as the Focused Post. Tapped videos have their own audio setting, which defaults to the feed-audio toggle until the user sets it and then takes precedence over it.
_Avoid_: fullscreen video (that describes the surface, not why it plays), opened video.

**Keyless**:
Hydra's access model: it uses no Reddit OAuth client ID. Anonymous browsing hits public `.json` endpoints; user actions (vote, comment, subscribe) are authorized by a `modhash` token obtained from a cookie-based browser login.
_Avoid_: anonymous-only, no-auth (logged-in actions still exist; there's just no API key).
