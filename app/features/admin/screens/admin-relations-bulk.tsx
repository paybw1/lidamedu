// 운영자 — 조문 ↔ 판례 연관관계 일괄 편집 (feat-7-008). P5 WORKSPACE 패턴.
// /admin/relations/bulk
// TSV/CSV paste → 검증(존재 여부) → apply.
// 문제 ↔ 판례 매칭은 feat-8-024 로 분리됨 — /admin/relations/exam-cases 사용.
import type { Route } from "./+types/admin-relations-bulk";

import {
  CheckCircle2Icon,
  CircleSlashIcon,
  Link2Icon,
  ListChecksIcon,
} from "lucide-react";
import { useState } from "react";
import { Link, data, redirect, useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Textarea } from "~/core/components/ui/textarea";
import makeServerClient from "~/core/lib/supa-client.server";
import { logAuditEvent } from "~/features/admin/queries/audit-log.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, Field } from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  FIRST_EXAM_LAW_SLUGS,
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
  SECOND_EXAM_LAW_SLUGS,
} from "~/features/subjects/lib/subjects";

export const meta: Route.MetaFunction = () => [
  { title: "조문·판례 일괄 편집 | Lidam Patent Attorney Academy" },
];

interface RowResult {
  raw: string;
  status: "ok" | "skipped" | "error";
  message: string;
  payload?: Record<string, string>;
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });
  return { role };
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
  const intent = String(fd.get("intent") ?? "preview");
  const lawCodeRaw = String(fd.get("lawCode") ?? "patent");
  const lawCode = (
    (LAW_SUBJECT_SLUGS as readonly string[]).includes(lawCodeRaw)
      ? lawCodeRaw
      : "patent"
  ) as LawSubjectSlug;
  const text = String(fd.get("text") ?? "");

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  const results: RowResult[] = [];

  // 행 포맷: "<case_number>\t<article_number>" (탭/쉼표/2칸 구분). 같은 law 의 article 만 매핑.
  const { data: lawRow } = await client
    .from("laws")
    .select("law_id")
    .eq("law_code", lawCode)
    .maybeSingle();
  if (!lawRow) {
    return data({ error: "법령 정보 없음" }, { status: 400 });
  }

  // 한번에 모든 case_number / article_number lookup.
  const caseNums = new Set<string>();
  const articleNums = new Set<string>();
  const parsed: { caseNumber: string; articleNumber: string }[] = [];
  for (const line of lines) {
    const parts = line
      .split(/[\t,]+|\s{2,}/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length < 2) {
      results.push({ raw: line, status: "error", message: "필드 부족" });
      continue;
    }
    const caseNumber = parts[0];
    const articleNumber = parts[1];
    parsed.push({ caseNumber, articleNumber });
    caseNums.add(caseNumber);
    articleNums.add(articleNumber);
  }

  const { data: caseRows } = await client
    .from("cases")
    .select("case_id, case_number")
    .in("case_number", [...caseNums])
    .is("deleted_at", null);
  const caseByNumber = new Map(
    (caseRows ?? []).map((r) => [r.case_number, r.case_id]),
  );

  const { data: artRows } = await client
    .from("articles")
    .select("article_id, article_number")
    .eq("law_id", lawRow.law_id)
    .in("article_number", [...articleNums])
    .is("deleted_at", null);
  const articleByNumber = new Map(
    (artRows ?? []).flatMap((r) =>
      r.article_number ? [[r.article_number, r.article_id] as const] : [],
    ),
  );

  // 기존 매핑 — duplicate skip.
  const candidatePairs = parsed
    .map((p) => ({
      caseId: caseByNumber.get(p.caseNumber),
      articleId: articleByNumber.get(p.articleNumber),
      raw: p,
    }))
    .filter((p) => p.caseId && p.articleId);
  let existing = new Set<string>();
  if (candidatePairs.length > 0) {
    const { data: dups } = await client
      .from("article_case_links")
      .select("article_id, case_id")
      .in(
        "case_id",
        candidatePairs.map((p) => p.caseId as string),
      );
    existing = new Set((dups ?? []).map((r) => `${r.article_id}:${r.case_id}`));
  }

  const toInsert: { article_id: string; case_id: string }[] = [];
  for (const p of parsed) {
    const caseId = caseByNumber.get(p.caseNumber);
    const articleId = articleByNumber.get(p.articleNumber);
    const raw = `${p.caseNumber} → ${p.articleNumber}`;
    if (!caseId) {
      results.push({ raw, status: "error", message: "case_number 미존재" });
      continue;
    }
    if (!articleId) {
      results.push({ raw, status: "error", message: "article_number 미존재" });
      continue;
    }
    const key = `${articleId}:${caseId}`;
    if (existing.has(key)) {
      results.push({ raw, status: "skipped", message: "이미 매핑됨" });
      continue;
    }
    existing.add(key);
    toInsert.push({ article_id: articleId, case_id: caseId });
    results.push({
      raw,
      status: "ok",
      message: "추가 예정",
      payload: { article_id: articleId, case_id: caseId },
    });
  }

  if (intent === "apply" && toInsert.length > 0) {
    const rows = toInsert.map((r) => ({
      article_id: r.article_id,
      case_id: r.case_id,
      relation_type: "cites" as const,
      created_by: user.id,
    }));
    const { error: insErr } = await client
      .from("article_case_links")
      .insert(rows);
    if (insErr) return data({ error: insErr.message }, { status: 400 });
  }

  if (intent === "apply") {
    const okCount = results.filter((r) => r.status === "ok").length;
    void logAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "relation.bulk.article_case",
      entityType: "relation_bulk",
      entityId: "article_case",
      metadata: {
        ok: okCount,
        skipped: results.filter((r) => r.status === "skipped").length,
        error: results.filter((r) => r.status === "error").length,
        lawCode,
      },
    });
    return redirect(`/admin/relations/bulk?applied=${okCount}`);
  }
  return data({ results });
}

