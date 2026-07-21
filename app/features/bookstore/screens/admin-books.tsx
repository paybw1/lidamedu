// feat-11-004 4c — 도서 관리: 등록·판매상태·재고 입고(원장)·강의 상품 연결. staff.

import { useEffect } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BookOpenIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { Link, data, useFetcher } from "react-router";
import { toast } from "sonner";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import { hasDutyAccess } from "~/features/admin/lib/duties.server";
import { createUserNotifications } from "~/features/notifications/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-books";

export const meta: Route.MetaFunction = () => [
  { title: "도서 관리 | 리담변리사학원" },
];

const SALE_LABEL: Record<string, string> = {
  scheduled: "예정",
  on_sale: "판매중",
  paused: "일시중지",
  closed: "종료",
  hidden: "숨김",
};

async function requireStaff(request: Request) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });
  if (!(await hasDutyAccess("lms_video_admin", user.id, role))) {
    throw data("Forbidden — 관리자 관리에서 접근 권한을 배정받아야 합니다.", { status: 403 });
  }
  return { client, user, role };
}

export async function loader({ request }: Route.LoaderArgs) {
  const { client, role } = await requireStaff(request);
  const [
    { data: books },
    { data: stocks },
    { data: links },
    { data: plans },
    { data: previews },
    { data: categories },
  ] = await Promise.all([
    client
      .from("books")
      .select(
        "book_id, title, author, publisher, price_krw, sale_status, isbn, description, cover_path, track_stock, sort_order",
      )
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false }),
    adminClient.from("v_book_stock").select("book_id, stock"),
    adminClient.from("plan_book_links").select("plan_id, book_id, requirement"),
    adminClient
      .from("subscription_plans")
      .select("plan_id, name")
      .in("product_kind", ["course", "tpass", "subject", "bundle"])
      .order("display_order"),
    adminClient
      .from("book_preview_pages")
      .select("preview_id, book_id, image_url, sort_order")
      .order("sort_order", { ascending: true }),
    adminClient
      .from("book_categories")
      .select("category_id, name")
      .order("sort_order", { ascending: true }),
  ]);
  const stockByBook = new Map((stocks ?? []).map((s) => [s.book_id, s.stock ?? 0]));
  return {
    role,
    plans: (plans ?? []).map((p) => ({ planId: p.plan_id, name: p.name })),
    categories: (categories ?? []).map((c) => ({
      categoryId: c.category_id,
      name: c.name,
    })),
    books: (books ?? []).map((b) => ({
      bookId: b.book_id,
      title: b.title,
      author: b.author,
      publisher: b.publisher,
      priceKrw: b.price_krw,
      saleStatus: b.sale_status,
      isbn: b.isbn,
      description: b.description,
      coverPath: b.cover_path,
      trackStock: b.track_stock,
      stock: b.track_stock ? (stockByBook.get(b.book_id) ?? 0) : null,
      linkedPlans: (links ?? [])
        .filter((l) => l.book_id === b.book_id)
        .map((l) => ({ planId: l.plan_id, requirement: l.requirement })),
      previews: (previews ?? [])
        .filter((p) => p.book_id === b.book_id)
        .map((p) => ({ previewId: p.preview_id, imageUrl: p.image_url })),
    })),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { client, user } = await requireStaff(request);
  const fd = await request.formData();
  const intent = fd.get("intent");

  // 도서 생성·수정은 전용 페이지(/admin/books/new · :id/edit)가 담당. 여기선 목록 빠른 조작만.
  if (intent === "cat_add") {
    const name = String(fd.get("name") ?? "").trim();
    if (!name) return data({ error: "카테고리명을 입력해 주세요." }, { status: 400 });
    const { error } = await client.from("book_categories").insert({ name });
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true as const });
  }
  if (intent === "cat_delete") {
    const categoryId = String(fd.get("categoryId") ?? "");
    if (!categoryId) return data({ error: "잘못된 요청" }, { status: 400 });
    const { error } = await client
      .from("book_categories")
      .delete()
      .eq("category_id", categoryId);
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true as const });
  }

  if (intent === "move_book") {
    // 진열 순서 이동 — 인접 도서와 sort_order 교환(동률 대비 전체 재부여 후 swap).
    const bookId = String(fd.get("bookId") ?? "");
    const dir = String(fd.get("dir") ?? "");
    if (!bookId || (dir !== "up" && dir !== "down"))
      return data({ error: "잘못된 요청" }, { status: 400 });
    const { data: list } = await client
      .from("books")
      .select("book_id")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    const rows = list ?? [];
    const idx = rows.findIndex((r) => r.book_id === bookId);
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= rows.length)
      return data({ ok: true as const }); // 경계 — 무시
    // 전체를 10 간격으로 재부여한 뒤 두 위치 교환.
    const reordered = rows.map((r, i) => ({ ...r, order: (i + 1) * 10 }));
    const tmp = reordered[idx].order;
    reordered[idx].order = reordered[swapIdx].order;
    reordered[swapIdx].order = tmp;
    for (const r of reordered) {
      const { error } = await client
        .from("books")
        .update({ sort_order: r.order })
        .eq("book_id", r.book_id);
      if (error) return data({ error: error.message }, { status: 400 });
    }
    return data({ ok: true as const });
  }

  if (intent === "delete_book") {
    // 소프트 삭제 — 주문 이력·환불 보존을 위해 deleted_at 만 설정(목록·카탈로그 비노출).
    const bookId = String(fd.get("bookId") ?? "");
    if (!bookId) return data({ error: "잘못된 요청" }, { status: 400 });
    const { error } = await client
      .from("books")
      .update({ deleted_at: new Date().toISOString() })
      .eq("book_id", bookId);
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true as const });
  }

  if (intent === "set_status") {
    const bookId = String(fd.get("bookId") ?? "");
    const status = String(fd.get("status") ?? "");
    if (!bookId || !(status in SALE_LABEL)) return data({ error: "잘못된 요청" }, { status: 400 });
    const { error } = await client.from("books").update({ sale_status: status }).eq("book_id", bookId);
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true as const });
  }

  if (intent === "inbound") {
    const bookId = String(fd.get("bookId") ?? "");
    const qty = Math.trunc(Number(fd.get("qty") ?? 0));
    if (!bookId || qty === 0) return data({ error: "수량을 확인해 주세요." }, { status: 400 });
    const { error } = await adminClient.from("book_stock_moves").insert({
      book_id: bookId,
      delta: qty,
      reason: qty > 0 ? "inbound" : "adjust",
      actor_id: user.id,
      note: String(fd.get("note") ?? "").trim() || null,
    });
    if (error) return data({ error: error.message }, { status: 400 });
    // 재고를 기록하면 이 도서는 수량 관리 대상으로 전환(품절 게이트 활성화).
    await adminClient.from("books").update({ track_stock: true }).eq("book_id", bookId);
    // feat-11 B2-4 — 재입고 시 알림 신청자에게 발송(재고>0 + 미발송, 멱등).
    if (qty > 0) await notifyRestock(bookId);
    return data({ ok: true as const });
  }

  if (intent === "link_plan") {
    const bookId = String(fd.get("bookId") ?? "");
    const planId = String(fd.get("planId") ?? "");
    const requirement = String(fd.get("requirement") ?? "optional");
    if (!bookId || !planId) return data({ error: "상품을 선택해 주세요." }, { status: 400 });
    const { error } = await client.from("plan_book_links").upsert(
      { book_id: bookId, plan_id: planId, requirement },
      { onConflict: "plan_id,book_id" },
    );
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true as const });
  }

  if (intent === "add_preview") {
    const bookId = String(fd.get("bookId") ?? "");
    const imageUrl = String(fd.get("imageUrl") ?? "").trim();
    const sortOrder = Number(fd.get("sortOrder") ?? 0);
    if (!bookId || !/^https?:\/\//.test(imageUrl))
      return data({ error: "미리보기 이미지 URL을 확인해 주세요." }, { status: 400 });
    const { error } = await client.from("book_preview_pages").insert({
      book_id: bookId,
      image_url: imageUrl,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    });
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true as const });
  }

  if (intent === "remove_preview") {
    const previewId = String(fd.get("previewId") ?? "");
    if (!previewId) return data({ error: "잘못된 요청" }, { status: 400 });
    const { error } = await client
      .from("book_preview_pages")
      .delete()
      .eq("preview_id", previewId);
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true as const });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}

