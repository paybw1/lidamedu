// 고객센터 FAQ 운영자 액션 — 저장(생성/수정)·삭제(soft). staff 게이트, RLS staff 백스톱.
import { data, redirect } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";

import {
  softDeleteSupportFaq,
  upsertSupportFaq,
} from "../faq.server";

import type { Route } from "./+types/admin-faq";

const LIST = "/admin/support-faqs";

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  if (!(await getStaffRole(client, user.id)))
    return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");
  const id = String(fd.get("id") ?? "");

  if (intent === "delete") {
    if (id) await softDeleteSupportFaq(client, id);
    return redirect(LIST);
  }
  if (intent !== "save") return data({ error: "bad intent" }, { status: 400 });

  const category = String(fd.get("category") ?? "").trim();
  const question = String(fd.get("question") ?? "").trim();
  if (!category || !question)
    return data({ error: "카테고리·질문을 입력하세요" }, { status: 400 });
  const res = await upsertSupportFaq(
    client,
    {
      category,
      question: question.slice(0, 300),
      answer: String(fd.get("answer") ?? "").trim(),
      sortOrder: Number.parseInt(String(fd.get("sortOrder") ?? "0"), 10) || 0,
      published: fd.get("published") === "on" || fd.get("published") === "true",
    },
    id || undefined,
  );
  if (!res.ok) return data({ error: res.error }, { status: 400 });
  return redirect(LIST);
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
