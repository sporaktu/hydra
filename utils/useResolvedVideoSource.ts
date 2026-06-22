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
  const [uri, setUri] = useState<string | null>(
    needsResolution ? null : rawSource,
  );
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    needsResolution ? "loading" : "ready",
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
    let cancelled = false;
    // Abort the resolution when this post scrolls off-screen (effect cleanup) so
    // it drops out of the queue and stops starving currently-visible posts under
    // fast scroll. An abort is NOT an error — the post just went away — so leave
    // the status as-is rather than flipping to a permanent error tile.
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
