// 환불(전액·부분) 검증용 100원 테스트 상품 만들기/치우기.
//
// 왜 2건인가: 부분환불은 **주문 항목 단위**다(refundOrderItem). 한 주문에 항목이
// 하나뿐이면 전액환불밖에 못 눌러 부분환불 경로가 검증되지 않는다.
// 그래서 100원짜리 두 권을 한 장바구니에 담아 200원 주문을 만든다.
//
// ★학생에게 노출되지 않게 listed=false 로 만든다 — 도서목록에는 안 뜨고 상세 URL
//   로만 들어갈 수 있다. 결제까지는 정상 동작한다.
// ★book_type=pdf · shipping_fee_type=free — 배송비 3,500원이 붙거나 배송건이
//   생기지 않게 한다. 검증 대상은 환불이지 배송이 아니다.
//
//   node scripts/admin/test-refund-products.mjs create
//   node scripts/admin/test-refund-products.mjs status
//   node scripts/admin/test-refund-products.mjs remove
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const MARK = "[환불테스트]";
const ITEMS = [
  { title: `${MARK} 결제·환불 점검용 A`, price: 100 },
  { title: `${MARK} 결제·환불 점검용 B`, price: 100 },
];

const mode = process.argv[2] ?? "status";

async function current() {
  const { data, error } = await sb
    .from("books")
    .select("book_id, title, price_krw, sale_status, listed, deleted_at")
    .like("title", `${MARK}%`)
    .order("title");
  if (error) throw new Error(error.message);
  return data;
}

if (mode === "create") {
  const have = await current();
  const rows = ITEMS.filter((i) => !have.some((h) => h.title === i.title && !h.deleted_at)).map(
    (i) => ({
      title: i.title,
      author: "리담",
      publisher: "리담지식재산교육원",
      price_krw: i.price,
      list_price_krw: i.price,
      sale_status: "on_sale",
      book_type: "pdf",
      shipping_fee_type: "free",
      shipping_fee_krw: 0,
      tax_free: true,
      track_stock: false,
      listed: false, // ★도서목록 미노출 — 상세 URL 로만 접근
      course_only: false,
      short_info: "결제·환불 동작 확인용입니다. 실제 학습 자료가 아닙니다.",
      description: "환불(전액·부분) 검증용 테스트 상품. 확인이 끝나면 삭제합니다.",
    }),
  );
  if (rows.length) {
    const { error } = await sb.from("books").insert(rows);
    if (error) throw new Error(error.message);
  }
  console.log(`생성 ${rows.length}건 (이미 있던 것 ${ITEMS.length - rows.length}건)`);
} else if (mode === "remove") {
  const have = (await current()).filter((b) => !b.deleted_at);
  // 주문에 걸려 있으면 지우지 않는다 — 주문 이력이 끊긴다.
  for (const b of have) {
    const { count } = await sb
      .from("order_items")
      .select("*", { count: "exact", head: true })
      .eq("book_id", b.book_id);
    if (count) {
      const { error } = await sb
        .from("books")
        .update({ sale_status: "closed", listed: false })
        .eq("book_id", b.book_id);
      if (error) throw new Error(error.message);
      console.log(`  판매중지 — ${b.title} (주문 ${count}건이 참조 중이라 삭제하지 않음)`);
      continue;
    }
    const { error } = await sb
      .from("books")
      .update({ deleted_at: new Date().toISOString() })
      .eq("book_id", b.book_id);
    if (error) throw new Error(error.message);
    console.log(`  삭제 — ${b.title}`);
  }
} else {
  const have = await current();
  if (!have.length) console.log("테스트 상품 없음");
  for (const b of have) {
    console.log(
      `${b.deleted_at ? "[삭제됨] " : ""}${b.title} · ${b.price_krw}원 · ${b.sale_status} · 목록노출=${b.listed}`,
    );
    console.log(`   구매 URL: /lecture/books/${b.book_id}`);
  }
}
