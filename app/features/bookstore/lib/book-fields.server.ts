// 도서 등록/수정 폼 필드 파싱·DB 행 매핑 (신규·수정 액션 공용). 구 플랫폼 도서등록 사양.
import { randomUUID } from "node:crypto";

import { z } from "zod";

import adminClient from "~/core/lib/supa-admin-client.server";

/** 표지(공개 버킷)·PDF(비공개 버킷) 파일 업로드. 없으면 undefined(기존 유지). */
export async function uploadBookFiles(
  fd: FormData,
): Promise<{ coverFilePath?: string; pdfPath?: string }> {
  const out: { coverFilePath?: string; pdfPath?: string } = {};
  const cover = fd.get("coverFile");
  if (cover instanceof File && cover.size > 0) {
    const ext = (cover.name.split(".").pop() || "jpg").toLowerCase();
    const path = `covers/${randomUUID()}.${ext}`;
    const { error } = await adminClient.storage
      .from("book-covers")
      .upload(path, cover, { contentType: cover.type || undefined });
    if (!error) {
      out.coverFilePath = adminClient.storage
        .from("book-covers")
        .getPublicUrl(path).data.publicUrl;
    }
  }
  const pdf = fd.get("pdfFile");
  if (pdf instanceof File && pdf.size > 0) {
    const path = `pdf/${randomUUID()}.pdf`;
    // 비공개 — 경로만 저장, 다운로드는 소유자 검증 후 signed URL(S2).
    const { error } = await adminClient.storage
      .from("book-files")
      .upload(path, pdf, { contentType: "application/pdf" });
    if (!error) out.pdfPath = path;
  }
  return out;
}

const intOrNull = z
  .union([z.literal(""), z.coerce.number().int()])
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();
const nz = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? undefined : s;
};
const bool = (v: FormDataEntryValue | null) => v === "on" || v === "1" || v === "true";

export const bookFormSchema = z.object({
  title: z.string().trim().min(1).max(200),
  categoryId: z.string().uuid().optional(),
  coverPath: z.string().trim().url().max(500).optional(),
  bookType: z.enum(["physical", "pdf"]).default("physical"),
  downloadLimit: z.coerce.number().int().min(0).max(1000).default(0),
  shortInfo: z.string().trim().max(300).optional(),
  listPriceKrw: intOrNull,
  priceKrw: z.coerce.number().int().min(0),
  shippingFeeType: z.enum(["cod", "prepaid", "free"]).default("cod"),
  shippingFeeKrw: z.coerce.number().int().min(0).default(0),
  taxFree: z.boolean().default(false),
  groupDiscountOk: z.boolean().default(false),
  perPersonLimit: intOrNull,
  courseOnly: z.boolean().default(false),
  eventPhrase: z.string().trim().max(60).optional(),
  labelText: z.string().trim().max(20).optional(),
  labelColor: z.string().trim().max(20).optional(),
  isbn: z.string().trim().max(20).optional(),
  author: z.string().trim().max(80).optional(),
  publisher: z.string().trim().max(80).optional(),
  publishedOn: z.string().trim().max(20).optional(),
  previewUrl: z.string().trim().url().max(500).optional(),
  shortIntro: z.string().trim().max(1000).optional(),
  description: z.string().trim().max(20000).optional(),
  authorBio: z.string().trim().max(20000).optional(),
  toc: z.string().trim().max(20000).optional(),
  extra1: z.string().trim().max(500).optional(),
  extra2: z.string().trim().max(500).optional(),
  isRecommended: z.boolean().default(false),
  saleStatus: z.enum(["draft", "on_sale", "paused", "closed"]).default("draft"),
  listed: z.boolean().default(true),
});

export type BookFormValues = z.infer<typeof bookFormSchema>;

/** FormData → 검증된 값(파일 제외). 파일(표지/PDF)은 액션에서 별도 처리. */
export function parseBookForm(
  fd: FormData,
): { ok: true; values: BookFormValues } | { ok: false; error: string } {
  const raw = {
    title: nz(fd.get("title")),
    categoryId: nz(fd.get("categoryId")),
    coverPath: nz(fd.get("coverPath")),
    bookType: nz(fd.get("bookType")) ?? "physical",
    downloadLimit: fd.get("downloadLimit") ?? 0,
    shortInfo: nz(fd.get("shortInfo")),
    listPriceKrw: (fd.get("listPriceKrw") as string) ?? "",
    priceKrw: fd.get("priceKrw") ?? 0,
    shippingFeeType: nz(fd.get("shippingFeeType")) ?? "cod",
    shippingFeeKrw: fd.get("shippingFeeKrw") ?? 0,
    taxFree: bool(fd.get("taxFree")),
    groupDiscountOk: bool(fd.get("groupDiscountOk")),
    perPersonLimit: (fd.get("perPersonLimit") as string) ?? "",
    courseOnly: bool(fd.get("courseOnly")),
    eventPhrase: nz(fd.get("eventPhrase")),
    labelText: nz(fd.get("labelText")),
    labelColor: nz(fd.get("labelColor")),
    isbn: nz(fd.get("isbn")),
    author: nz(fd.get("author")),
    publisher: nz(fd.get("publisher")),
    publishedOn: nz(fd.get("publishedOn")),
    previewUrl: nz(fd.get("previewUrl")),
    shortIntro: nz(fd.get("shortIntro")),
    description: nz(fd.get("description")),
    authorBio: nz(fd.get("authorBio")),
    toc: nz(fd.get("toc")),
    extra1: nz(fd.get("extra1")),
    extra2: nz(fd.get("extra2")),
    isRecommended: bool(fd.get("isRecommended")),
    saleStatus: nz(fd.get("saleStatus")) ?? "draft",
    listed: bool(fd.get("listed")),
  };
  const parsed = bookFormSchema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "입력 내용을 확인해 주세요.",
    };
  return { ok: true, values: parsed.data };
}

/** 검증된 값 → books 테이블 행(insert/update 공용). 파일 경로는 인자로 주입. */
export function bookRow(
  v: BookFormValues,
  files: { coverFilePath?: string | null; pdfPath?: string | null } = {},
) {
  return {
    title: v.title,
    category_id: v.categoryId ?? null,
    cover_path: v.coverPath ?? null,
    ...(files.coverFilePath !== undefined
      ? { cover_file_path: files.coverFilePath }
      : {}),
    book_type: v.bookType,
    ...(files.pdfPath !== undefined ? { pdf_path: files.pdfPath } : {}),
    download_limit: v.downloadLimit,
    short_info: v.shortInfo ?? null,
    list_price_krw: v.listPriceKrw ?? null,
    price_krw: v.priceKrw,
    shipping_fee_type: v.shippingFeeType,
    shipping_fee_krw: v.shippingFeeKrw,
    tax_free: v.taxFree,
    group_discount_ok: v.groupDiscountOk,
    per_person_limit: v.perPersonLimit ?? null,
    course_only: v.courseOnly,
    event_phrase: v.eventPhrase ?? null,
    label_text: v.labelText ?? null,
    label_color: v.labelColor ?? null,
    isbn: v.isbn ?? null,
    author: v.author ?? null,
    publisher: v.publisher ?? null,
    published_on: v.publishedOn ?? null,
    preview_url: v.previewUrl ?? null,
    short_intro: v.shortIntro ?? null,
    description: v.description ?? null,
    author_bio: v.authorBio ?? null,
    toc: v.toc ?? null,
    extra1: v.extra1 ?? null,
    extra2: v.extra2 ?? null,
    is_recommended: v.isRecommended,
    sale_status: v.saleStatus,
    listed: v.listed,
  };
}
