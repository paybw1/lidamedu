// 공지 인라인 생성/수정 폼 + 행 카드 — admin-announcements.tsx 에서 분리.

import {
  CheckCircle2Icon,
  EyeIcon,
  EyeOffIcon,
  FileEditIcon,
  PencilIcon,
  PinIcon,
  SearchIcon,
  SendIcon,
  Trash2Icon,
  UserIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useFetcher, useLocation, useNavigate } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { cn } from "~/core/lib/utils";
import { HtmlEditor } from "~/features/lms/components/html-editor";
import {
  ANNOUNCEMENT_PLATFORM_SCOPES,
  announcementPlatformLabel,
  type AnnouncementAudienceKind,
  type AnnouncementListItem,
  type AnnouncementPlatformScope,
} from "~/features/announcements/labels";
import {
  AdminSelect,
  Chip,
  Field,
  TD,
  TR,
} from "~/features/admin/components/admin-ui";

/* ── 대상 chip ─────────────────────────────────────────────────────────── */

export function AudienceChip({
  kind,
  count,
}: {
  kind: AnnouncementAudienceKind;
  count: number;
}) {
  if (kind === "all") {
    return (
      <Chip tone="blue">
        <UsersIcon className="size-2.5" /> 전체
      </Chip>
    );
  }
  if (kind === "cohort") {
    return (
      <Chip tone="neutral">
        <UsersIcon className="size-2.5" /> 반 {count}개
      </Chip>
    );
  }
  return (
    <Chip tone="neutral">
      <UserIcon className="size-2.5" /> {count}명
    </Chip>
  );
}

/* ── 공지 행 ─────────────────────────────────────────────────────────── */

