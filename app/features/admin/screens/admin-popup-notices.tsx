// 팝업 공지 관리 — manager+ 전용. 사이트 접속 시 뜨는 팝업(모달) 공지를 만들고 편집한다.
// 목록 + 인라인 편집 폼 (admin-discounts 패턴).

import type { ReactNode } from "react";

import {
  EyeIcon,
  MegaphoneIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { data, useFetcher, useLocation, useNavigate } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import {
  type PopupNotice,
  listAllPopupNotices,
} from "~/features/admin/queries/popup-notices.server";
import { MarkdownView } from "~/features/problems/components/markdown-view";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-popup-notices";

export const meta: Route.MetaFunction = () => [
  { title: "팝업 공지 관리 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role || !roleAtLeast(role, "manager")) {
    throw data("Forbidden — manager only", { status: 403 });
  }
  const notices = await listAllPopupNotices(client);
  return { notices, role };
}

// 현재 노출 중인지 (활성 + 기간내) — 목록 상태 표시용.
function isLiveNow(n: PopupNotice, nowMs: number): boolean {
  if (!n.isActive) return false;
  if (n.startsAt && new Date(n.startsAt).getTime() > nowMs) return false;
  if (n.endsAt && new Date(n.endsAt).getTime() <= nowMs) return false;
  return true;
}

export default function AdminPopupNotices({ loaderData }: Route.ComponentProps) {
  const { notices, role } = loaderData;
  const [adding, setAdding] = useState(false);
  const nowMs = Date.now();

  return (
    <AdminShell
      cluster="comms"
      role={role}
      title="팝업 공지 관리"
      desc="사이트 접속 시 뜨는 팝업 공지를 만들고 편집합니다. 활성 + 노출 기간 내 공지만 학생에게 표시되며, 학생이 닫으면 그 공지는 하루 동안 다시 뜨지 않습니다. (manager 이상)"
      headerRight={
        <Button size="sm" onClick={() => setAdding((v) => !v)}>
          <PlusIcon className="size-3.5" /> 공지 추가
        </Button>
      }
    >
      {adding ? (
        <div className="mb-3">
          <NoticeForm mode="create" onClose={() => setAdding(false)} />
        </div>
      ) : null}

      {notices.length === 0 && !adding ? (
        <div className="border-border bg-card text-muted-foreground flex flex-col items-center gap-2 rounded-xl border py-16 text-center text-sm shadow-sm">
          <MegaphoneIcon className="size-8 opacity-30" />
          <p>등록된 팝업 공지가 없습니다. ‘공지 추가’로 만들 수 있습니다.</p>
        </div>
      ) : (
        <IndexTable
          minWidth={900}
          headers={[
            { label: "제목" },
            { label: "노출 기간", width: "13rem" },
            { label: "링크", width: "8rem" },
            { label: "상태", align: "center", width: "6rem" },
            { label: "수정일", align: "right", width: "7rem" },
            { label: "", align: "right", width: "4rem" },
          ]}
        >
          {notices.map((n) => (
            <NoticeRow key={n.noticeId} notice={n} live={isLiveNow(n, nowMs)} />
          ))}
        </IndexTable>
      )}
    </AdminShell>
  );
}

function NoticeRow({ notice: n, live }: { notice: PopupNotice; live: boolean }) {
  const [editing, setEditing] = useState(false);
  const delFetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (
      delFetcher.state === "idle" &&
      delFetcher.data &&
      "ok" in delFetcher.data &&
      delFetcher.data.ok
    ) {
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [delFetcher.state, delFetcher.data, navigate, location.pathname, location.search]);

  const period =
    n.startsAt || n.endsAt
      ? `${n.startsAt ? n.startsAt.slice(0, 10) : "…"} ~ ${n.endsAt ? n.endsAt.slice(0, 10) : "…"}`
      : "상시";

  return (
    <>
      <TR>
        <TD>
          <span className="mr-1.5 font-medium">{n.title}</span>
          {n.imageUrl ? <Chip tone="outline">이미지</Chip> : null}
          {n.youtubeUrl ? <Chip tone="outline">영상</Chip> : null}
        </TD>
        <TD soft mono>
          {period}
        </TD>
        <TD soft>
          {n.linkUrl ? (
            <a
              href={n.linkUrl}
              target="_blank"
              rel="noreferrer"
              className="text-link block max-w-[7rem] truncate underline"
              title={n.linkUrl}
            >
              {n.linkLabel || n.linkUrl}
            </a>
          ) : (
            "—"
          )}
        </TD>
        <TD align="center">
          {live ? (
            <Chip tone="emerald">노출 중</Chip>
          ) : n.isActive ? (
            <Chip tone="outline">기간 외</Chip>
          ) : (
            <Chip tone="neutral">비활성</Chip>
          )}
        </TD>
        <TD align="right" mono soft>
          {n.updatedAt.slice(0, 10)}
        </TD>
        <TD align="right">
          <div className="flex items-center justify-end gap-0.5">
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="text-muted-foreground hover:text-foreground p-1"
              aria-label="수정"
            >
              <PencilIcon className="size-3.5" />
            </button>
            <delFetcher.Form
              method="post"
              action="/api/admin/popup-notice"
              className="inline"
              onSubmit={(e) => {
                if (!confirm(`팝업 공지 "${n.title}"을(를) 삭제하시겠습니까?`)) {
                  e.preventDefault();
                }
              }}
            >
              <input type="hidden" name="intent" value="delete" />
              <input type="hidden" name="noticeId" value={n.noticeId} />
              <button
                type="submit"
                disabled={delFetcher.state !== "idle"}
                className="text-muted-foreground p-1 hover:text-rose-600 disabled:opacity-50"
                aria-label="삭제"
              >
                <Trash2Icon className="size-3.5" />
              </button>
            </delFetcher.Form>
          </div>
        </TD>
      </TR>
      {editing ? (
        <tr className="border-border/60 border-b last:border-0">
          <td colSpan={6} className="p-3">
            <NoticeForm
              mode="update"
              notice={n}
              onClose={() => setEditing(false)}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const dt = new Date(iso);
  const off = dt.getTimezoneOffset() * 60000;
  return new Date(dt.getTime() - off).toISOString().slice(0, 16);
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[11px] font-semibold">
        {label}
      </span>
      {children}
    </label>
  );
}

function NoticeForm({
  mode,
  notice: n,
  onClose,
}: {
  mode: "create" | "update";
  notice?: PopupNotice;
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isSaving = fetcher.state !== "idle";
  const hasError = fetcher.data && "error" in fetcher.data;
  // 쉬운 편집 — 본문 마크다운을 입력하면서 바로 미리보기.
  const [bodyMd, setBodyMd] = useState(n?.bodyMd ?? "");
  const [preview, setPreview] = useState(true);

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
  }, [fetcher.state, fetcher.data, onClose, navigate, location.pathname, location.search]);

  return (
    <fetcher.Form
      method="post"
      action="/api/admin/popup-notice"
      encType="multipart/form-data"
      className="bg-card border-border space-y-3 rounded-xl border p-4 shadow-sm"
    >
      <p className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
        {mode === "create" ? "새 팝업 공지" : `공지 수정 · ${n?.title}`}
      </p>
      <input type="hidden" name="intent" value={mode} />
      {mode === "update" ? (
        <input type="hidden" name="noticeId" value={n!.noticeId} />
      ) : null}
      {n?.imageUrl ? (
        <input type="hidden" name="existingImageUrl" value={n.imageUrl} />
      ) : null}

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <FormField label="제목 *">
          <Input
            name="title"
            required
            maxLength={200}
            defaultValue={n?.title ?? ""}
            className="h-8 text-xs"
            placeholder="예: 오픈 기념 할인 안내"
          />
        </FormField>
        <FormField label="노출 시작 (선택)">
          <Input
            name="startsAt"
            type="datetime-local"
            defaultValue={isoToLocalInput(n?.startsAt ?? null)}
            className="h-8 text-xs"
          />
        </FormField>
        <FormField label="노출 종료 (선택)">
          <Input
            name="endsAt"
            type="datetime-local"
            defaultValue={isoToLocalInput(n?.endsAt ?? null)}
            className="h-8 text-xs"
          />
        </FormField>
        <FormField label="링크 URL (선택)">
          <Input
            name="linkUrl"
            type="url"
            defaultValue={n?.linkUrl ?? ""}
            className="h-8 text-xs"
            placeholder="https://…"
          />
        </FormField>
        <FormField label="링크 버튼 문구 (선택)">
          <Input
            name="linkLabel"
            maxLength={60}
            defaultValue={n?.linkLabel ?? ""}
            className="h-8 text-xs"
            placeholder="예: 자세히 보기"
          />
        </FormField>
        <div className="flex flex-col justify-end gap-1.5 pb-1">
          <label className="inline-flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              name="isActive"
              value="1"
              defaultChecked={n?.isActive ?? true}
              className="size-3.5"
            />
            활성 (체크 해제 시 저장만 하고 노출 안 함)
          </label>
          {/* 생성·수정 공통 — 수정에서 체크하면 사후 게시(같은 제목의 발행 공지가 있으면 중복 게시 안 함) */}
          <label className="inline-flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              name="alsoAnnounce"
              value="1"
              className="size-3.5"
            />
            커뮤니티 공지사항에도 게시 (전체 공지로 즉시 발행)
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <FormField label="팝업 이미지 (선택 · jpg/png/webp/gif, 5MB 이하)">
          <input
            type="file"
            name="imageFile"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="border-input bg-background h-8 w-full rounded-md border px-2 py-1 text-xs file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-0.5 file:text-xs"
          />
          <p className="text-muted-foreground mt-1 text-[10px] leading-tight">
            디자인한 배너 이미지를 올리면 팝업에 원본 그대로 표시됩니다. 폰트·색·
            표 등은 이미지 안에서 자유롭게 구성하세요.
          </p>
          {n?.imageUrl ? (
            <div className="mt-1.5 flex items-center gap-2">
              <img
                src={n.imageUrl}
                alt="현재 팝업 이미지"
                className="border-border h-14 rounded border object-contain"
              />
              <label className="inline-flex items-center gap-1 text-[11px]">
                <input type="checkbox" name="removeImage" value="1" className="size-3" />
                이미지 제거
              </label>
            </div>
          ) : null}
        </FormField>
        <FormField label="유튜브 영상 URL (선택)">
          <Input
            name="youtubeUrl"
            type="url"
            defaultValue={n?.youtubeUrl ?? ""}
            className="h-8 text-xs"
            placeholder="https://www.youtube.com/watch?v=… 또는 https://youtu.be/…"
          />
          <p className="text-muted-foreground mt-1 text-[10px] leading-tight">
            입력하면 팝업 안에 영상 플레이어가 표시됩니다.
          </p>
        </FormField>
      </div>

      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        <FormField label="내용 (마크다운 · 선택 — 이미지만으로 충분하면 비워두세요)">
          <textarea
            name="bodyMd"
            value={bodyMd}
            onChange={(e) => setBodyMd(e.target.value)}
            rows={8}
            maxLength={5000}
            className="border-input bg-background focus:border-primary w-full rounded-md border px-2.5 py-2 text-xs leading-relaxed outline-none"
            placeholder={"**굵게**, 줄바꿈, 목록(-) 등 마크다운을 쓸 수 있습니다."}
          />
        </FormField>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setPreview((v) => !v)}
            className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-[11px] font-semibold"
          >
            <EyeIcon className="size-3" /> 미리보기 {preview ? "접기" : "펼치기"}
          </button>
          {preview ? (
            <div className="border-border bg-muted/20 min-h-[8rem] rounded-md border p-3 text-sm">
              <MarkdownView
                text={bodyMd || "*내용을 입력하면 여기서 미리 볼 수 있습니다.*"}
                trusted={false}
              />
            </div>
          ) : null}
        </div>
      </div>

      {hasError ? (
        <p className="text-xs text-rose-600">
          {(fetcher.data as { error: string }).error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isSaving}>
          <XIcon className="size-3.5" /> 취소
        </Button>
        <Button type="submit" size="sm" disabled={isSaving}>
          {mode === "create" ? (
            <>
              <PlusIcon className="size-3.5" /> 추가
            </>
          ) : (
            <>
              <MegaphoneIcon className="size-3.5" /> 저장
            </>
          )}
        </Button>
      </div>
    </fetcher.Form>
  );
}
