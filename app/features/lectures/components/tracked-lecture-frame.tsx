// feat-7-029 — YouTube/Vimeo postMessage 진행률 자동 추적.
// iframe 안 player 가 보내는 timeupdate 이벤트를 받아 (1) 마지막 위치 주기 저장, (2) 시청 비율 임계치 도달 시 자동 완료.

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFetcher } from "react-router";

type PlayerKind = "youtube" | "vimeo" | "other";

const COMPLETION_RATIO = 0.85;
const POSITION_SAVE_INTERVAL_SEC = 15;
const YOUTUBE_POLL_INTERVAL_MS = 5000;

function detectKind(rawUrl: string): PlayerKind {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./, "");
    if (host.endsWith("youtube.com") || host === "youtu.be") return "youtube";
    if (host.endsWith("vimeo.com") || host === "player.vimeo.com")
      return "vimeo";
    return "other";
  } catch {
    return "other";
  }
}

function originMatches(messageOrigin: string, host: string): boolean {
  try {
    const h = new URL(messageOrigin).hostname.replace(/^www\./, "");
    return h === host || h.endsWith(`.${host}`);
  } catch {
    return false;
  }
}

function youtubeCommand(
  iframe: HTMLIFrameElement,
  func: string,
  args: unknown[] = [],
) {
  iframe.contentWindow?.postMessage(
    JSON.stringify({ event: "command", func, args }),
    "*",
  );
}

function vimeoCommand(
  iframe: HTMLIFrameElement,
  method: string,
  value?: unknown,
) {
  iframe.contentWindow?.postMessage(
    JSON.stringify(
      value !== undefined ? { method, value } : { method },
    ),
    "*",
  );
}

export interface TrackedLectureFrameProps {
  embedUrl: string;
  itemId: string;
  title: string;
  initialPositionSec: number;
  alreadyCompleted: boolean;
  onAutoComplete?: () => void;
}

