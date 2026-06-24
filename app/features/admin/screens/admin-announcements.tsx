// 공지사항 운영 화면 (feat-7-011). staff(instructor/admin) 접근.
// 일람 + 인라인 작성/수정 폼 + 발행/언발행/삭제.

import { MegaphoneIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useState } from "react";
import { Form, Link, data } from "react-router";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  listAvailableCohorts,
  listStaffAnnouncements,
} from "~/features/announcements/queries.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { IndexTable } from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import { roleAtLeast } from "~/core/lib/roles";

import { AnnouncementForm, AnnouncementRow } from "./announcement-form";
import type { Route } from "./+types/admin-announcements";

export const meta: Route.MetaFunction = () => [
  { title: "공지사항 | 리담변리사학원" },
];

interface Filters {
  q: string;
  includeDrafts: boolean;
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const includeDrafts = url.searchParams.get("drafts") !== "0";
  const filters: Filters = { q, includeDrafts };

  const items = await listStaffAnnouncements(client, {
    authorId: roleAtLeast(role, "manager") ? undefined : user.id,
    query: filters.q || undefined,
    includeDrafts,
  });

  const cohorts = await listAvailableCohorts(
    client,
    roleAtLeast(role, "manager") ? undefined : user.id,
  );

  return { items, filters, role, currentUserId: user.id, cohorts };
}

export default function AdminAnnouncements({
  loaderData,
}: Route.ComponentProps) {
  const { items, filters, role, currentUserId, cohorts } = loaderData;
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const filterActive = filters.q !== "" || !filters.includeDrafts;

  return (
    <AdminShell
      cluster="comms"
      role={role}
      title="공지사항"
      desc={
        roleAtLeast(role, "manager")
          ? "모든 작성자의 공지를 관리합니다."
          : "본인이 작성한 공지를 관리합니다."
      }
      headerRight={
        !showCreate && editingId === null ? (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <PlusIcon className="size-3.5" /> 새 공지
          </Button>
        ) : undefined
      }
    >
      {/* 인라인 생성 폼 — 표 위 카드로 펼침 (brief §5.3 P2) */}
      {showCreate ? (
        <div className="mb-4">
          <AnnouncementForm
            mode="create"
            cohorts={cohorts}
            onClose={() => setShowCreate(false)}
          />
        </div>
      ) : null}

      {/* 필터 바 */}
      <Form
        method="get"
        className="border-border bg-card mb-3 flex flex-wrap items-end gap-2.5 rounded-xl border p-3 shadow-sm"
      >
        <div className="relative min-w-[200px] flex-1 basis-[240px] sm:max-w-[300px]">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="제목 검색"
            aria-label="제목 검색"
            className="bg-muted/60 focus:bg-background focus:border-primary h-9 w-full rounded-full border border-transparent pr-3 pl-9 text-[13px] outline-none"
          />
        </div>
        <label className="border-input inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-[11px] font-semibold whitespace-nowrap">
          <input
            type="checkbox"
            name="drafts"
            value="0"
            defaultChecked={!filters.includeDrafts}
            className="accent-primary size-3.5"
          />
          발행본만
        </label>
        <Button type="submit" size="sm" variant="outline">
          적용
        </Button>
        {filterActive ? (
          <Link
            to="/admin/announcements"
            className="text-link inline-flex items-center gap-1 px-1 text-xs font-semibold"
          >
            초기화
          </Link>
        ) : null}
      </Form>

      {/* 빈 상태 */}
      {items.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground flex flex-col items-center gap-2 rounded-xl border py-16 text-center shadow-sm">
          <MegaphoneIcon className="size-8 opacity-30" />
          <p className="text-sm font-medium">
            {filterActive
              ? "조건에 맞는 공지가 없습니다."
              : '등록된 공지가 없습니다. "새 공지" 버튼으로 시작하세요.'}
          </p>
        </div>
      ) : (
        <IndexTable
          minWidth={760}
          headers={[
            { label: "상태", width: "5rem" },
            { label: "제목" },
            { label: "대상", width: "8rem" },
            { label: "작성자", width: "7rem" },
            { label: "읽음", align: "right", width: "5rem" },
            { label: "날짜", width: "9rem" },
            { label: "", width: "12rem" },
          ]}
          footer={
            <div className="border-border/60 text-muted-foreground border-t px-3 py-2 text-[11px] font-medium tabular-nums">
              총 {items.length}건
            </div>
          }
        >
          {items.map((a) =>
            editingId === a.announcementId ? (
              <tr key={a.announcementId}>
                <td colSpan={7} className="px-3 py-2">
                  <AnnouncementForm
                    mode="update"
                    existing={a}
                    cohorts={cohorts}
                    onClose={() => setEditingId(null)}
                  />
                </td>
              </tr>
            ) : (
              <AnnouncementRow
                key={a.announcementId}
                item={a}
                canEdit={
                  roleAtLeast(role, "manager") ||
                  a.authorId === currentUserId
                }
                onEdit={() => setEditingId(a.announcementId)}
              />
            ),
          )}
        </IndexTable>
      )}
    </AdminShell>
  );
}
