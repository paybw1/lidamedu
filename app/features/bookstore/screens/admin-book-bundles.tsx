// feat-11 B2-3 — 세트·번들 관리(staff). 번들 생성·판매상태·구성 도서 추가/제거.
// 결제 시 번들가는 회원 도서 정가 비율로 배분(create-cart-order). 재고/부분환불 정합 유지.
import { LayersIcon } from "lucide-react";
import { data, useFetcher } from "react-router";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip } from "~/features/admin/components/admin-ui";
import { hasDutyAccess } from "~/features/admin/lib/duties.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-book-bundles";

const SALE_LABEL: Record<string, string> = {
  draft: "임시저장",
  on_sale: "판매중",
  paused: "일시중지",
  closed: "판매종료",
};

async function requireStaff(request: Request) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });
  if (!(await hasDutyAccess("lms_video_admin", user.id, role)))
    throw data("Forbidden", { status: 403 });
  return { client, user, role };
}

export async function loader({ request }: Route.LoaderArgs) {
  const { role } = await requireStaff(request);
  const [{ data: bundles }, { data: items }, { data: books }] =
    await Promise.all([
      adminClient
        .from("book_bundles")
        .select("bundle_id, title, price_krw, sale_status")
        .is("deleted_at", null)
        .order("display_order", { ascending: true }),
      adminClient
        .from("book_bundle_items")
        .select("bundle_id, book_id, books(title)"),
      adminClient
        .from("books")
        .select("book_id, title")
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
    ]);
  return {
    role,
    books: (books ?? []).map((b) => ({ bookId: b.book_id, title: b.title })),
    bundles: (bundles ?? []).map((bn) => ({
      bundleId: bn.bundle_id,
      title: bn.title,
      priceKrw: bn.price_krw,
      saleStatus: bn.sale_status,
      members: (items ?? [])
        .filter((it) => it.bundle_id === bn.bundle_id)
        .map((it) => ({
          bookId: it.book_id,
          title: (it.books as { title: string } | null)?.title ?? "(삭제됨)",
        })),
    })),
  };
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  priceKrw: z.coerce.number().int().min(0),
});

export async function action({ request }: Route.ActionArgs) {
  const { client } = await requireStaff(request);
  const fd = await request.formData();
  const intent = fd.get("intent");

  if (intent === "create") {
    const parsed = createSchema.safeParse({
      title: fd.get("title"),
      priceKrw: fd.get("priceKrw"),
    });
    if (!parsed.success)
      return data({ error: "세트명·가격을 확인해 주세요." }, { status: 400 });
    const { error } = await client
      .from("book_bundles")
      .insert({ title: parsed.data.title, price_krw: parsed.data.priceKrw });
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true as const });
  }
  if (intent === "set_status") {
    const bundleId = String(fd.get("bundleId") ?? "");
    const status = String(fd.get("status") ?? "");
    const { error } = await client
      .from("book_bundles")
      .update({ sale_status: status })
      .eq("bundle_id", bundleId);
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true as const });
  }
  if (intent === "add_item") {
    const bundleId = String(fd.get("bundleId") ?? "");
    const bookId = String(fd.get("bookId") ?? "");
    if (!bundleId || !bookId)
      return data({ error: "도서를 선택해 주세요." }, { status: 400 });
    const { error } = await client
      .from("book_bundle_items")
      .upsert({ bundle_id: bundleId, book_id: bookId }, { onConflict: "bundle_id,book_id" });
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true as const });
  }
  if (intent === "remove_item") {
    const bundleId = String(fd.get("bundleId") ?? "");
    const bookId = String(fd.get("bookId") ?? "");
    const { error } = await client
      .from("book_bundle_items")
      .delete()
      .eq("bundle_id", bundleId)
      .eq("book_id", bookId);
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true as const });
  }
  return data({ error: "Unknown intent" }, { status: 400 });
}

