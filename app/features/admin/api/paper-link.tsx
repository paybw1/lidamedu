// 논문 ↔ 조문/판례 링크 add/remove API (feat-3-502). staff 전용.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  addPaperArticleLink,
  addPaperCaseLink,
  removePaperArticleLink,
  removePaperCaseLink,
} from "~/features/papers/queries.server";
import {
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/paper-link";

// "제29조", "29조", "29" → "29".
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
  const paperId = String(fd.get("paperId") ?? "");
  if (!z.string().uuid().safeParse(paperId).success) {
    return data({ error: "Invalid paperId" }, { status: 400 });
  }

  if (intent === "add_article") {
    const lawCodeRaw = String(fd.get("lawCode") ?? "");
    if (!(LAW_SUBJECT_SLUGS as readonly string[]).includes(lawCodeRaw)) {
      return data({ error: "Invalid lawCode" }, { status: 400 });
    }
    const articleNumber = normalizeArticleNumber(
      String(fd.get("articleNumber") ?? ""),
    );
    if (!articleNumber) {
      return data({ error: "조문번호 누락" }, { status: 400 });
    }
    const res = await addPaperArticleLink(
      client,
      paperId,
      lawCodeRaw as LawSubjectSlug,
      articleNumber,
      user.id,
    );
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "remove_article") {
    const articleId = String(fd.get("articleId") ?? "");
    if (!z.string().uuid().safeParse(articleId).success) {
      return data({ error: "Invalid articleId" }, { status: 400 });
    }
    const res = await removePaperArticleLink(client, paperId, articleId);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "add_case") {
    const caseNumber = String(fd.get("caseNumber") ?? "").trim();
    if (!caseNumber) {
      return data({ error: "사건번호 누락" }, { status: 400 });
    }
    const res = await addPaperCaseLink(client, paperId, caseNumber, user.id);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "remove_case") {
    const caseId = String(fd.get("caseId") ?? "");
    if (!z.string().uuid().safeParse(caseId).success) {
      return data({ error: "Invalid caseId" }, { status: 400 });
    }
    const res = await removePaperCaseLink(client, paperId, caseId);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}
