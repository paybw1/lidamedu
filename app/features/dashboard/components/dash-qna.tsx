// 대시보드 "최근 Q&A" 카드 — 내가 올린 질문 last 3 (제목 + 상태 + 시간) + 질문하기 CTA + 빈 상태.
// (Phase 5 진입 통합) 구 "최근 AI 대화"(/ai) 카드를 통합 Q&A(/qna)로 전환.

import { ArrowRightIcon, MessageCircleQuestionIcon, PlusIcon } from "lucide-react";
import { Link } from "react-router";

import { Card, Eyebrow, T } from "~/features/dashboard/lib/dash";
import { QNA_STATUS_LABEL, type QnaStatus } from "~/features/qna/labels";

export interface QnaRecentItem {
  threadId: string;
  title: string;
  status: QnaStatus;
  createdAt: string;
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

export function QnaRecentCard({
  threads,
}: {
  threads: ReadonlyArray<QnaRecentItem>;
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
          <MessageCircleQuestionIcon
            size={11}
            color={T.blue}
            strokeWidth={2.2}
            style={{ display: "inline-block" }}
          />
          Q&A
        </Eyebrow>
        <Link
          to="/qna"
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

      {threads.length === 0 ? (
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
          <MessageCircleQuestionIcon size={24} color={T.inkSoft} strokeWidth={1.5} />
          <p
            style={{
              font: "400 12px/1.5 Pretendard, sans-serif",
              color: T.inkSoft,
              margin: 0,
            }}
          >
            궁금한 점을 질문하면 AI 가 즉시
            <br />
            답하고, 강사가 확인·보완합니다.
          </p>
          <Link
            to="/qna/new?targetType=study_method"
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
            질문하기
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
            {threads.slice(0, 3).map((t) => (
              <li key={t.threadId}>
                <Link
                  to={`/qna/${t.threadId}`}
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
                      {t.title}
                    </p>
                    <span
                      style={{
                        font: "500 11px/1 Pretendard, sans-serif",
                        color: T.inkSoft,
                        flexShrink: 0,
                        tabSize: "tabular-nums",
                      }}
                    >
                      {relTime(t.createdAt)}
                    </span>
                  </div>
                  <span
                    style={{
                      font: "500 11px/1 Pretendard, sans-serif",
                      color: T.inkSoft,
                      margin: "4px 0 0",
                      display: "inline-block",
                    }}
                  >
                    {QNA_STATUS_LABEL[t.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            to="/qna/new?targetType=study_method"
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
            질문하기
          </Link>
        </>
      )}
    </Card>
  );
}
