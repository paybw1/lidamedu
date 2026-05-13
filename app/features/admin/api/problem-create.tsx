// 객관식 문제 신규 출제 (feat-7-006). 최소 필드 INSERT 후 admin-problem-edit 로 redirect.

import { data, redirect } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { addPackProblem } from "~/features/mcq-packs/queries.server";
import {
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/problem-create";

const inputSchema = z.object({
  lawCode: z.enum(LAW_SUBJECT_SLUGS),
  examRound: z.enum(["first", "second"]).default("first"),
  origin: z.enum(["past_exam", "past_exam_variant", "mock", "expected"]),
  format: z.enum(["mc_short", "mc_box", "mc_case", "ox", "blank", "subjective"]),
  polarity: z.enum(["positive", "negative"]).nullable(),
  scope: z.enum(["unit", "comprehensive"]).nullable(),
  year: z.number().int().min(1990).max(2099).nullable(),
  examRoundNo: z.number().int().min(1).max(99).nullable(),
  problemNumber: z.number().int().min(1).max(9999).nullable(),
  bodyMd: z.string().min(1).max(20_000),
  choiceCount: z.number().int().min(2).max(10).default(5),
  mcqPackId: z.string().uuid().nullable().optional(),
  gsRoundId: z.string().uuid().nullable().optional(),
});

function emptyToNullNum(raw: FormDataEntryValue | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function emptyToNullStr(
  raw: FormDataEntryValue | null,
): "positive" | "negative" | "unit" | "comprehensive" | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (s === "" || s === "none") return null;
  if (s === "positive" || s === "negative" || s === "unit" || s === "comprehensive")
    return s;
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const rawPackId = String(fd.get("mcqPackId") ?? "").trim();
  const rawGsRoundId = String(fd.get("gsRoundId") ?? "").trim();
  const parsed = inputSchema.safeParse({
    lawCode: fd.get("lawCode"),
    examRound: fd.get("examRound") ?? "first",
    origin: fd.get("origin"),
    format: fd.get("format"),
    polarity: emptyToNullStr(fd.get("polarity")) as
      | "positive"
      | "negative"
      | null,
    scope: emptyToNullStr(fd.get("scope")) as
      | "unit"
      | "comprehensive"
      | null,
    year: emptyToNullNum(fd.get("year")),
    examRoundNo: emptyToNullNum(fd.get("examRoundNo")),
    problemNumber: emptyToNullNum(fd.get("problemNumber")),
    bodyMd: fd.get("bodyMd"),
    choiceCount: emptyToNullNum(fd.get("choiceCount")) ?? 5,
    mcqPackId: rawPackId === "" ? null : rawPackId,
    gsRoundId: rawGsRoundId === "" ? null : rawGsRoundId,
  });
  if (!parsed.success) {
    return data(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // law_id 조회.
  const { data: law } = await client
    .from("laws")
    .select("law_id")
    .eq("law_code", input.lawCode as LawSubjectSlug)
    .maybeSingle();
  if (!law) return data({ error: "Law not seeded" }, { status: 400 });

  // problem INSERT.
  const { data: prob, error: pErr } = await client
    .from("problems")
    .insert({
      law_id: law.law_id,
      exam_round: input.examRound,
      origin: input.origin,
      format: input.format,
      polarity: input.polarity,
      scope: input.scope,
      year: input.year,
      exam_round_no: input.examRoundNo,
      problem_number: input.problemNumber,
      body_md: input.bodyMd,
      subject_type: "law",
    })
    .select("problem_id")
    .single();
  if (pErr) return data({ error: pErr.message }, { status: 400 });

  // mc 계열만 choices 자동 생성. ox/blank/subjective 는 비워둠.
  if (
    input.format === "mc_short" ||
    input.format === "mc_box" ||
    input.format === "mc_case"
  ) {
    const choices = Array.from({ length: input.choiceCount }, (_, i) => ({
      problem_id: prob.problem_id,
      choice_index: i + 1,
      body_md: "",
      is_correct: i === 0, // 1번을 임시 정답. 편집 화면에서 수정.
    }));
    const { error: cErr } = await client.from("problem_choices").insert(choices);
    if (cErr) {
      // 롤백 — problem soft delete.
      await client
        .from("problems")
        .update({ deleted_at: new Date().toISOString() })
        .eq("problem_id", prob.problem_id);
      return data({ error: cErr.message }, { status: 400 });
    }
  }

  // 선택된 mcq pack 이 있으면 매핑. 실패해도 problem 자체는 보존 — 운영자가 후속 매핑 가능.
  if (input.mcqPackId) {
    await addPackProblem(client, input.mcqPackId, prob.problem_id);
  }

  // 주관식 + GS 회차 선택 시 — gs_questions 에 미러 INSERT.
  // gs_questions 는 problems 와 별도 row 라 동기화는 아니지만, 출제 시점 한 번에 묶여 만들어진다.
  // 본문/모범답안/채점기준은 problems 에 아직 없을 수 있으므로 body_md 만 복사, 나머지는 빈 값.
  if (input.gsRoundId && input.format === "subjective") {
    const { data: maxOrder } = await client
      .from("gs_questions")
      .select("order_index")
      .eq("round_id", input.gsRoundId)
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = (maxOrder?.order_index ?? -1) + 1;
    await client.from("gs_questions").insert({
      round_id: input.gsRoundId,
      order_index: nextOrder,
      body_md: input.bodyMd,
      title: input.problemNumber ? `문제 ${input.problemNumber}` : null,
    });
  }

  throw redirect(`/admin/problems/${prob.problem_id}`);
}
