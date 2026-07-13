// 고객센터 FAQ 목록(운영자) — /admin/support-faqs. staff 전용.
import { Form, Link, redirect } from "react-router";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";

import { listSupportFaqs } from "../faq.server";

import type { Route } from "./+types/admin-faqs";

export function meta() {
  return [{ title: "FAQ 관리 | 운영관리" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/dashboard");
  const faqs = await listSupportFaqs(client, { includeUnpublished: true });
  return { role, faqs };
}

export default function AdminFaqs({ loaderData }: Route.ComponentProps) {
  const { role, faqs } = loaderData;
  return (
    <AdminShell
      cluster="comms"
      role={role}
      title="FAQ 관리"
      desc="고객센터(/lecture/support) 상단 '자주 묻는 질문'에 노출됩니다."
    >
      <div className="mx-auto max-w-3xl p-5 md:p-8">
        <div className="mb-4 flex justify-end">
          <Button asChild size="sm">
            <Link to="/admin/support-faqs/new">+ 새 FAQ</Link>
          </Button>
        </div>

        {faqs.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border p-8 text-center text-sm">
            등록된 FAQ가 없습니다.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs">
                <tr>
                  <th className="w-32 p-3 text-left font-medium">카테고리</th>
                  <th className="p-3 text-left font-medium">질문</th>
                  <th className="w-14 p-3 text-center font-medium">순서</th>
                  <th className="w-16 p-3 text-center font-medium">공개</th>
                  <th className="w-24 p-3"></th>
                </tr>
              </thead>
              <tbody>
                {faqs.map((f) => (
                  <tr key={f.faqId} className="border-t">
                    <td className="text-muted-foreground p-3 text-xs">
                      {f.category}
                    </td>
                    <td className="p-3">
                      <Link
                        to={`/admin/support-faqs/${f.faqId}/edit`}
                        className="font-medium hover:underline"
                      >
                        {f.question}
                      </Link>
                    </td>
                    <td className="p-3 text-center tabular-nums">
                      {f.sortOrder}
                    </td>
                    <td className="p-3 text-center">
                      {f.published ? (
                        <span className="text-green-600">공개</span>
                      ) : (
                        <span className="text-muted-foreground">숨김</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button asChild variant="ghost" size="sm">
                          <Link to={`/admin/support-faqs/${f.faqId}/edit`}>
                            편집
                          </Link>
                        </Button>
                        <Form method="post" action="/api/admin/support-faq">
                          <input type="hidden" name="intent" value="delete" />
                          <input type="hidden" name="id" value={f.faqId} />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={(e) => {
                              if (!confirm("이 FAQ를 삭제할까요?"))
                                e.preventDefault();
                            }}
                          >
                            삭제
                          </Button>
                        </Form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
