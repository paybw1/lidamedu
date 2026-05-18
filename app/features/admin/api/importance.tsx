// 콘텐츠 중요도 설정 API (feat-8-025). staff(instructor/admin) 전용.
// 운영자·강사가 판례·조문·문제 뷰어 오른쪽 패널의 별점으로 importance 를 직접 조정한다.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/importance";

const schema = z.object({
  targetType: z.enum(["case", "article", "problem"]),
  targetId: z.string().uuid(),
  // 판례 1~3, 조문·문제 0~3. 공통 상한으로 0~3 받고 case 는 아래에서 1 미만 거부.
  importance: z.coerce.number().int().min(0).max(3),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ ok: false, error: "method-not-allowed" }, { status: 405 });
  }

  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return data({ ok: false, error: "unauthorized" }, { status: 401, headers });
  }
  const role = await getStaffRole(client, user.id);
  if (!role) {
    return data({ ok: false, error: "forbidden" }, { status: 403, headers });
  }

  const parsed = schema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) {
    return data({ ok: false, error: "invalid-input" }, { status: 400, headers });
  }
  const { targetType, targetId, importance } = parsed.data;

  // 판례 importance 는 NOT NULL · CHECK 1~3.
  if (targetType === "case" && importance < 1) {
    return data(
      { ok: false, error: "판례 중요도는 1~3 입니다." },
      { status: 400, headers },
    );
  }

  // cases/articles/problems 쓰기는 RLS instructor-admin-write 정책으로 staff 에게 허용.
  // .select() 로 영향 행을 확인 — 잘못된 id·삭제된 행은 0건이라 명시적으로 거른다.
  let affected = 0;
  let dbError: string | null = null;
  if (targetType === "case") {
    const { data: rows, error } = await client
      .from("cases")
      .update({ importance })
      .eq("case_id", targetId)
      .is("deleted_at", null)
      .select("case_id");
    affected = rows?.length ?? 0;
    dbError = error?.message ?? null;
  } else if (targetType === "article") {
    const { data: rows, error } = await client
      .from("articles")
      .update({ importance })
      .eq("article_id", targetId)
      .is("deleted_at", null)
      .select("article_id");
    affected = rows?.length ?? 0;
    dbError = error?.message ?? null;
  } else {
    const { data: rows, error } = await client
      .from("problems")
      .update({ importance })
      .eq("problem_id", targetId)
      .is("deleted_at", null)
      .select("problem_id");
    affected = rows?.length ?? 0;
    dbError = error?.message ?? null;
  }
  if (dbError) {
    return data({ ok: false, error: dbError }, { status: 400, headers });
  }
  if (affected === 0) {
    return data(
      { ok: false, error: "대상을 찾을 수 없습니다." },
      { status: 404, headers },
    );
  }

  return data({ ok: true, importance }, { headers });
}