export function AnnouncementRow({
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
    <TR>
      <TD>
        <div className="flex items-center gap-1">
          {isDraft ? (
            <Chip tone="amber">초안</Chip>
          ) : (
            <Chip tone="emerald">발행</Chip>
          )}
          {item.isPinned ? (
            <PinIcon
              className="text-muted-foreground size-3 shrink-0"
              aria-label="고정"
            />
          ) : null}
        </div>
      </TD>
      <TD>
        <span className="line-clamp-1 max-w-[22rem] text-[13px] font-semibold">
          {item.title}
        </span>
        {item.bodyHtml || item.bodyMd ? (
          <p className="text-muted-foreground line-clamp-1 max-w-[22rem] text-[11px]">
            {(item.bodyHtml
              ? item.bodyHtml.replace(/<[^>]*>/g, " ")
              : item.bodyMd
            )
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 100)}
          </p>
        ) : null}
      </TD>
      <TD>
        <div className="flex flex-wrap items-center gap-1">
          <AudienceChip kind={item.audienceKind} count={item.audienceCount} />
          <Chip tone={item.platformScope === "both" ? "violet" : "outline"}>
            {announcementPlatformLabel(item.platformScope)}
          </Chip>
        </div>
      </TD>
      <TD soft>{item.authorName ?? "—"}</TD>
      <TD align="right" mono soft>
        <span className="inline-flex items-center gap-0.5">
          <CheckCircle2Icon className="size-3" /> {item.readCount}
        </span>
      </TD>
      <TD mono soft>
        {item.publishedAt
          ? item.publishedAt.slice(0, 10)
          : item.updatedAt.slice(0, 10)}
      </TD>
      <TD align="right">
        {canEdit ? (
          <div className="flex justify-end gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
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
                className="h-7 text-xs"
                disabled={fetcher.state !== "idle"}
              >
                {isDraft ? (
                  <>
                    <SendIcon className="size-3" /> 발행
                  </>
                ) : (
                  <>
                    <EyeOffIcon className="size-3" /> 취소
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
                className="h-7 text-xs text-rose-600 hover:text-rose-700"
                disabled={fetcher.state !== "idle"}
                onClick={(e) => {
                  if (!confirm(`"${item.title}" 공지를 삭제하시겠습니까?`)) {
                    e.preventDefault();
                  }
                }}
              >
                <Trash2Icon className="size-3" />
              </Button>
            </fetcher.Form>
          </div>
        ) : null}
      </TD>
    </TR>
  );
}

/* ── 인라인 생성/수정 폼 ──────────────────────────────────────────────── */

interface SelectedAudience {
  audienceType: "cohort" | "user";
  audienceId: string;
  label: string;
}

export function AnnouncementForm({
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
  const err =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;

  const [title, setTitle] = useState(existing?.title ?? "");
  const [bodyHtml, setBodyHtml] = useState(
    existing?.bodyHtml || existing?.bodyMd || "",
  );
  const [audienceKind, setAudienceKind] = useState<AnnouncementAudienceKind>(
    existing?.audienceKind ?? "all",
  );
  const [isPinned, setIsPinned] = useState(existing?.isPinned ?? false);
  // 노출 위치 — 기본은 학습 플랫폼(공지 대부분이 학습 콘텐츠 안내다).
  const [platformScope, setPlatformScope] = useState<AnnouncementPlatformScope>(
    existing?.platformScope ?? "study",
  );
  const [selectedCohorts, setSelectedCohorts] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<SelectedAudience[]>([]);
  const [userQuery, setUserQuery] = useState("");

  const detailFetcher = useFetcher<{
    audiences?: {
      audienceType: "cohort" | "user";
      audienceId: string;
      label: string;
    }[];
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
    results?: { profileId: string; name: string; email: string | null }[];
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
    fd.set("bodyHtml", bodyHtml);
    fd.set("audienceKind", audienceKind);
    fd.set("platformScope", platformScope);
    fd.set("audiences", JSON.stringify(audiencesPayload));
    fd.set("isPinned", isPinned ? "1" : "0");
    fd.set("publish", publish ? "1" : "0");
    fetcher.submit(fd, { method: "post", action: "/api/admin/announcement" });
  };

  return (
    <div className="border-border bg-card space-y-4 rounded-xl border p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="inline-flex items-center gap-1.5 text-sm font-bold">
          <FileEditIcon className="size-4" />
          {mode === "create" ? "새 공지 작성" : "공지 수정"}
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          disabled={isSaving}
          className="h-7"
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>

      <Field label="제목" required htmlFor="ann-title">
        <Input
          id="ann-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder="예: 5월 보충 강의 안내"
          className="h-9 text-sm"
        />
      </Field>

      <Field label="본문" htmlFor="ann-body">
        <HtmlEditor
          name="bodyHtml"
          defaultValue={bodyHtml}
          onChange={setBodyHtml}
          uploadUrl="/api/lms/editor-image"
          minHeight={220}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="대상" htmlFor="ann-audience">
          <AdminSelect
            id="ann-audience"
            value={audienceKind}
            onChange={(e) =>
              setAudienceKind(e.target.value as AnnouncementAudienceKind)
            }
            className="w-full"
          >
            <option value="all">전체 사용자</option>
            <option value="cohort">반 선택</option>
            <option value="user">개별 사용자</option>
          </AdminSelect>
        </Field>
        <Field label="노출 위치" htmlFor="ann-platform">
          <AdminSelect
            id="ann-platform"
            value={platformScope}
            onChange={(e) =>
              setPlatformScope(e.target.value as AnnouncementPlatformScope)
            }
            className="w-full"
          >
            {ANNOUNCEMENT_PLATFORM_SCOPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </AdminSelect>
          <p className="text-muted-foreground mt-1 text-[11px]">
            {ANNOUNCEMENT_PLATFORM_SCOPES.find((s) => s.value === platformScope)
              ?.hint ?? ""}
          </p>
        </Field>
        <Field>
          <label className="border-input flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-[13px]">
            <input
              type="checkbox"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
              className="accent-primary size-3.5"
            />
            <PinIcon className="size-3" /> 상단 고정
          </label>
        </Field>
      </div>

      {audienceKind === "cohort" ? (
        <Field label={`반 선택 (${selectedCohorts.length}개 선택)`}>
          {cohorts.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              등록된 반이 없습니다.
            </p>
          ) : (
            <div className="border-border grid max-h-48 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
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
                      className="accent-primary size-3.5"
                    />
                    {c.name}
                  </label>
                );
              })}
            </div>
          )}
        </Field>
      ) : null}

      {audienceKind === "user" ? (
        <Field label={`사용자 검색 후 추가 (${selectedUsers.length}명 선택)`}>
          <div className="flex gap-2">
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
              className="h-8 shrink-0"
              disabled={
                userQuery.trim().length < 2 ||
                userSearchFetcher.state !== "idle"
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
            <div className="border-border max-h-40 space-y-0.5 overflow-y-auto rounded-md border p-1">
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
                    <span className="font-medium">
                      {u.name || "(이름 없음)"}
                    </span>
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
                <span
                  key={u.audienceId}
                  className="bg-muted text-foreground/80 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
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
                    aria-label={`${u.label} 제거`}
                  >
                    <XIcon className="size-2.5" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </Field>
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
        {/* 발행 — 위험 동작이므로 코랄 강조 (brief §4.3, §5.5) */}
        <Button
          type="button"
          size="sm"
          onClick={() => submit(true)}
          disabled={isSaving || !title.trim()}
          className={cn(
            mode === "update" &&
              "bg-rose-600 hover:bg-rose-700 text-white border-rose-600",
          )}
        >
          <SendIcon className="size-3.5" />{" "}
          {mode === "create" ? "발행" : "변경 + 발행"}
        </Button>
      </div>
    </div>
  );
}
