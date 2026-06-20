// 대시보드 셸 — 좌측 Sidebar(240px) + 상단 Topbar.

import {
  BellIcon,
  BookmarkIcon,
  BookOpenIcon,
  ClipboardListIcon,
  LayoutDashboardIcon,
  MessagesSquareIcon,
  NewspaperIcon,
  SearchIcon,
  ShieldIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import { Link } from "react-router";

import { openCommandPalette } from "~/core/components/command-palette";
import { T } from "~/features/dashboard/lib/dash";

interface NavItem {
  label: string;
  to: string;
  icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  active?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "대시보드", to: "/dashboard", icon: LayoutDashboardIcon, active: true },
  { label: "학습관리", to: "/goals", icon: ClipboardListIcon },
  { label: "학습과목", to: "/subjects/patent", icon: BookOpenIcon },
  { label: "학습지원", to: "/study/wrong-note", icon: BookmarkIcon },
  { label: "학습정보", to: "/latest/laws", icon: NewspaperIcon },
  { label: "커뮤니티", to: "/community", icon: MessagesSquareIcon },
  { label: "운영관리", to: "/admin", icon: ShieldIcon },
];

export function DashSidebar({
  isStaff = false,
}: {
  isStaff?: boolean;
}) {
  // 수험생에게는 운영관리 항목을 감춘다.
  const navItems = NAV_ITEMS.filter(
    (it) => it.to !== "/admin" || isStaff,
  );
  return (
    <aside
      className="dash-sidebar"
      style={{
        width: 240,
        flexShrink: 0,
        background: "var(--sidebar)",
        borderRight: `1px solid ${T.line}`,
        position: "sticky",
        top: 0,
        alignSelf: "flex-start",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        padding: "20px 12px",
        fontFamily: T.font,
      }}
    >
      {/* 로고 — 다른 페이지(navigation-bar)와 동일한 리담변리사학원 PNG. */}
      <Link
        to="/"
        aria-label="리담변리사학원 홈"
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "0 8px",
          marginBottom: 24,
          textDecoration: "none",
        }}
      >
        <img
          src="/lidam-logo.png"
          alt="리담변리사학원"
          style={{ height: 28, width: "auto", maxWidth: "none" }}
        />
      </Link>

      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {navItems.map((it) => {
          const Icon = it.icon;
          return (
            <Link
              key={it.label}
              to={it.to}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "9px 12px",
                borderRadius: 8,
                font: `${it.active ? 700 : 500} 14px/1 Pretendard, sans-serif`,
                color: it.active ? T.blue : T.ink,
                background: it.active ? T.blueSoft : "transparent",
                letterSpacing: "-0.01em",
                textDecoration: "none",
              }}
            >
              <Icon
                size={18}
                color={it.active ? T.blue : T.inkSoft}
                strokeWidth={it.active ? 2 : 1.8}
              />
              <span style={{ flex: 1 }}>{it.label}</span>
            </Link>
          );
        })}
      </nav>

      <div style={{ marginTop: "auto" }}>
        <div
          style={{
            padding: 14,
            borderRadius: 12,
            background: T.blueTint,
            border: `1px solid ${T.blueSoft}`,
            font: "400 12px/1.5 Pretendard, sans-serif",
            color: T.inkSoft,
            letterSpacing: "-0.005em",
          }}
        >
          <div
            style={{
              font: "700 13px/1.3 Pretendard, sans-serif",
              color: T.ink,
              marginBottom: 4,
            }}
          >
            ☕ 27기 종합반
          </div>
          학원 상담은 평일 10~18시.
          <Link
            to="/contact"
            style={{
              display: "block",
              marginTop: 8,
              color: T.blue,
              font: "600 12px/1 Pretendard, sans-serif",
              textDecoration: "none",
            }}
          >
            상담 신청 →
          </Link>
        </div>
      </div>
    </aside>
  );
}

export function DashTopbar({
  userName,
  inboxHref,
}: {
  userName: string;
  inboxHref: string;
}) {
  const initial = userName.slice(0, 1) || "?";
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "saturate(160%) blur(10px)",
        WebkitBackdropFilter: "saturate(160%) blur(10px)",
        borderBottom: `1px solid ${T.line}`,
        padding: "12px 32px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontFamily: T.font,
      }}
    >
      <button
        type="button"
        onClick={() => openCommandPalette()}
        aria-label="전역 검색 (⌘K)"
        style={{
          flex: "0 1 380px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 36,
          padding: "0 12px",
          background: T.subtle,
          border: 0,
          borderRadius: 8,
          font: "400 13px/1 Pretendard, sans-serif",
          color: T.inkMute,
          letterSpacing: "-0.01em",
          cursor: "pointer",
        }}
      >
        <SearchIcon size={15} color={T.inkSoft} />
        <span style={{ flex: 1, textAlign: "left" }}>
          조문 · 판례 · 문제 통합 검색
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 2,
            padding: "2px 6px",
            background: T.paper,
            border: `1px solid ${T.line}`,
            borderRadius: 4,
            font: "600 10px/1 Pretendard, sans-serif",
            color: T.inkSoft,
          }}
        >
          ⌘K
        </span>
      </button>

      <div
        style={{
          marginLeft: "auto",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Link
          to={inboxHref}
          aria-label="알림"
          style={{
            width: 36,
            height: 36,
            borderRadius: 9999,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: T.ink,
            position: "relative",
          }}
        >
          <BellIcon size={18} />
          <span
            style={{
              position: "absolute",
              top: 7,
              right: 8,
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: T.coral,
              border: `1.5px solid ${T.paper}`,
            }}
          />
        </Link>
        <Link
          to="/account/edit"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 10px 4px 4px",
            borderRadius: 9999,
            background: "transparent",
            border: `1px solid ${T.lineSoft}`,
            font: "600 13px/1 Pretendard, sans-serif",
            color: T.ink,
            textDecoration: "none",
          }}
        >
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${T.blueDeep}, ${T.blueStrong})`,
              color: "#fff",
              font: "700 12px/28px Pretendard, sans-serif",
              textAlign: "center",
            }}
          >
            {initial}
          </span>
          {userName}
        </Link>
      </div>
    </header>
  );
}
