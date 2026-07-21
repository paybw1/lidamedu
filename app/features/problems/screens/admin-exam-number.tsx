// 기출 시험번호(exam_number) 매칭 도구 — 식별번호(P-코드)로 문제를 찾아 실제 시험 문항번호를
//   지정/정정한다. 자동 매칭(색인·발문 대조)이 놓치거나 어긋난 건을 운영자가 직접 교정하는 화면.
//   staff 전용. exam_number 는 problem_number(노드 순번)와 별개 축([[problem-exam-number]]).
import { useEffect } from "react";

import { SearchIcon } from "lucide-react";
import { Form, data, useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip } from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import { ORIGIN_LABEL } from "~/features/problems/labels";

import type { Route } from "./+types/admin-exam-number";

export const meta: Route.MetaFunction = () => [
  { title: "기출 시험번호 매칭 | 리담변리사학원" },
];

async function requireStaff(request: Request) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });
  return { client, user, role };
}

interface FoundProblem {
  problemId: string;
  displayNo: number;
  lawCode: string | null;
  lawLabel: string | null;
  year: number | null;
  origin: string;
  problemNumber: number | null;
  examNumber: number | null;
  stem: string;
  nodeLabel: string | null;
  // 같은 법·연도에서 이미 이 시험번호를 쓰는 다른 문제(중복 경고용).
  siblings: Array<{ examNumber: number; displayNo: number; stem: string }>;
}

// "P-1234" / "1234" → 1234.
function parseDisplayNo(raw: string): number | null {
  const m = /(\d+)/.exec(raw.trim());
  return m ? Number(m[1]) : null;
}

export async function loader({ request }: Route.LoaderArgs) {
  const { client, role } = await requireStaff(request);
  const url = new URL(request.url);
  const codeRaw = url.searchParams.get("code") ?? "";
  const displayNo = codeRaw ? parseDisplayNo(codeRaw) : null;

  let found: FoundProblem | null = null;
  let notFound = false;
  if (displayNo != null) {
    const { data: p } = await client
      .from("problems")
      .select(
        "problem_id, display_no, year, origin, problem_number, exam_number, body_md, law_id, primary_node_id, laws(law_code, short_label)",
      )
      .eq("display_no", displayNo)
      .is("deleted_at", null)
      .maybeSingle();
    if (!p) {
      notFound = true;
    } else {
      let nodeLabel: string | null = null;
      if (p.primary_node_id) {
        const { data: n } = await client
          .from("systematic_nodes")
          .select("display_label")
          .eq("node_id", p.primary_node_id)
          .maybeSingle();
        nodeLabel = n?.display_label ?? null;
      }
      // 같은 법·연도의 기출/변형 시험번호 현황(중복 경고).
      const siblings: FoundProblem["siblings"] = [];
      if (p.law_id && p.year != null) {
        const { data: sib } = await client
          .from("problems")
          .select("display_no, exam_number, body_md")
          .eq("law_id", p.law_id)
          .eq("year", p.year)
          .in("origin", ["past_exam", "past_exam_variant"])
          .not("exam_number", "is", null)
          .neq("problem_id", p.problem_id)
          .is("deleted_at", null);
        for (const s of sib ?? [])
          siblings.push({
            examNumber: s.exam_number as number,
            displayNo: s.display_no,
            stem: (s.body_md ?? "").replace(/\s+/g, " ").slice(0, 40),
          });
        siblings.sort((a, b) => a.examNumber - b.examNumber);
      }
      found = {
        problemId: p.problem_id,
        displayNo: p.display_no,
        lawCode: p.laws?.law_code ?? null,
        lawLabel: p.laws?.short_label ?? null,
        year: p.year,
        origin: p.origin,
        problemNumber: p.problem_number,
        examNumber: p.exam_number,
        stem: (p.body_md ?? "").replace(/\s+/g, " ").slice(0, 200),
        nodeLabel,
        siblings,
      };
    }
  }

  return { role, code: codeRaw, found, notFound };
}

const saveSchema = z.object({
  problemId: z.string().uuid(),
  examNumber: z.coerce.number().int().min(1).max(60).nullable(),
});