// 재입고 알림 발송 — 재고>0 이고 미발송(notified_at null) 신청자에게. best-effort·멱등.
async function notifyRestock(bookId: string): Promise<void> {
  try {
    const { data: stockRow } = await adminClient
      .from("v_book_stock")
      .select("stock")
      .eq("book_id", bookId)
      .maybeSingle();
    if (Number(stockRow?.stock ?? 0) <= 0) return;
    const { data: alerts } = await adminClient
      .from("book_restock_alerts")
      .select("user_id")
      .eq("book_id", bookId)
      .is("notified_at", null);
    const recipientIds = (alerts ?? []).map((a) => a.user_id);
    if (recipientIds.length === 0) return;
    const { data: bk } = await adminClient
      .from("books")
      .select("title")
      .eq("book_id", bookId)
      .maybeSingle();
    await createUserNotifications({
      recipientIds,
      kind: "book_restock",
      entityType: "book",
      entityId: bookId,
      title: "재입고 알림",
      body: `《${bk?.title ?? "도서"}》 재입고 — 지금 구매할 수 있습니다.`,
      href: `/lecture/books/${bookId}`,
    });
    await adminClient
      .from("book_restock_alerts")
      .update({ notified_at: new Date().toISOString() })
      .eq("book_id", bookId)
      .is("notified_at", null);
  } catch (e) {
    console.error("[bookstore] restock notify failed:", e);
  }
}

