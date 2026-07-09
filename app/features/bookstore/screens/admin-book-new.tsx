// 도서 등록 페이지 (구 플랫폼 도서등록화면 사양) — /admin/books/new.
import { BookPlusIcon } from "lucide-react";
import { Form, Link, data, redirect } from "react-router";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { hasDutyAccess } from "~/features/admin/lib/duties.server";
import { BookForm } from "~/features/bookstore/components/book-form";
import {
  bookRow,
  parseBookForm,
  uploadBookFiles,
} from "~/features/bookstore/lib/book-fields.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-book-new";

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
  return [{ title: "도서 등록 | 리담변리사학원" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { role } = await requireStaff(request);
  const { data: cats } = await adminClient
    .from("book_categories")
    .select("category_id, name")
    .order("sort_order", { ascending: true });
  return {
    role,
    categories: (cats ?? []).map((c) => ({
      categoryId: c.category_id,
      name: c.name,
    })),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { client } = await requireStaff(request);
  const fd = await request.formData();
  const parsed = parseBookForm(fd);
  if (!parsed.ok) return data({ error: parsed.error }, { status: 400 });
  const files = await uploadBookFiles(fd);
  const { error } = await client.from("books").insert(bookRow(parsed.values, files));
  if (error) return data({ error: error.message }, { status: 400 });
  throw redirect("/admin/books");
}

export default function AdminBookNew({ loaderData, actionData }: Route.ComponentProps) {
  const { role, categories } = loaderData;
  const error = (actionData as { error?: string } | undefined)?.error;
  return (
    <AdminShell cluster="lms" role={role} title="도서 등록" desc="도서 정보를 입력해 등록합니다.">
      <Form method="post" encType="multipart/form-data" className="mx-auto max-w-3xl">
        <BookForm book={null} categories={categories} />
        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
        <div className="mt-4 flex items-center justify-between">
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/books">목록</Link>
          </Button>
          <Button type="submit">
            <BookPlusIcon className="size-4" /> 도서 등록
          </Button>
        </div>
      </Form>
    </AdminShell>
  );
}
