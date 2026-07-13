// 이용 가이드 관리 — manager+ 전용. 기능 사용법(글+영상)을 만들고 발행한다.
// 목록 + 인라인 편집 폼 (admin-popup-notices 패턴).

import type { ReactNode } from "react";

import {
  BookOpenIcon,
  EyeIcon,
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
import { GUIDE_SCREEN_KEYS } from "~/features/guide/help-keys";
import {
  type GuideArticle,
  listAllGuides,
} from "~/features/guide/queries.server";
import { MarkdownView } from "~/features/problems/components/markdown-view";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-guides";

export const meta: Route.MetaFunction = () => [
  { title: "이용 가이드 관리 | 리담변리사학원" },
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
  const guides = await listAllGuides();
  return { guides, role };
}

export default function AdminGuides({ loaderData }: Route.ComponentProps) {
  const { guides, role } = loaderData;
  const [adding, setAdding] = useState(false);
  const categories = [...new Set(guides.map((g) => g.category))];

  return (
    <AdminShell
      cluster="ops"
      role={role}
      title="이용 가이드 관리"
      desc="학생 '이용 가이드'(커뮤니티 탭)에 노출되는 사용법 콘텐츠를 만들고 발행합니다. 영상은 유튜브 미등록(unlisted) 링크를 붙이면 화면에 임베드됩니다. (manager 이상)"
      headerRight={
        <Button size="sm" onClick={() => setAdding((v) => !v)}>
          <PlusIcon className="size-3.5" /> 가이드 추가
        </Button>
      }
    >
      {adding ? (
        <div className="mb-3">
          <GuideForm
            mode="create"
            categories={categories}
            onClose={() => setAdding(false)}
          />
        </div>
      ) : null}

      {guides.length === 0 && !adding ? (
        <div className="border-border bg-card text-muted-foreground flex flex-col items-center gap-2 rounded-xl border py-16 text-center text-sm shadow-sm">
          <BookOpenIcon className="size-8 opacity-30" />
          <p>등록된 가이드가 없습니다. ‘가이드 추가’로 만들 수 있습니다.</p>
        </div>
      ) : (
        <IndexTable
          minWidth={860}
          headers={[
            { label: "카테고리", width: "9rem" },
            { label: "제목" },
            { label: "영상", align: "center", width: "5rem" },
            { label: "순서", align: "center", width: "4rem" },
            { label: "상태", align: "center", width: "6rem" },
            { label: "수정일", align: "right", width: "7rem" },
            { label: "", align: "right", width: "4rem" },
          ]}
        >
          {guides.map((g) => (
            <GuideRow key={g.guideId} guide={g} categories={categories} />
          ))}
        </IndexTable>
      )}
    </AdminShell>
  );
}

function GuideRow({
  guide: g,
  categories,
}: {
  guide: GuideArticle;
  categories: string[];
}) {
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

  return (
    <>
      <TR>
        <TD soft>{g.category}</TD>
        <TD>
          <span className="font-medium">{g.title}</span>
        </TD>
        <TD align="center" soft>
          {g.youtubeUrl ? <Chip tone="outline">영상</Chip> : "—"}
        </TD>
        <TD align="center" mono soft>
          {g.displayOrder}
        </TD>
        <TD align="center">
          {g.isPublished ? (
            <Chip tone="emerald">발행</Chip>
          ) : (
            <Chip tone="neutral">임시저장</Chip>
          )}
          {g.audience === "staff" ? <Chip tone="amber">운영자</Chip> : null}
        </TD>
        <TD align="right" mono soft>
          {g.updatedAt.slice(0, 10)}
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
              action="/api/admin/guide"
              className="inline"
              onSubmit={(e) => {
                if (!confirm(`가이드 "${g.title}"을(를) 삭제하시겠습니까?`)) {
                  e.preventDefault();
                }
              }}
            >
              <input type="hidden" name="intent" value="delete" />
              <input type="hidden" name="guideId" value={g.guideId} />
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
          <td colSpan={7} className="p-3">
            <GuideForm
              mode="update"
              guide={g}
              categories={categories}
              onClose={() => setEditing(false)}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
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

function GuideForm({
  mode,
  guide: g,
  categories,
  onClose,
}: {
  mode: "create" | "update";
  guide?: GuideArticle;
  categories: string[];
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isSaving = fetcher.state !== "idle";
  const hasError = fetcher.data && "error" in fetcher.data;
  const [bodyMd, setBodyMd] = useState(g?.bodyMd ?? "");
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
      action="/api/admin/guide"
      className="bg-card border-border space-y-3 rounded-xl border p-4 shadow-sm"
    >
      <p className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
        {mode === "create" ? "새 가이드" : `가이드 수정 · ${g?.title}`}
      </p>
      <input type="hidden" name="intent" value={mode} />
      {mode === "update" ? (
        <input type="hidden" name="guideId" value={g!.guideId} />
      ) : null}

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-5">
        <FormField label="제목 *">
          <Input
            name="title"
            required
            maxLength={120}
            defaultValue={g?.title ?? ""}
            className="h-8 text-xs"
            placeholder="예: 조문 읽으면서 문제까지 풀기"
          />
        </FormField>
        <FormField label="카테고리 * (자유 입력 — 같은 이름끼리 묶임)">
          <Input
            name="category"
            required
            maxLength={30}
            defaultValue={g?.category ?? categories[0] ?? "시작하기"}
            list="guide-categories"
            className="h-8 text-xs"
            placeholder="예: 시작하기 / 학습과목 / 문제 풀이"
          />
          <datalist id="guide-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </FormField>
        <FormField label="정렬 순서 (작을수록 위)">
          <Input
            name="displayOrder"
            type="number"
            min={0}
            max={999}
            defaultValue={g?.displayOrder ?? 0}
            className="h-8 text-xs"
          />
        </FormField>
        <FormField label="대상">
          <select
            name="audience"
            defaultValue={g?.audience ?? "student"}
            className="border-input bg-background focus:border-primary h-8 w-full rounded-md border px-2 text-xs outline-none"
          >
            <option value="student">학생 전체</option>
            <option value="staff">운영자·강사 전용</option>
          </select>
        </FormField>
        <div className="flex items-end pb-1">
          <label className="inline-flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              name="isPublished"
              value="1"
              defaultChecked={g?.isPublished ?? false}
              className="size-3.5"
            />
            발행 (체크 해제 시 임시저장 — 학생에게 안 보임)
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <FormField label="유튜브 영상 URL (선택 — 미등록(unlisted) 권장)">
          <Input
            name="youtubeUrl"
            type="url"
            defaultValue={g?.youtubeUrl ?? ""}
            className="h-8 text-xs"
            placeholder="https://www.youtube.com/watch?v=… 또는 https://youtu.be/…"
          />
        </FormField>
        <FormField label="화면 키 (선택 — 그 화면의 '?' 도움 버튼에 연결)">
          <Input
            name="screenKey"
            maxLength={60}
            defaultValue={g?.screenKey ?? ""}
            list="guide-screen-keys"
            className="h-8 text-xs"
            placeholder="예: article-viewer (비워 두어도 됩니다)"
          />
          <datalist id="guide-screen-keys">
            {GUIDE_SCREEN_KEYS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </datalist>
        </FormField>
      </div>

      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        <FormField label="본문 (마크다운)">
          <textarea
            name="bodyMd"
            value={bodyMd}
            onChange={(e) => setBodyMd(e.target.value)}
            rows={10}
            maxLength={20000}
            className="border-input bg-background focus:border-primary w-full rounded-md border px-2.5 py-2 text-xs leading-relaxed outline-none"
            placeholder={"**굵게**, 목록(-), 이미지(![](url)) 등 마크다운을 쓸 수 있습니다."}
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
            <div className="border-border bg-muted/20 min-h-[10rem] rounded-md border p-3 text-sm">
              <MarkdownView
                text={bodyMd || "*본문을 입력하면 여기서 미리 볼 수 있습니다.*"}
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
              <BookOpenIcon className="size-3.5" /> 저장
            </>
          )}
        </Button>
      </div>
    </fetcher.Form>
  );
}
