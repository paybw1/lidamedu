// feat-6-012 강사소개 — 서버 쿼리. 공개 읽기는 RLS(published)로 강제, 편집은 staff.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

import type { InstructorCategory } from "./labels";

type Client = SupabaseClient<Database>;

export interface InstructorCourse {
  code: string;
  name: string;
  priceKrw: number;
  productKind: "course" | "tpass";
}

/** 이 강사(profile_id)가 담당하는 판매중 강의 상품. course_series.instructor_id 로 정밀 연결.
 *  강의 카탈로그(subscription_plans course/tpass) → plan_courses → courses → course_series. adminClient 읽기. */
export async function getInstructorCourses(
  profileId: string | null,
): Promise<InstructorCourse[]> {
  if (!profileId) return [];
  const { data: series } = await adminClient
    .from("course_series")
    .select("series_id")
    .eq("instructor_id", profileId)
    .is("deleted_at", null);
  const seriesIds = (series ?? []).map((s) => s.series_id);
  if (seriesIds.length === 0) return [];
  const { data: courses } = await adminClient
    .from("courses")
    .select("course_id")
    .in("series_id", seriesIds)
    .is("deleted_at", null);
  const courseIds = (courses ?? []).map((c) => c.course_id);
  if (courseIds.length === 0) return [];
  const { data: links } = await adminClient
    .from("plan_courses")
    .select("plan_id")
    .in("course_id", courseIds);
  const planIds = [...new Set((links ?? []).map((l) => l.plan_id))];
  if (planIds.length === 0) return [];
  const { data: plans } = await adminClient
    .from("subscription_plans")
    .select("code, name, price_krw, product_kind, is_active")
    .in("plan_id", planIds)
    .eq("is_active", true)
    .in("product_kind", ["course", "tpass"]);
  return (plans ?? []).map((p) => ({
    code: p.code,
    name: p.name,
    priceKrw: p.price_krw,
    productKind: p.product_kind as "course" | "tpass",
  }));
}

export interface InstructorMetric {
  value: string;
  unit: string;
  label: string;
}
export interface InstructorBook {
  title: string;
  label: string;
}

export interface InstructorCard {
  instructorId: string;
  slug: string;
  name: string;
  monogram: string | null;
  category: InstructorCategory;
  subjectLabel: string;
  roleLabel: string | null;
  headline: string | null;
  photoPath: string | null;
  published: boolean;
  displayOrder: number;
}

export interface InstructorDetail extends InstructorCard {
  title: string | null;
  subjectCodes: string[];
  metrics: InstructorMetric[];
  education: string[];
  career: string[];
  books: InstructorBook[];
  philosophyMd: string | null;
  bioMd: string | null;
  profileId: string | null;
}

const SEL_CARD =
  "instructor_id, slug, name, monogram, category, subject_label, role_label, headline, photo_path, published, display_order";
const SEL_FULL =
  SEL_CARD +
  ", title, subject_codes, metrics, education, career, books, philosophy_md, bio_md, profile_id";

function asStrArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
function asMetrics(v: unknown): InstructorMetric[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
    .map((m) => ({
      value: String(m.value ?? ""),
      unit: String(m.unit ?? ""),
      label: String(m.label ?? ""),
    }))
    .filter((m) => m.value || m.label);
}
function asBooks(v: unknown): InstructorBook[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((b): b is Record<string, unknown> => !!b && typeof b === "object")
    .map((b) => ({ title: String(b.title ?? ""), label: String(b.label ?? "") }))
    .filter((b) => b.title);
}

type CardRow = {
  instructor_id: string;
  slug: string;
  name: string;
  monogram: string | null;
  category: string;
  subject_label: string;
  role_label: string | null;
  headline: string | null;
  photo_path: string | null;
  published: boolean;
  display_order: number;
};
function toCard(r: CardRow): InstructorCard {
  return {
    instructorId: r.instructor_id,
    slug: r.slug,
    name: r.name,
    monogram: r.monogram,
    category: (r.category as InstructorCategory) ?? "ip_law",
    subjectLabel: r.subject_label,
    roleLabel: r.role_label,
    headline: r.headline,
    photoPath: r.photo_path,
    published: r.published,
    displayOrder: r.display_order,
  };
}

/** 공개 강사 목록(게시 순서). RLS 가 published 강제(비게시는 staff 요청 시 포함). */
export async function listInstructors(client: Client): Promise<InstructorCard[]> {
  const { data, error } = await client
    .from("instructors")
    .select(SEL_CARD)
    .is("deleted_at", null)
    .order("display_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => toCard(r as CardRow));
}

export async function getInstructorBySlug(
  client: Client,
  slug: string,
): Promise<InstructorDetail | null> {
  const { data, error } = await client
    .from("instructors")
    .select(SEL_FULL)
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return toDetail(data as unknown as CardRow & Record<string, unknown>);
}

export async function getInstructorById(
  client: Client,
  id: string,
): Promise<InstructorDetail | null> {
  const { data, error } = await client
    .from("instructors")
    .select(SEL_FULL)
    .eq("instructor_id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return toDetail(data as unknown as CardRow & Record<string, unknown>);
}

function toDetail(r: CardRow & Record<string, unknown>): InstructorDetail {
  return {
    ...toCard(r),
    title: (r.title as string | null) ?? null,
    subjectCodes: asStrArray(r.subject_codes),
    metrics: asMetrics(r.metrics),
    education: asStrArray(r.education),
    career: asStrArray(r.career),
    books: asBooks(r.books),
    philosophyMd: (r.philosophy_md as string | null) ?? null,
    bioMd: (r.bio_md as string | null) ?? null,
    profileId: (r.profile_id as string | null) ?? null,
  };
}

export async function softDeleteInstructor(
  client: Client,
  id: string,
): Promise<void> {
  const { error } = await client
    .from("instructors")
    .update({ deleted_at: new Date().toISOString() })
    .eq("instructor_id", id);
  if (error) throw error;
}
