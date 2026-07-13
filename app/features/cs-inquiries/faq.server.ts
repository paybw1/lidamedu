// 고객센터 FAQ — 공개 조회(카테고리 그룹) + 운영자 CRUD. support_faqs 테이블.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

type Client = SupabaseClient<Database>;

export interface SupportFaq {
  faqId: string;
  category: string;
  question: string;
  answer: string;
  sortOrder: number;
  published: boolean;
}
export interface FaqGroup {
  category: string;
  items: SupportFaq[];
}

// 카테고리 표시 순서(그 외는 뒤에 등장순).
const CATEGORY_ORDER = [
  "동영상·기기",
  "결제·취소·환불",
  "수강·교재",
  "회원정보",
];

function toFaq(r: Record<string, unknown>): SupportFaq {
  return {
    faqId: String(r.faq_id),
    category: String(r.category ?? "기타"),
    question: String(r.question ?? ""),
    answer: String(r.answer ?? ""),
    sortOrder: Number(r.sort_order ?? 0),
    published: Boolean(r.published),
  };
}

export async function listSupportFaqs(
  client: Client,
  opts: { includeUnpublished?: boolean } = {},
): Promise<SupportFaq[]> {
  let q = client
    .from("support_faqs")
    .select("faq_id, category, question, answer, sort_order, published")
    .is("deleted_at", null)
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true });
  if (!opts.includeUnpublished) q = q.eq("published", true);
  const { data } = await q;
  return (data ?? []).map(toFaq);
}

// 공개용 — 카테고리별 그룹(표시 순서 적용).
export async function listSupportFaqGroups(client: Client): Promise<FaqGroup[]> {
  const all = await listSupportFaqs(client);
  const map = new Map<string, SupportFaq[]>();
  for (const f of all) {
    const arr = map.get(f.category) ?? [];
    arr.push(f);
    map.set(f.category, arr);
  }
  const cats = [...map.keys()].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
  return cats.map((category) => ({ category, items: map.get(category)! }));
}

export async function getSupportFaq(
  client: Client,
  id: string,
): Promise<SupportFaq | null> {
  const { data } = await client
    .from("support_faqs")
    .select("faq_id, category, question, answer, sort_order, published")
    .eq("faq_id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return data ? toFaq(data) : null;
}

export interface UpsertFaqInput {
  category: string;
  question: string;
  answer: string;
  sortOrder: number;
  published: boolean;
}

export async function upsertSupportFaq(
  client: Client,
  input: UpsertFaqInput,
  id?: string,
): Promise<{ ok: boolean; error?: string }> {
  const row = {
    category: input.category,
    question: input.question,
    answer: input.answer,
    sort_order: input.sortOrder,
    published: input.published,
  };
  const q = id
    ? client.from("support_faqs").update(row).eq("faq_id", id)
    : client.from("support_faqs").insert(row);
  const { error } = await q;
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function softDeleteSupportFaq(
  client: Client,
  id: string,
): Promise<void> {
  await client
    .from("support_faqs")
    .update({ deleted_at: new Date().toISOString() })
    .eq("faq_id", id);
}
