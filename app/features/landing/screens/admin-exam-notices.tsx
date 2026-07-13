// 시험 공고 목록(운영자) — /admin/exam-notices. staff 전용.
import { Form, Link, redirect } from "react-router";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";

import { listExamNotices } from "../queries.server";

import type { Route } from "./+types/admin-exam-notices";

export function meta() {
  return [{ title: "시험 공고 | 운영관리" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/dashboard");
  const notices = await listExamNotices(client, { includeUnpublished: true });
  return { role, notices };
}

export default function AdminExamNotices({ loaderData }: Route.ComponentProps) {
  const { role, notices } = loaderData;
  return (
    <AdminShell
      cluster="landing"
      role={role}
      title="시험 공고"
      desc="시험정보 페이지(/lecture/exam-info) 하단에 노출되는 공식 공고문입니다."
    >
      <div className="mx-auto max-w-3xl p-5 md:p-8">
        <div className="mb-4 flex justify-end">
          <Button asChild size="sm">
            <Link to="/admin/exam-notices/new">+ 새 공고</Link>
          </Button>
        </div>

        {notices.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border p-8 text-center text-sm">
            등록된 공고가 없습니다.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs">
                <tr>
                  <th className="p-3 text-left font-medium">제목</th>
                  <th className="w-24 p-3 text-left font-medium">등록일</th>
                  <th className="w-16 p-3 text-center font-medium">첨부</th>
                  <th className="w-16 p-3 text-center font-medium">공개</th>
                  <th className="w-28 p-3 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {notices.map((n) => (
                  <tr key={n.notice_id} className="border-t">
                    <td className="p-3">
                      <Link
                        to={`/admin/exam-notices/${n.notice_id}/edit`}
                        className="font-medium hover:underline"
                      >
                        {n.is_pinned ? "📌 " : ""}
                        {n.title}
                      </Link>
                    </td>
                    <td className="text-muted-foreground p-3 tabular-nums">
                      {n.published_at.slice(0, 10).replace(/-/g, ".")}
                    </td>
                    <td className="p-3 text-center tabular-nums">
                      {n.files.length || "—"}
                    </td>
                    <td className="p-3 text-center">
                      {n.published ? (
                        <span className="text-green-600">공개</span>
                      ) : (
                        <span className="text-muted-foreground">비공개</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button asChild variant="ghost" size="sm">
                          <Link to={`/admin/exam-notices/${n.notice_id}/edit`}>
                            편집
                          </Link>
                        </Button>
                        <Form method="post" action="/api/admin/exam-notice">
                          <input type="hidden" name="intent" value="delete" />
                          <input type="hidden" name="id" value={n.notice_id} />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={(e) => {
                              if (!confirm("이 공고를 삭제할까요?"))
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
