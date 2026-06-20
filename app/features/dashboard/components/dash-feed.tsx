// FEED 그룹 — 최근 학습 · 신규 법 개정 · 최근 판례.

import { Link } from "react-router";

import { Card, Chip, Eyebrow, Sub, T } from "~/features/dashboard/lib/dash";

// ── 최근 학습 ───────────────────────────────────────────────────────────────

export interface RecentActivityRow {
  type: "article" | "case" | "problem";
  label: string;
  href: string;
  when: string;
}

const TYPE_META: Record<
  RecentActivityRow["type"],
  { label: string; color: string }
> = {
  article: { label: "조문", color: T.blue },
  case: { label: "판례", color: "#7B6BA0" },
  problem: { label: "문제", color: T.amberInk },
};

export function RecentActivityCard({
  items,
}: {
  items: ReadonlyArray<RecentActivityRow>;
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
        <Eyebrow>최근 학습</Eyebrow>
        <Sub style={{ font: "500 11px/1 Pretendard, sans-serif" }}>
          최근 {items.length}건
        </Sub>
      </div>
      {items.length === 0 ? (
        <p
          style={{
            font: "400 12px/1.5 Pretendard, sans-serif",
            color: T.inkSoft,
            margin: 0,
          }}
        >
          최근 학습 활동이 없습니다.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.slice(0, 8).map((a, i, arr) => {
            const meta = TYPE_META[a.type];
            return (
              <li
                key={i}
                style={{
                  borderBottom:
                    i < arr.length - 1 ? `1px solid ${T.lineSoft}` : "none",
                }}
              >
                <Link
                  to={a.href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 0",
                    textDecoration: "none",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: meta.color,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      font: "600 11px/1 Pretendard, sans-serif",
                      color: meta.color,
                      width: 30,
                      flexShrink: 0,
                    }}
                  >
                    {meta.label}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      font: "500 13px/1.4 Pretendard, sans-serif",
                      color: T.ink,
                      letterSpacing: "-0.01em",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {a.label}
                  </span>
                  <span
                    style={{
                      font: "500 11px/1 Pretendard, sans-serif",
                      color: T.inkMute,
                      flexShrink: 0,
                    }}
                  >
                    {a.when}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ── 신규 법 개정 ────────────────────────────────────────────────────────────

export interface RevisionRow {
  lawRevisionId: string;
  lawCode: string;
  lawName: string;
  version: string;
  date: string;
  affectedCount: number;
}

export function RecentRevisionsCard({
  items,
}: {
  items: ReadonlyArray<RevisionRow>;
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
        <Eyebrow>신규 법 개정</Eyebrow>
        <Link
          to="/latest/laws"
          style={{
            font: "600 12px/1 Pretendard, sans-serif",
            color: T.link,
            textDecoration: "none",
          }}
        >
          모두 보기 →
        </Link>
      </div>
      {items.length === 0 ? (
        <p
          style={{
            font: "400 12px/1.5 Pretendard, sans-serif",
            color: T.inkSoft,
            margin: 0,
          }}
        >
          최근 법 개정 소식이 없습니다.
        </p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {items.map((r) => (
            <li key={r.lawRevisionId}>
              <Link
                to={`/subjects/${r.lawCode}`}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                  padding: "6px 0",
                  borderBottom: `1px solid ${T.lineSoft}`,
                  textDecoration: "none",
                }}
              >
                <Chip tone="blue">{r.lawName}</Chip>
                <span
                  style={{
                    font: "500 13px/1.4 Pretendard, sans-serif",
                    color: T.ink,
                    flex: 1,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {r.version}
                </span>
                <Sub style={{ font: "500 11px/1 Pretendard, sans-serif" }}>
                  {r.date}
                </Sub>
                {r.affectedCount > 0 ? (
                  <span
                    style={{
                      font: "600 11px/1 Pretendard, sans-serif",
                      color: T.link,
                      padding: "2px 6px",
                      background: T.blueSoft,
                      borderRadius: 4,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    조문 {r.affectedCount}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ── 최근 판례 ───────────────────────────────────────────────────────────────

export interface CaseRow {
  caseId: string;
  lawSlug: string;
  cite: string;
  date: string;
  excerpt: string;
}

export function RecentCasesCard({
  items,
}: {
  items: ReadonlyArray<CaseRow>;
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
        <Eyebrow>최근 판례</Eyebrow>
        <Link
          to="/latest/cases"
          style={{
            font: "600 12px/1 Pretendard, sans-serif",
            color: T.link,
            textDecoration: "none",
          }}
        >
          모두 보기 →
        </Link>
      </div>
      {items.length === 0 ? (
        <p
          style={{
            font: "400 12px/1.5 Pretendard, sans-serif",
            color: T.inkSoft,
            margin: 0,
          }}
        >
          최근 판례 소식이 없습니다.
        </p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {items.map((c) => (
            <li key={c.caseId}>
              <Link
                to={`/subjects/${c.lawSlug}/cases/${c.caseId}`}
                style={{
                  display: "block",
                  padding: "8px 0",
                  borderBottom: `1px solid ${T.lineSoft}`,
                  textDecoration: "none",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    marginBottom: 4,
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      font: "700 12px/1.3 Pretendard, sans-serif",
                      color: "#7B6BA0",
                      letterSpacing: "0.01em",
                    }}
                  >
                    {c.cite}
                  </span>
                  <Sub style={{ font: "500 11px/1 Pretendard, sans-serif" }}>
                    {c.date}
                  </Sub>
                </div>
                <div
                  style={{
                    font: "500 12px/1.5 Pretendard, sans-serif",
                    color: T.inkSoft,
                    letterSpacing: "-0.005em",
                  }}
                >
                  {c.excerpt}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
