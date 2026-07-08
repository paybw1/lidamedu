// feat-7-042 — 오프라인 테스트 빌더 (운영자).
// 좌: 문항 후보 탐색(유형·파트·중요도 필터 + 자동 추출) / 우: 담긴 문항(순서·배점).

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ClipboardListIcon,
  PencilIcon,
  PlusIcon,
  PrinterIcon,
  Trash2Icon,
  WandSparklesIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Form,
  Link,
  data,
  useFetcher,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import makeServerClient from "~/core/lib/supa-client.server";
import { roleAtLeast } from "~/core/lib/roles";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip } from "~/features/admin/components/admin-ui";
import { getCohortById } from "~/features/cohorts/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  OFFLINE_QUESTION_TYPE_LABEL,
  offlineTestSubjectName,
  type BlankCandidate,
  type McqCandidate,
  type OfflineQuestionRef,
  type OfflineQuestionType,
  type OfflineTestQuestion,
  type OxCandidate,
} from "~/features/offline-tests/labels";
import {
  getOfflineTestWithQuestions,
  listBlankCandidates,
  listMcqCandidates,
  listOxCandidates,
  listScienceMcqCandidates,
} from "~/features/offline-tests/queries.server";
import {
  listSeries,
  type SeriesSummary,
} from "~/features/offline-tests/series.server";

import type { Route } from "./+types/admin-offline-test-edit";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d || !d.test) return [{ title: "오프라인 테스트 | 리담변리사학원" }];
  return [{ title: `${d.test.title} | 리담변리사학원` }];
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

  // 후보 탐색 필터 (URL) — type/node/imp. 자연과학은 객관식 고정 + 파트=단원.
  const isScience = !!test.scienceSubject;
  const url = new URL(request.url);
  const type = isScience
    ? "mcq"
    : ((["mcq", "ox", "blank"] as const).find(
        (t) => t === url.searchParams.get("type"),
      ) ?? "mcq");
  const nodeId = url.searchParams.get("node") || null;
  const minImportance = Math.max(
    0,
    Math.min(3, Number(url.searchParams.get("imp")) || 0),
  );

  let mcqCands: Awaited<ReturnType<typeof listMcqCandidates>> = [];
  let oxCands: Awaited<ReturnType<typeof listOxCandidates>> = [];
  let blankCands: Awaited<ReturnType<typeof listBlankCandidates>> = [];
  if (isScience && test.scienceSubject) {
    mcqCands = await listScienceMcqCandidates(client, {
      scienceSubject: test.scienceSubject,
      sectionId: nodeId,
      limit: 80,
    });
  } else if (test.lawCode) {
    const filter = { lawCode: test.lawCode, nodeId, minImportance, limit: 80 };
    [mcqCands, oxCands, blankCands] = await Promise.all([
      type === "mcq" ? listMcqCandidates(client, filter) : Promise.resolve([]),
      type === "ox" ? listOxCandidates(client, filter) : Promise.resolve([]),
      type === "blank" ? listBlankCandidates(client, filter) : Promise.resolve([]),
    ]);
  }

  // 파트 옵션 — 법률=체계도 노드 / 자연과학=단원(science_sections). 라벨만 경량 조회.
  let nodes: Array<{ nodeId: string; label: string; depth: number }> = [];
  if (isScience && test.scienceSubject) {
    const { data: sections } = await client
      .from("science_sections")
      .select("section_id, label, order_index")
      .eq("science_subject", test.scienceSubject)
      .order("order_index");
    nodes = (sections ?? []).map((s) => ({
      nodeId: s.section_id,
      label: s.label,
      depth: 1,
    }));
  } else if (test.lawCode) {
    const { data: rows } = await client
      .from("systematic_nodes")
      .select("node_id, display_label, path")
      .eq("law_code", test.lawCode)
      .eq("case_only", false)
      .order("path");
    nodes = (rows ?? []).map((n) => ({
      nodeId: n.node_id,
      label: n.display_label,
      depth: String(n.path ?? "").split(".").length,
    }));
  }

  const series = await listSeries(client, test.cohortId);

  return {
    cohort,
    test,
    role,
    isScience,
    filter: { type, nodeId, minImportance },
    mcqCands,
    oxCands,
    blankCands,
    nodes,
    series,
  };
}

