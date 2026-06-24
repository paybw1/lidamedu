// feat-10-006 — 본인의 OX 시험 응시 이력 조회 (/me/ox-sessions).
// quiz_sessions.scope_payload->>exam_kind='ox' 인 row + 통계.
import type { Route } from "./+types/my-ox-sessions";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  ClockIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useState } from "react";
import { Link, data, useNavigate } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { scoreBgTone } from "~/core/lib/chart-colors";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import {
  MCQ_PACK_KIND_LABELS,
  MCQ_PACK_SUBJECT_LABELS,
} from "~/features/mcq-packs/labels";
import {
  type OxSessionRow,
  listMyOxSessions,
} from "~/features/mcq-packs/queries.server";
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
  const navigate = useNavigate();
  const [rangeSel, setRangeSel] = useState<RangeSelection>(ALL_RANGE_SELECTION);
  const [subjectSel, setSubjectSel] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"recent" | "byPack">("recent");
  // 이력에 등장한 과목(subject_scope)만 필터 후보로.
  const availableSubjects = [
    ...new Set(
      sessions.map((s) => s.packSubjectScope).filter((v): v is string => !!v),
    ),
  ];
  const visible = sessions.filter(
    (s) =>
      inRangeSelection(s.completedAt ?? s.startedAt, rangeSel) &&
      (subjectSel === "all" || s.packSubjectScope === subjectSel),
  );

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6">
      <header className="mb-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1 text-xs"
        >
          <ArrowLeftIcon className="size-3.5" /> 뒤로
        </button>
        <h1 className="text-2xl font-bold tracking-tight">
          정오문제 응시 이력
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          1차 객관식 팩을 정오문제 시험 모드로 푼 이력. 정답률·미응답·소요
          시간을 한 눈에 확인합니다.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="tabular-nums">
            {isRangeSelectionAll(rangeSel) && subjectSel === "all"
              ? `총 ${sessions.length} 회`
              : `${visible.length} / ${sessions.length} 회`}
          </Badge>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild size="sm">
              <Link to="/latest/mcq?kind=past_exam">정오문제 풀러 가기</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/me/ox-wrong-note">
                오답 노트 <ArrowRightIcon className="size-3.5" />
              </Link>
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <RangeSelectionGroup value={rangeSel} onChange={setRangeSel} />
        </div>
        {availableSubjects.length > 1 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground text-[11px]">과목</span>
            <SubjectChip
              active={subjectSel === "all"}
              onClick={() => setSubjectSel("all")}
            >
              전체
            </SubjectChip>
            {availableSubjects.map((sc) => (
              <SubjectChip
                key={sc}
                active={subjectSel === sc}
                onClick={() => setSubjectSel(sc)}
              >
                {MCQ_PACK_SUBJECT_LABELS[
                  sc as keyof typeof MCQ_PACK_SUBJECT_LABELS
                ] ?? sc}
              </SubjectChip>
            ))}
          </div>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground text-[11px]">보기</span>
          <SubjectChip
            active={viewMode === "recent"}
            onClick={() => setViewMode("recent")}
          >
            회차순
          </SubjectChip>
          <SubjectChip
            active={viewMode === "byPack"}
            onClick={() => setViewMode("byPack")}
          >
            팩별 추이
          </SubjectChip>
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
      ) : viewMode === "byPack" ? (
        <PackTrendView sessions={visible} />
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

// 과목 보기 필터 칩(전체/과목들). 보기 전용 FE 상태. 토큰만 사용(다크 안전).
function SubjectChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

// ── 팩별 추이(같은 팩 반복 응시 정답률 변화) ──────────────────────────────
interface PackGroup {
  packId: string | null;
  packTitle: string | null;
  packKind: string | null;
  packSubjectScope: string | null;
  attempts: OxSessionRow[]; // 오래된 → 최신
  latestKey: string;
}

// 입력은 최신순(loader completed_at desc). 팩별로 묶고 각 그룹은 오래된→최신으로 뒤집는다.
// packId 없는(삭제된) 팩은 묶지 않고 회차별 단독 그룹.
function groupSessionsByPack(sessions: OxSessionRow[]): PackGroup[] {
  const map = new Map<string, OxSessionRow[]>();
  for (const s of sessions) {
    const key = s.packId ?? `__del__:${s.sessionId}`;
    const arr = map.get(key) ?? [];
    arr.push(s);
    map.set(key, arr);
  }
  return [...map.values()]
    .map((arr) => ({
      packId: arr[0].packId,
      packTitle: arr[0].packTitle,
      packKind: arr[0].packKind,
      packSubjectScope: arr[0].packSubjectScope,
      attempts: [...arr].reverse(),
      latestKey: arr[0].completedAt ?? arr[0].startedAt,
    }))
    .sort((a, b) => (a.latestKey < b.latestKey ? 1 : -1));
}

function PackTrendView({ sessions }: { sessions: OxSessionRow[] }) {
  const groups = groupSessionsByPack(sessions);
  return (
    <div className="space-y-2">
      {groups.map((g) => (
        <PackTrendCard key={g.packId ?? g.attempts[0].sessionId} group={g} />
      ))}
    </div>
  );
}

function PackTrendCard({ group }: { group: PackGroup }) {
  const attempts = group.attempts.map((s) => ({
    sessionId: s.sessionId,
    rate: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0,
    date: (s.completedAt ?? s.startedAt).slice(0, 10),
  }));
  const first = attempts[0].rate;
  const latest = attempts[attempts.length - 1].rate;
  const delta = latest - first;
  const multi = attempts.length >= 2;
  return (
    <div className="bg-card rounded-xl border p-3.5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-foreground truncate text-sm font-semibold">
            {group.packTitle ?? "(팩 삭제됨)"}
          </p>
          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            {group.packKind && (
              <Badge variant="outline" className="font-normal">
                {MCQ_PACK_KIND_LABELS[
                  group.packKind as keyof typeof MCQ_PACK_KIND_LABELS
                ] ?? group.packKind}
              </Badge>
            )}
            {group.packSubjectScope && (
              <Badge variant="outline" className="font-normal">
                {MCQ_PACK_SUBJECT_LABELS[
                  group.packSubjectScope as keyof typeof MCQ_PACK_SUBJECT_LABELS
                ] ?? group.packSubjectScope}
              </Badge>
            )}
            <span className="tabular-nums">{attempts.length}회 응시</span>
          </div>
        </div>
        <div className="shrink-0 text-right text-xs tabular-nums">
          {multi ? (
            <span
              className={cn(
                "font-semibold",
                delta > 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : delta < 0
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-muted-foreground",
              )}
            >
              {first}% → {latest}%
              {delta !== 0
                ? ` (${delta > 0 ? "▲" : "▼"}${Math.abs(delta)})`
                : ""}
            </span>
          ) : (
            <span className="text-muted-foreground">최근 {latest}%</span>
          )}
        </div>
      </div>
      <div className="mt-2">
        <Sparkline attempts={attempts} />
      </div>
      {group.packId && group.packTitle ? (
        <Link
          to={`/latest/mcq/${group.packId}/ox-exam`}
          className="text-muted-foreground hover:text-foreground mt-2 inline-flex items-center gap-0.5 text-[11px]"
        >
          <RotateCcwIcon className="size-3" /> 다시 풀기
        </Link>
      ) : null}
    </div>
  );
}

// 정답률 스파크라인 — 막대 높이=정답률, 색=scoreBgTone(성과 SSOT·다크 안전). 막대 클릭=회차 결과.
function Sparkline({
  attempts,
}: {
  attempts: { sessionId: string; rate: number; date: string }[];
}) {
  return (
    <div className="flex h-9 items-end gap-1">
      {attempts.map((a) => (
        <Link
          key={a.sessionId}
          to={`/me/ox-sessions/${a.sessionId}`}
          title={`${a.date} · 정답률 ${a.rate}%`}
          className={cn(
            "w-4 rounded-sm transition-opacity hover:opacity-80",
            scoreBgTone(a.rate),
          )}
          style={{ height: `${Math.max(12, a.rate)}%` }}
        />
      ))}
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
          {s.packId && s.packTitle ? (
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
