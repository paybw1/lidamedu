// 운영자 — 기출문제 ↔ 판례 수동 매칭 (feat-8-024).
// /admin/relations/exam-cases
// 1차 객관식 기출문제 목록 + 연결된 판례. 자동 스캔(scan_exam_case_links)으로
// 미연결된 문제를 사건번호 입력으로 직접 매칭한다.
import type { Route } from "./+types/admin-exam-case-links";

import { ArrowLeftIcon, NetworkIcon, RefreshCwIcon, XIcon } from "lucide-react";
import { Form, Link, data, useSearchParams } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent } from "~/core/components/ui/card";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
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
          1차 객관식 기출문제 지문에 입력된 판례를 자동 스캔으로 연결합니다.
          자동 연결되지 않은 문제는 사건번호를 직접 입력해 매칭하세요.
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
                : "기출문제가 없습니다."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {visible.map((r) => (
            <li
              key={r.problemId}
              className="bg-card rounded-lg border px-4 py-3"
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="text-sm font-semibold tabular-nums">
                  {r.year ? `${r.year}년 ` : ""}1차
                  {r.problemNumber ? ` ${r.problemNumber}번` : ""}
                </span>
                {r.links.length === 0 ? (
                  <Badge
                    variant="outline"
                    className="border-amber-300 text-[10px] text-amber-700"
                  >
                    미연결
                  </Badge>
                ) : null}
              </div>
              <p className="text-muted-foreground mb-2 text-xs leading-relaxed">
                {r.bodySnippet}
              </p>

              <div className="flex flex-wrap items-center gap-1.5">
                {r.links.map((l) => (
                  <span
                    key={l.linkId}
                    className="bg-muted inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]"
                  >
                    <span className="font-mono">{l.caseNumber}</span>
                    <span className="text-muted-foreground">
                      {l.isAuto ? "자동" : "수동"}
                    </span>
                    <Form method="post" className="inline">
                      <input type="hidden" name="intent" value="unlink" />
                      <input type="hidden" name="linkId" value={l.linkId} />
                      <button
                        type="submit"
                        aria-label={`${l.caseNumber} 연결 해제`}
                        className="text-muted-foreground hover:text-rose-600"
                      >
                        <XIcon className="size-3" />
                      </button>
                    </Form>
                  </span>
                ))}

                <Form method="post" className="flex items-center gap-1">
                  <input type="hidden" name="intent" value="link" />
                  <input type="hidden" name="problemId" value={r.problemId} />
                  <input
                    type="text"
                    name="caseNumber"
                    required
                    placeholder="사건번호 (예: 2019후11541)"
                    className="border-input bg-background h-7 w-52 rounded-md border px-2 text-[11px]"
                  />
                  <Button type="submit" size="sm" variant="outline">
                    추가
                  </Button>
                </Form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
