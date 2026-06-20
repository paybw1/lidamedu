// 운영자 — 기출문제 ↔ 판례 수동 매칭 (feat-8-024). P5/P6 패턴.
// /admin/relations/exam-cases
// 1차 객관식 기출문제 목록 + 연결된 판례. 자동 스캔(scan_exam_case_links)으로
// 미연결된 문제를 사건번호 입력으로 직접 매칭한다.
import type { Route } from "./+types/admin-exam-case-links";

import { ExternalLinkIcon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Form,
  Link,
  data,
  useFetcher,
  useSearchParams,
} from "react-router";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { ExamCaseRow } from "~/features/admin/components/exam-case-row";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip } from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import { extractCaseNumber } from "~/features/problems/extract";
import { listExamCaseLinkRows } from "~/features/problems/queries.server";
import {
  FIRST_EXAM_LAW_SLUGS,
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

export const meta: Route.MetaFunction = () => [
  { title: "기출문제 판례 매칭 | Lidam Patent Attorney Academy" },
];

// 사건번호 토큰 — "대법원 2019. 5. 9. 선고 2019후11541 판결" 같은 입력에서도 추출.
const CASE_NUMBER_RE = /[0-9]{2,4}[가-힣]+[0-9]+/;

function resolveLawCode(raw: string | null): LawSubjectSlug {
  if (raw && (LAW_SUBJECT_SLUGS as readonly string[]).includes(raw)) {
    return raw as LawSubjectSlug;
  }
  return "patent";
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const lawCode = resolveLawCode(url.searchParams.get("subject"));
  const rows = await listExamCaseLinkRows(client, lawCode);
  return { lawCode, rows, role };
}

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  if (intent === "rescan") {
    const { data: count, error } = await client.rpc("scan_exam_case_links");
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true, message: `재스캔 완료 — 새 연결 ${count ?? 0}건` });
  }

  if (intent === "unlink") {
    const linkId = String(fd.get("linkId") ?? "");
    if (!linkId) return data({ error: "linkId 누락" }, { status: 400 });
    const { error } = await client
      .from("problem_case_links")
      .delete()
      .eq("link_id", linkId);
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true, message: "연결을 해제했습니다" });
  }

  if (intent === "link") {
    const problemId = String(fd.get("problemId") ?? "");
    const token = String(fd.get("caseNumber") ?? "").match(CASE_NUMBER_RE)?.[0];
    if (!problemId || !token) {
      return data(
        { error: "사건번호를 인식할 수 없습니다 (예: 2019후11541)" },
        { status: 400 },
      );
    }
    const { data: caseRow } = await client
      .from("cases")
      .select("case_id")
      .eq("case_number", token)
      .is("deleted_at", null)
      .maybeSingle();
    if (!caseRow) {
      return data(
        { error: `판례 ${token} 를 판례 DB 에서 찾을 수 없습니다` },
        { status: 400 },
      );
    }
    const { error } = await client.from("problem_case_links").upsert(
      {
        problem_id: problemId,
        case_id: caseRow.case_id,
        relation_type: "cited",
        created_by: user.id,
      },
      {
        onConflict: "problem_id,case_id,relation_type",
        ignoreDuplicates: true,
      },
    );
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true, message: `판례 ${token} 를 연결했습니다` });
  }

  // 미연결 문제의 해설 인라인 수정 (feat-8-024).
  // 해설(explanation_md)을 저장하고, 해설에서 사건번호를 추출해
  // related_case_number 를 갱신한 뒤 그 번호로 판례를 자동 재연결한다.
  if (intent === "edit-explanation") {
    const problemId = String(fd.get("problemId") ?? "");
    const segmentKind = String(fd.get("segmentKind") ?? "");
    const segmentId = String(fd.get("segmentId") ?? "");
    const explanationMd = String(fd.get("explanationMd") ?? "").trim();
    if (!problemId || !segmentId) {
      return data({ error: "필수 값이 누락되었습니다" }, { status: 400 });
    }
    if (segmentKind !== "choice" && segmentKind !== "box") {
      return data({ error: "잘못된 지문 종류입니다" }, { status: 400 });
    }

    // 해설에서 사건번호(판례 인용) 추출 — 인식되면 related_case_number 도 갱신.
    const citation = extractCaseNumber(explanationMd);
    const patch: {
      explanation_md: string | null;
      related_case_number?: string;
    } = { explanation_md: explanationMd || null };
    if (citation) patch.related_case_number = citation;

    let updateError: string | null = null;
    if (segmentKind === "choice") {
      const { error } = await client
        .from("problem_choices")
        .update(patch)
        .eq("choice_id", segmentId)
        .eq("problem_id", problemId);
      updateError = error?.message ?? null;
    } else {
      const { error } = await client
        .from("problem_box_items")
        .update(patch)
        .eq("box_item_id", segmentId)
        .eq("problem_id", problemId);
      updateError = error?.message ?? null;
    }
    if (updateError) return data({ error: updateError }, { status: 400 });

    if (!citation) {
      return data({
        ok: true,
        message:
          "해설을 저장했습니다. 사건번호를 인식하지 못했습니다 — 해설에 판례 인용을 보강하거나 아래에서 사건번호를 직접 입력하세요.",
      });
    }

    const token = citation.match(CASE_NUMBER_RE)?.[0];
    if (!token) {
      return data({
        ok: true,
        message: `해설을 저장했습니다. "${citation}" 에서 사건번호를 추출하지 못했습니다.`,
      });
    }
    const { data: caseRow } = await client
      .from("cases")
      .select("case_id")
      .eq("case_number", token)
      .is("deleted_at", null)
      .maybeSingle();
    if (!caseRow) {
      return data({
        ok: true,
        message: `해설을 저장했습니다. 사건번호 ${token} 는 판례 DB 에서 찾을 수 없어 연결되지 않았습니다.`,
      });
    }
    const { error: linkError } = await client
      .from("problem_case_links")
      .upsert(
        {
          problem_id: problemId,
          case_id: caseRow.case_id,
          relation_type: "cited",
          created_by: user.id,
        },
        {
          onConflict: "problem_id,case_id,relation_type",
          ignoreDuplicates: true,
        },
      );
    if (linkError) return data({ error: linkError.message }, { status: 400 });
    return data({
      ok: true,
      message: `해설을 저장하고 판례 ${token} 를 연결했습니다`,
    });
  }

  return data({ error: `알 수 없는 intent: ${intent}` }, { status: 400 });
}

