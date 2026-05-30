// feat-2-021 추천 슬롯 ON/OFF 토글 API.
// 본인 profile.recommendation_prefs 만 갱신. 변경은 다음 KST 자정 이후 새 스냅샷부터 적용.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  type DailyMenuKind,
  ALL_DAILY_MENU_KINDS,
} from "~/features/study/lib/daily-menu";

import type { Route } from "./+types/recommendation-prefs";

const Schema = z.object({
  kind: z.string().refine(
    (v): v is DailyMenuKind =>
      (ALL_DAILY_MENU_KINDS as readonly string[]).includes(v),
    "지원하지 않는 슬롯 kind",
  ),
  enabled: z.union([z.literal("true"), z.literal("false")]).transform(
    (v) => v === "true",
  ),
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

  const form = await request.formData();
  const parsed = Schema.safeParse({
    kind: form.get("kind"),
    enabled: form.get("enabled"),
  });
  if (!parsed.success) {
    return data(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  // 현재 prefs 읽고 머지.
  const { data: profile } = await client
    .from("profiles")
    .select("recommendation_prefs")
    .eq("profile_id", user.id)
    .maybeSingle();
  const cur =
    profile?.recommendation_prefs && typeof profile.recommendation_prefs === "object"
      ? (profile.recommendation_prefs as Record<string, unknown>)
      : {};
  const next: Record<string, boolean> = { ...(cur as Record<string, boolean>) };
  if (parsed.data.enabled) {
    // true 는 기본이라 키 자체를 제거 (jsonb 작아짐).
    delete next[parsed.data.kind];
  } else {
    next[parsed.data.kind] = false;
  }

  const { error } = await client
    .from("profiles")
    .update({ recommendation_prefs: next })
    .eq("profile_id", user.id);
  if (error) {
    return data({ ok: false, error: error.message }, { status: 500 });
  }
  return data({ ok: true, prefs: next });
}
