// feat-12 강의 플랫폼 랜딩 운영자 액션 — 일정·소식·배너 저장/삭제/순서변경.
// staff 게이트, 쓰기는 요청 클라이언트(RLS staff 백스톱). entity 로 대상 구분.
import type { Database } from "database.types";
import { data, redirect } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";

import { reorderRow, softDeleteRow } from "../queries.server";

import type { Route } from "./+types/admin-landing";

type Entity = "schedule" | "news" | "banner";
const TABLE = {
  schedule: "lecture_schedules",
  news: "lecture_news",
  banner: "landing_banners",
} as const;
const LIST_PATH: Record<Entity, string> = {
  schedule: "/admin/lecture-schedules",
  news: "/admin/lecture-news",
  banner: "/admin/landing-banners",
};

const str = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v.length ? v : null;
};
const int = (fd: FormData, k: string) => {
  const n = Number(fd.get(k));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};
const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";
const lines = (fd: FormData, k: string) =>
  String(fd.get(k) ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  if (!(await getStaffRole(client, user.id)))
    return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const entity = String(fd.get("entity") ?? "") as Entity;
  if (!(entity in TABLE)) return data({ error: "bad entity" }, { status: 400 });
  const intent = String(fd.get("intent") ?? "");
  const id = String(fd.get("id") ?? "");

  if (intent === "delete") {
    if (id) await softDeleteRow(client, TABLE[entity], id);
    return redirect(LIST_PATH[entity]);
  }
  if (intent === "reorder") {
    const direction = String(fd.get("direction") ?? "");
    if (id && (direction === "up" || direction === "down"))
      await reorderRow(client, TABLE[entity], id, direction);
    return data({ ok: true });
  }
  if (intent !== "save") return data({ error: "bad intent" }, { status: 400 });

  // ── 저장(insert/update) — entity 별 concrete 테이블로 타입 정확 ──
  if (entity === "schedule") {
    const row = {
      subject_label: str(fd, "subject_label") ?? "",
      subject_code: str(fd, "subject_code"),
      title: str(fd, "title") ?? "",
      instructor_name: str(fd, "instructor_name") ?? "",
      start_date: str(fd, "start_date"),
      day_label: str(fd, "day_label"),
      time_label: str(fd, "time_label"),
      format: str(fd, "format") ?? "offline",
      capacity: int(fd, "capacity"),
      enrolled: int(fd, "enrolled"),
      status: str(fd, "status") ?? "open",
      note: str(fd, "note"),
      display_order: int(fd, "display_order"),
      published: bool(fd, "published"),
    } satisfies Database["public"]["Tables"]["lecture_schedules"]["Insert"];
    const q = id
      ? client.from("lecture_schedules").update(row).eq("schedule_id", id)
      : client.from("lecture_schedules").insert(row);
    const { error } = await q;
    if (error) return data({ error: error.message }, { status: 400 });
  } else if (entity === "news") {
    const row = {
      kind: str(fd, "kind") ?? "notice",
      title: str(fd, "title") ?? "",
      body_md: str(fd, "body_md"),
      pinned: bool(fd, "pinned"),
      published: bool(fd, "published"),
      published_at: str(fd, "published_at") ?? new Date().toISOString(),
    } satisfies Database["public"]["Tables"]["lecture_news"]["Insert"];
    const q = id
      ? client.from("lecture_news").update(row).eq("news_id", id)
      : client.from("lecture_news").insert(row);
    const { error } = await q;
    if (error) return data({ error: error.message }, { status: 400 });
  } else {
    const row = {
      kind: str(fd, "kind") ?? "promo",
      accent: str(fd, "accent") ?? "gilt",
      eyebrow: str(fd, "eyebrow"),
      headline: str(fd, "headline") ?? "",
      highlight: str(fd, "highlight"),
      sub: str(fd, "sub"),
      cta_label: str(fd, "cta_label"),
      cta_href: str(fd, "cta_href"),
      secondary_label: str(fd, "secondary_label"),
      secondary_href: str(fd, "secondary_href"),
      big_value: str(fd, "big_value"),
      big_unit: str(fd, "big_unit"),
      badges: lines(fd, "badges"),
      display_order: int(fd, "display_order"),
      published: bool(fd, "published"),
    } satisfies Database["public"]["Tables"]["landing_banners"]["Insert"];
    const q = id
      ? client.from("landing_banners").update(row).eq("banner_id", id)
      : client.from("landing_banners").insert(row);
    const { error } = await q;
    if (error) return data({ error: error.message }, { status: 400 });
  }
  return redirect(LIST_PATH[entity]);
}
