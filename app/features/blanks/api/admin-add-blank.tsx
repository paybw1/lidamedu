import { data } from "react-router";
import { z } from "zod";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { addBlankToSet } from "~/features/blanks/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-add-blank";

// setId 또는 articleId 둘 중 하나 필수.
//   setId      — 기존 set 에 빈칸 추가
//   articleId  — 자기 owner 의 set 이 있으면 거기, 없으면 새로 만들고 추가
const schema = z
  .object({
    setId: z.string().uuid().optional(),
    articleId: z.string().uuid().optional(),
    selectionText: z.string().min(1).max(500),
    // 운영자가 본문에서 드래그로 선택한 영역 주위 텍스트. 동일 정답이 본문에 여러 번 등장할 때
    // 어떤 위치를 사용자가 의도했는지 disambiguation 에 사용.
    beforeHint: z.string().max(500).optional(),
    afterHint: z.string().max(500).optional(),
    // 선택 영역의 가장 가까운 clause/item/sub DOM id (예: "clause-5"). before/after suffix
    // 매칭이 라벨/소제목 등 noise 로 흔들리는 케이스에서 occurrence 를 강제 한정.
    blockHint: z
      .string()
      .max(64)
      .regex(/^(clause|item|sub)-/)
      .optional(),
    // 정확 위치 — DOM data attribute 에서 캡처한 walkBlocks 인덱스 + block 내 cumulative offset.
    // 둘 다 있으면 컨텍스트 매칭 우회하고 결정적으로 그 좌표에 배치.
    blockIndex: z.coerce.number().int().min(0).optional(),
    cumOffset: z.coerce.number().int().min(0).optional(),
  })
  .refine((d) => d.setId || d.articleId, {
    message: "setId 또는 articleId 가 필요합니다.",
  });

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw data("Method Not Allowed", { status: 405 });
  }
  const fd = await request.formData();
  const parsed = schema.safeParse({
    setId: fd.get("setId") || undefined,
    articleId: fd.get("articleId") || undefined,
    selectionText: fd.get("selectionText"),
    beforeHint: fd.get("beforeHint") ?? undefined,
    afterHint: fd.get("afterHint") ?? undefined,
    blockHint: fd.get("blockHint") || undefined,
    blockIndex: fd.get("blockIndex") ?? undefined,
    cumOffset: fd.get("cumOffset") ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" } as const;

  // setId 가 없으면 articleId 로 자기 set 조회 — 없으면 자동 생성.
  let setId = parsed.data.setId;
  if (!setId) {
    const role = await getStaffRole(client, user.id);
    if (!role) return { ok: false, error: "Forbidden" } as const;

    const articleId = parsed.data.articleId!;
    const { data: existing } = await adminClient
      .from("article_blank_sets")
      .select("set_id")
      .eq("article_id", articleId)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existing) {
      setId = existing.set_id;
    } else {
      const { data: inserted, error: insErr } = await adminClient
        .from("article_blank_sets")
        .insert({
          article_id: articleId,
          version: "기본",
          body_text: "",
          blanks: [] as never,
          importance: 0,
          owner_id: user.id,
          display_name: null,
        })
        .select("set_id")
        .single();
      if (insErr) return { ok: false, error: insErr.message } as const;
      setId = inserted.set_id;
    }
  }

  const result = await addBlankToSet(client, setId, parsed.data.selectionText, {
    beforeHint: parsed.data.beforeHint,
    afterHint: parsed.data.afterHint,
    blockHint: parsed.data.blockHint,
    blockIndex: parsed.data.blockIndex,
    cumOffset: parsed.data.cumOffset,
  });
  if (!result.ok) return { ok: false, error: result.reason } as const;
  return { ok: true, newIdx: result.newIdx, setId } as const;
}
