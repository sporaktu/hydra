// Pure fallback logic for the embedded video player in
// components/UI/Gallery/Video.tsx. Kept here (free of expo-video / RN deps) so
// it can be unit-tested directly.
//
// Some embedded videos fail to load the first time only because the source URL
// carries trailing query parameters (tracking params, cache-busters, etc.) that
// the host mishandles. When the player errors, we retry once with those
// parameters stripped.
//
// The important exception: Reddit's own media CDNs and Redgifs sign their URLs —
// the query string carries the auth signature, so stripping it turns a working
// URL into a 403. Those hosts must never be trimmed; their own recovery paths
// (the reload watchdog, the Redgifs stale-cache bust) handle them instead.

const SIGNED_MEDIA_HOST_SUFFIXES = [
  "redd.it", // v.redd.it, i.redd.it, preview.redd.it, external-preview.redd.it
  "redgifs.com",
  "redgifs.net",
];

function getHost(uri: string): string | null {
  const match = uri.match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i);
  if (!match) return null;
  // Drop any userinfo/port so we compare bare hostnames.
  return match[1].split("@").pop()!.split(":")[0].toLowerCase();
}

function isSignedMediaHost(host: string): boolean {
  return SIGNED_MEDIA_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

/**
 * The parameter-free URL to retry when an embedded video fails to load, or null
 * when no fallback should be attempted:
 *  - the URL has no query string to trim, or
 *  - the host signs its URLs (Reddit / Redgifs), so trimming would break it.
 */
export function getTrimmedVideoSource(uri: string | null): string | null {
  if (!uri) return null;
  const queryIndex = uri.indexOf("?");
  if (queryIndex === -1) return null;

  const host = getHost(uri);
  if (host && isSignedMediaHost(host)) return null;

  const trimmed = uri.slice(0, queryIndex);
  return trimmed && trimmed !== uri ? trimmed : null;
}
