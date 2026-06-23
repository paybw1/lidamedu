// feat-10-006 단계2 — OX 회차 결과 뷰 (/me/ox-sessions/:sessionId).
// 한 응시 회차에서 지문별로 무엇을 맞고/틀리고/안 했는지 + 정답·해설을 다시 본다.
// 본문·정답은 채점·러너와 동일 단일 소스(getOxQuestionsForPack)로 복원, QuestionCard 재사용.
import type { Route } from "./+types/my-ox-session-result";

import { ArrowLeftIcon, ClockIcon, RotateCcwIcon } from "lucide-react";
import { Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import {
  MCQ_PACK_KIND_LABELS,
  MCQ_PACK_SUBJECT_LABELS,
} from "~/features/mcq-packs/labels";
import { getOxSessionResult } from "~/features/mcq-packs/queries.server";
import { QuestionCard } from "~/features/problems/components/ox-question-card";

export const meta: Route.MetaFunction = () => [
  { title: "정오문제 회차 결과 | Lidam Patent Attorney Academy" },
];

export async function loader({ params, request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  if (!params.sessionId) throw data("Missing sessionId", { status: 404 });
  const detail = await getOxSessionResult(client, user.id, params.sessionId);
  if (!detail) throw data("Not found", { status: 404 });
  return { detail };
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

export default function MyOxSessionResult({
  loaderData,
}: Route.ComponentProps) {
  const { detail } = loaderData;
  // 정답률은 전체(total) 기준으로 통일 — 미응답을 분모에 포함(시험 의미).
  const rate =
    detail.total > 0 ? Math.round((detail.correct / detail.total) * 100) : 0;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6">
      <header className="mb-5">
        <Link
          to="/me/ox-sessions"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
        >
          <ArrowLeftIcon className="size-3.5" /> 정오문제 응시 이력
        </Link>
        <h1 className="mt-2 text-xl font-bold tracking-tight">
          {detail.packTitle ?? "(팩 삭제됨)"}
        </h1>
        <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
          {detail.packKind && (
            <Badge variant="outline" className="font-normal">
              {MCQ_PACK_KIND_LABELS[
                detail.packKind as keyof typeof MCQ_PACK_KIND_LABELS
              ] ?? detail.packKind}
            </Badge>
          )}
          {detail.packSubjectScope && (
            <Badge variant="outline" className="font-normal">
              {MCQ_PACK_SUBJECT_LABELS[
                detail.packSubjectScope as keyof typeof MCQ_PACK_SUBJECT_LABELS
              ] ?? detail.packSubjectScope}
            </Badge>
          )}
          <span className="tabular-nums">{fmtDate(detail.completedAt)}</span>
          <span className="inline-flex items-center gap-0.5 tabular-nums">
            <ClockIcon className="size-3" />
            {fmtDuration(detail.durationSec)}
          </span>
        </div>
      </header>

      {/* 요약 */}
      <div className="border-border bg-card mb-4 flex flex-wrap items-center gap-2 rounded-2xl border p-4 shadow-sm">
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
        <Badge variant="default" className="tabular-nums">
          정답 {detail.correct}
        </Badge>
        <Badge variant="destructive" className="tabular-nums">
          오답 {detail.wrong}
        </Badge>
        {detail.blank > 0 && (
          <Badge variant="secondary" className="tabular-nums">
            미응답 {detail.blank}
          </Badge>
        )}
        <span className="text-muted-foreground text-xs tabular-nums">
          / 전체 {detail.total}
        </span>
        {detail.packId ? (
          <Button asChild size="sm" variant="outline" className="ml-auto">
            <Link to={`/latest/mcq/${detail.packId}/ox-exam`}>
              <RotateCcwIcon className="size-3.5" /> 다시 풀기
            </Link>
          </Button>
        ) : null}
      </div>

      {detail.items.length === 0 ? (
        <p className="text-muted-foreground rounded-2xl border border-dashed py-10 text-center text-sm">
          이 회차의 지문을 복원할 수 없습니다(팩이 변경·삭제되었을 수 있음).
        </p>
      ) : (
        <ol className="space-y-2.5">
          {detail.items.map((it, i) => (
            <li key={`${it.refType}:${it.refId}`}>
              <QuestionCard
                item={it}
                index={i + 1}
                answer={it.userAnswer}
                submitted
                onAnswer={() => {}}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
