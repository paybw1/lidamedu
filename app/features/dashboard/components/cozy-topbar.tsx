import { Link } from "react-router";

import {
  COZY_INK_SOFT,
  COZY_LINE,
  type CozyPalette,
} from "~/core/lib/cozy-tokens";

type Props = {
  palette: CozyPalette;
  user: {
    name: string;
    avatarInitials: string;
    cohort: string;
  };
};

export default function CozyTopbar({ palette, user }: Props) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        marginBottom: 28,
      }}
    >
      <div
        style={{
          flex: 1,
          maxWidth: 420,
          background: "#FFF",
          border: `1px solid ${COZY_LINE}`,
          borderRadius: 12,
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 13,
          color: COZY_INK_SOFT,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M11 11l3 3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        강의·문제·노트 검색
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            padding: "2px 6px",
            background: palette.tint,
            color: palette.primary,
            borderRadius: 4,
            fontFamily: "ui-monospace, monospace",
          }}
        >
          ⌘K
        </span>
      </div>
      <div
        style={{
          marginLeft: "auto",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <button type="button" style={iconBtnStyle()}>
          <BellIcon />
          <span
            style={{
              position: "absolute",
              top: 8,
              right: 9,
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: palette.accent,
              border: "2px solid #FFF",
            }}
          />
        </button>
        <Link
          to="/account/edit"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "4px 12px 4px 4px",
            background: "#FFF",
            border: `1px solid ${COZY_LINE}`,
            borderRadius: 999,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${palette.accent}, ${palette.primary})`,
              color: "#FFF",
              display: "grid",
              placeItems: "center",
              fontWeight: 600,
              fontSize: 12,
            }}
          >
            {user.avatarInitials}
          </div>
          <div style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 600 }}>{user.name}</div>
            <div style={{ fontSize: 10.5, color: COZY_INK_SOFT }}>
              {user.cohort}
            </div>
          </div>
        </Link>
      </div>
    </header>
  );
}

function iconBtnStyle(): React.CSSProperties {
  return {
    all: "unset",
    cursor: "pointer",
    position: "relative",
    width: 40,
    height: 40,
    borderRadius: 12,
    background: "#FFF",
    border: `1px solid ${COZY_LINE}`,
    display: "grid",
    placeItems: "center",
  };
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M3.5 11.5h9l-1.2-1.5V7a3.3 3.3 0 0 0-2.6-3.2V3.2a.7.7 0 1 0-1.4 0v.6A3.3 3.3 0 0 0 4.7 7v3l-1.2 1.5zM6.5 13a1.5 1.5 0 0 0 3 0"
        stroke="#2B1F14"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