// ★안정 identity 필수 — 이 함수를 성공 useEffect deps([fetcher.data, reload])에 쓰는데,
// 매 렌더 새 함수를 반환하면 성공 후에도 fetcher.data.ok 가 계속 참이라 effect 가 무한
// 재실행(navigate+setState 루프)돼 화면이 멈춘다. useCallback([]) + ref 로 identity 고정.
function useReload() {
  const navigate = useNavigate();
  const location = useLocation();
  const ref = useRef<() => void>(() => {});
  ref.current = () =>
    navigate(location.pathname + location.search, {
      replace: true,
      preventScrollReset: true,
    });
  return useCallback(() => ref.current(), []);
}

const API = "/api/admin/offline-test";

export default function AdminOfflineTestEdit({
  loaderData,
}: Route.ComponentProps) {
  const {
    cohort,
    test,
    role,
    isScience,
    filter,
    mcqCands,
    oxCands,
    blankCands,
    nodes,
    series,
  } = loaderData;
  const basePath = `/admin/cohorts/${cohort.cohortId}/assignments/${test.assignmentId}`;
  const totalPoints = test.questions.reduce((s, q) => s + q.points, 0);

  return (
    <AdminShell
      cluster="cohorts"
      role={role}
      width={1100}
      title={test.title}
      desc={`${offlineTestSubjectName(test)} · ${test.questions.length}문항 · ${totalPoints}점${test.durationMin ? ` · ${test.durationMin}분` : ""}`}
      headerRight={
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to={`${basePath}/tests/${test.testId}/print`} target="_blank">
              <PrinterIcon className="size-3.5" /> 문제지
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link
              to={`${basePath}/tests/${test.testId}/print?answers=1`}
              target="_blank"
            >
              <PrinterIcon className="size-3.5" /> 정답·해설지
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to={`${basePath}/tests/${test.testId}/results`}>
              결과 입력
            </Link>
          </Button>
        </div>
      }
    >
      <Link
        to={basePath}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-xs"
      >
        ← 과제로
      </Link>

      <div className="flex flex-wrap items-start gap-2">
        <TestMetaForm
          testId={test.testId}
          title={test.title}
          durationMin={test.durationMin}
          instructionsMd={test.instructionsMd}
        />
        <SeriesForm
          testId={test.testId}
          cohortId={cohort.cohortId}
          seriesId={test.seriesId}
          seriesRoundNo={test.seriesRoundNo}
          series={series}
        />
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
        {/* 좌: 후보 탐색 */}
        <section className="border-border bg-card rounded-xl border shadow-sm">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-bold tracking-tight">문항 후보</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              유형·파트·중요도로 후보를 찾아 시험지에 담습니다.
            </p>
          </div>
          <CandidateFilter filter={filter} nodes={nodes} isScience={isScience} />
          <CandidatePanel
            testId={test.testId}
            type={filter.type}
            mcqCands={mcqCands}
            oxCands={oxCands}
            blankCands={blankCands}
          />
          <AutoPickForm testId={test.testId} filter={filter} />
        </section>

        {/* 우: 담긴 문항 */}
        <section className="border-border bg-card rounded-xl border shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h2 className="text-sm font-bold tracking-tight">
                시험지 문항{" "}
                <span className="text-muted-foreground font-normal">
                  ({test.questions.length})
                </span>
              </h2>
              <p className="text-muted-foreground mt-0.5 text-xs">
                합계 <span className="font-semibold tabular-nums">{totalPoints}</span>점
              </p>
            </div>
          </div>
          {test.questions.length === 0 ? (
            <div className="py-12 text-center">
              <ClipboardListIcon className="text-muted-foreground mx-auto mb-2 size-6 opacity-40" />
              <p className="text-muted-foreground text-xs">
                왼쪽에서 문항을 추가하세요.
              </p>
            </div>
          ) : (
            <ul className="divide-border divide-y">
              {test.questions.map((q, i) => (
                <QuestionRow
                  key={q.questionId}
                  testId={test.testId}
                  q={q}
                  isFirst={i === 0}
                  isLast={i === test.questions.length - 1}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </AdminShell>
  );
}

function TestMetaForm({
  testId,
  title,
  durationMin,
  instructionsMd,
}: {
  testId: string;
  title: string;
  durationMin: number | null;
  instructionsMd: string | null;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const reload = useReload();
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "ok" in fetcher.data && fetcher.data.ok) {
      setEditing(false);
      reload();
    }
  }, [fetcher.state, fetcher.data, reload]);

  if (!editing) {
    return (
      <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
        <PencilIcon className="size-3.5" /> 시험 정보 편집
      </Button>
    );
  }
  return (
    <fetcher.Form
      method="post"
      action={API}
      className="bg-card mt-2 space-y-3 rounded-xl border p-4 shadow-sm"
    >
      <input type="hidden" name="intent" value="update_test" />
      <input type="hidden" name="testId" value={testId} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px]">
        <div>
          <Label className="text-muted-foreground text-[11px]">시험명</Label>
          <Input name="title" defaultValue={title} required maxLength={200} className="mt-1 h-8 text-xs" />
        </div>
        <div>
          <Label className="text-muted-foreground text-[11px]">시험시간(분)</Label>
          <Input
            name="durationMin"
            type="number"
            min={1}
            max={600}
            defaultValue={durationMin ?? ""}
            className="mt-1 h-8 text-xs tabular-nums"
          />
        </div>
      </div>
      <div>
        <Label className="text-muted-foreground text-[11px]">
          응시 안내 (시험지 머리말에 인쇄)
        </Label>
        <textarea
          name="instructionsMd"
          defaultValue={instructionsMd ?? ""}
          rows={2}
          maxLength={2000}
          className="border-input bg-background mt-1 w-full rounded-md border px-2 py-1 text-xs"
        />
      </div>
      {fetcher.data && "error" in fetcher.data ? (
        <p className="text-xs text-rose-600">{fetcher.data.error}</p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
          <XIcon className="size-3.5" /> 취소
        </Button>
        <Button type="submit" size="sm" disabled={fetcher.state !== "idle"}>
          저장
        </Button>
      </div>
    </fetcher.Form>
  );
}

// feat-7-044 — 시리즈(주간 테스트 묶음) 지정. 시리즈에 넣어야 성적 추이에 잡힌다.
function SeriesForm({
  testId,
  cohortId,
  seriesId,
  seriesRoundNo,
  series,
}: {
  testId: string;
  cohortId: string;
  seriesId: string | null;
  seriesRoundNo: number | null;
  series: SeriesSummary[];
}) {
  const assignFetcher = useFetcher<{ ok?: true; error?: string }>();
  const createFetcher = useFetcher<{ ok?: true; seriesId?: string; error?: string }>();
  const reload = useReload();
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (
      assignFetcher.state === "idle" &&
      assignFetcher.data &&
      "ok" in assignFetcher.data &&
      assignFetcher.data.ok
    ) {
      reload();
    }
  }, [assignFetcher.state, assignFetcher.data, reload]);
  // 새 시리즈 생성 → 이 테스트를 바로 그 시리즈에 연결.
  useEffect(() => {
    if (
      createFetcher.state === "idle" &&
      createFetcher.data &&
      "ok" in createFetcher.data &&
      createFetcher.data.ok &&
      createFetcher.data.seriesId
    ) {
      setCreating(false);
      const fd = new FormData();
      fd.set("intent", "set_series");
      fd.set("testId", testId);
      fd.set("seriesId", createFetcher.data.seriesId);
      assignFetcher.submit(fd, { method: "post", action: API });
    }
    // assignFetcher 는 안정 참조가 아니므로 의존성에서 제외해도 안전(제출 1회 목적).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createFetcher.state, createFetcher.data, testId]);

  const current = series.find((s) => s.seriesId === seriesId);

  return (
    <div className="border-border bg-muted/30 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2">
      <span className="text-muted-foreground text-[11px] font-semibold">
        시리즈
      </span>
      {current ? (
        <span className="text-xs font-medium">
          {current.title}
          {seriesRoundNo ? (
            <span className="text-link ml-1 tabular-nums">{seriesRoundNo}회차</span>
          ) : null}
        </span>
      ) : (
        <span className="text-muted-foreground text-xs">
          미지정 — 시리즈에 넣으면 회차별 성적 추이에 집계됩니다.
        </span>
      )}
      <assignFetcher.Form method="post" action={API} className="flex items-center gap-1.5">
        <input type="hidden" name="intent" value="set_series" />
        <input type="hidden" name="testId" value={testId} />
        <select
          name="seriesId"
          defaultValue={seriesId ?? ""}
          className="border-input bg-background h-7 rounded-md border px-1.5 text-[11px]"
        >
          <option value="">시리즈 없음</option>
          {series.map((s) => (
            <option key={s.seriesId} value={s.seriesId}>
              {s.title} ({s.testCount})
            </option>
          ))}
        </select>
        <Input
          name="roundNo"
          type="number"
          min={1}
          max={999}
          defaultValue={seriesRoundNo ?? ""}
          placeholder="회차(자동)"
          className="h-7 w-20 text-[11px] tabular-nums"
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          className="h-7 text-[11px]"
          disabled={assignFetcher.state !== "idle"}
        >
          지정
        </Button>
      </assignFetcher.Form>
      {creating ? (
        <createFetcher.Form method="post" action={API} className="flex items-center gap-1.5">
          <input type="hidden" name="intent" value="create_series" />
          <input type="hidden" name="cohortId" value={cohortId} />
          <Input
            name="title"
            required
            maxLength={200}
            placeholder="예: 주간 테스트"
            className="h-7 w-36 text-[11px]"
          />
          <Button
            type="submit"
            size="sm"
            className="h-7 text-[11px]"
            disabled={createFetcher.state !== "idle"}
          >
            만들기
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-[11px]"
            onClick={() => setCreating(false)}
          >
            취소
          </Button>
        </createFetcher.Form>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-[11px]"
          onClick={() => setCreating(true)}
        >
          + 새 시리즈
        </Button>
      )}
      {assignFetcher.data && "error" in assignFetcher.data && assignFetcher.data.error ? (
        <p className="w-full text-[11px] text-rose-600">{assignFetcher.data.error}</p>
      ) : null}
      {createFetcher.data && "error" in createFetcher.data && createFetcher.data.error ? (
        <p className="w-full text-[11px] text-rose-600">{createFetcher.data.error}</p>
      ) : null}
    </div>
  );
}

function CandidateFilter({
  filter,
  nodes,
  isScience,
}: {
  filter: { type: OfflineQuestionType; nodeId: string | null; minImportance: number };
  nodes: Array<{ nodeId: string; label: string; depth: number }>;
  isScience: boolean;
}) {
  return (
    <Form method="get" preventScrollReset className="flex flex-wrap items-end gap-2 border-b px-4 py-3">
      <div className="flex flex-col gap-1">
        <Label className="text-[11px]">유형</Label>
        <select
          name="type"
          defaultValue={filter.type}
          disabled={isScience}
          title={isScience ? "자연과학은 객관식만 지원합니다" : undefined}
          className="border-input bg-background h-8 rounded-md border px-2 text-xs disabled:opacity-60"
        >
          {(isScience ? (["mcq"] as const) : (["mcq", "ox", "blank"] as const)).map(
            (t) => (
              <option key={t} value={t}>
                {OFFLINE_QUESTION_TYPE_LABEL[t]}
              </option>
            ),
          )}
        </select>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <Label className="text-[11px]">{isScience ? "단원" : "파트(체계도)"}</Label>
        <select
          name="node"
          defaultValue={filter.nodeId ?? ""}
          className="border-input bg-background h-8 max-w-56 rounded-md border px-2 text-xs"
        >
          <option value="">전체</option>
          {nodes.map((n) => (
            <option key={n.nodeId} value={n.nodeId}>
              {" ".repeat(Math.max(0, n.depth - 1) * 2)}
              {n.label}
            </option>
          ))}
        </select>
      </div>
      {isScience ? null : (
        <div className="flex flex-col gap-1">
          <Label className="text-[11px]">중요도</Label>
          <select
            name="imp"
            defaultValue={String(filter.minImportance)}
            className="border-input bg-background h-8 rounded-md border px-2 text-xs"
          >
            <option value="0">전체</option>
            <option value="1">★ 이상</option>
            <option value="2">★★ 이상</option>
            <option value="3">★★★</option>
          </select>
        </div>
      )}
      <Button type="submit" size="sm" variant="outline">
        조회
      </Button>
    </Form>
  );
}

function CandidatePanel({
  testId,
  type,
  mcqCands,
  oxCands,
  blankCands,
}: {
  testId: string;
  type: OfflineQuestionType;
  mcqCands: McqCandidate[];
  oxCands: OxCandidate[];
  blankCands: BlankCandidate[];
}) {
  const fetcher = useFetcher<{ ok?: true; added?: number; error?: string }>();
  const reload = useReload();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [searchParams] = useSearchParams();
  // 필터가 바뀌면 선택 초기화.
  useEffect(() => {
    setChecked(new Set());
  }, [searchParams]);
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "ok" in fetcher.data && fetcher.data.ok) {
      setChecked(new Set());
      reload();
    }
  }, [fetcher.state, fetcher.data, reload]);

  const items: Array<{ key: string; ref: OfflineQuestionRef; label: string; sub: string }> =
    type === "mcq"
      ? mcqCands.map((c) => ({
          key: `mcq:${c.problemId}`,
          ref: { questionType: "mcq", problemId: c.problemId },
          label: c.snippet,
          sub: `${c.year ? `${c.year}년` : "기타"}${c.problemNumber ? ` ${c.problemNumber}번` : ""} · ${"★".repeat(c.importance) || "—"}`,
        }))
      : type === "ox"
        ? oxCands.map((c) => ({
            key: `ox:${c.refType}:${c.refId}`,
            ref: {
              questionType: "ox",
              oxRefType: c.refType,
              oxRefId: c.refId,
              oxProblemId: c.problemId,
            },
            label: c.snippet,
            sub: `정답 ${c.oxTruth}${c.year ? ` · ${c.year}년` : ""} · ${"★".repeat(c.importance) || "—"}`,
          }))
        : blankCands.map((c) => ({
            key: `blank:${c.setId}`,
            ref: { questionType: "blank", blankSetId: c.setId },
            label: `${c.articleLabel}${c.displayName ? ` — ${c.displayName}` : ""}`,
            sub: `빈칸 ${c.blanksCount}개 · 조문 ${"★".repeat(c.articleImportance) || "—"}`,
          }));

  const toggle = (key: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const addSelected = () => {
    const refs = items.filter((it) => checked.has(it.key)).map((it) => it.ref);
    if (refs.length === 0) return;
    const fd = new FormData();
    fd.set("intent", "add_questions");
    fd.set("testId", testId);
    fd.set("refs", JSON.stringify(refs));
    fetcher.submit(fd, { method: "post", action: API });
  };

  return (
    <div>
      <div className="max-h-96 divide-y overflow-y-auto">
        {items.length === 0 ? (
          <p className="text-muted-foreground px-4 py-8 text-center text-xs">
            조건에 맞는 후보가 없습니다.
          </p>
        ) : (
          items.map((it) => (
            <label
              key={it.key}
              className="hover:bg-muted/40 flex cursor-pointer items-start gap-2.5 px-4 py-2.5"
            >
              <input
                type="checkbox"
                checked={checked.has(it.key)}
                onChange={() => toggle(it.key)}
                className="accent-primary mt-0.5 size-3.5"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs leading-snug">{it.label}</span>
                <span className="text-muted-foreground text-[10px]">{it.sub}</span>
              </span>
            </label>
          ))
        )}
      </div>
      <div className="flex items-center justify-between border-t px-4 py-2.5">
        <p className="text-muted-foreground text-[11px] tabular-nums">
          {checked.size}개 선택 · 후보 {items.length}
        </p>
        <Button
          size="sm"
          onClick={addSelected}
          disabled={checked.size === 0 || fetcher.state !== "idle"}
        >
          <PlusIcon className="size-3.5" /> 선택 추가
        </Button>
      </div>
      {fetcher.data && "error" in fetcher.data && fetcher.data.error ? (
        <p className="px-4 pb-2 text-xs text-rose-600">{fetcher.data.error}</p>
      ) : null}
    </div>
  );
}

function AutoPickForm({
  testId,
  filter,
}: {
  testId: string;
  filter: { type: OfflineQuestionType; nodeId: string | null; minImportance: number };
}) {
  const fetcher = useFetcher<{ ok?: true; added?: number; error?: string }>();
  const reload = useReload();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "ok" in fetcher.data && fetcher.data.ok) {
      reload();
    }
  }, [fetcher.state, fetcher.data, reload]);
  return (
    <fetcher.Form
      method="post"
      action={API}
      className="bg-muted/30 flex flex-wrap items-center gap-2 border-t px-4 py-3"
    >
      <input type="hidden" name="intent" value="auto_pick" />
      <input type="hidden" name="testId" value={testId} />
      <input type="hidden" name="type" value={filter.type} />
      <input type="hidden" name="nodeId" value={filter.nodeId ?? ""} />
      <input type="hidden" name="minImportance" value={filter.minImportance} />
      <WandSparklesIcon className="text-muted-foreground size-3.5" />
      <span className="text-xs">현재 조건에서</span>
      <Input
        name="n"
        type="number"
        min={1}
        max={50}
        defaultValue={10}
        className="h-8 w-16 text-xs tabular-nums"
      />
      <span className="text-xs">문항 자동 추출 (중요도 우선)</span>
      <Button type="submit" size="sm" variant="outline" disabled={fetcher.state !== "idle"}>
        추가
      </Button>
      {fetcher.data && "error" in fetcher.data && fetcher.data.error ? (
        <p className="w-full text-xs text-rose-600">{fetcher.data.error}</p>
      ) : null}
      {fetcher.data && fetcher.data.ok && fetcher.data.added !== undefined ? (
        <p className="w-full text-xs text-emerald-700 dark:text-emerald-400">
          ✓ {fetcher.data.added}문항 추가됨
        </p>
      ) : null}
    </fetcher.Form>
  );
}