export default function AdminBooks({ loaderData }: Route.ComponentProps) {
  const { books, plans, categories, role } = loaderData;
  return (
    <AdminShell
      cluster="lms"
      role={role}
      title="도서 관리"
      desc="도서 등록·판매상태·재고(입고 원장)와 강의 상품 연결(결제 화면 함께 구매)을 관리합니다. 재고는 판매 시 자동 차감, 환불 시 자동 복원됩니다."
      headerRight={
        <div className="flex items-center gap-2">
          <Chip tone="solid">
            <BookOpenIcon className="size-3" /> {books.length}종
          </Chip>
          <Button asChild size="sm">
            <Link to="/admin/books/new">
              <PlusIcon className="size-3.5" /> 도서 등록
            </Link>
          </Button>
        </div>
      }
    >
      <CategoryManager categories={categories} />
      <div className="mt-4">
        {books.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-10 text-center text-sm">
            등록된 도서가 없습니다.
          </p>
        ) : (
          <IndexTable
            minWidth={960}
            headers={[
              { label: "순서", align: "center", width: "3.5rem" },
              { label: "도서" },
              { label: "판매가", align: "right", width: "6.5rem" },
              { label: "재고", align: "right", width: "4.5rem" },
              { label: "판매상태", width: "7rem" },
              { label: "연결 상품", width: "16rem" },
              { label: "입고", width: "11rem" },
              { label: "미리보기", width: "13rem" },
            ]}
          >
            {books.map((b, i) => (
              <BookRow
                key={b.bookId}
                book={b}
                plans={plans}
                isFirst={i === 0}
                isLast={i === books.length - 1}
              />
            ))}
          </IndexTable>
        )}
      </div>
    </AdminShell>
  );
}

