// feat-4-A-117 — 운영자 case-study 검토 화면용 API.
// intent=search — 사건번호로 cases 검색
// intent=link   — 후보 슬라이드 → case 연결 (lecture_resources insert)
// intent=unlink — 연결 취소 (lecture_resources soft delete)
// intent=resolve / unresolve — 슬라이드 처리 완료 토글

import type { Route } from "./+types/case-study-review";

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  linkCandidateToCase,
  searchCasesByNumber,
  setCandidateResolved,
  unlinkCandidateCase,
} from "~/features/lectures/queries.server";

const searchSchema = z.object({ query: z.string().min(1).max(40) });
const linkSchema = z.object({
  candidateId: z.string().uuid(),
  caseId: z.string().uuid(),
  bookSlug: z.string().min(1).max(64),
  slideIdx: z.coerce.number().int().positive(),
  pdfUrl: z.string().min(1).max(500),
});
const unlinkSchema = z.object({
  caseId: z.string().uuid(),
  pdfUrl: z.string().min(1).max(500),
});
const resolveSchema = z.object({
  candidateId: z.string().uuid(),
  resolved: z.string().transform((v) => v === "true" || v === "1"),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ ok: false, error: "Method not allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ ok: false, error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ ok: false, error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  if (intent === "search") {
    const parsed = searchSchema.safeParse({ query: fd.get("query") });
    if (!parsed.success) {
      return data(
        { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" },
        { status: 400 },
      );
    }
    try {
      const results = await searchCasesByNumber(client, parsed.data.query, 20);
      return data({ ok: true, intent: "search" as const, results });
    } catch (e) {
      return data(
        { ok: false, error: e instanceof Error ? e.message : "검색 실패" },
        { status: 400 },
      );
    }
  }

  if (intent === "link") {
    const parsed = linkSchema.safeParse({
      candidateId: fd.get("candidateId"),
      caseId: fd.get("caseId"),
      bookSlug: fd.get("bookSlug"),
      slideIdx: fd.get("slideIdx"),
      pdfUrl: fd.get("pdfUrl"),
    });
    if (!parsed.success) {
      return data(
        { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" },
        { status: 400 },
      );
    }
    try {
      const res = await linkCandidateToCase(client, {
        bookSlug: parsed.data.bookSlug,
        slideIdx: parsed.data.slideIdx,
        pdfUrl: parsed.data.pdfUrl,
        caseId: parsed.data.caseId,
        createdBy: user.id,
      });
      return data({
        ok: true,
        intent: "link" as const,
        candidateId: parsed.data.candidateId,
        caseId: parsed.data.caseId,
        resourceId: res.resourceId,
        alreadyExists: res.alreadyExists,
      });
    } catch (e) {
      return data(
        { ok: false, error: e instanceof Error ? e.message : "연결 실패" },
        { status: 400 },
      );
    }
  }

  if (intent === "unlink") {
    const parsed = unlinkSchema.safeParse({
      caseId: fd.get("caseId"),
      pdfUrl: fd.get("pdfUrl"),
    });
    if (!parsed.success) {
      return data(
        { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" },
        { status: 400 },
      );
    }
    try {
      await unlinkCandidateCase(client, parsed.data);
      return data({
        ok: true,
        intent: "unlink" as const,
        caseId: parsed.data.caseId,
        pdfUrl: parsed.data.pdfUrl,
      });
    } catch (e) {
      return data(
        { ok: false, error: e instanceof Error ? e.message : "해제 실패" },
        { status: 400 },
      );
    }
  }

  if (intent === "resolve") {
    const parsed = resolveSchema.safeParse({
      candidateId: fd.get("candidateId"),
      resolved: fd.get("resolved"),
    });
    if (!parsed.success) {
      return data(
        { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" },
        { status: 400 },
      );
    }
    try {
      await setCandidateResolved(
        client,
        parsed.data.candidateId,
        parsed.data.resolved,
      );
      return data({
        ok: true,
        intent: "resolve" as const,
        candidateId: parsed.data.candidateId,
        resolved: parsed.data.resolved,
      });
    } catch (e) {
      return data(
        { ok: false, error: e instanceof Error ? e.message : "상태 변경 실패" },
        { status: 400 },
      );
    }
  }

  return data({ ok: false, error: "Invalid intent" }, { status: 400 });
}