export default function AdminRelationsBulk({
  loaderData,
}: Route.ComponentProps) {
  const { role } = loaderData;
  const [lawCode, setLawCode] = useState<LawSubjectSlug>("patent");
  const [text, setText] = useState("");
  const fetcher = useFetcher<{ results?: RowResult[]; error?: string }>();
  const preview = (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    fd.set("intent", "preview");
    fd.set("lawCode", lawCode);
    fd.set("text", text);
    fetcher.submit(fd, { method: "post", action: "/admin/relations/bulk" });
  };
  const results =
    fetcher.data && "results" in fetcher.data ? fetcher.data.results : null;
  const err =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;
  const okCount = results?.filter((r) => r.status === "ok").length ?? 0;
  const skipCount = results?.filter((r) => r.status === "skipped").length ?? 0;
  const errCount = results?.filter((r) => r.status === "error").length ?? 0;

  return (
    <AdminShell
      cluster="relations"
      role={role}
      title="조문·판례 일괄 편집"
      desc={
        <>
          조문 ↔ 판례 매핑을 TSV/CSV 로 붙여넣어 한번에 등록합니다. 먼저 검증으로 결과를
          확인한 뒤 적용하세요. 문제 ↔ 판례 매칭은{" "}
          <Link to="/admin/relations/exam-cases" className="text-link underline">
            기출문제 판례 매칭
          </Link>{" "}
          화면을 이용하세요.
        </>
      }
      width={960}
    >
      {/* 입력 패널 */}
      <div className="border-border bg-card mb-4 overflow-hidden rounded-xl border shadow-sm">
        <div className="border-border bg-muted/60 flex items-center gap-2 border-b px-4 py-3">
          <Link2Icon className="text-link size-4" />
          <span className="text-sm font-semibold">매핑 데이터 입력</span>
        </div>
        <div className="p-4">
          <form onSubmit={preview} className="space-y-4">
            <Field label="조문이 속한 법" htmlFor="bulk-law-select">
              <select
                id="bulk-law-select"
                value={lawCode}
                onChange={(e) => setLawCode(e.target.value as LawSubjectSlug)}
                className="border-input bg-background focus:border-primary h-9 rounded-md border px-3 text-[13px] outline-none"
              >
                <optgroup label="1차 · 객관식">
                  {FIRST_EXAM_LAW_SLUGS.map((s) => (
                    <option key={s} value={s}>
                      {LAW_SUBJECTS[s].name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="2차 · 주관식">
                  {SECOND_EXAM_LAW_SLUGS.map((s) => (
                    <option key={s} value={s}>
                      {LAW_SUBJECTS[s].name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </Field>

            <Field
              label="매핑 데이터"
              htmlFor="bulk-textarea"
              hint="한 줄에 한 매핑 — 사건번호와 조문번호를 탭 또는 쉼표로 구분. 예: 2014후1234, 29"
            >
              <Textarea
                id="bulk-textarea"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={10}
                placeholder={"2014후1234\t29\n2015도567\t30\n# 주석 줄"}
                data-testid="bulk-text"
                className="font-mono text-[13px]"
              />
            </Field>

            {err ? <p className="text-xs text-rose-600">{err}</p> : null}

            <div className="flex items-center justify-end gap-2">
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={!text.trim() || fetcher.state !== "idle"}
                data-testid="bulk-preview"
              >
                검증
              </Button>
              {results && okCount > 0 ? (
                <fetcher.Form method="post" action="/admin/relations/bulk">
                  <input type="hidden" name="intent" value="apply" />
                  <input type="hidden" name="lawCode" value={lawCode} />
                  <input type="hidden" name="text" value={text} />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={fetcher.state !== "idle"}
                    onClick={(e) => {
                      if (
                        !confirm(`${okCount}건을 매핑합니다. 진행하시겠습니까?`)
                      ) {
                        e.preventDefault();
                      }
                    }}
                    data-testid="bulk-apply"
                  >
                    {okCount}건 적용
                  </Button>
                </fetcher.Form>
              ) : null}
            </div>
          </form>
        </div>
      </div>

      {/* 검증 결과 */}
      {results ? (
        <div className="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
          <div className="border-border bg-muted/60 flex items-center gap-3 border-b px-4 py-3">
            <span className="text-sm font-semibold">검증 결과</span>
            <Chip tone="emerald">추가 {okCount}</Chip>
            {skipCount > 0 ? <Chip tone="neutral">중복 {skipCount}</Chip> : null}
            {errCount > 0 ? <Chip tone="coral">오류 {errCount}</Chip> : null}
          </div>
          <ul className="divide-border divide-y" data-testid="bulk-results">
            {results.map((r, i) => (
              <li key={i} className="flex items-center gap-2.5 px-4 py-2.5">
                {r.status === "ok" ? (
                  <CheckCircle2Icon className="size-3.5 shrink-0 text-emerald-600" />
                ) : r.status === "skipped" ? (
                  <ListChecksIcon className="text-muted-foreground size-3.5 shrink-0" />
                ) : (
                  <CircleSlashIcon className="size-3.5 shrink-0 text-rose-600" />
                )}
                <span className="flex-1 font-mono text-[13px] tabular-nums">
                  {r.raw}
                </span>
                <Chip
                  tone={
                    r.status === "ok"
                      ? "emerald"
                      : r.status === "error"
                        ? "coral"
                        : "neutral"
                  }
                >
                  {r.message}
                </Chip>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </AdminShell>
  );
}