export default function AdminExamCaseLinks({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { lawCode, rows, role } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();
  const unlinkedOnly = searchParams.get("unlinked") === "1";

  const visible = unlinkedOnly ? rows.filter((r) => r.links.length === 0) : rows;
  const linkedCount = rows.filter((r) => r.links.length > 0).length;
  const unlinkedCount = rows.length - linkedCount;

  const actionError =
    actionData && "error" in actionData ? actionData.error : null;
  const actionMessage =
    actionData && "ok" in actionData ? actionData.message : null;

  function patchParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setSearchParams(next);
  }

  return (
    <AdminShell
      cluster="relations"
      role={role}
      title="기출문제 판례 매칭"
      desc="판례형 지문(선택지·박스 항목)이 있는 1차 객관식 기출문제만 표시합니다. 지문에 입력된 판례는 자동 스캔으로 연결되며, 자동 연결되지 않은 문제는 사건번호를 직접 입력해 매칭하세요."
      headerRight={
        <Form method="post">
          <input type="hidden" name="intent" value="rescan" />
          <Button type="submit" size="sm" variant="outline">
            <RefreshCwIcon className="size-3.5" /> 전체 재스캔
          </Button>
        </Form>
      }
    >
      {/* 필터 바 */}
      <div className="border-border bg-card mb-4 flex flex-wrap items-center gap-2 rounded-xl border p-3 shadow-sm">
        <label className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-[11px] font-semibold">
            과목
          </span>
          <select
            value={lawCode}
            onChange={(e) => patchParam("subject", e.target.value)}
            aria-label="과목"
            className="border-input bg-background focus:border-primary h-9 rounded-md border px-3 text-[13px] outline-none"
          >
            {FIRST_EXAM_LAW_SLUGS.map((s) => (
              <option key={s} value={s}>
                {LAW_SUBJECTS[s].name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-end gap-2 self-end">
          <Button
            type="button"
            size="sm"
            variant={unlinkedOnly ? "default" : "outline"}
            onClick={() => patchParam("unlinked", unlinkedOnly ? null : "1")}
          >
            미연결만
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Chip tone="emerald">연결 {linkedCount}</Chip>
          {unlinkedCount > 0 ? (
            <Chip tone="amber">미연결 {unlinkedCount}</Chip>
          ) : null}
          <span className="text-muted-foreground tabular-nums text-xs">
            / {rows.length}건
          </span>
        </div>
      </div>

      {/* 판례 빠른 검색 — 사건번호를 모를 때 검색해서 복사. 결과의 사건번호를
          클릭하면 클립보드에 복사되어, 아래 각 문제 row 의 "사건번호" 입력란에
          paste 해 매칭한다. */}
      <CaseSearchBox lawCode={lawCode} />

      {/* 액션 피드백 */}
      {actionError ? (
        <p className="mb-3 text-xs text-rose-600">{actionError}</p>
      ) : null}
      {actionMessage ? (
        <p className="mb-3 text-xs text-emerald-600">{actionMessage}</p>
      ) : null}

      {/* 목록 */}
      {visible.length === 0 ? (
        <div className="border-border bg-card rounded-xl border py-16 text-center shadow-sm">
          <p className="text-muted-foreground text-sm">
            {unlinkedOnly
              ? "미연결 기출문제가 없습니다."
              : "판례형 지문이 있는 기출문제가 없습니다."}
          </p>
          {unlinkedOnly ? (
            <button
              type="button"
              onClick={() => patchParam("unlinked", null)}
              className="text-link mt-2 text-xs underline-offset-2 hover:underline"
            >
              전체 보기
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((r) => (
            <ExamCaseRow key={r.problemId} row={r} />
          ))}
        </ul>
      )}
    </AdminShell>
  );
}

// 사건번호 추출(검색 결과 secondary 에서) — admin-exam-case-links action 동일 규칙.
const SEARCH_CASE_NUMBER_RE = /[0-9]{2,4}[가-힣]+[0-9]+/;

interface CaseSearchItem {
  id: string;
  label: string;
  secondary?: string;
}

// 운영자가 매칭할 사건번호를 모를 때 — 사건명·사건번호 일부로 검색해 후보를
// 본다. 사건번호 칩 클릭 시 클립보드 복사, 외부링크 아이콘으로 판례 viewer
// 새창. 매칭은 아래 각 row 의 "사건번호" 입력란에 paste 후 [추가] 버튼.
//
// 검색 API: /api/admin/search-content?kind=case&q=... (이미 존재, LIMIT 20).
// 디바운스 300ms — 빠른 타이핑 중 매 stroke 마다 쿼리 발사 방지.
function CaseSearchBox({ lawCode }: { lawCode: LawSubjectSlug }) {
  const fetcher = useFetcher<{ items: CaseSearchItem[] }>();
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) return;
    const tid = setTimeout(() => {
      fetcher.load(
        `/api/admin/search-content?kind=case&q=${encodeURIComponent(t)}`,
      );
    }, 300);
    return () => clearTimeout(tid);
    // fetcher 는 의존성에서 의도적으로 제외 — 매 렌더마다 새 참조라 무한루프.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function copyToken(token: string) {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(token);
      setTimeout(() => setCopied((c) => (c === token ? null : c)), 1500);
    } catch {
      // 클립보드 권한 없으면 무시 — 사건번호는 secondary 에 그대로 보임.
    }
  }

  const items = fetcher.data?.items ?? [];
  const busy = fetcher.state !== "idle";
  const hasQuery = q.trim().length >= 2;

  return (
    <div className="border-border bg-card mb-4 rounded-xl border p-3 shadow-sm">
      <div className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-muted-foreground text-[11px] font-semibold">
            판례 빠른 검색 — 사건명 또는 사건번호 일부 (사건번호 클릭 시 복사)
          </span>
          <div className="relative">
            <SearchIcon className="text-muted-foreground absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="예: 2019후, 신규성, 진보성"
              className="border-input bg-background focus:border-primary h-9 w-full rounded-md border pl-8 pr-3 text-[13px] outline-none"
            />
          </div>
        </label>
        {busy ? (
          <span className="text-muted-foreground self-end pb-2.5 text-[11px]">
            검색 중…
          </span>
        ) : null}
      </div>

      {hasQuery && !busy && items.length === 0 ? (
        <p className="text-muted-foreground mt-2 text-[11px]">
          검색 결과가 없습니다.
        </p>
      ) : null}

      {items.length > 0 ? (
        <ul className="mt-2 max-h-72 space-y-1 overflow-auto">
          {items.map((it) => {
            const token = it.secondary?.match(SEARCH_CASE_NUMBER_RE)?.[0];
            return (
              <li
                key={it.id}
                className="bg-background flex items-start gap-2 rounded-md border px-2 py-1.5 text-[12px]"
              >
                {token ? (
                  <button
                    type="button"
                    onClick={() => copyToken(token)}
                    title="사건번호 복사"
                    className={cn(
                      "inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-mono text-[11px] font-bold transition-colors",
                      copied === token
                        ? "bg-emerald-500 text-white"
                        : "bg-muted hover:bg-muted/70 text-foreground",
                    )}
                  >
                    {copied === token ? "복사됨" : token}
                  </button>
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="text-foreground line-clamp-2">{it.label}</p>
                  {it.secondary ? (
                    <p className="text-muted-foreground truncate text-[11px]">
                      {it.secondary}
                    </p>
                  ) : null}
                </div>
                <Link
                  to={`/subjects/${lawCode}/cases/${it.id}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="판례 새 창으로 열기"
                  className="text-muted-foreground hover:text-foreground self-center"
                >
                  <ExternalLinkIcon className="size-3.5" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
