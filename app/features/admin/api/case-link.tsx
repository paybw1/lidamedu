// 운영자 case ↔ article 매핑 추가/삭제 API.
// staff (instructor/admin) 만 호출 가능.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  addCaseArticleLink,
  removeCaseArticleLink,
} from "~/features/admin/queries/case-mapper.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/case-link";

const addSchema = z.object({
  intent: z.literal("add"),
  caseId: z.string().uuid(),
  lawCode: z.string(),
  articleNumber: z.string().min(1).max(20),
});
const removeSchema = z.object({
  intent: z.literal("remove"),
  caseId: z.string().uuid(),
  lawCode: z.string(),
  articleNumber: z.string().min(1).max(20),
});

// "제29조", "29조", "29" → "29"
function normalizeArticleNumber(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^제\s*/, "");
  s = s.replace(/\s*조$/, "");
  s = s.replace(/\s+/g, "");
  return s;
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
  const intent = String(fd.get("intent") ?? "");

  if (intent === "add") {
    const parsed = addSchema.safeParse({
      intent,
      caseId: fd.get("caseId"),
      lawCode: fd.get("lawCode"),
      articleNumber: normalizeArticleNumber(
        String(fd.get("articleNumber") ?? ""),
      ),
    });
    if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });
    if (!(LAW_SUBJECT_SLUGS as readonly string[]).includes(parsed.data.lawCode))
      return data({ error: "Invalid lawCode" }, { status: 400 });
    const res = await addCaseArticleLink(
      client,
      parsed.data.caseId,
      parsed.data.lawCode as LawSubjectSlug,
      parsed.data.articleNumber,
      user.id,
    );
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "remove") {
    const parsed = removeSchema.safeParse({
      intent,
      caseId: fd.get("caseId"),
      lawCode: fd.get("lawCode"),
      articleNumber: normalizeArticleNumber(
        String(fd.get("articleNumber") ?? ""),
      ),
    });
    if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });
    if (!(LAW_SUBJECT_SLUGS as readonly string[]).includes(parsed.data.lawCode))
      return data({ error: "Invalid lawCode" }, { status: 400 });
    const res = await removeCaseArticleLink(
      client,
      parsed.data.caseId,
      parsed.data.articleNumber,
      parsed.data.lawCode as LawSubjectSlug,
    );
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
