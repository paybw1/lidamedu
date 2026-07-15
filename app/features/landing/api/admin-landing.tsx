// feat-12 강의 플랫폼 랜딩 운영자 액션 — 일정·소식·배너 저장/삭제/순서변경.
// staff 게이트, 쓰기는 요청 클라이언트(RLS staff 백스톱). entity 로 대상 구분.
import { randomUUID } from "node:crypto";

import type { Database } from "database.types";
import { data, redirect } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { getStaffRole } from "~/features/laws/queries.server";

import { reorderRow, softDeleteRow, upsertExamInfo } from "../queries.server";

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
  const entityRaw = String(fd.get("entity") ?? "");

  // 시험정보 — 단일 JSONB 문서 upsert(테이블 CRUD 와 별개 경로). data 필드에 전체 문서 JSON.
  if (entityRaw === "exam_info") {
    if (String(fd.get("intent") ?? "") !== "save")
      return data({ error: "bad intent" }, { status: 400 });
    let payload: unknown;
    try {
      payload = JSON.parse(String(fd.get("data") ?? "null"));
    } catch {
      return data({ error: "JSON 파싱 실패" }, { status: 400 });
    }
    const res = await upsertExamInfo(client, payload, user.id);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return redirect("/admin/exam-info");
  }

  const entity = entityRaw as Entity;
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
      plan_code: str(fd, "plan_code"),
      intro_md: str(fd, "intro_md"),
      curriculum_md: str(fd, "curriculum_md"),
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
    // 저장 실패 시 되돌아갈 폼 경로(조용한 실패 방지 — ?err= 로 사유 표시).
    const backPath = id
      ? `/admin/landing-banners/${id}/edit`
      : "/admin/landing-banners/new";
    // 이미지 배너 — 파일 업로드 시 공개 버킷에 저장(URL 직접 입력도 허용).
    let imageUrl = str(fd, "image_url");
    const file = fd.get("image_file");
    if (file instanceof File && file.size > 0) {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `banners/${randomUUID()}.${ext}`;
      const { error: upErr } = await adminClient.storage
        .from("landing-banners")
        .upload(path, file, { contentType: file.type || undefined });
      // 업로드 실패를 조용히 무시하지 않고 사유를 표시(과거: 무시돼 이미지 없이 저장됐음).
      if (upErr)
        return redirect(
          `${backPath}?err=${encodeURIComponent(`이미지 업로드 실패: ${upErr.message}`)}`,
        );
      imageUrl = adminClient.storage
        .from("landing-banners")
        .getPublicUrl(path).data.publicUrl;
    }
    // HTML 배너 — 파일 업로드 시 그 내용을 body_html 로(직접작성 칸보다 우선).
    let bodyHtml = str(fd, "body_html");
    const htmlFile = fd.get("html_file");
    if (htmlFile instanceof File && htmlFile.size > 0) {
      const text = (await htmlFile.text()).trim();
      if (text) bodyHtml = text;
    }
    const tierRaw = int(fd, "tier");
    const imwRaw = int(fd, "image_max_width");
    const row = {
      kind: str(fd, "kind") ?? "promo",
      accent: str(fd, "accent") ?? "gilt",
      tier: tierRaw >= 1 && tierRaw <= 3 ? tierRaw : 1,
      image_url: imageUrl,
      // 0/빈값 = 전체 폭(제약 없음). 지정 시 렌더에서 가운데 정렬 + 원본 비율.
      image_max_width: imwRaw > 0 ? imwRaw : null,
      body_html: bodyHtml,
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
    if (error)
      return redirect(`${backPath}?err=${encodeURIComponent(error.message)}`);
  }
  return redirect(LIST_PATH[entity]);
}
