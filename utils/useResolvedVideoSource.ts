import { useCallback, useEffect, useRef, useState } from "react";
import Redgifs, { RedgifsAbortError } from "./RedGifs";

type ResolvedVideoSource = {
  uri: string | null;
  status: "loading" | "ready" | "error";
  retry: () => void;
};

const noop = () => {};

export function useResolvedVideoSource(
  rawSource: string,
  needsResolution: boolean | undefined,
): ResolvedVideoSource {
  // Resolve-once: if this redgifs id was already resolved (e.g. earlier in the
  // scroll, before FlashList recycled this cell), reuse the cached url straight
  // away. Starting in "ready" means a previously-loaded video never flashes back
  // to a black loading tile on re-mount, and we skip a redundant re-resolve.
  const initialResolved = needsResolution
    ? Redgifs.peekCachedMediaURL(rawSource)
    : rawSource;

  const [uri, setUri] = useState<string | null>(initialResolved ?? null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    initialResolved ? "ready" : "loading",
  );
  const [attempt, setAttempt] = useState(0);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!needsResolution) {
      setUri(rawSource);
      setStatus("ready");
      return;
    }

    // Already resolved (cache hit on mount or a prior run): keep the playing
    // source as-is. Never blank it back to "loading" — that's the recycle
    // regression — and don't start a new abortable request that could be
    // cancelled out from under an already-good source.
    const cached = Redgifs.peekCachedMediaURL(rawSource);
    if (cached) {
      setUri(cached);
      setStatus("ready");
      return;
    }

    let cancelled = false;
    // Abort the in-flight resolution if this post scrolls off-screen (effect
    // cleanup) so it drops out of the queue and stops starving currently-visible
    // posts under fast scroll. This only ever cancels work for a source that has
    // NOT resolved yet (cache hits return above), so it can't blank a completed
    // result. An abort is not an error — the post just went away — so leave the
    // state untouched rather than flipping to a permanent error tile.
    const controller = new AbortController();
    setStatus("loading");
    Redgifs.getMediaURL(rawSource, controller.signal)
      .then((resolved) => {
        if (cancelled || !isMounted.current) return;
        setUri(resolved);
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled || !isMounted.current) return;
        if (err instanceof RedgifsAbortError) return;
        setUri(null);
        setStatus("error");
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [rawSource, needsResolution, attempt]);

  const retry = useCallback(() => {
    if (!needsResolution) return;
    setAttempt((a) => a + 1);
  }, [needsResolution]);

  return { uri, status, retry: needsResolution ? retry : noop };
}
