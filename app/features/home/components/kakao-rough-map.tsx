// 카카오(다음) 약도 위젯 — roughmap Lander. 등록된 약도(timestamp/key)를 렌더한다.
// 클라이언트 전용(window/document) — useEffect 안에서만 스크립트를 만진다.
//
// ★ 핵심 함정: 공식 로더(roughmapLoader.js)는 실제 엔진(roughmapLander.js)을
//   document.write() 로 주입한다. 그런데 document.write 는 "페이지 로드 후 동적으로
//   삽입된 스크립트"에서는 브라우저가 무시한다 → useEffect 동적 삽입 시 엔진이 안 실려
//   daum.roughmap.Lander 가 없고 약도가 빈칸이 된다.
//   해결: 로더는 daum.roughmap.cdn/phase 만 얻는 용도로 쓰고(그 사이 document.write 는
//   페이지 wipe 방지 위해 무력화), 엔진 스크립트는 cdn 버전으로 직접 로드한다.
// ★ SSR 시엔 컨테이너 div 만 나가고, 스크립트 로드·render 는 브라우저에서만.
// ★ StrictMode 이중호출·effect 재실행에도 render 는 1회만(ref + 컨테이너 자식 가드).
import { useEffect, useRef } from "react";

const CONTAINER_ID = "daumRoughmapContainer1782880326471";
const LOADER_SRC =
  "https://ssl.daumcdn.net/dmaps/map_js_init/roughmapLoader.js";
const TIMESTAMP = "1782880326471";
const KEY = "qgjdsajoqdy";
const MAP_WIDTH = "640";
const MAP_HEIGHT = "360";
const LOADER_CLASS = "daum_roughmap_loader_script";
const LANDER_CLASS = "daum_roughmap_lander_script";

// ── 최소 타입(공식 d.ts 없음 — 사용하는 API 만 좁게 선언, any 회피) ──
interface RoughmapLander {
  render(): void;
}
interface RoughmapNamespace {
  Lander?: new (opts: {
    timestamp: string;
    key: string;
    mapWidth: string;
    mapHeight: string;
  }) => RoughmapLander;
  cdn?: string;
  phase?: string;
}
declare global {
  interface Window {
    daum?: { roughmap?: RoughmapNamespace };
  }
}

function getRoughmap(): RoughmapNamespace | undefined {
  return window.daum?.roughmap;
}

// className 으로 중복 삽입 방지 + 로드 완료 기억(data-loaded).
function loadScriptOnce(src: string, className: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script.${className}`,
    );
    if (existing) {
      if (existing.dataset.loaded === "1") resolve();
      else {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error(src)), {
          once: true,
        });
      }
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.className = className;
    s.setAttribute("charset", "UTF-8");
    s.addEventListener(
      "load",
      () => {
        s.dataset.loaded = "1";
        resolve();
      },
      { once: true },
    );
    s.addEventListener("error", () => reject(new Error(src)), { once: true });
    document.body.appendChild(s);
  });
}

async function ensureLander(): Promise<RoughmapNamespace | undefined> {
  if (getRoughmap()?.Lander) return getRoughmap();

  // 1) 로더 로드 — daum.roughmap.cdn/phase 를 심는다(엔진 주입 document.write 는 무력화).
  if (!getRoughmap()?.cdn) {
    const originalWrite = document.write;
    document.write = (() => {}) as typeof document.write;
    try {
      await loadScriptOnce(LOADER_SRC, LOADER_CLASS);
    } finally {
      document.write = originalWrite;
    }
  }
  if (getRoughmap()?.Lander) return getRoughmap();

  // 2) 실제 엔진(roughmapLander.js)을 cdn 버전으로 직접 로드(document.write 우회).
  const rm = getRoughmap();
  if (rm?.cdn) {
    const proto = window.location.protocol === "https:" ? "https:" : "http:";
    const url = `${proto}//t1.kakaocdn.net/kakaomapweb/roughmap/place/${
      rm.phase ?? "prod"
    }/${rm.cdn}/roughmapLander.js`;
    await loadScriptOnce(url, LANDER_CLASS);
  }
  return getRoughmap();
}

export function KakaoRoughMap({ className }: { className?: string }) {
  // effect 재실행·StrictMode 이중호출 대비 — 렌더 1회 보장.
  const renderedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const container = document.getElementById(CONTAINER_ID);
    // 이미 렌더돼 컨테이너에 자식이 있으면 skip(중복 방지).
    if (renderedRef.current || !container || container.childElementCount > 0) {
      renderedRef.current = true;
      return;
    }

    ensureLander()
      .then((rm) => {
        if (cancelled || renderedRef.current) return;
        const el = document.getElementById(CONTAINER_ID);
        if (!rm?.Lander || !el || el.childElementCount > 0) return;
        renderedRef.current = true;
        new rm.Lander({
          timestamp: TIMESTAMP,
          key: KEY,
          mapWidth: MAP_WIDTH,
          mapHeight: MAP_HEIGHT,
        }).render();
      })
      .catch(() => {
        // 스크립트 로드 실패(네트워크·차단 등) — 빈 컨테이너 유지, 페이지엔 영향 없음.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ★ 반응형: 위젯은 고정 640px 라 작은 화면서 레이아웃을 넘김 →
  //   래퍼 max-width:100% + overflow-x-auto 로 좁은 화면선 가로 스크롤(레이아웃 보호).
  return (
    <div className={className}>
      <div className="w-full overflow-x-auto">
        <div
          id={CONTAINER_ID}
          className="root_daum_roughmap root_daum_roughmap_landing mx-auto"
          style={{ maxWidth: "100%" }}
        />
      </div>
    </div>
  );
}
