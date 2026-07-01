// 카카오(다음) 약도 위젯 — roughmap Lander. 등록된 약도(timestamp/key)를 스크립트로
// 렌더한다. 클라이언트 전용(window/document) — useEffect 안에서만 스크립트를 만진다.
// ★ SSR 시엔 컨테이너 div 만 나가고, 로더 스크립트·render 는 브라우저에서만 실행.
// ★ StrictMode 이중호출·effect 재실행에도 render 는 1회만(컨테이너 자식 유무로 가드).
import { useEffect, useRef } from "react";

const CONTAINER_ID = "daumRoughmapContainer1782880326471";
const LOADER_SRC =
  "https://ssl.daumcdn.net/dmaps/map_js_init/roughmapLoader.js";
const TIMESTAMP = "1782880326471";
const KEY = "qgjdsajoqdy";
const MAP_WIDTH = "640";
const MAP_HEIGHT = "360";

// ── 최소 타입(공식 d.ts 없음 — 사용하는 API 만 좁게 선언, any 회피) ──
interface RoughmapLander {
  render(): void;
}
interface RoughmapNamespace {
  Lander: new (opts: {
    timestamp: string;
    key: string;
    mapWidth: string;
    mapHeight: string;
  }) => RoughmapLander;
}
declare global {
  interface Window {
    daum?: { roughmap?: RoughmapNamespace };
  }
}

export function KakaoRoughMap({ className }: { className?: string }) {
  // effect 재실행·StrictMode 이중호출 대비 — 렌더 1회 보장.
  const renderedRef = useRef(false);

  useEffect(() => {
    if (renderedRef.current) return;

    const doRender = () => {
      if (renderedRef.current) return;
      const roughmap = window.daum?.roughmap;
      const el = document.getElementById(CONTAINER_ID);
      // 이미 렌더돼 컨테이너에 자식이 있으면 skip(중복 방지).
      if (!roughmap || !el || el.childElementCount > 0) return;
      renderedRef.current = true;
      new roughmap.Lander({
        timestamp: TIMESTAMP,
        key: KEY,
        mapWidth: MAP_WIDTH,
        mapHeight: MAP_HEIGHT,
      }).render();
    };

    // 1) 이미 로더가 준비됐으면 즉시 렌더.
    if (window.daum?.roughmap) {
      doRender();
      return;
    }
    // 2) 로더 스크립트가 이미 있으면(다른 곳서 추가) 로드 대기 후 렌더.
    const existing = document.querySelector<HTMLScriptElement>(
      "script.daum_roughmap_loader_script",
    );
    if (existing) {
      if (window.daum?.roughmap) doRender();
      else existing.addEventListener("load", doRender, { once: true });
      return;
    }
    // 3) 없으면 동적 삽입 후 onload 에서 렌더.
    const script = document.createElement("script");
    script.src = LOADER_SRC;
    script.className = "daum_roughmap_loader_script";
    script.setAttribute("charset", "UTF-8");
    script.addEventListener("load", doRender, { once: true });
    document.body.appendChild(script);
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