export default function AdminBookBundles({ loaderData }: Route.ComponentProps) {
  const { bundles, books, role } = loaderData;
  return (
    <AdminShell
      cluster="lms"
      role={role}
      title="세트·번들 관리"
      desc="여러 도서를 묶어 할인가로 판매합니다. 결제 시 세트가는 구성 도서 정가 비율로 배분되어 재고·부분환불 정합이 유지됩니다."
      headerRight={
        <Chip tone="solid">
          <LayersIcon className="size-3" /> {bundles.length}세트
        </Chip>
      }
    >
      <CreateBundleForm />
      <div className="mt-4 flex flex-col gap-3">
        {bundles.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-10 text-center text-sm">
            등록된 세트가 없습니다.
          </p>
        ) : (
          bundles.map((bn) => (
            <BundleRow key={bn.bundleId} bundle={bn} books={books} />
          ))
        )}
      </div>
    </AdminShell>
  );
}

function CreateBundleForm() {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  return (
    <fetcher.Form
      method="post"
      className="border-border flex flex-wrap items-end gap-2 rounded-xl border p-3"
    >
      <input type="hidden" name="intent" value="create" />
      <label className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-[11px] font-semibold">세트명</span>
        <input name="title" required maxLength={200} className="border-input bg-background h-9 w-64 rounded-lg border px-3 text-sm" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-[11px] font-semibold">세트 판매가</span>
        <input name="priceKrw" type="number" required min={0} className="border-input bg-background h-9 w-32 rounded-lg border px-2 text-sm tabular-nums" />
      </label>
      <Button type="submit" size="sm">세트 추가</Button>
      {fetcher.data?.error ? (
        <span className="text-xs text-rose-600">{fetcher.data.error}</span>
      ) : null}
    </fetcher.Form>
  );
}

function BundleRow({
  bundle,
  books,
}: {
  bundle: {
    bundleId: string;
    title: string;
    priceKrw: number;
    saleStatus: string;
    members: Array<{ bookId: string; title: string }>;
  };
  books: Array<{ bookId: string; title: string }>;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  return (
    <div className="border-border rounded-xl border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{bundle.title}</span>
        <span className="text-sm font-bold tabular-nums">
          ₩{bundle.priceKrw.toLocaleString("ko-KR")}
        </span>
        <fetcher.Form method="post" className="ml-auto">
          <input type="hidden" name="intent" value="set_status" />
          <input type="hidden" name="bundleId" value={bundle.bundleId} />
          <select
            name="status"
            defaultValue={bundle.saleStatus}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="border-input bg-background h-7 rounded-md border px-1.5 text-[12px]"
          >
            {Object.entries(SALE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </fetcher.Form>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {bundle.members.map((m) => (
          <span
            key={m.bookId}
            className="border-border inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px]"
          >
            {m.title}
            <fetcher.Form method="post" className="inline">
              <input type="hidden" name="intent" value="remove_item" />
              <input type="hidden" name="bundleId" value={bundle.bundleId} />
              <input type="hidden" name="bookId" value={m.bookId} />
              <button type="submit" aria-label="구성 도서 제거" className="text-muted-foreground hover:text-rose-600">
                ✕
              </button>
            </fetcher.Form>
          </span>
        ))}
        {bundle.members.length === 0 ? (
          <span className="text-muted-foreground text-xs">구성 도서 없음</span>
        ) : null}
      </div>

      <fetcher.Form method="post" className="mt-2 flex items-center gap-1">
        <input type="hidden" name="intent" value="add_item" />
        <input type="hidden" name="bundleId" value={bundle.bundleId} />
        <select name="bookId" className="border-input bg-background h-7 max-w-[16rem] rounded-md border px-1 text-[12px]">
          {books.map((b) => (
            <option key={b.bookId} value={b.bookId}>{b.title}</option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="outline" className="h-7">
          도서 추가
        </Button>
      </fetcher.Form>
    </div>
  );
}
