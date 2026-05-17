// 운영자 — 기출문제 ↔ 판례 수동 매칭 (feat-8-024).
// /admin/relations/exam-cases
// 1차 객관식 기출문제 목록 + 연결된 판례. 자동 스캔(scan_exam_case_links)으로
// 미연결된 문제를 사건번호 입력으로 직접 매칭한다.
import type { Route } from "./+types/admin-exam-case-links";

import { ArrowLeftIcon, NetworkIcon, RefreshCwIcon } from "lucide-react";
import { Form, Link, data, useSearchParams } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent } from "~/core/components/ui/card";
import makeServerClient from "~/core/lib/supa-client.server";
import { ExamCaseRow } from "~/features/admin/components/exam-case-row";
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
  return { lawCode, rows };
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
  const { lawCode, rows } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();
  const unlinkedOnly = searchParams.get("unlinked") === "1";

  const visible = unlinkedOnly
    ? rows.filter((r) => r.links.length === 0)
    : rows;
  const linkedCount = rows.filter((r) => r.links.length > 0).length;

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
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <Link
        to="/admin"
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ArrowLeftIcon className="size-3" /> 운영자
      </Link>
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <NetworkIcon className="size-3.5" /> 운영자
        </p>
        <h1 className="text-2xl font-bold tracking-tight">
          기출문제 판례 매칭
        </h1>
        <p className="text-muted-foreground text-sm">
          판례형 지문(선택지·박스 항목)이 있는 1차 객관식 기출문제만 표시합니다.
          지문에 입력된 판례는 자동 스캔으로 연결되며, 자동 연결되지 않은 문제는
          사건번호를 직접 입력해 매칭하세요.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={lawCode}
          onChange={(e) => patchParam("subject", e.target.value)}
          className="border-input bg-background h-8 rounded-md border px-2 text-xs"
          aria-label="과목"
        >
          {FIRST_EXAM_LAW_SLUGS.map((s) => (
            <option key={s} value={s}>
              {LAW_SUBJECTS[s].name}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          variant={unlinkedOnly ? "default" : "outline"}
          onClick={() => patchParam("unlinked", unlinkedOnly ? null : "1")}
        >
          미연결만
        </Button>
        <span className="text-muted-foreground text-xs">
          {linkedCount} / {rows.length} 문제 연결됨
        </span>
        <Form method="post" className="ml-auto">
          <input type="hidden" name="intent" value="rescan" />
          <Button type="submit" size="sm" variant="outline">
            <RefreshCwIcon className="size-3.5" /> 전체 재스캔
          </Button>
        </Form>
      </div>

      {actionError ? (
        <p className="mb-3 text-xs text-rose-600">{actionError}</p>
      ) : null}
      {actionMessage ? (
        <p className="mb-3 text-xs text-emerald-600">{actionMessage}</p>
      ) : null}

      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground text-sm">
              {unlinkedOnly
                ? "미연결 기출문제가 없습니다."
                : "판례형 지문이 있는 기출문제가 없습니다."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {visible.map((r) => (
            <ExamCaseRow key={r.problemId} row={r} />
          ))}
        </ul>
      )}
    </div>
  );
}
