"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EngineState } from "@/lib/engine/state";
import type { PublicHealth } from "@/lib/health/public-health";
import type { Act2Scene } from "@/lib/demo/director";
import { ensureLabSurface } from "@/components/lab-url";

export type EngineSource = "live" | "demo";
export type ViewerConnection = "connecting" | "open" | "stale" | "offline";

const STREAMS: Record<EngineSource, string> = {
  live: "/api/stream",
  demo: "/api/demo/act2/stream",
};

export interface EngineStreamControllerValue {
  state: EngineState | null;
  health: PublicHealth | null;
  connection: ViewerConnection;
  source: EngineSource;
  switchSource: (source: EngineSource) => void;
}

/**
 * Browser boundary for engine streams. Components consume one stable source of
 * truth and never need to know how live hydration differs from the Act II feed.
 */
export function useEngineStreamController(
  initialSource: EngineSource,
  options: { demoScene?: Act2Scene | null; paused?: boolean } = {},
): EngineStreamControllerValue {
  const [source, setSource] = useState<EngineSource>(initialSource);
  const [state, setState] = useState<EngineState | null>(null);
  const [connection, setConnection] = useState<ViewerConnection>("connecting");
  const [health, setHealth] = useState<PublicHealth | null>(null);
  const lastFrameAt = useRef(0);
  const pausedRef = useRef(Boolean(options.paused));
  const latestSnapshot = useRef<EngineState | null>(null);

  useEffect(() => {
    setSource(initialSource);
  }, [initialSource]);

  useEffect(() => {
    if (source !== "live") {
      setHealth(null);
      return;
    }
    let cancelled = false;
    const refresh = () => {
      fetch("/api/health", { cache: "no-store" })
        .then((response) => response.ok ? response.json() as Promise<PublicHealth> : Promise.reject(new Error("health unavailable")))
        .then((snapshot) => { if (!cancelled) setHealth(snapshot); })
        .catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [source]);

  useEffect(() => {
    pausedRef.current = Boolean(options.paused);
    if (options.paused) {
      setConnection("stale");
    } else if (latestSnapshot.current) {
      setState(latestSnapshot.current);
      setConnection("open");
    }
  }, [options.paused]);

  useEffect(() => {
    let cancelled = false;
    setState(null);
    latestSnapshot.current = null;
    setConnection("connecting");
    lastFrameAt.current = 0;

    if (source === "live") {
      fetch("/api/session", { cache: "no-store" })
        .then((response) => response.json())
        .then((snapshot: EngineState) => {
          if (!cancelled && snapshot?.sessionId && snapshot.provenance !== "simulation") {
            setState(snapshot);
            lastFrameAt.current = Date.now();
          }
        })
        .catch(() => undefined);
    }

    const streamUrl = source === "demo" && options.demoScene
      ? `${STREAMS.demo}?scene=${options.demoScene}`
      : STREAMS[source];
    const stream = new EventSource(streamUrl);
    stream.onopen = () => {
      if (!cancelled) setConnection(pausedRef.current ? "stale" : "open");
    };
    stream.onerror = () => {
      if (!cancelled) setConnection(lastFrameAt.current ? "stale" : "offline");
    };
    stream.onmessage = (event) => {
      try {
        const snapshot = JSON.parse(event.data) as EngineState;
        if (!snapshot?.sessionId || cancelled || !matchesSource(snapshot, source)) return;
        lastFrameAt.current = Date.now();
        latestSnapshot.current = snapshot;
        if (!pausedRef.current) {
          setState(snapshot);
          setConnection("open");
        }
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
  }, [source, options.demoScene]);

  const switchSource = useCallback((next: EngineSource) => {
    setSource(next);
    const url = new URL(window.location.href);
    if (next === "demo") url.searchParams.set("demo", "act2");
    else url.searchParams.delete("demo");
    ensureLabSurface(url);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }, []);

  return { state, health, connection, source, switchSource };
}

function matchesSource(snapshot: EngineState, source: EngineSource): boolean {
  return source === "demo" ? snapshot.provenance === "simulation" : snapshot.provenance !== "simulation";
}
