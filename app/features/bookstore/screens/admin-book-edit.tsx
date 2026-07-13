// 도서 수정 페이지 — /admin/books/:bookId/edit. 등록 폼 전 필드 프리필.
import { SaveIcon } from "lucide-react";
import { Form, Link, data, redirect } from "react-router";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { hasDutyAccess } from "~/features/admin/lib/duties.server";
import {
  BookForm,
  type BookFormData,
} from "~/features/bookstore/components/book-form";
import { BookPreviewManager } from "~/features/bookstore/components/book-preview-manager";
import {
  bookRow,
  parseBookForm,
  uploadBookFiles,
} from "~/features/bookstore/lib/book-fields.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-book-edit";

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

export function meta() {
  return [{ title: "도서 수정 | 리담변리사학원" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { role } = await requireStaff(request);
  const bookId = params.bookId;
  if (!bookId) throw data("도서를 찾을 수 없습니다", { status: 404 });
  const { data: b } = await adminClient
    .from("books")
    .select("*")
    .eq("book_id", bookId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!b) throw data("도서를 찾을 수 없습니다", { status: 404 });
  const { data: cats } = await adminClient
    .from("book_categories")
    .select("category_id, name")
    .order("sort_order", { ascending: true });
  const { data: previews } = await adminClient
    .from("book_preview_pages")
    .select("preview_id, image_url")
    .eq("book_id", bookId)
    .order("sort_order", { ascending: true });
  const book: BookFormData = {
    bookId: b.book_id,
    title: b.title,
    categoryId: b.category_id,
    coverPath: b.cover_path,
    coverFilePath: b.cover_file_path,
    bookType: b.book_type,
    downloadLimit: b.download_limit,
    shortInfo: b.short_info,
    listPriceKrw: b.list_price_krw,
    priceKrw: b.price_krw,
    shippingFeeType: b.shipping_fee_type,
    shippingFeeKrw: b.shipping_fee_krw,
    taxFree: b.tax_free,
    groupDiscountOk: b.group_discount_ok,
    perPersonLimit: b.per_person_limit,
    courseOnly: b.course_only,
    eventPhrase: b.event_phrase,
    labelText: b.label_text,
    labelColor: b.label_color,
    isbn: b.isbn,
    author: b.author,
    publisher: b.publisher,
    publishedOn: b.published_on,
    previewUrl: b.preview_url,
    shortIntro: b.short_intro,
    description: b.description,
    authorBio: b.author_bio,
    toc: b.toc,
    extra1: b.extra1,
    extra2: b.extra2,
    isRecommended: b.is_recommended,
    trackStock: b.track_stock,
    saleStatus: b.sale_status,
    listed: b.listed,
  };
  return {
    role,
    book,
    categories: (cats ?? []).map((c) => ({
      categoryId: c.category_id,
      name: c.name,
    })),
    previewPages: (previews ?? []).map((p) => ({
      previewId: p.preview_id,
      imageUrl: p.image_url,
    })),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { client } = await requireStaff(request);
  const bookId = params.bookId;
  if (!bookId) return data({ error: "잘못된 요청" }, { status: 400 });
  const fd = await request.formData();
  const parsed = parseBookForm(fd);
  if (!parsed.ok) return data({ error: parsed.error }, { status: 400 });
  const files = await uploadBookFiles(fd);
  const { error } = await client
    .from("books")
    .update(bookRow(parsed.values, files))
    .eq("book_id", bookId);
  if (error) return data({ error: error.message }, { status: 400 });
  throw redirect("/admin/books");
}

export default function AdminBookEdit({ loaderData, actionData }: Route.ComponentProps) {
  const { role, book, categories, previewPages } = loaderData;
  const error = (actionData as { error?: string } | undefined)?.error;
  return (
    <AdminShell cluster="lms" role={role} title="도서 수정" desc={book.title}>
      <div className="mx-auto max-w-3xl">
        <Form method="post" encType="multipart/form-data">
          <BookForm book={book} categories={categories} />
          {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
          <div className="mt-4 flex items-center justify-between">
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/books">목록</Link>
            </Button>
            <Button type="submit">
              <SaveIcon className="size-4" /> 저장
            </Button>
          </div>
        </Form>

        {book.bookId ? (
          <div className="mt-6">
            <BookPreviewManager bookId={book.bookId} pages={previewPages} />
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}
