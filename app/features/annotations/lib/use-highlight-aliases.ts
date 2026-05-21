// feat-3-208 — 사용자 색상 닉네임을 client 에서 공유하는 hook.
// HighlightToolbar / HighlightList 등 selection 발생 후에야 의미가 있어 SSR 필수 데이터가 아님.
// sessionStorage 로 첫 fetch 결과를 캐시해 navigation 마다 재요청하지 않는다.
//
// 저장은 /api/annotations/highlight-alias action 후 sessionStorage 를 갱신하면 다음 mount 부터 반영.

import { useEffect, useState } from "react";

import { normalizeHighlightColorAliases } from "../labels";
import type { HighlightColorAliases } from "../labels";

const STORAGE_KEY = "lidam-highlight-color-aliases";

function readCached(): HighlightColorAliases {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return normalizeHighlightColorAliases(JSON.parse(raw));
  } catch {
    return {};
  }
}

function writeCached(aliases: HighlightColorAliases) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(aliases));
  } catch {
    // 저장 실패는 무시 (private mode 등) — 다음 fetch 가 재시도.
  }
}

// alias 갱신을 다른 컴포넌트에 전파하기 위한 이벤트 (저장 직후 호출).
const ALIAS_UPDATED_EVENT = "lidam-highlight-aliases-updated";

export function publishHighlightAliases(aliases: HighlightColorAliases) {
  writeCached(aliases);
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<HighlightColorAliases>(ALIAS_UPDATED_EVENT, {
      detail: aliases,
    }),
  );
}

export function useHighlightAliases(): HighlightColorAliases {
  const [aliases, setAliases] = useState<HighlightColorAliases>(() =>
    readCached(),
  );

  // 첫 마운트 시 GET — 캐시가 비어 있거나 stale 가능성 있을 때 갱신.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/annotations/highlight-alias", {
      method: "GET",
      credentials: "same-origin",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        if (d && typeof d === "object" && "aliases" in d) {
          const next = normalizeHighlightColorAliases(
            (d as { aliases: unknown }).aliases,
          );
          setAliases(next);
          writeCached(next);
        }
      })
      .catch(() => {
        // 네트워크 실패 — 캐시 그대로 유지.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 같은 탭의 다른 컴포넌트에서 publish 된 갱신 수신.
  useEffect(() => {
    const onUpdated = (e: Event) => {
      const ce = e as CustomEvent<HighlightColorAliases>;
      setAliases(normalizeHighlightColorAliases(ce.detail));
    };
    window.addEventListener(ALIAS_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(ALIAS_UPDATED_EVENT, onUpdated);
  }, []);

  return aliases;
}
