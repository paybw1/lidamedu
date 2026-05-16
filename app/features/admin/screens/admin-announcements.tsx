// 공지사항 운영 화면 (feat-7-011). staff(instructor/admin) 접근.
// 일람 + 인라인 작성/수정 폼 + 발행/언발행/삭제.

import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  EyeIcon,
  EyeOffIcon,
  FileEditIcon,
  FilterXIcon,
  MegaphoneIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
  Trash2Icon,
  UserIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Form,
  Link,
  data,
  useFetcher,
  useLocation,
  useNavigate,
} from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import makeServerClient from "~/core/lib/supa-client.server";
import type {
  AnnouncementAudienceKind,
  AnnouncementListItem,
} from "~/features/announcements/labels";
import {
  listAvailableCohorts,
  listStaffAnnouncements,
} from "~/features/announcements/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-announcements";

export const meta: Route.MetaFunction = () => [
  { title: "공지사항 | Lidam Patent Attorney Academy" },
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
    authorId: role === "admin" ? undefined : user.id,
    query: filters.q || undefined,
    includeDrafts,
  });

  const cohorts = await listAvailableCohorts(
    client,
    role === "admin" ? undefined : user.id,
  );

  return { items, filters, role, currentUserId: user.id, cohorts };
}

interface SelectedAudience {
  audienceType: "cohort" | "user";
  audienceId: string;
  label: string;
}

