// 카카오맵 SDK 임베드 — 주소 지오코딩 후 마커 표시.
// ★ JS 키는 도메인 제한(공개 안전). 등록 도메인 밖(예: 미등록 localhost)에서는
//   타일이 안 뜰 수 있어, 스크립트 로드 실패 시 구글 지도(fallbackSrc)로 폴백한다.
// 클라이언트 전용(window/document) — useEffect 안에서만 SDK 를 만진다.
import { useEffect, useRef, useState } from "react";

// 카카오 JS 키 — 공개 가능한 도메인 제한 키. env 로 override 가능.
const KAKAO_MAP_KEY: string =
  import.meta.env.VITE_KAKAO_MAP_KEY ?? "ab60ec0a326459136171fd0a33c3a41e";

// ── 최소 타입(공식 d.ts 없음 — 사용하는 API 만 좁게 선언, any 회피) ──
type KakaoLatLng = object;
interface KakaoMapInstance {
  setCenter(latlng: KakaoLatLng): void;
}
interface KakaoGeocoderResult {
  x: string; // 경도(lng)
  y: string; // 위도(lat)
}
interface KakaoGeocoder {
  addressSearch(
    address: string,
    callback: (result: KakaoGeocoderResult[], status: string) => void,
  ): void;
}
interface KakaoMapsNamespace {
  load(callback: () => void): void;
  Map: new (
    container: HTMLElement,
    options: { center: KakaoLatLng; level: number },
  ) => KakaoMapInstance;
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  Marker: new (options: {
    map: KakaoMapInstance;
    position: KakaoLatLng;
  }) => unknown;
  services: {
    Geocoder: new () => KakaoGeocoder;
    Status: { OK: string };
  };
}
interface KakaoSdk {
  maps: KakaoMapsNamespace;
}
declare global {
  interface Window {
    kakao?: KakaoSdk;
  }
}

const SDK_ID = "kakao-maps-sdk";

export function KakaoMap({
  address,
  label,
  fallbackSrc,
  className,
}: {
  address: string;
  label: string;
  fallbackSrc: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!KAKAO_MAP_KEY) {
      setFailed(true);
      return;
    }
    let cancelled = false;

    function render() {
      const kakao = window.kakao;
      const el = containerRef.current;
      if (!kakao || !el) return;
      kakao.maps.load(() => {
        if (cancelled || !containerRef.current) return;
        // 기본 중심(서초 일대) → 지오코딩 성공 시 정확 위치로 재중심.
        const center = new kakao.maps.LatLng(37.4837, 127.0078);
        const map = new kakao.maps.Map(containerRef.current, {
          center,
          level: 3,
        });
        const geocoder = new kakao.maps.services.Geocoder();
        geocoder.addressSearch(address, (result, status) => {
          if (status === kakao.maps.services.Status.OK && result[0]) {
            const pos = new kakao.maps.LatLng(
              Number(result[0].y),
              Number(result[0].x),
            );
            map.setCenter(pos);
            new kakao.maps.Marker({ map, position: pos });
          }
        });
      });
    }

    if (window.kakao?.maps) {
      render();
      return () => {
        cancelled = true;
      };
    }

    const existing = document.getElementById(
      SDK_ID,
    ) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", render);
      existing.addEventListener("error", () => setFailed(true));
      return () => {
        cancelled = true;
        existing.removeEventListener("load", render);
      };
    }

    const script = document.createElement("script");
    script.id = SDK_ID;
    script.async = true;
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_MAP_KEY}&autoload=false&libraries=services`;
    script.addEventListener("load", render);
    script.addEventListener("error", () => setFailed(true));
    document.head.appendChild(script);

    return () => {
      cancelled = true;
    };
  }, [address]);

  if (failed) {
    return (
      <iframe
        title={label}
        src={fallbackSrc}
        className={className}
        style={{ border: 0 }}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
    );
  }

  return <div ref={containerRef} aria-label={label} className={className} />;
}
