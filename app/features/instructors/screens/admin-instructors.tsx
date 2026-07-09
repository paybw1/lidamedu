// feat-6-012 강사소개 — 운영자 강사 관리 목록(/admin/instructors). staff. 상세 편집은 :id/edit.
import { PlusIcon } from "lucide-react";
import { Link, redirect } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { AdminShell } from "~/features/admin/components/admin-shell";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";

import { CATEGORY_LABEL } from "../labels";
import { listInstructors } from "../queries.server";

import type { Route } from "./+types/admin-instructors";

export function meta() {
  return [{ title: "강사 관리 | 운영관리" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/dashboard");
  const instructors = await listInstructors(client); // staff = 미게시 포함
  return { role, instructors };
}

export default function AdminInstructors({ loaderData }: Route.ComponentProps) {
  const { role, instructors } = loaderData;
  return (
    <AdminShell
      cluster="comms"
      role={role}
      title="강사 관리"
      desc="리담안내 · 강사진에 노출되는 강사 프로필을 등록·편집합니다. 게시(published)된 강사만 공개됩니다."
      headerRight={
        <Button asChild size="sm">
          <Link to="/admin/instructor-profiles/new">
            <PlusIcon className="size-4" /> 강사 등록
          </Link>
        </Button>
      }
    >
      <div className="p-5 md:p-8">
        {instructors.length === 0 ? (
          <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center text-sm">
            등록된 강사가 없습니다.
          </div>
        ) : (
          <ul className="divide-border bg-card divide-y rounded-xl border">
            {instructors.map((it) => (
              <li key={it.instructorId}>
                <Link
                  to={`/admin/instructor-profiles/${it.instructorId}/edit`}
                  className="hover:bg-muted/40 flex items-center gap-3 px-4 py-3"
                >
                  <span className="text-muted-foreground w-8 shrink-0 text-xs tabular-nums">
                    {it.displayOrder}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-sm font-semibold">{it.name}</span>
                    <span className="text-muted-foreground ml-2 text-xs">
                      {it.subjectLabel} · {CATEGORY_LABEL[it.category].kr}
                    </span>
                  </span>
                  {it.published ? (
                    <Badge className="shrink-0 text-[11px]">공개</Badge>
                  ) : (
                    <Badge variant="secondary" className="shrink-0 text-[11px]">
                      비공개
                    </Badge>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
