// feat-10-006 — 대시보드 OX 카드.
// 최근 응시 추세(미니 막대) + 평균 정답률 + 누적 오답 노트 수 + deep link.
// dash-restudy 와 같은 카드 스타일을 따른다.

import { ArrowRightIcon, CircleHelpIcon } from "lucide-react";
import { Link } from "react-router";

import { Card, Eyebrow, T } from "~/features/dashboard/lib/dash";

export interface OxRecentSession {
  sessionId: string;
  packId: string | null;
  packTitle: string | null;
  completedAt: string | null;
  startedAt: string;
  total: number;
  correct: number;
  wrong: number;
}

export interface OxRecentData {
  sessions: ReadonlyArray<OxRecentSession>; // 최신 → 과거 (10건 정도)
  wrongCount: number;
  totalSessions: number;
}

function rateOf(s: OxRecentSession): number {
  const answered = s.correct + s.wrong;
  return answered > 0 ? Math.round((s.correct / answered) * 100) : 0;
}

function rateColor(rate: number): string {
  if (rate >= 80) return T.emerald;
  if (rate >= 60) return T.amberInk;
  return T.coral;
}

function fmtShortDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function OxRecentCard({ data }: { data: OxRecentData }) {
  const recent = [...data.sessions].slice(0, 10).reverse(); // 차트는 좌→우 시간 흐름
  const avg =
    recent.length === 0
      ? 0
      : Math.round(recent.reduce((s, r) => s + rateOf(r), 0) / recent.length);

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
        <Eyebrow>정오문제 응시 추세</Eyebrow>
        <Link
          to="/me/ox-sessions"
          style={{
            font: "600 12px/1 Pretendard, sans-serif",
            color: T.link,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
          }}
        >
          전체 이력 <ArrowRightIcon size={12} />
        </Link>
      </div>

      {data.totalSessions === 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "24px 8px",
            color: T.inkSoft,
            font: "400 12px/1.5 Pretendard, sans-serif",
            textAlign: "center",
          }}
        >
          <CircleHelpIcon size={22} color={T.inkSoft} strokeWidth={1.5} />
          <p style={{ margin: 0 }}>
            아직 정오문제 응시 이력이 없습니다.
            <br />
            1차 모의고사 문제집에서 <strong>정오문제 시험</strong>으로 풀어 보세요.
          </p>
          <Link
            to="/latest/mcq?kind=mock_progressive"
            style={{
              marginTop: 4,
              font: "600 12px/1 Pretendard, sans-serif",
              color: T.link,
              textDecoration: "none",
            }}
          >
            진도별 모의고사 →
          </Link>
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 12,
              marginBottom: 14,
            }}
          >
            <StatCell label="응시 횟수" value={`${data.totalSessions}회`} />
            <StatCell
              label="최근 평균"
              value={`${avg}%`}
              accent={rateColor(avg)}
            />
            <StatCell
              label="누적 오답"
              value={`${data.wrongCount}건`}
              href="/me/ox-wrong-note"
              accent={data.wrongCount > 0 ? T.coral : undefined}
            />
          </div>

          {/* mini bars — 좌→우 시간순. 막대 높이는 정답률 0~100%, 색은 rateColor. */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 4,
              height: 56,
              padding: "4px 0",
              borderTop: `1px dashed ${T.lineSoft}`,
              borderBottom: `1px dashed ${T.lineSoft}`,
            }}
            aria-label="최근 정오문제 응시 정답률 추세"
          >
            {recent.map((r) => {
              const rate = rateOf(r);
              const h = Math.max(6, Math.round((rate / 100) * 48));
              return (
                <Link
                  key={r.sessionId}
                  to={
                    r.packId
                      ? `/latest/mcq/${r.packId}/ox-exam`
                      : "/me/ox-sessions"
                  }
                  title={`${r.packTitle ?? "(문제집 삭제됨)"} · ${rate}% · ${fmtShortDate(
                    r.completedAt ?? r.startedAt,
                  )}`}
                  style={{
                    flex: 1,
                    height: h,
                    background: rateColor(rate),
                    borderRadius: 3,
                    opacity: 0.85,
                    minWidth: 8,
                    transition: "opacity 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = "1";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = "0.85";
                  }}
                />
              );
            })}
            {/* 빈 슬롯 — 10건 미만일 때 좌측 정렬 효과 방지 */}
            {Array.from({ length: Math.max(0, 10 - recent.length) }).map(
              (_, i) => (
                <div
                  key={`pad-${i}`}
                  style={{ flex: 1, minWidth: 8, height: 6, opacity: 0 }}
                />
              ),
            )}
          </div>

          <p
            style={{
              font: "400 11px/1.4 Pretendard, sans-serif",
              color: T.inkSoft,
              marginTop: 8,
              margin: "8px 0 0",
            }}
          >
            막대는 최근 {recent.length}건의 정답률입니다(좌→우 시간순). 클릭하면
            해당 문제집의 정오문제 시험 화면으로 이동합니다.
          </p>
        </>
      )}
    </Card>
  );
}

function StatCell({
  label,
  value,
  accent,
  href,
}: {
  label: string;
  value: string;
  accent?: string;
  href?: string;
}) {
  const inner = (
    <>
      <div
        style={{
          font: "500 11px/1 Pretendard, sans-serif",
          color: T.inkSoft,
          letterSpacing: "-0.005em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          font: "700 18px/1 Pretendard, sans-serif",
          color: accent ?? T.ink,
          letterSpacing: "-0.015em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </>
  );
  if (href) {
    return (
      <Link
        to={href}
        style={{
          display: "block",
          textDecoration: "none",
          padding: "8px 10px",
          borderRadius: 8,
          background: T.subtle,
          border: `1px solid ${T.lineSoft}`,
        }}
      >
        {inner}
      </Link>
    );
  }
  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: 8,
        background: T.subtle,
        border: `1px solid ${T.lineSoft}`,
      }}
    >
      {inner}
    </div>
  );
}