export default function AdminAnnouncements({
  loaderData,
}: Route.ComponentProps) {
  const { items, filters, role, currentUserId, cohorts } = loaderData;
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const filterActive = filters.q !== "" || !filters.includeDrafts;

  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <Link
        to="/admin"
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ArrowLeftIcon className="size-3" /> 운영자
      </Link>
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          {role === "admin" ? "원장 · 강사" : "강사 · 본인 작성분만"}
        </p>
        <div className="flex items-center justify-between gap-2">
          <h1 className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight">
            <MegaphoneIcon className="text-primary size-6" /> 공지사항
          </h1>
          {!showCreate ? (
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <PlusIcon className="size-3.5" /> 새 공지
            </Button>
          ) : null}
        </div>
        <p className="text-muted-foreground text-sm">
          {items.length}건 ·{" "}
          {role === "admin" ? "모든 작성자" : "본인 작성분"}
          {filters.q ? ` · "${filters.q}" 검색` : ""}
          {!filters.includeDrafts ? " · 발행본만" : ""}
        </p>
      </header>

      {showCreate ? (
        <div className="mb-4">
          <AnnouncementForm
            mode="create"
            cohorts={cohorts}
            onClose={() => setShowCreate(false)}
          />
        </div>
      ) : null}

      <Form
        method="get"
        className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]"
      >
        <div className="relative">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="제목 검색"
            className="pl-9"
          />
        </div>
        <label className="border-input flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs">
          <input
            type="checkbox"
            name="drafts"
            value="0"
            defaultChecked={!filters.includeDrafts}
            className="size-3.5"
          />
          발행본만
        </label>
        <Button type="submit" size="sm" className="h-9">
          적용
        </Button>
      </Form>
      {filterActive ? (
        <div className="mb-4">
          <Button asChild type="button" size="sm" variant="ghost" className="h-7">
            <Link to="/admin/announcements">
              <FilterXIcon className="size-3.5" /> 초기화
            </Link>
          </Button>
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            등록된 공지가 없습니다. 상단 "새 공지" 버튼으로 시작하세요.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((a) =>
            editingId === a.announcementId ? (
              <AnnouncementForm
                key={a.announcementId}
                mode="update"
                existing={a}
                cohorts={cohorts}
                onClose={() => setEditingId(null)}
              />
            ) : (
              <AnnouncementCard
                key={a.announcementId}
                item={a}
                canEdit={role === "admin" || a.authorId === currentUserId}
                onEdit={() => setEditingId(a.announcementId)}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function AnnouncementCard({
  item,
  canEdit,
  onEdit,
}: {
  item: AnnouncementListItem;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [
    fetcher.state,
    fetcher.data,
    navigate,
    location.pathname,
    location.search,
  ]);

  const isDraft = item.publishedAt === null;

  return (
    <Card className="hover:border-primary/60 transition-colors">
      <CardContent className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            variant={isDraft ? "outline" : "default"}
            className="text-[10px]"
          >
            {isDraft ? "초안" : "발행"}
          </Badge>
          {item.isPinned ? (
            <Badge variant="secondary" className="gap-0.5 text-[10px]">
              <PinIcon className="size-2.5" /> 고정
            </Badge>
          ) : null}
          <AudienceBadge kind={item.audienceKind} count={item.audienceCount} />
          {item.authorName ? (
            <Badge variant="outline" className="text-[10px]">
              {item.authorName}
            </Badge>
          ) : null}
          <span className="text-muted-foreground ml-auto inline-flex items-center gap-1 text-[11px] tabular-nums">
            <CheckCircle2Icon className="size-3" /> 읽음 {item.readCount}
          </span>
        </div>
        <h3 className="text-sm leading-snug font-semibold">{item.title}</h3>
        {item.bodyMd ? (
          <p className="text-muted-foreground line-clamp-2 text-xs whitespace-pre-line">
            {item.bodyMd.slice(0, 240)}
          </p>
        ) : null}
        <p className="text-muted-foreground text-[11px] tabular-nums">
          {item.publishedAt
            ? `발행 ${item.publishedAt.slice(0, 16).replace("T", " ")}`
            : `초안 ${item.updatedAt.slice(0, 16).replace("T", " ")}`}
        </p>
        {canEdit ? (
          <div className="flex flex-wrap gap-1.5 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={onEdit}
            >
              <PencilIcon className="size-3" /> 수정
            </Button>
            <fetcher.Form method="post" action="/api/admin/announcement">
              <input
                type="hidden"
                name="intent"
                value={isDraft ? "publish" : "unpublish"}
              />
              <input
                type="hidden"
                name="announcementId"
                value={item.announcementId}
              />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                className="h-7"
                disabled={fetcher.state !== "idle"}
              >
                {isDraft ? (
                  <>
                    <SendIcon className="size-3" /> 발행
                  </>
                ) : (
                  <>
                    <EyeOffIcon className="size-3" /> 발행 취소
                  </>
                )}
              </Button>
            </fetcher.Form>
            <fetcher.Form method="post" action="/api/admin/announcement">
              <input type="hidden" name="intent" value="delete" />
              <input
                type="hidden"
                name="announcementId"
                value={item.announcementId}
              />
              <Button
                type="submit"
                size="sm"
                variant="ghost"
                className="h-7 text-rose-600 hover:text-rose-700"
                disabled={fetcher.state !== "idle"}
                onClick={(e) => {
                  if (!confirm(`"${item.title}" 공지를 삭제하시겠습니까?`)) {
                    e.preventDefault();
                  }
                }}
              >
                <Trash2Icon className="size-3" /> 삭제
              </Button>
            </fetcher.Form>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AudienceBadge({
  kind,
  count,
}: {
  kind: AnnouncementAudienceKind;
  count: number;
}) {
  if (kind === "all") {
    return (
      <Badge variant="default" className="gap-0.5 text-[10px]">
        <UsersIcon className="size-2.5" /> 전체
      </Badge>
    );
  }
  if (kind === "cohort") {
    return (
      <Badge variant="default" className="gap-0.5 text-[10px]">
        <UsersIcon className="size-2.5" /> 반 {count}개
      </Badge>
    );
  }
  return (
    <Badge variant="default" className="gap-0.5 text-[10px]">
      <UserIcon className="size-2.5" /> {count}명
    </Badge>
  );
}

function AnnouncementForm({
  mode,
  existing,
  cohorts,
  onClose,
}: {
  mode: "create" | "update";
  existing?: AnnouncementListItem;
  cohorts: { cohortId: string; name: string }[];
  onClose: () => void;
}) {
  const fetcher = useFetcher<{
    ok?: true;
    error?: string;
    announcementId?: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isSaving = fetcher.state !== "idle";
  const err = fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;

  const [title, setTitle] = useState(existing?.title ?? "");
  const [bodyMd, setBodyMd] = useState(existing?.bodyMd ?? "");
  const [audienceKind, setAudienceKind] = useState<AnnouncementAudienceKind>(
    existing?.audienceKind ?? "all",
  );
  const [isPinned, setIsPinned] = useState(existing?.isPinned ?? false);
  const [selectedCohorts, setSelectedCohorts] = useState<string[]>(() => []);
  const [selectedUsers, setSelectedUsers] = useState<SelectedAudience[]>([]);
  const [userQuery, setUserQuery] = useState("");

  // 수정 모드일 때 기존 audience 를 로드해야 한다 — 카드에서 제공 안 하므로 별도 fetch.
  const detailFetcher = useFetcher<{
    audiences?: { audienceType: "cohort" | "user"; audienceId: string; label: string }[];
  }>();
  useEffect(() => {
    if (
      mode === "update" &&
      existing &&
      audienceKind !== "all" &&
      detailFetcher.state === "idle" &&
      !detailFetcher.data
    ) {
      detailFetcher.load(
        `/admin/announcements/audiences?id=${existing.announcementId}`,
      );
    }
  }, [mode, existing, audienceKind, detailFetcher]);
  useEffect(() => {
    const aud = detailFetcher.data?.audiences;
    if (!aud) return;
    if (audienceKind === "cohort") {
      setSelectedCohorts(
        aud.filter((a) => a.audienceType === "cohort").map((a) => a.audienceId),
      );
    }
    if (audienceKind === "user") {
      setSelectedUsers(aud.filter((a) => a.audienceType === "user"));
    }
  }, [detailFetcher.data, audienceKind]);

  const userSearchFetcher = useFetcher<{
    results?: {
      profileId: string;
      name: string;
      email: string | null;
    }[];
  }>();
  const searchResults = userSearchFetcher.data?.results ?? [];

  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      onClose();
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [
    fetcher.state,
    fetcher.data,
    onClose,
    navigate,
    location.pathname,
    location.search,
  ]);

  const audiencesPayload = useMemo(() => {
    if (audienceKind === "cohort") {
      return selectedCohorts.map((cohortId) => ({
        audienceType: "cohort" as const,
        audienceId: cohortId,
      }));
    }
    if (audienceKind === "user") {
      return selectedUsers.map((u) => ({
        audienceType: "user" as const,
        audienceId: u.audienceId,
      }));
    }
    return [];
  }, [audienceKind, selectedCohorts, selectedUsers]);

  const submit = (publish: boolean) => {
    if (!title.trim()) return;
    const fd = new FormData();
    fd.set("intent", mode);
    if (mode === "update" && existing) {
      fd.set("announcementId", existing.announcementId);
    }
    fd.set("title", title.trim());
    fd.set("bodyMd", bodyMd);
    fd.set("audienceKind", audienceKind);
    fd.set("audiences", JSON.stringify(audiencesPayload));
    fd.set("isPinned", isPinned ? "1" : "0");
    fd.set("publish", publish ? "1" : "0");
    fetcher.submit(fd, { method: "post", action: "/api/admin/announcement" });
  };

  return (
    <div className="bg-card space-y-3 rounded-md border p-4">
      <div className="flex items-center justify-between">
        <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <FileEditIcon className="size-4" />
          {mode === "create" ? "새 공지 작성" : "공지 수정"}
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          disabled={isSaving}
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>

      <div className="space-y-2">
        <Label className="text-muted-foreground text-[11px]">제목 *</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder="예: 5월 보충 강의 안내"
          className="h-9 text-sm"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-muted-foreground text-[11px]">
          본문 (Markdown 지원)
        </Label>
        <textarea
          value={bodyMd}
          onChange={(e) => setBodyMd(e.target.value)}
          maxLength={20_000}
          rows={6}
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          placeholder="공지 내용을 입력하세요"
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-muted-foreground text-[11px]">대상</Label>
          <select
            value={audienceKind}
            onChange={(e) =>
              setAudienceKind(e.target.value as AnnouncementAudienceKind)
            }
            className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
          >
            <option value="all">전체 사용자</option>
            <option value="cohort">반 선택</option>
            <option value="user">개별 사용자</option>
          </select>
        </div>
        <div className="flex items-end">
          <label className="border-input flex h-9 w-full cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs">
            <input
              type="checkbox"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
              className="size-3.5"
            />
            <PinIcon className="size-3" /> 상단 고정
          </label>
        </div>
      </div>

      {audienceKind === "cohort" ? (
        <div className="space-y-2">
          <Label className="text-muted-foreground text-[11px]">
            반 선택 ({selectedCohorts.length}개)
          </Label>
          {cohorts.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              등록된 반이 없습니다.
            </p>
          ) : (
            <div className="grid max-h-48 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
              {cohorts.map((c) => {
                const checked = selectedCohorts.includes(c.cohortId);
                return (
                  <label
                    key={c.cohortId}
                    className="hover:bg-muted/60 flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setSelectedCohorts((prev) =>
                          e.target.checked
                            ? [...prev, c.cohortId]
                            : prev.filter((id) => id !== c.cohortId),
                        );
                      }}
                      className="size-3.5"
                    />
                    {c.name}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {audienceKind === "user" ? (
        <div className="space-y-2">
          <Label className="text-muted-foreground text-[11px]">
            사용자 검색 후 추가 ({selectedUsers.length}명 선택)
          </Label>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="이름·이메일 2자 이상"
              className="h-8 text-xs"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={
                userQuery.trim().length < 2 || userSearchFetcher.state !== "idle"
              }
              onClick={() => {
                const fd = new FormData();
                fd.set("intent", "search_users");
                fd.set("q", userQuery);
                userSearchFetcher.submit(fd, {
                  method: "post",
                  action: "/api/admin/announcement",
                });
              }}
            >
              <SearchIcon className="size-3" /> 검색
            </Button>
          </div>
          {searchResults.length > 0 ? (
            <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border p-1">
              {searchResults.map((u) => {
                const already = selectedUsers.some(
                  (s) => s.audienceId === u.profileId,
                );
                return (
                  <button
                    key={u.profileId}
                    type="button"
                    disabled={already}
                    onClick={() =>
                      setSelectedUsers((prev) => [
                        ...prev,
                        {
                          audienceType: "user",
                          audienceId: u.profileId,
                          label: u.name || u.email || "(이름 없음)",
                        },
                      ])
                    }
                    className="hover:bg-muted/60 flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs disabled:opacity-50"
                  >
                    <UserIcon className="text-muted-foreground size-3" />
                    <span className="font-medium">{u.name || "(이름 없음)"}</span>
                    <span className="text-muted-foreground">{u.email}</span>
                    {already ? (
                      <span className="text-muted-foreground ml-auto text-[10px]">
                        이미 선택
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
          {selectedUsers.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {selectedUsers.map((u) => (
                <Badge
                  key={u.audienceId}
                  variant="secondary"
                  className="gap-1 text-[10px]"
                >
                  {u.label}
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedUsers((prev) =>
                        prev.filter((s) => s.audienceId !== u.audienceId),
                      )
                    }
                    className="hover:text-rose-600"
                  >
                    <XIcon className="size-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {err ? <p className="text-rose-600 text-xs">{err}</p> : null}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => submit(false)}
          disabled={isSaving || !title.trim()}
        >
          <EyeIcon className="size-3.5" /> 초안 저장
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => submit(true)}
          disabled={isSaving || !title.trim()}
        >
          <SendIcon className="size-3.5" />{" "}
          {mode === "create" ? "발행" : "변경 + 발행"}
        </Button>
      </div>
    </div>
  );
}
