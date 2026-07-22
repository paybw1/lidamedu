// feat-12 강의 홈(/lecture/home) 우하단 플로팅 버튼 묶음.
//   위: 카카오 오픈채팅 문의 / 아래: 맨 위로 스크롤.
//   아래로 스크롤(임계 320px 초과)했을 때만 나타난다.
import { useEffect, useState } from "react";

const OPEN_CHAT_URL = "https://open.kakao.com/o/pb4ApLdi";
const SHOW_AFTER_PX = 320;

export function KakaoFloat() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = () =>
    window.scrollTo({ top: 0, behavior: "smooth" });

  return (
    <div
      style={{
        position: "fixed",
        right: "20px",
        bottom: "24px",
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: "10px",
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : "translateY(16px)",
        pointerEvents: shown ? "auto" : "none",
        transition: "opacity .25s ease, transform .25s ease",
      }}
    >
      <a
        href={OPEN_CHAT_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="카카오톡 오픈채팅 문의"
        title="카카오톡 오픈채팅으로 문의하기"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          height: "52px",
          padding: "0 18px 0 14px",
          borderRadius: "9999px",
          background: "#FEE500",
          color: "#191600",
          fontSize: "14px",
          fontWeight: 700,
          textDecoration: "none",
          boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 3.6c-4.75 0-8.6 3-8.6 6.7 0 2.4 1.6 4.5 4 5.7-.18.63-.65 2.3-.74 2.66-.12.45.16.44.34.32.14-.09 2.24-1.52 3.15-2.14.6.09 1.22.13 1.85.13 4.75 0 8.6-3 8.6-6.7 0-3.7-3.85-6.67-8.6-6.67Z"
            fill="#191600"
          />
        </svg>
        카톡 문의
      </a>

      <button
        type="button"
        onClick={scrollToTop}
        aria-label="맨 위로 이동"
        title="맨 위로"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "52px",
          height: "52px",
          borderRadius: "9999px",
          border: "1px solid rgba(0,0,0,0.08)",
          background: "#ffffff",
          color: "#191600",
          cursor: "pointer",
          boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 19V6M6 12l6-6 6 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
