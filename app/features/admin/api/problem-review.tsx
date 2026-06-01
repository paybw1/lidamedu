// feat — §2 강사 검증·승인 API.
// intents:
//   approve         → review_status='approved', approved_at/by 기록
//   reject          → review_status='rejected', rejected_reason 기록
//   bulk-approve    → 다중 problemId 일괄 승인 (멱등)
//   bulk-reject     → 다중 problemId 일괄 반려 + 사유
//   quick-edit      → body_md / explanation_md / 선지 body 인라인 수정 (status 변경 없음)
//
// 게이트: staff(instructor/admin) 만. RLS 보호된 supa-client 사용.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/problem-review";

const REVIEW_INTENTS = [
  "approve",
  "reject",
  "bulk-approve",
  "bulk-reject",
  "quick-edit",
] as const;

const baseSchema = z.object({
  intent: z.enum(REVIEW_INTENTS),
});

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
  const intentParse = baseSchema.safeParse({ intent: fd.get("intent") });
  if (!intentParse.success) {
    return data({ error: "Invalid intent" }, { status: 400 });
  }
  const intent = intentParse.data.intent;
  const now = new Date().toISOString();

  if (intent === "approve") {
    const problemId = z.string().uuid().safeParse(fd.get("problemId"));
    if (!problemId.success)
      return data({ error: "Invalid problemId" }, { status: 400 });
    const { error } = await client
      .from("problems")
      .update({
        review_status: "approved",
        approved_at: now,
        approved_by: user.id,
        rejected_reason: null,
      })
      .eq("problem_id", problemId.data)
      .is("deleted_at", null);
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "reject") {
    const schema = z.object({
      problemId: z.string().uuid(),
      reason: z.string().min(1).max(2000),
    });
    const parsed = schema.safeParse({
      problemId: fd.get("problemId"),
      reason: fd.get("reason"),
    });
    if (!parsed.success)
      return data(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    const { error } = await client
      .from("problems")
      .update({
        review_status: "rejected",
        rejected_reason: parsed.data.reason,
        approved_at: null,
        approved_by: null,
      })
      .eq("problem_id", parsed.data.problemId)
      .is("deleted_at", null);
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "bulk-approve") {
    const raw = String(fd.get("problemIds") ?? "");
    const ids = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => z.string().uuid().safeParse(s).success);
    if (ids.length === 0)
      return data({ error: "no valid ids" }, { status: 400 });
    const { error } = await client
      .from("problems")
      .update({
        review_status: "approved",
        approved_at: now,
        approved_by: user.id,
        rejected_reason: null,
      })
      .in("problem_id", ids)
      .is("deleted_at", null);
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true, count: ids.length });
  }

  if (intent === "bulk-reject") {
    const schema = z.object({
      problemIds: z.string(),
      reason: z.string().min(1).max(2000),
    });
    const parsed = schema.safeParse({
      problemIds: fd.get("problemIds"),
      reason: fd.get("reason"),
    });
    if (!parsed.success)
      return data(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    const ids = parsed.data.problemIds
      .split(",")
      .map((s) => s.trim())
      .filter((s) => z.string().uuid().safeParse(s).success);
    if (ids.length === 0)
      return data({ error: "no valid ids" }, { status: 400 });
    const { error } = await client
      .from("problems")
      .update({
        review_status: "rejected",
        rejected_reason: parsed.data.reason,
        approved_at: null,
        approved_by: null,
      })
      .in("problem_id", ids)
      .is("deleted_at", null);
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true, count: ids.length });
  }

  if (intent === "quick-edit") {
    // body_md / explanation_md / 선지 body_md 인라인 수정 (status 유지).
    //   choices = "<choiceId>:<body>;...;" 형식 (구분자 ; 와 :). 빈 값은 무시.
    const schema = z.object({
      problemId: z.string().uuid(),
      bodyMd: z.string().optional(),
      explanationMd: z.string().optional(),
      choices: z.string().optional(), // 그대로 받아 파싱
    });
    const parsed = schema.safeParse({
      problemId: fd.get("problemId"),
      bodyMd: fd.get("bodyMd"),
      explanationMd: fd.get("explanationMd"),
      choices: fd.get("choices"),
    });
    if (!parsed.success)
      return data(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    const update: { body_md?: string; explanation_md?: string | null } = {};
    if (typeof parsed.data.bodyMd === "string")
      update.body_md = parsed.data.bodyMd;
    if (typeof parsed.data.explanationMd === "string")
      update.explanation_md = parsed.data.explanationMd || null;
    if (Object.keys(update).length > 0) {
      const { error } = await client
        .from("problems")
        .update(update)
        .eq("problem_id", parsed.data.problemId);
      if (error) return data({ error: error.message }, { status: 400 });
    }
    // 선지 인라인 수정 (선택). "<choiceId>|<body_md>" 줄 단위.
    if (parsed.data.choices) {
      const lines = parsed.data.choices.split("\n").filter((l) => l.includes("|"));
      for (const line of lines) {
        const sepIdx = line.indexOf("|");
        const choiceId = line.slice(0, sepIdx).trim();
        const bodyMd = line.slice(sepIdx + 1);
        if (!z.string().uuid().safeParse(choiceId).success) continue;
        await client
          .from("problem_choices")
          .update({ body_md: bodyMd })
          .eq("choice_id", choiceId)
          .eq("problem_id", parsed.data.problemId);
      }
    }
    return data({ ok: true });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}
