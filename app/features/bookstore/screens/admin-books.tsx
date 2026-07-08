// feat-11-004 4c — 도서 관리: 등록·판매상태·재고 입고(원장)·강의 상품 연결. staff.

import { useEffect } from "react";
import { BookOpenIcon, PlusIcon } from "lucide-react";
import { data, useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
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
  return { client, user, role };
}

export async function loader({ request }: Route.LoaderArgs) {
  const { client, role } = await requireStaff(request);
  const [{ data: books }, { data: stocks }, { data: links }, { data: plans }] =
    await Promise.all([
      client
        .from("books")
        .select("book_id, title, author, publisher, price_krw, sale_status, isbn")
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      adminClient.from("v_book_stock").select("book_id, stock"),
      adminClient.from("plan_book_links").select("plan_id, book_id, requirement"),
      adminClient
        .from("subscription_plans")
        .select("plan_id, name")
        .in("product_kind", ["course", "tpass", "subject", "bundle"])
        .order("display_order"),
    ]);
  const stockByBook = new Map((stocks ?? []).map((s) => [s.book_id, s.stock ?? 0]));
  return {
    role,
    plans: (plans ?? []).map((p) => ({ planId: p.plan_id, name: p.name })),
    books: (books ?? []).map((b) => ({
      bookId: b.book_id,
      title: b.title,
      author: b.author,
      publisher: b.publisher,
      priceKrw: b.price_krw,
      saleStatus: b.sale_status,
      isbn: b.isbn,
      stock: stockByBook.get(b.book_id) ?? 0,
      linkedPlans: (links ?? [])
        .filter((l) => l.book_id === b.book_id)
        .map((l) => ({ planId: l.plan_id, requirement: l.requirement })),
    })),
  };
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  author: z.string().trim().max(80).optional(),
  publisher: z.string().trim().max(80).optional(),
  priceKrw: z.coerce.number().int().min(0),
  isbn: z.string().trim().max(20).optional(),
});

export async function action({ request }: Route.ActionArgs) {
  const { client, user } = await requireStaff(request);
  const fd = await request.formData();
  const intent = fd.get("intent");

  if (intent === "create") {
    const parsed = createSchema.safeParse({
      title: fd.get("title"),
      author: fd.get("author") || undefined,
      publisher: fd.get("publisher") || undefined,
      priceKrw: fd.get("priceKrw"),
      isbn: fd.get("isbn") || undefined,
    });
    if (!parsed.success) return data({ error: "도서명·판매가를 확인해 주세요." }, { status: 400 });
    const { error } = await client.from("books").insert({
      title: parsed.data.title,
      author: parsed.data.author ?? null,
      publisher: parsed.data.publisher ?? null,
      price_krw: parsed.data.priceKrw,
      isbn: parsed.data.isbn ?? null,
    });
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

  return data({ error: "Unknown intent" }, { status: 400 });
}

export default function AdminBooks({ loaderData }: Route.ComponentProps) {
  const { books, plans, role } = loaderData;
  return (
    <AdminShell
      cluster="lms"
      role={role}
      title="도서 관리"
      desc="도서 등록·판매상태·재고(입고 원장)와 강의 상품 연결(결제 화면 함께 구매)을 관리합니다. 재고는 판매 시 자동 차감, 환불 시 자동 복원됩니다."
      headerRight={
        <Chip tone="solid">
          <BookOpenIcon className="size-3" /> {books.length}종
        </Chip>
      }
    >
      <CreateBookForm />
      <div className="mt-4">
        {books.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-10 text-center text-sm">
            등록된 도서가 없습니다.
          </p>
        ) : (
          <IndexTable
            minWidth={900}
            headers={[
              { label: "도서" },
              { label: "판매가", align: "right", width: "6.5rem" },
              { label: "재고", align: "right", width: "4.5rem" },
              { label: "판매상태", width: "7rem" },
              { label: "연결 상품", width: "16rem" },
              { label: "입고", width: "11rem" },
            ]}
          >
            {books.map((b) => (
              <BookRow key={b.bookId} book={b} plans={plans} />
            ))}
          </IndexTable>
        )}
      </div>
    </AdminShell>
  );
}

function CreateBookForm() {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.error) toast.error(fetcher.data.error);
    else if (fetcher.state === "idle" && fetcher.data?.ok) toast.success("도서를 등록했습니다.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);
  return (
    <fetcher.Form
      method="post"
      className="border-border bg-card flex flex-wrap items-end gap-2.5 rounded-xl border p-3 shadow-sm"
    >
      <input type="hidden" name="intent" value="create" />
      <label className="flex min-w-[220px] flex-1 flex-col gap-1.5">
        <span className="text-muted-foreground text-[11px] font-semibold">도서명</span>
        <input name="title" required maxLength={200} className="border-input bg-background h-9 rounded-lg border px-3 text-sm" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-[11px] font-semibold">저자</span>
        <input name="author" maxLength={80} className="border-input bg-background h-9 w-32 rounded-lg border px-2 text-sm" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-[11px] font-semibold">출판사</span>
        <input name="publisher" maxLength={80} className="border-input bg-background h-9 w-32 rounded-lg border px-2 text-sm" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-[11px] font-semibold">판매가</span>
        <input name="priceKrw" type="number" required min={0} className="border-input bg-background h-9 w-28 rounded-lg border px-2 text-sm tabular-nums" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-[11px] font-semibold">ISBN</span>
        <input name="isbn" maxLength={20} className="border-input bg-background h-9 w-36 rounded-lg border px-2 font-mono text-sm" />
      </label>
      <Button type="submit" size="sm" className="h-9" disabled={fetcher.state !== "idle"}>
        <PlusIcon className="size-3.5" /> 도서 등록
      </Button>
    </fetcher.Form>
  );
}

function BookRow({
  book,
  plans,
}: {
  book: {
    bookId: string;
    title: string;
    author: string | null;
    publisher: string | null;
    priceKrw: number;
    saleStatus: string;
    isbn: string | null;
    stock: number;
    linkedPlans: Array<{ planId: string; requirement: string }>;
  };
  plans: Array<{ planId: string; name: string }>;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.error) toast.error(fetcher.data.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);
  const planName = (id: string) => plans.find((p) => p.planId === id)?.name ?? id.slice(0, 8);
  return (
    <TR>
      <TD>
        <p className="font-semibold">{book.title}</p>
        <p className="text-muted-foreground text-[11px]">
          {[book.author, book.publisher, book.isbn].filter(Boolean).join(" · ") || "—"}
        </p>
      </TD>
      <TD align="right" mono>₩{book.priceKrw.toLocaleString("ko-KR")}</TD>
      <TD align="right" mono>
        <span className={book.stock <= 0 ? "text-rose-600 dark:text-rose-400" : ""}>{book.stock}</span>
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
    </TR>
  );
}
