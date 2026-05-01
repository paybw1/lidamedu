import { data, redirect } from "react-router";
import { z } from "zod";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-create-set";

const schema = z.object({
  articleId: z.string().uuid(),
});

// admin/instructor 가 article-viewer 에서 빈칸 자료를 새로 만들 때 호출.
// 같은 (article, owner) 조합의 set 이 이미 있으면 그것의 setId 로 redirect.
// 없으면 빈 body_text + 빈 blanks 배열로 새 set 생성 후 그 setId 의 편집 화면으로 redirect.
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw data("Method Not Allowed", { status: 405 });
  }
  const fd = await request.formData();
  const parsed = schema.safeParse({ articleId: fd.get("articleId") });
  if (!parsed.success) {
    throw data("Invalid input", { status: 400 });
  }

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  // 본인 owner 의 기존 set 이 있는지 — 있으면 그 set 의 편집 화면으로 redirect.
  const { data: existing } = await adminClient
    .from("article_blank_sets")
    .select("set_id")
    .eq("article_id", parsed.data.articleId)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing) {
    return redirect(`/admin/blanks/${existing.set_id}`);
  }

  // 없으면 새로 생성. body_text 는 빈 string — admin-blanks-edit 은 article body_json 기반으로
  // 렌더하므로 비어있어도 본문 표시에 영향 없음. 빈칸 추가 시 [[BLANK:N]] 토큰이 점차 채워진다.
  const { data: inserted, error } = await adminClient
    .from("article_blank_sets")
    .insert({
      article_id: parsed.data.articleId,
      version: "기본",
      body_text: "",
      blanks: [] as never,
      importance: 0,
      owner_id: user.id,
      display_name: null,
    })
    .select("set_id")
    .single();
  if (error) throw data(error.message, { status: 500 });

  return redirect(`/admin/blanks/${inserted.set_id}`);
}
