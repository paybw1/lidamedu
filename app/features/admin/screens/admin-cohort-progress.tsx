// 반 학생 진도 모니터링 (feat-7-010). staff 가 자기 반 학생들 학습 활동 한 화면.
// 컬럼: 이름·이메일·문제풀이·정답률·조문 열람·빈칸·최근 활동.

import {
  AlertTriangleIcon,
  ArrowRightIcon,
  ClockIcon,
  ListChecksIcon,
  UsersIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, data } from "react-router";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { getCohortById } from "~/features/cohorts/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  listCohortProgressSummary,
  type CohortMemberProgress,
} from "~/features/admin/queries/student-progress.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  Bar,
  Chip,
  IndexTable,
  TD,
  TR,
} from "~/features/admin/components/admin-ui";

import type { Route } from "./+types/admin-cohort-progress";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d || !d.cohort) return [{ title: "반 진도 | Lidam Patent Attorney Academy" }];
  return [{ title: `${d.cohort.name} 진도 | Lidam Patent Attorney Academy` }];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!params.cohortId) throw data("Missing cohortId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const cohort = await getCohortById(client, params.cohortId);
  if (!cohort) throw data("Cohort not found", { status: 404 });
  if (role !== "admin" && cohort.ownerId !== user.id) {
    throw data("본인 소유 반만 조회 가능", { status: 403 });
  }

  const members = await listCohortProgressSummary(params.cohortId);
  return { cohort, members, role };
}