export async function action({ request }: Route.ActionArgs) {
  const { client } = await requireStaff(request);
  const fd = await request.formData();
  const raw = String(fd.get("examNumber") ?? "").trim();
  const parsed = saveSchema.safeParse({
    problemId: fd.get("problemId"),
    examNumber: raw === "" ? null : raw,
  });
  if (!parsed.success)
    return data({ error: "시험번호는 1~60 사이 숫자이거나 비워 주세요." }, { status: 400 });
  const { error } = await client
    .from("problems")
    .update({ exam_number: parsed.data.examNumber })
    .eq("problem_id", parsed.data.problemId);
  if (error) return data({ error: error.message }, { status: 400 });
  return data({ ok: true as const, examNumber: parsed.data.examNumber });
}

export default function AdminExamNumber({ loaderData }: Route.ComponentProps) {
  const { role, code, found, notFound } = loaderData;
  return (
    <AdminShell
      cluster="problems"
      role={role}
      title="기출 시험번호 매칭"
      desc="식별번호(P-코드)로 문제를 찾아 실제 시험 문항번호를 지정·정정합니다. 시험번호는 Q&A 특정·문제 뷰어의 '문제 N번' 표시와 prev/next 순서의 기준입니다."
      width={900}
    >
      <Form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            name="code"
            defaultValue={code}
            placeholder="식별번호 입력 (예: P-5917 또는 5917)"
            className="h-9 w-72 pl-8"
            autoFocus
          />
        </div>
        <Button type="submit" size="sm">
          찾기
        </Button>
        <span className="text-muted-foreground text-xs">
          문제 화면의 P-코드 칩을 그대로 입력하세요.
        </span>
      </Form>

      {notFound ? (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-rose-600">
          식별번호 {code} 에 해당하는 문제를 찾을 수 없습니다.
        </p>
      ) : null}

      {found ? <ProblemEditor found={found} /> : null}
    </AdminShell>
  );
}

function ProblemEditor({ found }: { found: FoundProblem }) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string; examNumber?: number | null }>();
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.error) toast.error(fetcher.data.error);
    else if (fetcher.data.ok)
      toast.success(
        fetcher.data.examNumber != null
          ? `시험번호를 ${fetcher.data.examNumber}번으로 저장했습니다.`
          : "시험번호를 비웠습니다.",
      );
  }, [fetcher.state, fetcher.data]);

  const isPast = found.origin === "past_exam" || found.origin === "past_exam_variant";

  return (
    <div className="border-border bg-card space-y-3 rounded-xl border p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="neutral">P-{found.displayNo}</Chip>
        <Chip tone="outline">{ORIGIN_LABEL[found.origin as never] ?? found.origin}</Chip>
        {found.lawLabel ? <Chip tone="blue">{found.lawLabel}</Chip> : null}
        {found.year ? <span className="text-sm font-semibold">{found.year}년</span> : null}
        {found.nodeLabel ? (
          <span className="text-muted-foreground text-xs">· {found.nodeLabel}</span>
        ) : null}
      </div>
      <p className="text-sm leading-relaxed">{found.stem}…</p>

      <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 border-t pt-2 text-xs">
        <span>노드 순번(problem_number): {found.problemNumber ?? "—"}</span>
        <span>
          현재 시험번호(exam_number):{" "}
          <b className="text-foreground">{found.examNumber ?? "미지정"}</b>
        </span>
      </div>

      {!isPast ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          기출/기출변형이 아닌 문제입니다. 시험번호는 기출에만 의미가 있어, 저장해도 표시에
          반영되지 않습니다.
        </p>
      ) : null}

      <fetcher.Form method="post" className="flex flex-wrap items-end gap-2 border-t pt-3">
        <input type="hidden" name="problemId" value={found.problemId} />
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px] font-semibold">
            실제 시험 문항번호
          </span>
          <Input
            name="examNumber"
            type="number"
            min={1}
            max={60}
            defaultValue={found.examNumber ?? ""}
            placeholder="예: 7"
            className="h-9 w-28"
          />
        </label>
        <Button type="submit" size="sm" disabled={fetcher.state !== "idle"}>
          저장
        </Button>
        <span className="text-muted-foreground text-xs">비우면 시험번호 미지정으로 저장됩니다.</span>
      </fetcher.Form>

      {found.siblings.length > 0 ? (
        <details className="border-t pt-2 text-xs">
          <summary className="text-muted-foreground cursor-pointer font-semibold">
            {found.year}년 시험번호 현황 ({found.siblings.length}건) — 중복 확인
          </summary>
          <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {found.siblings.map((s) => (
              <li key={s.displayNo} className="text-muted-foreground">
                <b className="text-foreground">{s.examNumber}번</b> · P-{s.displayNo} · {s.stem}…
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
