// 학생 — 논점 추출 attempt CRUD.
// intent: autosave / submit / self_check / reset.
// 본인만 R/W (RLS + 서버에서 user_id 강제).

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  resetIssueAttempt,
  upsertIssueAttempt,
} from "~/features/gs/queries-issue-attempts.server";

import type { Route } from "./+types/issue-attempt";

const autosaveSchema = z.object({
  intent: z.literal("autosave"),
  gsQuestionId: z.string().uuid(),
  studentIssuesMd: z.string().max(20000),
});
const submitSchema = z.object({
  intent: z.literal("submit"),
  gsQuestionId: z.string().uuid(),
  studentIssuesMd: z.string().max(20000),
});
const selfCheckSchema = z.object({
  intent: z.literal("self_check"),
  gsQuestionId: z.string().uuid(),
  hits: z.string(),    // JSON.stringify(string[])
  missed: z.string(),
  wrong: z.string(),
});
const resetSchema = z.object({
  intent: z.literal("reset"),
  gsQuestionId: z.string().uuid(),
});

function parseStringArray(raw: unknown): string[] {
  if (typeof raw !== "string" || raw.length === 0) return [];
  try {
    const j = JSON.parse(raw);
    if (!Array.isArray(j)) return [];
    return j.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST")
    return data({ error: "Method not allowed" }, { status: 405 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });

  const fd = await request.formData();
  const intent = fd.get("intent");

  if (intent === "autosave") {
    const parsed = autosaveSchema.safeParse({
      intent,
      gsQuestionId: fd.get("gsQuestionId"),
      studentIssuesMd: fd.get("studentIssuesMd") ?? "",
    });
    if (!parsed.success)
      return data({ error: "Invalid input" }, { status: 400 });
    const attempt = await upsertIssueAttempt(client, {
      userId: user.id,
      gsQuestionId: parsed.data.gsQuestionId,
      studentIssuesMd: parsed.data.studentIssuesMd,
    });
    return data({ ok: true, attemptId: attempt.attemptId });
  }

  if (intent === "submit") {
    const parsed = submitSchema.safeParse({
      intent,
      gsQuestionId: fd.get("gsQuestionId"),
      studentIssuesMd: fd.get("studentIssuesMd") ?? "",
    });
    if (!parsed.success)
      return data({ error: "Invalid input" }, { status: 400 });
    const attempt = await upsertIssueAttempt(client, {
      userId: user.id,
      gsQuestionId: parsed.data.gsQuestionId,
      studentIssuesMd: parsed.data.studentIssuesMd,
      submittedAt: new Date().toISOString(),
    });
    return data({ ok: true, attemptId: attempt.attemptId });
  }

  if (intent === "self_check") {
    const parsed = selfCheckSchema.safeParse({
      intent,
      gsQuestionId: fd.get("gsQuestionId"),
      hits: fd.get("hits") ?? "[]",
      missed: fd.get("missed") ?? "[]",
      wrong: fd.get("wrong") ?? "[]",
    });
    if (!parsed.success)
      return data({ error: "Invalid input" }, { status: 400 });
    const selfCheck = {
      hits: parseStringArray(parsed.data.hits),
      missed: parseStringArray(parsed.data.missed),
      wrong: parseStringArray(parsed.data.wrong),
    };
    const attempt = await upsertIssueAttempt(client, {
      userId: user.id,
      gsQuestionId: parsed.data.gsQuestionId,
      selfCheck,
      selfCheckedAt: new Date().toISOString(),
    });
    return data({ ok: true, attemptId: attempt.attemptId });
  }

  if (intent === "reset") {
    const parsed = resetSchema.safeParse({
      intent,
      gsQuestionId: fd.get("gsQuestionId"),
    });
    if (!parsed.success)
      return data({ error: "Invalid input" }, { status: 400 });
    await resetIssueAttempt(client, user.id, parsed.data.gsQuestionId);
    return data({ ok: true });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
