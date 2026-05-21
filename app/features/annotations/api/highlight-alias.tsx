// feat-3-208 — 사용자별 색상 닉네임 set/clear action + GET loader.
// GET  /api/annotations/highlight-alias                 → { aliases }
// POST /api/annotations/highlight-alias
//   intent=set, color in HIGHLIGHT_COLORS, alias 문자열(빈 값이면 키 제거)
//
// RLS: profiles 본인 row 만 select/update — 별도 권한 가드 불필요(supa-client 가 auth 컨텍스트).
import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";

import {
  HIGHLIGHT_ALIAS_MAX_LEN,
  getHighlightColorAliases,
  highlightColorSchema,
  setHighlightColorAlias,
} from "../queries.server";

import type { Route } from "./+types/highlight-alias";

export async function loader({ request }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ aliases: {} }, { headers });
  const aliases = await getHighlightColorAliases(client, user.id);
  return data({ aliases }, { headers });
}

const schema = z.object({
  intent: z.literal("set"),
  color: highlightColorSchema,
  // 빈 값은 alias 삭제(기본 색 이름 복귀) 의도로 허용.
  alias: z.string().max(HIGHLIGHT_ALIAS_MAX_LEN),
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

  const fd = await request.formData();
  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) {
    return data(
      { ok: false, error: "invalid-input", issues: parsed.error.issues },
      { status: 400, headers },
    );
  }

  const next = await setHighlightColorAlias(
    client,
    user.id,
    parsed.data.color,
    parsed.data.alias,
  );
  return data({ ok: true, aliases: next }, { headers });
}