// 카테고리 관리 — 추가/삭제(도서등록 드롭다운에 노출).
function CategoryManager({
  categories,
}: {
  categories: Array<{ categoryId: string; name: string }>;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.error)
      toast.error(fetcher.data.error);
  }, [fetcher.state, fetcher.data]);
  return (
    <div className="border-border bg-card flex flex-wrap items-center gap-2 rounded-xl border p-3">
      <span className="text-muted-foreground text-[11px] font-semibold">카테고리</span>
      {categories.map((c) => (
        <span
          key={c.categoryId}
          className="border-border inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px]"
        >
          {c.name}
          <fetcher.Form method="post" className="inline">
            <input type="hidden" name="intent" value="cat_delete" />
            <input type="hidden" name="categoryId" value={c.categoryId} />
            <button type="submit" aria-label="카테고리 삭제" className="text-muted-foreground hover:text-rose-600">
              ✕
            </button>
          </fetcher.Form>
        </span>
      ))}
      <fetcher.Form method="post" className="flex items-center gap-1">
        <input type="hidden" name="intent" value="cat_add" />
        <input name="name" placeholder="새 카테고리" maxLength={40} className="border-input bg-background h-7 w-28 rounded-md border px-2 text-[12px]" />
        <button type="submit" className="border-border hover:bg-muted/50 h-7 rounded-md border px-2 text-[12px]">추가</button>
      </fetcher.Form>
    </div>
  );
}