function accuracyTone(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 60) return "text-lime-600 dark:text-lime-400";
  if (pct >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function formatLast(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const day = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (day === 0) return "오늘";
  if (day === 1) return "어제";
  if (day < 7) return `${day}일 전`;
  if (day < 30) return `${Math.floor(day / 7)}주 전`;
  return iso.slice(0, 10);
}

type SortKey = "default" | "accuracy_asc" | "attempts_desc" | "recent_desc" | "inactive_first";

function inactiveDays(iso: string | null): number {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default function AdminCohortProgress({
  loaderData,
}: Route.ComponentProps) {
  const { cohort, members, role } = loaderData;

  const [sortKey, setSortKey] = useState<SortKey>("default");
  const sortedMembers = useMemo(() => {
    const arr = [...members];
    switch (sortKey) {
      case "accuracy_asc":
        return arr.sort((a, b) => {
          const aPct = a.accuracyPct ?? 200;
          const bPct = b.accuracyPct ?? 200;
          return aPct - bPct;
        });
      case "attempts_desc":
        return arr.sort((a, b) => b.problemsAttempted - a.problemsAttempted);
      case "recent_desc":
        return arr.sort(
          (a, b) =>
            (b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0) -
            (a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0),
        );
      case "inactive_first":
        return arr.sort(
          (a, b) => inactiveDays(b.lastActivityAt) - inactiveDays(a.lastActivityAt),
        );
      default:
        return arr;
    }
  }, [members, sortKey]);

  const totalAttempts = members.reduce((s, m) => s + m.problemsAttempted, 0);
  const totalArticles = members.reduce((s, m) => s + m.articlesViewed, 0);
  const activeCount = members.filter((m) => m.lastActivityAt !== null).length;
  const inactiveCount = members.filter(
    (m) => inactiveDays(m.lastActivityAt) >= 7,
  ).length;
  const lowAccuracyCount = members.filter(
    (m) => m.accuracyPct !== null && m.accuracyPct < 40 && m.problemsAttempted >= 5,
  ).length;
  const avgAccuracy = (() => {
    const withData = members.filter((m) => m.accuracyPct !== null);
    if (withData.length === 0) return null;
    const sum = withData.reduce((s, m) => s + (m.accuracyPct ?? 0), 0);
    return Math.round(sum / withData.length);
  })();

  return (
    <AdminShell
      cluster="cohorts"
      role={role}
      title={`${cohort.name} — 학생 진도`}
      desc={`반 멤버 ${members.length}명 · 학습 활동 있음 ${activeCount}명`}
      headerRight={
        <Button asChild size="sm" variant="outline">
          <Link to={`/admin/cohorts/${cohort.cohortId}/stats`}>
            전체 통계 <ArrowRightIcon className="size-3" />
          </Link>
        </Button>
      }
    >
      {/* KPI 요약 카드 */}
      <div className="mb-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="활동 중 학생" value={`${activeCount}`} hint={`/ 전체 ${members.length}명`} />
        <KpiCard label="총 문제 풀이" value={totalAttempts.toLocaleString("ko-KR")} hint="멤버 합산" />
        <KpiCard
          label="평균 정답률"
          value={avgAccuracy !== null ? `${avgAccuracy}%` : "—"}
          hint="학생별 평균"
          tone={avgAccuracy === null ? "default" : avgAccuracy >= 60 ? "emerald" : avgAccuracy >= 40 ? "warn" : "danger"}
        />
        <KpiCard label="조문 열람" value={totalArticles.toLocaleString("ko-KR")} hint="멤버 합산" />
        <KpiCard
          label="비활성 (7일+)"
          value={`${inactiveCount}`}
          hint="최근 활동 없는 학생"
          tone={inactiveCount > 0 ? "warn" : "default"}
        />
        <KpiCard
          label="저성과 (<40%)"
          value={`${lowAccuracyCount}`}
          hint="문제 5개+ + 정답률 40% 미만"
          tone={lowAccuracyCount > 0 ? "danger" : "default"}
        />
      </div>

      {/* 정렬 칩 */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground font-medium">정렬:</span>
        {(
          [
            { key: "default", label: "가입순" },
            { key: "accuracy_asc", label: "정답률 낮은 순" },
            { key: "attempts_desc", label: "풀이량 많은 순" },
            { key: "recent_desc", label: "최근 활동순" },
            { key: "inactive_first", label: "비활성 먼저" },
          ] as Array<{ key: SortKey; label: string }>
        ).map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSortKey(s.key)}
            className={cn(
              "border-input rounded-full border px-2.5 py-0.5 transition-colors",
              sortKey === s.key
                ? "bg-primary text-primary-foreground border-primary"
                : "hover:bg-muted",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {members.length === 0 ? (
        <div className="border-border bg-card flex flex-col items-center gap-2 rounded-xl border py-16 text-center shadow-sm">
          <UsersIcon className="text-muted-foreground/40 size-10" />
          <p className="text-muted-foreground text-sm">
            반에 멤버가 없습니다. 먼저 학생을 추가하세요.
          </p>
          <Button asChild size="sm" variant="outline" className="mt-2">
            <Link to={`/admin/cohorts/${cohort.cohortId}`}>
              <UsersIcon className="size-3.5" /> 멤버 관리
            </Link>
          </Button>
        </div>
      ) : (
        <IndexTable
          minWidth={780}
          headers={[
            { label: "No", align: "center", width: "3rem" },
            { label: "학생" },
            { label: "문제 풀이", align: "right", width: "7rem" },
            { label: "정답률", align: "right", width: "9rem" },
            { label: "조문 열람", align: "right", width: "6rem" },
            { label: "빈칸", align: "right", width: "7rem" },
            { label: "메모/즐겨/하이", align: "right", width: "7rem" },
            { label: "최근 활동", align: "right", width: "6rem" },
            { label: "", align: "right", width: "5rem" },
          ]}
          footer={
            <div className="border-border/60 text-muted-foreground border-t px-3 py-2 text-[11px] font-medium tabular-nums">
              총 {members.length}명
            </div>
          }
        >
          {sortedMembers.map((m, i) => (
            <ProgressRow
              key={m.profileId}
              member={m}
              index={i + 1}
              cohortId={cohort.cohortId}
            />
          ))}
        </IndexTable>
      )}
    </AdminShell>
  );
}

function ProgressRow({
  member: m,
  index,
  cohortId: _cohortId,
}: {
  member: CohortMemberProgress;
  index: number;
  cohortId: string;
}) {
  const isLowPerformer =
    m.problemsAttempted >= 5 && m.accuracyPct !== null && m.accuracyPct < 40;
  const isInactive = inactiveDays(m.lastActivityAt) >= 7;

  return (
    <TR>
      <TD align="center" soft mono>
        {index}
      </TD>
      <TD>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{m.name || "(이름 없음)"}</span>
          {isLowPerformer ? (
            <Chip tone="coral">저성과</Chip>
          ) : null}
          {isInactive ? (
            <Chip tone="amber">비활성</Chip>
          ) : null}
        </div>
        {m.email ? (
          <p className="text-muted-foreground text-xs">{m.email}</p>
        ) : null}
      </TD>
      <TD align="right" mono>
        {m.problemsAttempted > 0 ? (
          <>
            {m.problemsCorrect}
            <span className="text-muted-foreground">/{m.problemsAttempted}</span>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TD>
      <TD align="right">
        {m.accuracyPct !== null ? (
          <div className="flex items-center justify-end gap-2">
            <Bar value={m.accuracyPct} tone="auto" className="w-14" />
            <span className={cn("font-mono text-[12px] font-bold tabular-nums", accuracyTone(m.accuracyPct))}>
              {m.accuracyPct}%
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TD>
      <TD align="right" mono soft>
        {m.articlesViewed > 0 ? m.articlesViewed : "—"}
      </TD>
      <TD align="right" mono>
        {m.blanksAttempts > 0 ? (
          <span className={cn(accuracyTone(m.blanksAccuracyPct))}>
            {m.blanksAccuracyPct !== null ? `${m.blanksAccuracyPct}%` : "—"}
            <span className="text-muted-foreground ml-1 font-normal">
              ({m.blanksAttempts})
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TD>
      <TD align="right" soft>
        {m.memos + m.bookmarks + m.highlights === 0 ? (
          "—"
        ) : (
          <span
            title={`메모 ${m.memos} · 즐겨찾기 ${m.bookmarks} · 하이라이트 ${m.highlights}`}
          >
            {m.memos}
            <span className="text-muted-foreground/60"> · </span>
            {m.bookmarks}
            <span className="text-muted-foreground/60"> · </span>
            {m.highlights}
          </span>
        )}
      </TD>
      <TD align="right" soft>
        <span className="inline-flex items-center gap-1">
          <ClockIcon className="size-3" />
          {formatLast(m.lastActivityAt)}
        </span>
      </TD>
      <TD align="right">
        <Link
          to={`/admin/students/${m.profileId}`}
          viewTransition
          className="text-primary inline-flex items-center gap-1 text-xs font-semibold hover:underline"
        >
          상세 <ArrowRightIcon className="size-3" />
        </Link>
      </TD>
    </TR>
  );
}

function KpiCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "warn" | "danger" | "emerald";
}) {
  const valueClass =
    tone === "danger"
      ? "text-rose-600 dark:text-rose-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "emerald"
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-foreground";
  return (
    <div className="border-border bg-card rounded-xl border p-4 shadow-sm">
      <p className="text-muted-foreground inline-flex items-center gap-1 font-mono text-[11px] font-semibold tracking-[0.06em] uppercase">
        {tone === "danger" || tone === "warn" ? (
          <AlertTriangleIcon className="size-3" />
        ) : (
          <ListChecksIcon className="size-3" />
        )}
        {label}
      </p>
      <p className={cn("mt-2 text-2xl font-extrabold tracking-tight tabular-nums", valueClass)}>
        {value}
      </p>
      <p className="text-muted-foreground mt-0.5 text-[11px]">{hint}</p>
    </div>
  );
}
