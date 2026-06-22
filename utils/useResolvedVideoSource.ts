import { useCallback, useEffect, useRef, useState } from "react";
import Redgifs from "./RedGifs";

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
    setStatus("loading");
    Redgifs.getMediaURL(rawSource)
      .then((resolved) => {
        if (cancelled || !isMounted.current) return;
        setUri(resolved);
        setStatus("ready");
      })
      .catch(() => {
        if (cancelled || !isMounted.current) return;
        setUri(null);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [rawSource, needsResolution, attempt]);

  const retry = useCallback(() => {
    if (!needsResolution) return;
    setAttempt((a) => a + 1);
  }, [needsResolution]);

  return { uri, status, retry: needsResolution ? retry : noop };
}
