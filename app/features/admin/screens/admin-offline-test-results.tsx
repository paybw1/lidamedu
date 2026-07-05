// feat-7-042 3단계 — 오프라인 테스트 결과 입력 (운영자).
// 그리드: 행=반 학생, 열=문항 번호. 응시로 표시하면 전부 정답 기본 →
// 틀린 문항 번호만 클릭(채점 관행). 저장 시 학습 신호(quiz_session+attempts) 합류.

import { CheckIcon, MonitorIcon, SaveIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, data, useFetcher, useLocation, useNavigate } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { roleAtLeast } from "~/core/lib/roles";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getCohortById, listCohortMembers } from "~/features/cohorts/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { offlineTestSubjectName } from "~/features/offline-tests/labels";
import { getOfflineTestWithQuestions } from "~/features/offline-tests/queries.server";
import {
  getOnlineSessionPrefill,
  listOfflineTestResults,
} from "~/features/offline-tests/results.server";

import type { Route } from "./+types/admin-offline-test-results";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d) return [{ title: "결과 입력 | 리담변리사학원" }];
  return [{ title: `${d.test.title} 결과 입력 | 리담변리사학원` }];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!params.cohortId || !params.assignmentId || !params.testId) {
    throw data("Missing params", { status: 404 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const cohort = await getCohortById(client, params.cohortId);
  if (!cohort) throw data("Cohort not found", { status: 404 });
  if (!roleAtLeast(role, "manager") && cohort.ownerId !== user.id) {
    throw data("본인 소유 반만 접근 가능", { status: 403 });
  }

  const test = await getOfflineTestWithQuestions(client, params.testId);
  if (!test || test.assignmentId !== params.assignmentId) {
    throw data("Test not found", { status: 404 });
  }

  // 온라인 응시 프리필 — 학생 세션 조회라 adminClient(읽기 전용). 위 소유권 게이트 선행.
  const [members, results, onlinePrefill] = await Promise.all([
    listCohortMembers(client, params.cohortId),
    listOfflineTestResults(client, params.testId),
    getOnlineSessionPrefill(adminClient, params.testId),
  ]);

  // KST 오늘 — 응시일 기본값.
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today = `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;

  return {
    cohort,
    test,
    role,
    members: members
      .filter((m) => m.role === "student")
      .map((m) => ({ profileId: m.profileId, name: m.name })),
    results,
    onlinePrefill,
    today,
  };
}

function accuracyTone(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 60) return "text-lime-600 dark:text-lime-400";
  if (pct >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

// 저장된 결과 기준 테스트 통계 — 평균·최고/최저·미응시 + 문항별 정답률(변별 낮은 문항 식별).
function TestStatsBlock({
  ords,
  maxScore,
  results,
}: {
  ords: number[];
  maxScore: number;
  results: Array<{
    status: "taken" | "absent";
    score: number | null;
    wrongOrds: number[];
  }>;
}) {
  const taken = results.filter((r) => r.status === "taken" && r.score !== null);
  if (taken.length === 0) return null;
  const scores = taken.map((r) => r.score as number);
  const avg = Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10;
  const absent = results.filter((r) => r.status === "absent").length;
  const wrongCountByOrd = new Map<number, number>();
  for (const r of taken) {
    for (const o of r.wrongOrds) {
      wrongCountByOrd.set(o, (wrongCountByOrd.get(o) ?? 0) + 1);
    }
  }
  return (
    <div className="border-border bg-card mb-4 rounded-xl border shadow-sm">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 border-b px-4 py-2.5 text-xs">
        <span>
          응시{" "}
          <strong className="tabular-nums">{taken.length}</strong>명
          {absent > 0 ? (
            <span className="text-muted-foreground"> · 미응시 {absent}명</span>
          ) : null}
        </span>
        <span>
          평균{" "}
          <strong className={cn("tabular-nums", accuracyTone(maxScore > 0 ? Math.round((avg / maxScore) * 100) : null))}>
            {avg}
          </strong>
          <span className="text-muted-foreground">/{maxScore}</span>
        </span>
        <span className="text-muted-foreground tabular-nums">
          최고 {Math.max(...scores)} · 최저 {Math.min(...scores)}
        </span>
      </div>
      <div className="px-4 py-2.5">
        <p className="text-muted-foreground mb-1.5 text-[10px] font-semibold tracking-wide uppercase">
          문항별 정답률
        </p>
        <div className="flex flex-wrap gap-1">
          {ords.map((o) => {
            const wrong = wrongCountByOrd.get(o) ?? 0;
            const pct = Math.round(((taken.length - wrong) / taken.length) * 100);
            return (
              <span
                key={o}
                title={`${o + 1}번 — 정답률 ${pct}% (오답 ${wrong}명)`}
                className={cn(
                  "inline-flex h-6 min-w-10 items-center justify-center gap-0.5 rounded border px-1 text-[10px] tabular-nums",
                  accuracyTone(pct),
                )}
              >
                <span className="text-muted-foreground">{o + 1}.</span>
                {pct}%
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type RowStatus = "none" | "taken" | "absent";

interface RowState {
  status: RowStatus;
  wrong: Set<number>;
  // 온라인 응시 결과에서 불러온 행 — 저장 시 스냅샷만 기록(시도 재기록 없음).
  onlineSessionId?: string | null;
}

export default function AdminOfflineTestResults({
  loaderData,
}: Route.ComponentProps) {
  const { cohort, test, role, members, results, onlinePrefill, today } =
    loaderData;
  const basePath = `/admin/cohorts/${cohort.cohortId}/assignments/${test.assignmentId}`;
  const navigate = useNavigate();
  const location = useLocation();
  const fetcher = useFetcher<{
    ok?: true;
    saved?: number;
    absent?: number;
    error?: string;
  }>();

  const ords = test.questions.map((q) => q.ord);
  const pointsByOrd = useMemo(
    () => new Map(test.questions.map((q) => [q.ord, q.points] as const)),
    [test.questions],
  );
  const maxScore = test.questions.reduce((s, q) => s + q.points, 0);

  const [takenAt, setTakenAt] = useState(
    results.find((r) => r.takenAt)?.takenAt ?? today,
  );
  const [rows, setRows] = useState<Map<string, RowState>>(() => {
    const m = new Map<string, RowState>();
    const byUser = new Map(results.map((r) => [r.userId, r]));
    for (const member of members) {
      const r = byUser.get(member.profileId);
      m.set(member.profileId, {
        status: r ? (r.status as RowStatus) : "none",
        wrong: new Set(r?.wrongOrds ?? []),
      });
    }
    return m;
  });

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "ok" in fetcher.data && fetcher.data.ok) {
      navigate(location.pathname, { replace: true, preventScrollReset: true });
    }
  }, [fetcher.state, fetcher.data, navigate, location.pathname]);

  const setRow = (userId: string, next: RowState) =>
    setRows((prev) => new Map(prev).set(userId, next));

  const markAllTaken = () =>
    setRows((prev) => {
      const next = new Map(prev);
      for (const [uid, r] of next) {
        if (r.status === "none") next.set(uid, { ...r, status: "taken" });
      }
      return next;
    });

  // 온라인 응시 결과를 그리드에 반영 — 반 학생인 세션만.
  const memberIdSet = useMemo(
    () => new Set(members.map((m) => m.profileId)),
    [members],
  );
  const applicablePrefill = onlinePrefill.filter((p) => memberIdSet.has(p.userId));
  const applyOnlinePrefill = () =>
    setRows((prev) => {
      const next = new Map(prev);
      for (const p of applicablePrefill) {
        next.set(p.userId, {
          status: "taken",
          wrong: new Set(p.wrongOrds),
          onlineSessionId: p.sessionId,
        });
      }
      return next;
    });

  const entryCount = [...rows.values()].filter((r) => r.status !== "none").length;

  const save = () => {
    const entries = members
      .map((m) => {
        const r = rows.get(m.profileId);
        if (!r || r.status === "none") return null;
        return {
          userId: m.profileId,
          status: r.status,
          wrongOrds: r.status === "taken" ? [...r.wrong].sort((a, b) => a - b) : [],
          ...(r.status === "taken" && r.onlineSessionId
            ? { onlineSessionId: r.onlineSessionId }
            : {}),
        };
      })
      .filter(Boolean);
    if (entries.length === 0) return;
    if (
      !confirm(
        `${entries.length}명의 결과를 저장하시겠습니까?\n응시자는 문항별 정오가 학생 학습 기록(약점 진단·통계)에 반영됩니다.`,
      )
    ) {
      return;
    }
    const fd = new FormData();
    fd.set("intent", "save_results");
    fd.set("testId", test.testId);
    fd.set("takenAt", takenAt);
    fd.set("entries", JSON.stringify(entries));
    fetcher.submit(fd, { method: "post", action: "/api/admin/offline-test" });
  };

  return (
    <AdminShell
      cluster="cohorts"
      role={role}
      width={1200}
      title={`${test.title} — 결과 입력`}
      desc={`${offlineTestSubjectName(test)} · ${test.questions.length}문항 · ${maxScore}점 만점 · 학생 ${members.length}명`}
      headerRight={
        <div className="flex items-center gap-2">
          <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
            응시일
            <Input
              type="date"
              value={takenAt}
              onChange={(e) => setTakenAt(e.target.value)}
              className="h-8 w-36 text-xs tabular-nums"
            />
          </label>
          <Button
            size="sm"
            onClick={save}
            disabled={entryCount === 0 || fetcher.state !== "idle"}
          >
            <SaveIcon className="size-3.5" /> {entryCount}명 저장
          </Button>
        </div>
      }
    >
      <Link
        to={`${basePath}/tests/${test.testId}`}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-xs"
      >
        ← 시험지 빌더로
      </Link>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={markAllTaken}>
          <CheckIcon className="size-3.5" /> 미입력 전원 응시로 표시
        </Button>
        {applicablePrefill.length > 0 ? (
          <Button size="sm" variant="outline" onClick={applyOnlinePrefill}>
            <MonitorIcon className="size-3.5" /> 온라인 응시 불러오기 (
            {applicablePrefill.length}명)
          </Button>
        ) : null}
        <p className="text-muted-foreground text-xs">
          응시로 표시하면 <strong>전부 정답</strong>이 기본입니다 — 틀린 문항
          번호만 클릭하세요. 저장 시 문항별 정오가 학생의 학습 기록에
          합류합니다(재저장 시 덮어씀). 온라인 응시분은 이미 기록된 학생
          세션을 그대로 연결해 점수만 확정합니다.
        </p>
      </div>

      {fetcher.data && "error" in fetcher.data && fetcher.data.error ? (
        <p className="mb-3 text-xs text-rose-600">{fetcher.data.error}</p>
      ) : null}
      {fetcher.data && fetcher.data.ok ? (
        <p className="mb-3 text-xs text-emerald-700 dark:text-emerald-400">
          ✓ 저장됨 — 응시 {fetcher.data.saved ?? 0}명 · 미응시{" "}
          {fetcher.data.absent ?? 0}명
        </p>
      ) : null}

      {/* 4단계 — 저장된 결과 기준 테스트 통계 */}
      <TestStatsBlock ords={ords} maxScore={maxScore} results={results} />


      {test.questions.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed py-10 text-center text-sm">
          문항이 없습니다. 빌더에서 문항을 먼저 추가하세요.
        </p>
      ) : members.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed py-10 text-center text-sm">
          이 반에 학생이 없습니다.
        </p>
      ) : (
        <div className="border-border bg-card overflow-x-auto rounded-xl border shadow-sm">
          <table className="w-full min-w-[720px] border-collapse text-xs">
            <thead>
              <tr className="border-border border-b text-left">
                <th className="sticky left-0 z-10 bg-card px-3 py-2 font-semibold">
                  학생
                </th>
                <th className="px-2 py-2 font-semibold">상태</th>
                <th className="px-2 py-2 font-semibold">
                  오답 문항 (클릭)
                </th>
                <th className="px-3 py-2 text-right font-semibold">점수</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {members.map((m) => {
                const r = rows.get(m.profileId) ?? {
                  status: "none" as RowStatus,
                  wrong: new Set<number>(),
                };
                const score =
                  r.status === "taken"
                    ? ords.reduce(
                        (s, o) =>
                          s + (r.wrong.has(o) ? 0 : (pointsByOrd.get(o) ?? 0)),
                        0,
                      )
                    : null;
                return (
                  <tr key={m.profileId} className={cn(r.status === "none" && "opacity-60")}>
                    <td className="sticky left-0 z-10 bg-card px-3 py-2 font-medium whitespace-nowrap">
                      {m.name}
                    </td>
                    <td className="px-2 py-2">
                      <select
                        value={r.status}
                        onChange={(e) =>
                          setRow(m.profileId, {
                            ...r,
                            status: e.target.value as RowStatus,
                          })
                        }
                        className={cn(
                          "border-input h-7 rounded-md border px-1.5 text-xs",
                          r.status === "taken"
                            ? "bg-emerald-50 dark:bg-emerald-950/30"
                            : r.status === "absent"
                              ? "bg-muted"
                              : "bg-background",
                        )}
                      >
                        <option value="none">미입력</option>
                        <option value="taken">응시</option>
                        <option value="absent">미응시</option>
                      </select>
                      {r.onlineSessionId ? (
                        <span className="text-link ml-1.5 align-middle text-[10px] font-semibold">
                          온라인
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">
                      {r.status === "taken" ? (
                        <div className="flex flex-wrap gap-1">
                          {ords.map((o) => {
                            const wrong = r.wrong.has(o);
                            return (
                              <button
                                key={o}
                                type="button"
                                onClick={() => {
                                  const next = new Set(r.wrong);
                                  if (wrong) next.delete(o);
                                  else next.add(o);
                                  setRow(m.profileId, { ...r, wrong: next });
                                }}
                                title={`${o + 1}번 ${wrong ? "오답 → 정답으로" : "정답 → 오답으로"}`}
                                className={cn(
                                  "size-6 rounded border text-[10px] font-bold tabular-nums transition-colors",
                                  wrong
                                    ? "border-rose-500 bg-rose-500 text-white"
                                    : "border-border text-muted-foreground hover:border-rose-300",
                                )}
                              >
                                {o + 1}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">
                          {r.status === "absent" ? "미응시" : "—"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums whitespace-nowrap">
                      {score !== null ? (
                        <>
                          {score}
                          <span className="text-muted-foreground font-normal">
                            /{maxScore}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