function BookRow({
  book,
  plans,
  isFirst,
  isLast,
}: {
  book: {
    bookId: string;
    title: string;
    author: string | null;
    publisher: string | null;
    priceKrw: number;
    saleStatus: string;
    isbn: string | null;
    description: string | null;
    coverPath: string | null;
    trackStock: boolean;
    stock: number | null;
    linkedPlans: Array<{ planId: string; requirement: string }>;
    previews: Array<{ previewId: string; imageUrl: string }>;
  };
  plans: Array<{ planId: string; name: string }>;
  isFirst: boolean;
  isLast: boolean;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.error) toast.error(fetcher.data.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);
  const planName = (id: string) => plans.find((p) => p.planId === id)?.name ?? id.slice(0, 8);
  const move = (dir: "up" | "down") => {
    const f = new FormData();
    f.set("intent", "move_book");
    f.set("bookId", book.bookId);
    f.set("dir", dir);
    fetcher.submit(f, { method: "post" });
  };
  const del = () => {
    if (
      !window.confirm(
        `《${book.title}》 도서를 삭제할까요?\n목록·판매에서 즉시 사라집니다. (주문 이력은 보존)`,
      )
    )
      return;
    const f = new FormData();
    f.set("intent", "delete_book");
    f.set("bookId", book.bookId);
    fetcher.submit(f, { method: "post" });
  };
  const busy = fetcher.state !== "idle";
  return (
    <TR>
      <TD align="center">
        <div className="flex flex-col items-center gap-0.5">
          <button
            type="button"
            onClick={() => move("up")}
            disabled={isFirst || busy}
            aria-label="위로"
            className="text-muted-foreground hover:text-foreground disabled:opacity-25"
          >
            <ArrowUpIcon className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => move("down")}
            disabled={isLast || busy}
            aria-label="아래로"
            className="text-muted-foreground hover:text-foreground disabled:opacity-25"
          >
            <ArrowDownIcon className="size-3.5" />
          </button>
        </div>
      </TD>
      <TD>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{book.title}</p>
            <p className="text-muted-foreground text-[11px]">
              {[book.author, book.publisher, book.isbn].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          <Link
            to={`/admin/books/${book.bookId}/edit`}
            className="border-border hover:bg-muted/50 h-6 shrink-0 rounded-md border px-1.5 text-[11px] leading-6"
          >
            수정
          </Link>
          <button
            type="button"
            onClick={del}
            disabled={busy}
            title="도서 삭제"
            className="text-muted-foreground hover:text-rose-600 h-6 shrink-0 px-1 leading-6 disabled:opacity-40"
          >
            <Trash2Icon className="size-3.5" />
          </button>
        </div>
      </TD>
      <TD align="right" mono>₩{book.priceKrw.toLocaleString("ko-KR")}</TD>
      <TD align="right" mono>
        {book.stock === null ? (
          <span className="text-muted-foreground" title="재고 미관리 — 항상 판매 가능">
            —
          </span>
        ) : (
          <span className={book.stock <= 0 ? "text-rose-600 dark:text-rose-400" : ""}>
            {book.stock}
          </span>
        )}
      </TD>
      <TD>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="set_status" />
          <input type="hidden" name="bookId" value={book.bookId} />
          <select
            name="status"
            defaultValue={book.saleStatus}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="border-input bg-background h-7 rounded-md border px-1.5 text-[12px]"
          >
            {Object.entries(SALE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </fetcher.Form>
      </TD>
      <TD>
        <div className="flex flex-col gap-1">
          {book.linkedPlans.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {book.linkedPlans.map((l) => (
                <Chip key={l.planId} tone={l.requirement === "required" ? "violet" : "neutral"}>
                  {planName(l.planId)}
                  {l.requirement === "required" ? " (필수)" : ""}
                </Chip>
              ))}
            </div>
          ) : null}
          <fetcher.Form method="post" className="flex items-center gap-1">
            <input type="hidden" name="intent" value="link_plan" />
            <input type="hidden" name="bookId" value={book.bookId} />
            <select name="planId" className="border-input bg-background h-6 max-w-[9rem] rounded-md border px-1 text-[11px]">
              {plans.map((p) => (
                <option key={p.planId} value={p.planId}>{p.name}</option>
              ))}
            </select>
            <select name="requirement" className="border-input bg-background h-6 rounded-md border px-1 text-[11px]">
              <option value="optional">선택</option>
              <option value="required">필수</option>
            </select>
            <button type="submit" className="border-border hover:bg-muted/50 h-6 rounded-md border px-1.5 text-[11px]">
              연결
            </button>
          </fetcher.Form>
        </div>
      </TD>
      <TD>
        <fetcher.Form method="post" className="flex items-center gap-1">
          <input type="hidden" name="intent" value="inbound" />
          <input type="hidden" name="bookId" value={book.bookId} />
          <input name="qty" type="number" placeholder="+수량" className="border-input bg-background h-6 w-16 rounded-md border px-1 text-[11px] tabular-nums" />
          <button type="submit" className="border-border hover:bg-muted/50 h-6 rounded-md border px-1.5 text-[11px]">
            입고
          </button>
        </fetcher.Form>
      </TD>
      <TD>
        <div className="flex flex-col gap-1">
          {book.previews.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {book.previews.map((p, i) => (
                <span key={p.previewId} className="inline-flex items-center gap-0.5">
                  <a
                    href={p.imageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-link text-[11px] underline"
                  >
                    {i + 1}p
                  </a>
                  <fetcher.Form method="post" className="inline">
                    <input type="hidden" name="intent" value="remove_preview" />
                    <input type="hidden" name="previewId" value={p.previewId} />
                    <button
                      type="submit"
                      aria-label="미리보기 삭제"
                      className="text-muted-foreground hover:text-rose-600 text-[11px]"
                    >
                      ✕
                    </button>
                  </fetcher.Form>
                </span>
              ))}
            </div>
          ) : null}
          <fetcher.Form method="post" className="flex items-center gap-1">
            <input type="hidden" name="intent" value="add_preview" />
            <input type="hidden" name="bookId" value={book.bookId} />
            <input
              name="imageUrl"
              type="url"
              placeholder="이미지 URL"
              className="border-input bg-background h-6 w-28 rounded-md border px-1 text-[11px]"
            />
            <button type="submit" className="border-border hover:bg-muted/50 h-6 rounded-md border px-1.5 text-[11px]">
              추가
            </button>
          </fetcher.Form>
        </div>
      </TD>
    </TR>
  );
}
