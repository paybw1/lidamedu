// feat §3 — AI 초안 일괄 생성 API. staff 만. 비동기·blocking 단순 호출 (생성은 보통 1-5분).
// 응답: GenerateReport JSON. 생성된 problemIds + 통계 + 에러 목록.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { generateAiDraftProblems } from "~/features/admin/lib/ai-problem-gen.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  LAW_SUBJECT_SLUGS,
  lawSubjectSlugSchema,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/ai-problem-gen";

const inputSchema = z.object({
  lawCode: lawSubjectSlugSchema,
  primaryArticleIds: z.array(z.string().uuid()).optional(),
  mcShortCount: z.number().int().min(0).max(50),
  mcBoxCount: z.number().int().min(0).max(50),
  model: z.string().optional(),
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
  const articleIdsRaw = String(fd.get("primaryArticleIds") ?? "");
  const articleIds = articleIdsRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => z.string().uuid().safeParse(s).success);

  const parsed = inputSchema.safeParse({
    lawCode: fd.get("lawCode"),
    primaryArticleIds: articleIds.length > 0 ? articleIds : undefined,
    mcShortCount: Number(fd.get("mcShortCount") ?? 0),
    mcBoxCount: Number(fd.get("mcBoxCount") ?? 0),
    model: fd.get("model") ? String(fd.get("model")) : undefined,
  });
  if (!parsed.success) {
    return data(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const total = input.mcShortCount + input.mcBoxCount;
  if (total === 0) {
    return data({ error: "생성 문항 수가 0입니다." }, { status: 400 });
  }
  if (total > 30) {
    return data(
      { error: "한 번에 최대 30문항까지 생성 가능합니다." },
      { status: 400 },
    );
  }

  try {
    const report = await generateAiDraftProblems(client, adminClient, user.id, {
      lawCode: input.lawCode,
      primaryArticleIds: input.primaryArticleIds,
      formatMix: {
        mc_short: input.mcShortCount,
        mc_box: input.mcBoxCount,
      },
      model: input.model,
    });
    return data({ ok: true, report });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return data({ error: msg }, { status: 500 });
  }
}