export function TrackedLectureFrame({
  embedUrl,
  itemId,
  title,
  initialPositionSec,
  alreadyCompleted,
  onAutoComplete,
}: TrackedLectureFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const positionFetcher = useFetcher<{ ok?: true; error?: string }>();
  const completeFetcher = useFetcher<{ ok?: true; error?: string }>();

  const kind = useMemo<PlayerKind>(() => detectKind(embedUrl), [embedUrl]);

  // YouTube 는 enablejsapi=1 + origin 파라미터가 있어야 postMessage 가 동작.
  const finalUrl = useMemo(() => {
    if (kind !== "youtube") return embedUrl;
    try {
      const u = new URL(embedUrl);
      u.searchParams.set("enablejsapi", "1");
      u.searchParams.set("playsinline", "1");
      if (typeof window !== "undefined") {
        u.searchParams.set("origin", window.location.origin);
      }
      // 학생이 중간에 종료하고 재진입하면 마지막 위치부터 재생.
      if (initialPositionSec > 0 && !u.searchParams.has("start")) {
        u.searchParams.set("start", String(Math.floor(initialPositionSec)));
      }
      return u.toString();
    } catch {
      return embedUrl;
    }
  }, [embedUrl, kind, initialPositionSec]);

  const lastSavedPosRef = useRef<number>(initialPositionSec);
  const lastDurationRef = useRef<number | null>(null);
  const completedRef = useRef<boolean>(alreadyCompleted);

  const submitPosition = useCallback(
    (sec: number) => {
      const fd = new FormData();
      fd.append("intent", "position");
      fd.append("itemId", itemId);
      fd.append("positionSec", String(Math.max(0, Math.floor(sec))));
      positionFetcher.submit(fd, {
        method: "post",
        action: "/api/student/lecture-progress",
      });
    },
    [itemId, positionFetcher],
  );

  const submitComplete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    const fd = new FormData();
    fd.append("intent", "complete");
    fd.append("itemId", itemId);
    completeFetcher.submit(fd, {
      method: "post",
      action: "/api/student/lecture-progress",
    });
    onAutoComplete?.();
  }, [itemId, completeFetcher, onAutoComplete]);

  const handleProgress = useCallback(
    (currentSec: number, durationSec: number) => {
      if (
        !Number.isFinite(currentSec) ||
        !Number.isFinite(durationSec) ||
        durationSec <= 0
      )
        return;
      // 진행 위치 저장 — 일정 간격마다만.
      if (
        currentSec - lastSavedPosRef.current >= POSITION_SAVE_INTERVAL_SEC ||
        currentSec < lastSavedPosRef.current - 30 // 큰 폭의 되감기도 한 번 저장
      ) {
        lastSavedPosRef.current = currentSec;
        submitPosition(currentSec);
      }
      // 자동 완료 — 시청 비율 임계치.
      const ratio = currentSec / durationSec;
      if (ratio >= COMPLETION_RATIO) submitComplete();
    },
    [submitPosition, submitComplete],
  );

  // postMessage 수신
  useEffect(() => {
    if (kind === "other") return;

    function onMessage(e: MessageEvent) {
      let t: number | null = null;
      let d: number | null = null;

      let parsed: unknown = null;
      try {
        parsed = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (!parsed || typeof parsed !== "object") return;
      const obj = parsed as Record<string, unknown>;

      if (kind === "youtube" && originMatches(e.origin, "youtube.com")) {
        if (obj.event === "infoDelivery" && obj.info) {
          const info = obj.info as Record<string, unknown>;
          if (typeof info.currentTime === "number") t = info.currentTime;
          if (typeof info.duration === "number") d = info.duration;
        }
      } else if (kind === "vimeo" && originMatches(e.origin, "vimeo.com")) {
        if (obj.event === "timeupdate" && obj.data) {
          const dat = obj.data as Record<string, unknown>;
          if (typeof dat.seconds === "number") t = dat.seconds;
          if (typeof dat.duration === "number") d = dat.duration;
        } else if (
          (obj.method === "getDuration" || obj.event === "loaded") &&
          obj.value &&
          typeof obj.value === "object"
        ) {
          const val = obj.value as Record<string, unknown>;
          if (typeof val.duration === "number") d = val.duration;
        }
      }

      if (d !== null && d > 0) lastDurationRef.current = d;
      if (t !== null) {
        const dur = lastDurationRef.current;
        if (dur !== null && dur > 0) handleProgress(t, dur);
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [kind, handleProgress]);

  // iframe 로드 후 핸드셰이크 + (YouTube) 폴링
  useEffect(() => {
    if (kind === "other") return;
    const iframe = iframeRef.current;
    if (!iframe) return;

    let pollId: ReturnType<typeof setInterval> | null = null;

    function handshake() {
      const frame = iframeRef.current;
      if (!frame) return;
      if (kind === "youtube") {
        frame.contentWindow?.postMessage(
          JSON.stringify({ event: "listening" }),
          "*",
        );
        if (pollId) clearInterval(pollId);
        pollId = setInterval(() => {
          const f = iframeRef.current;
          if (!f) return;
          youtubeCommand(f, "getCurrentTime");
          youtubeCommand(f, "getDuration");
        }, YOUTUBE_POLL_INTERVAL_MS);
      } else if (kind === "vimeo") {
        vimeoCommand(frame, "addEventListener", "timeupdate");
        vimeoCommand(frame, "getDuration");
      }
    }

    // iframe 이 이미 로드된 상태일 수 있으므로 즉시 + onLoad 둘 다.
    handshake();
    iframe.addEventListener("load", handshake);

    return () => {
      iframe.removeEventListener("load", handshake);
      if (pollId) clearInterval(pollId);
    };
  }, [kind, finalUrl]);

  // 탭 종료/언마운트 시점에 최종 위치 저장 (best-effort).
  useEffect(() => {
    function flush() {
      const pos = lastSavedPosRef.current;
      if (pos > 0) {
        const blob = new Blob(
          [
            new URLSearchParams({
              intent: "position",
              itemId,
              positionSec: String(Math.floor(pos)),
            }).toString(),
          ],
          { type: "application/x-www-form-urlencoded" },
        );
        navigator.sendBeacon?.("/api/student/lecture-progress", blob);
      }
    }
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [itemId]);

  return (
    <iframe
      ref={iframeRef}
      src={finalUrl}
      title={title}
      className="size-full"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    />
  );
}
