// feat-6-012 강사소개 — 운영자 폼 파싱 + 사진 업로드(instructor-photos 공개 버킷, service_role).
import { randomUUID } from "node:crypto";

import { z } from "zod";

import adminClient from "~/core/lib/supa-admin-client.server";

const lines = (v: FormDataEntryValue | null): string[] =>
  typeof v === "string"
    ? v.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    : [];
const nz = (v: FormDataEntryValue | null): string | undefined => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? undefined : s;
};
const bool = (v: FormDataEntryValue | null) => v === "on" || v === "true" || v === "1";

// "value | unit | label" 줄 → metric
function parseMetrics(v: FormDataEntryValue | null) {
  return lines(v).map((ln) => {
    const [value = "", unit = "", label = ""] = ln.split("|").map((s) => s.trim());
    return { value, unit, label };
  }).filter((m) => m.value || m.label);
}
// "title | label" 줄 → book
function parseBooks(v: FormDataEntryValue | null) {
  return lines(v).map((ln) => {
    const [title = "", label = ""] = ln.split("|").map((s) => s.trim());
    return { title, label };
  }).filter((b) => b.title);
}
// "라벨 | URL" 줄 → link. URL 은 http(s) 만 허용, 라벨 없으면 URL 을 라벨로.
function parseLinks(v: FormDataEntryValue | null) {
  return lines(v)
    .map((ln) => {
      const [a = "", b = ""] = ln.split("|").map((s) => s.trim());
      // "라벨 | URL" 또는 "URL" 단독. http 로 시작하는 쪽을 URL 로 판별.
      const url = /^https?:\/\//i.test(b) ? b : /^https?:\/\//i.test(a) ? a : "";
      const label = url === b ? a : url === a ? "" : a;
      return { label: label || url, url };
    })
    .filter((l) => l.url);
}

const schema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]*$/, "slug 은 영소문자·숫자·하이픈"),
  name: z.string().trim().min(1).max(40),
  category: z.enum(["ip_law", "civil", "civil_procedure", "science"]),
  subjectLabel: z.string().trim().min(1).max(60),
  displayOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export type InstructorFormResult =
  | { ok: true; row: Record<string, unknown>; slug: string }
  | { ok: false; error: string };

export function parseInstructorForm(
  fd: FormData,
  photoUrl?: string | null,
): InstructorFormResult {
  const base = schema.safeParse({
    slug: nz(fd.get("slug")),
    name: nz(fd.get("name")),
    category: nz(fd.get("category")) ?? "ip_law",
    subjectLabel: nz(fd.get("subjectLabel")),
    displayOrder: fd.get("displayOrder") ?? 0,
  });
  if (!base.success)
    return { ok: false, error: base.error.issues[0]?.message ?? "입력 확인" };
  const v = base.data;
  const row: Record<string, unknown> = {
    slug: v.slug,
    name: v.name,
    monogram: nz(fd.get("monogram")) ?? null,
    category: v.category,
    subject_label: v.subjectLabel,
    subject_codes: (nz(fd.get("subjectCodes")) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    title: nz(fd.get("title")) ?? null,
    role_label: nz(fd.get("roleLabel")) ?? null,
    headline: nz(fd.get("headline")) ?? null,
    metrics: parseMetrics(fd.get("metrics")),
    education: lines(fd.get("education")),
    career: lines(fd.get("career")),
    books: parseBooks(fd.get("books")),
    links: parseLinks(fd.get("links")),
    philosophy_md: nz(fd.get("philosophyMd")) ?? null,
    bio_md: nz(fd.get("bioMd")) ?? null,
    display_order: v.displayOrder,
    published: bool(fd.get("published")),
  };
  // 사진 업로드가 있으면 갱신, 없으면 기존 유지(undefined → set 안 함).
  if (photoUrl !== undefined && photoUrl !== null) row.photo_path = photoUrl;
  return { ok: true, row, slug: v.slug };
}

/** 프로필 사진 업로드 → 공개 URL. 없으면 undefined(기존 유지). */
export async function uploadInstructorPhoto(
  fd: FormData,
): Promise<string | undefined> {
  const f = fd.get("photo");
  if (!(f instanceof File) || f.size === 0) return undefined;
  const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
  const path = `photos/${randomUUID()}.${ext}`;
  const { error } = await adminClient.storage
    .from("instructor-photos")
    .upload(path, f, { contentType: f.type || undefined });
  if (error) return undefined;
  return adminClient.storage.from("instructor-photos").getPublicUrl(path).data
    .publicUrl;
}
