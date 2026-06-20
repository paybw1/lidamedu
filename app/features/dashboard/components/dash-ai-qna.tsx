// feat-9-004 잔여 ② — 대시보드 "최근 AI 대화" 카드.
// last 3 대화 (제목 + 미리보기 + 시간) + "새 대화" CTA + 빈 상태.

import { ArrowRightIcon, PlusIcon, SparklesIcon } from "lucide-react";
import { Link } from "react-router";

import { Card, Eyebrow, T } from "~/features/dashboard/lib/dash";

export interface AiQnaConversationItem {
  conversationId: string;
  title: string | null;
  lastSnippet: string | null;
  updatedAt: string;
  messageCount: number;
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "어제";
  if (day < 7) return `${day}일 전`;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
  }).format(new Date(iso));
}

export function AiQnaRecentCard({
  conversations,
}: {
  conversations: ReadonlyArray<AiQnaConversationItem>;
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
        <Eyebrow style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <SparklesIcon
            size={11}
            color={T.blue}
            strokeWidth={2.2}
            style={{ display: "inline-block" }}
          />
          AI Q&A
        </Eyebrow>
        <Link
          to="/ai"
          style={{
            font: "600 12px/1 Pretendard, sans-serif",
            color: T.link,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
          }}
        >
          전체 <ArrowRightIcon size={12} />
        </Link>
      </div>

      {conversations.length === 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "20px 8px",
            textAlign: "center",
          }}
        >
          <SparklesIcon size={24} color={T.inkSoft} strokeWidth={1.5} />
          <p
            style={{
              font: "400 12px/1.5 Pretendard, sans-serif",
              color: T.inkSoft,
              margin: 0,
            }}
          >
            조문·판례·문제를 색인한 AI 가
            <br />
            출처를 인용해 즉답합니다.
          </p>
          <Link
            to="/ai"
            style={{
              marginTop: 4,
              padding: "8px 14px",
              borderRadius: 9999,
              background: T.blue,
              color: "#fff",
              font: "600 12px/1 Pretendard, sans-serif",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <PlusIcon size={12} strokeWidth={2.4} />
            대화 시작
          </Link>
        </div>
      ) : (
        <>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {conversations.slice(0, 3).map((c) => (
              <li key={c.conversationId}>
                <Link
                  to={`/ai?c=${c.conversationId}`}
                  style={{
                    display: "block",
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: T.subtle,
                    border: `1px solid ${T.lineSoft}`,
                    textDecoration: "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <p
                      style={{
                        font: "600 13px/1.3 Pretendard, sans-serif",
                        color: T.ink,
                        letterSpacing: "-0.012em",
                        margin: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                      }}
                    >
                      {c.title ?? "(제목 없음)"}
                    </p>
                    <span
                      style={{
                        font: "500 11px/1 Pretendard, sans-serif",
                        color: T.inkSoft,
                        flexShrink: 0,
                        tabSize: "tabular-nums",
                      }}
                    >
                      {relTime(c.updatedAt)}
                    </span>
                  </div>
                  {c.lastSnippet ? (
                    <p
                      style={{
                        font: "400 11px/1.4 Pretendard, sans-serif",
                        color: T.inkSoft,
                        margin: "4px 0 0",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.lastSnippet}
                    </p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
          <Link
            to="/ai"
            style={{
              marginTop: 10,
              padding: "8px 0",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              width: "100%",
              borderRadius: 9999,
              border: `1px solid ${T.lineSoft}`,
              font: "600 12px/1 Pretendard, sans-serif",
              color: T.ink,
              textDecoration: "none",
              background: T.paper,
            }}
          >
            <PlusIcon size={12} strokeWidth={2.4} />
            새 대화
          </Link>
        </>
      )}
    </Card>
  );
}
