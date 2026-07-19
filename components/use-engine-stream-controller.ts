"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EngineState } from "@/lib/engine/state";

export type EngineSource = "live" | "demo";
export type ViewerConnection = "connecting" | "open" | "stale" | "offline";

const STREAMS: Record<EngineSource, string> = {
  live: "/api/stream",
  demo: "/api/demo/act2/stream",
};

export interface EngineStreamControllerValue {
  state: EngineState | null;
  connection: ViewerConnection;
  source: EngineSource;
  switchSource: (source: EngineSource) => void;
}

/**
 * Browser boundary for engine streams. Components consume one stable source of
 * truth and never need to know how live hydration differs from the Act II feed.
 */
export function useEngineStreamController(initialSource: EngineSource): EngineStreamControllerValue {
  const [source, setSource] = useState<EngineSource>(initialSource);
  const [state, setState] = useState<EngineState | null>(null);
  const [connection, setConnection] = useState<ViewerConnection>("connecting");
  const lastFrameAt = useRef(0);

  useEffect(() => {
    setSource(initialSource);
  }, [initialSource]);

  useEffect(() => {
    let cancelled = false;
    setState(null);
    setConnection("connecting");
    lastFrameAt.current = 0;

    if (source === "live") {
      fetch("/api/session", { cache: "no-store" })
        .then((response) => response.json())
        .then((snapshot: EngineState) => {
          if (!cancelled && snapshot?.sessionId) {
            setState(snapshot);
            lastFrameAt.current = Date.now();
          }
        })
        .catch(() => undefined);
    }

    const stream = new EventSource(STREAMS[source]);
    stream.onopen = () => {
      if (!cancelled) setConnection("open");
    };
    stream.onerror = () => {
      if (!cancelled) setConnection(lastFrameAt.current ? "stale" : "offline");
    };
    stream.onmessage = (event) => {
      try {
        const snapshot = JSON.parse(event.data) as EngineState;
        if (!snapshot?.sessionId || cancelled) return;
        lastFrameAt.current = Date.now();
        setState(snapshot);
        setConnection("open");
      } catch {
        // Ignore heartbeat comments or a malformed frame; EventSource remains open.
      }
    };

    const staleTimer = window.setInterval(() => {
      if (cancelled || lastFrameAt.current === 0) return;
      if (Date.now() - lastFrameAt.current > 45_000) setConnection("stale");
    }, 5_000);

    return () => {
      cancelled = true;
      window.clearInterval(staleTimer);
      stream.close();
    };
  }, [source]);

  const switchSource = useCallback((next: EngineSource) => {
    setSource(next);
    const url = new URL(window.location.href);
    if (next === "demo") url.searchParams.set("demo", "act2");
    else url.searchParams.delete("demo");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }, []);

  return { state, connection, source, switchSource };
}

