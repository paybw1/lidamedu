// RE-STUDY 그룹 — 재학습 진입 칩 · 즐겨찾기 빠른 접근.

import {
  BookmarkIcon,
  HighlighterIcon,
  StickyNoteIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import { Link } from "react-router";

import { Card, Eyebrow, T } from "~/features/dashboard/lib/dash";

// ── 재학습 진입 칩 ──────────────────────────────────────────────────────────

export interface StudyAidCountsData {
  wrongMcq: number;
  wrongOx: number;
  bookmarks: number;
  memos: number;
  highlights: number;
}

export function ReentryChipsCard({
  counts,
}: {
  counts: StudyAidCountsData;
}) {
  const items: {
    label: string;
    icon: ComponentType<{ size?: number; strokeWidth?: number }>;
    count: number;
    to: string;
  }[] = [
    {
      label: "오답노트",
      icon: TriangleAlertIcon,
      count: counts.wrongMcq + counts.wrongOx,
      to: "/study/wrong-note",
    },
    {
      label: "즐겨찾기",
      icon: BookmarkIcon,
      count: counts.bookmarks,
      to: "/study/bookmarks",
    },
    {
      label: "메모",
      icon: StickyNoteIcon,
      count: counts.memos,
      to: "/study/notes",
    },
    {
      label: "하이라이트",
      icon: HighlighterIcon,
      count: counts.highlights,
      to: "/study/highlights",
    },
  ];
  return (
    <Card padding={20}>
      <Eyebrow style={{ marginBottom: 14 }}>재학습 진입</Eyebrow>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 8,
        }}
      >
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <Link
              key={it.label}
              to={it.to}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 14px",
                borderRadius: 12,
                background: T.subtle,
                border: `1px solid ${T.lineSoft}`,
                textDecoration: "none",
              }}
            >
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: T.blueSoft,
                  color: T.blue,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon size={16} strokeWidth={2} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    font: "600 13px/1 Pretendard, sans-serif",
                    color: T.ink,
                    letterSpacing: "-0.012em",
                  }}
                >
                  {it.label}
                </div>
                <div
                  style={{
                    font: "700 16px/1 Pretendard, sans-serif",
                    color: T.ink,
                    fontVariantNumeric: "tabular-nums",
                    marginTop: 4,
                  }}
                >
                  {it.count.toLocaleString("ko-KR")}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

// ── 즐겨찾기 빠른 접근 ──────────────────────────────────────────────────────

export interface QuickBookmarkData {
  targetType: "article" | "case" | "problem";
  label: string;
  href: string;
  starLevel: number;
}

const TYPE_COLOR: Record<QuickBookmarkData["targetType"], string> = {
  article: T.blue,
  case: "#7B6BA0",
  problem: T.amberInk,
};

export function BookmarksQuickCard({
  bookmarks,
}: {
  bookmarks: ReadonlyArray<QuickBookmarkData>;
}) {
  return (
    <Card padding={20}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <Eyebrow>즐겨찾기 빠른 접근</Eyebrow>
        <Link
          to="/study/bookmarks"
          style={{
            font: "600 12px/1 Pretendard, sans-serif",
            color: T.blue,
            textDecoration: "none",
          }}
        >
          전체 →
        </Link>
      </div>
      {bookmarks.length === 0 ? (
        <p
          style={{
            font: "400 12px/1.5 Pretendard, sans-serif",
            color: T.inkSoft,
            margin: 0,
          }}
        >
          즐겨찾기가 비어 있습니다. 조문·판례에서 별점을 매겨 보세요.
        </p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {bookmarks.map((b, i) => (
            <Link
              key={i}
              to={b.href}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "7px 11px",
                borderRadius: 9999,
                background: T.subtle,
                border: `1px solid ${T.lineSoft}`,
                font: "500 12px/1 Pretendard, sans-serif",
                color: T.ink,
                letterSpacing: "-0.01em",
                textDecoration: "none",
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: TYPE_COLOR[b.targetType],
                }}
              />
              {b.label}
              {b.starLevel >= 2 ? (
                <span style={{ color: T.amber, fontSize: 10, marginLeft: 2 }}>
                  {"★".repeat(b.starLevel)}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