function QuestionRow({
  testId,
  q,
  isFirst,
  isLast,
}: {
  testId: string;
  q: OfflineTestQuestion;
  isFirst: boolean;
  isLast: boolean;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const reload = useReload();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "ok" in fetcher.data && fetcher.data.ok) {
      reload();
    }
  }, [fetcher.state, fetcher.data, reload]);
  const busy = fetcher.state !== "idle";
  const post = (fields: Record<string, string>) => {
    const fd = new FormData();
    fd.set("testId", testId);
    fd.set("questionId", q.questionId);
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    fetcher.submit(fd, { method: "post", action: API });
  };

  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <span className="text-muted-foreground w-6 text-center text-xs tabular-nums">
        {q.ord + 1}
      </span>
      <Chip tone="outline">{OFFLINE_QUESTION_TYPE_LABEL[q.questionType]}</Chip>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs">{q.label}</p>
        {q.sub ? (
          <p className="text-muted-foreground text-[10px]">{q.sub}</p>
        ) : null}
      </div>
      {/* 배점 */}
      <input
        type="number"
        min={0.5}
        max={100}
        step={0.5}
        defaultValue={q.points}
        onBlur={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v !== q.points) {
            post({ intent: "set_points", points: String(v) });
          }
        }}
        className="border-input bg-background h-7 w-16 rounded-md border px-1.5 text-right text-xs tabular-nums"
        title="배점"
        disabled={busy}
      />
      <span className="text-muted-foreground text-[10px]">점</span>
      <div className="flex items-center">
        <Button
          size="icon"
          variant="ghost"
          className="size-6"
          disabled={busy || isFirst}
          onClick={() => post({ intent: "move_question", dir: "up" })}
        >
          <ArrowUpIcon className="size-3" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-6"
          disabled={busy || isLast}
          onClick={() => post({ intent: "move_question", dir: "down" })}
        >
          <ArrowDownIcon className="size-3" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-6 text-rose-600 hover:text-rose-700"
          disabled={busy}
          onClick={() => {
            if (confirm("이 문항을 시험지에서 제거하시겠습니까?")) {
              post({ intent: "remove_question" });
            }
          }}
        >
          <Trash2Icon className="size-3" />
        </Button>
      </div>
    </li>
  );
}
