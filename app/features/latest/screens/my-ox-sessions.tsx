// feat-10-006 — 본인의 OX 시험 응시 이력 조회 (/me/ox-sessions).
// quiz_sessions.scope_payload->>exam_kind='ox' 인 row + 통계.
import type { Route } from "./+types/my-ox-sessions";

import {
  ArrowRightIcon,
  CheckCircle2Icon,
  ClockIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useState } from "react";
import { Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import {
  MCQ_PACK_KIND_LABELS,
  MCQ_PACK_SUBJECT_LABELS,
} from "~/features/mcq-packs/labels";
import { listMyOxSessions } from "~/features/mcq-packs/queries.server";
import {
  ALL_RANGE_SELECTION,
  type RangeSelection,
  RangeSelectionGroup,
  inRangeSelection,
  isRangeSelectionAll,
} from "~/features/study/components/study-aids-list";

export const meta: Route.MetaFunction = () => [
  { title: "정오문제 응시 이력 | Lidam Patent Attorney Academy" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const sessions = await listMyOxSessions(client, user.id, { limit: 100 });
  return { sessions };
}

function fmtDuration(sec: number | null): string {
  if (sec == null) return "-";
  if (sec < 60) return `${sec}초`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}분 ${s}초` : `${m}분`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function MyOxSessions({ loaderData }: Route.ComponentProps) {
  const { sessions } = loaderData;
  const [rangeSel, setRangeSel] = useState<RangeSelection>(ALL_RANGE_SELECTION);
  const visible = sessions.filter((s) =>
    inRangeSelection(s.completedAt ?? s.startedAt, rangeSel),
  );

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          정오문제 응시 이력
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          1차 객관식 팩을 정오문제 시험 모드로 푼 이력. 정답률·미응답·소요
          시간을 한 눈에 확인합니다.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="tabular-nums">
            {isRangeSelectionAll(rangeSel)
              ? `총 ${sessions.length} 회`
              : `${visible.length} / ${sessions.length} 회`}
          </Badge>
          <Button asChild size="sm" variant="outline" className="ml-auto">
            <Link to="/me/ox-wrong-note">
              오답 노트 <ArrowRightIcon className="size-3.5" />
            </Link>
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <RangeSelectionGroup value={rangeSel} onChange={setRangeSel} />
        </div>
      </header>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed py-12 text-center">
          <CheckCircle2Icon className="text-muted-foreground mx-auto size-10" />
          <p className="text-muted-foreground mt-3 text-sm">
            {sessions.length === 0 ? (
              <>
                아직 정오문제 시험 응시 이력이 없습니다. 1차 모의고사 또는 기출
                팩에서 <strong>정오문제 시험</strong> 버튼으로 풀어보세요.
              </>
            ) : (
              "선택한 기간에 해당하는 응시 이력이 없습니다."
            )}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((s) => (
            <li key={s.sessionId}>
              <SessionRow s={s} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SessionRow({
  s,
}: {
  s: import("~/features/mcq-packs/queries.server").OxSessionRow;
}) {
  // 정답률은 전체(total) 기준으로 통일 — 미응답을 분모에 포함(시험 의미, 러너·결과 뷰와 동일).
  const rate = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
  return (
    <div className="bg-card hover:border-primary/40 rounded-xl border p-3.5 shadow-sm transition-colors">
      <div className="flex flex-wrap items-start justify-between gap-2">
        {/* 클릭 = 회차 결과 보기. 재시작은 우측 "다시 풀기" 별도 버튼. */}
        <Link to={`/me/ox-sessions/${s.sessionId}`} className="min-w-0 flex-1">
          <p className="text-foreground line-clamp-2 text-sm font-semibold">
            {s.packTitle ?? "(팩 삭제됨)"}
          </p>
          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            {s.packKind && (
              <Badge variant="outline" className="font-normal">
                {MCQ_PACK_KIND_LABELS[
                  s.packKind as keyof typeof MCQ_PACK_KIND_LABELS
                ] ?? s.packKind}
              </Badge>
            )}
            {s.packSubjectScope && (
              <Badge variant="outline" className="font-normal">
                {MCQ_PACK_SUBJECT_LABELS[
                  s.packSubjectScope as keyof typeof MCQ_PACK_SUBJECT_LABELS
                ] ?? s.packSubjectScope}
              </Badge>
            )}
            <span className="tabular-nums">
              {fmtDate(s.completedAt ?? s.startedAt)}
            </span>
            <span className="inline-flex items-center gap-0.5 tabular-nums">
              <ClockIcon className="size-3" />
              {fmtDuration(s.durationSec)}
            </span>
          </div>
        </Link>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex items-center gap-1.5">
            <Badge
              variant="outline"
              className={cn(
                "tabular-nums",
                rate >= 80
                  ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                  : rate >= 60
                    ? "border-amber-500/40 text-amber-700 dark:text-amber-300"
                    : "border-rose-500/40 text-rose-700 dark:text-rose-300",
              )}
            >
              정답률 {rate}%
            </Badge>
            <Badge variant="secondary" className="tabular-nums">
              {s.correct}/{s.total}
              {s.blank > 0 ? ` · 미응답 ${s.blank}` : ""}
            </Badge>
          </div>
          {s.packId ? (
            <Link
              to={`/latest/mcq/${s.packId}/ox-exam`}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 text-[11px]"
            >
              <RotateCcwIcon className="size-3" /> 다시 풀기
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
