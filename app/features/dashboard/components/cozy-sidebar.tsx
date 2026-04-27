import { Link } from "react-router";

import type { CozyPalette } from "~/core/lib/cozy-tokens";

type IconName = "home" | "book" | "pen" | "chart" | "chat" | "note";

type NavItem = {
  icon: IconName;
  label: string;
  to: string;
  active?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { icon: "home", label: "대시보드", to: "/dashboard", active: true },
  { icon: "book", label: "강의", to: "/subjects/patent" },
  { icon: "pen", label: "실전 모의고사", to: "/gs" },
  { icon: "chart", label: "진도 현황", to: "/goals" },
  { icon: "chat", label: "Q&A", to: "/community" },
  { icon: "note", label: "내 노트", to: "/dashboard" },
];

type Props = {
  palette: CozyPalette;
  streakDays?: number;
  weeklyHoursRemaining?: number;
  weeklyProgressPercent?: number;
};

export default function CozySidebar({
  palette,
  streakDays = 23,
  weeklyHoursRemaining = 4,
  weeklyProgressPercent = 76,
}: Props) {
  return (
    <aside
      style={{
        width: 240,
        padding: "32px 20px",
        background: palette.primary,
        color: "#F8EFE3",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        zIndex: 1,
        flexShrink: 0,
      }}
    >
      <Link
        to="/dashboard"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 36,
          padding: "0 8px",
          textDecoration: "none",
          color: "inherit",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: palette.accent,
            display: "grid",
            placeItems: "center",
            fontFamily: "serif",
            fontWeight: 700,
            fontSize: 18,
            color: "#FFF",
          }}
        >
          리
        </div>
        <div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "-0.01em",
            }}
          >
            리담 변리사 학원
          </div>
          <div style={{ fontSize: 11, opacity: 0.65 }}>Lidam Patent Academy</div>
        </div>
      </Link>

      <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {NAV_ITEMS.map((n) => (
          <Link
            key={n.label}
            to={n.to}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "11px 14px",
              borderRadius: 10,
              background: n.active ? "rgba(255,255,255,0.12)" : "transparent",
              color: n.active ? "#FFF" : "rgba(248,239,227,0.78)",
              fontSize: 14,
              fontWeight: n.active ? 600 : 500,
              textDecoration: "none",
            }}
          >
            <NavIcon name={n.icon} />
            <span>{n.label}</span>
          </Link>
        ))}
      </nav>

      <div
        style={{
          marginTop: "auto",
          padding: 16,
          borderRadius: 14,
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: 18 }}>🔥</span>
          <span style={{ fontSize: 12, opacity: 0.75 }}>연속 학습</span>
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}>
          {streakDays}
          <span style={{ fontSize: 14, fontWeight: 500, opacity: 0.7 }}>
            {" "}
            일째
          </span>
        </div>
        <div
          style={{
            marginTop: 10,
            height: 4,
            borderRadius: 2,
            background: "rgba(255,255,255,0.12)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${weeklyProgressPercent}%`,
              height: "100%",
              background: palette.accent,
            }}
          />
        </div>
        <div style={{ marginTop: 8, fontSize: 11, opacity: 0.7 }}>
          이번 주 목표까지 {weeklyHoursRemaining}시간
        </div>
      </div>
    </aside>
  );
}

function NavIcon({ name }: { name: IconName }) {
  const stroke = "currentColor";
  const sw = 1.5;
  if (name === "home") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path
          d="M3 8l6-5 6 5v6.5a1 1 0 0 1-1 1h-3v-4H7v4H4a1 1 0 0 1-1-1V8z"
          stroke={stroke}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (name === "book") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path
          d="M3 4a1 1 0 0 1 1-1h4.5v11H4a1 1 0 0 1-1-1V4zM9.5 3H14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9.5V3z"
          stroke={stroke}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (name === "pen") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path
          d="M11 3l4 4-8.5 8.5H2.5V11.5L11 3z"
          stroke={stroke}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (name === "chart") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path
          d="M3 15V3M3 15h12M6 12V8M9.5 12V5.5M13 12V9.5"
          stroke={stroke}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (name === "chat") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path
          d="M3 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H7l-3 2.5V13H4a1 1 0 0 1-1-1V4z"
          stroke={stroke}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M5 2.5h6.5L14 5v9.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1zM6.5 7.5h5M6.5 10h5M6.5 12.5h3"
        stroke={stroke}
        strokeWidth={sw}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
