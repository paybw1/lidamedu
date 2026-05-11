// 법 개정 워크스페이스 상세 (feat-7-004).
// draft 상태에서 조문 추가/수정/삭제 후 발행.

import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  FileEditIcon,
  PencilIcon,
  PlusIcon,
  RocketIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Link,
  data,
  useFetcher,
  useLocation,
  useNavigate,
} from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import { Separator } from "~/core/components/ui/separator";
import makeServerClient from "~/core/lib/supa-client.server";
import { getLawByCode, getStaffRole } from "~/features/laws/queries.server";
import {
  CHANGE_KIND_LABELS,
  LAW_REVISION_STATUS_LABELS,
  type ArticleChangeKind,
  type LawRevisionStatus,
  type RevisionArticleEntry,
} from "~/features/law-revisions/labels";
import {
  getLawRevisionById,
  listRevisionArticles,
} from "~/features/law-revisions/queries.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-law-revision-workspace";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d || !d.revision) return [{ title: "법 개정 | Lidam Edu" }];
  return [
    {
      title: `${d.subjectName} ${d.revision.revisionNumber} | Lidam Edu`,
    },
  ];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  const lawCodeRaw = params.lawCode ?? "";
  if (!(LAW_SUBJECT_SLUGS as readonly string[]).includes(lawCodeRaw)) {
    throw data("Unknown law", { status: 404 });
  }
  const lawCode = lawCodeRaw as LawSubjectSlug;
  if (!params.revisionId) throw data("Missing revisionId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const law = await getLawByCode(client, lawCode);
  if (!law) throw data("Law not seeded", { status: 404 });
  const revision = await getLawRevisionById(client, params.revisionId);
  if (!revision) throw data("Revision not found", { status: 404 });
  if (revision.lawId !== law.lawId) {
    throw data("Mismatched law", { status: 404 });
  }
  const articles = await listRevisionArticles(client, params.revisionId);

  return {
    lawCode,
    subjectName: LAW_SUBJECTS[lawCode].name,
    law,
    revision,
    articles,
  };
}

const STATUS_VARIANT: Record<
  LawRevisionStatus,
  "default" | "secondary" | "outline"
> = {
  draft: "outline",
  review: "secondary",
  published: "default",
};

export default function AdminLawRevisionWorkspace({
  loaderData,
}: Route.ComponentProps) {
  const { lawCode, subjectName, law, revision, articles } = loaderData;
  const isDraft = revision.status === "draft";
  const isReview = revision.status === "review";
  const isPublished = revision.status === "published";

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-5 py-6 md:px-10 md:py-8">
      <Link
        to={`/admin/laws/${lawCode}/revisions`}
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ArrowLeftIcon className="size-3" /> {subjectName} 개정 목록
      </Link>

      <header className="mb-6 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={STATUS_VARIANT[revision.status]}>
            {LAW_REVISION_STATUS_LABELS[revision.status]}
          </Badge>
          {revision.effectiveDate ? (
            <Badge variant="outline" className="text-xs tabular-nums">
              시행 {revision.effectiveDate}
            </Badge>
          ) : null}
        </div>
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight">
          <FileEditIcon className="text-primary size-6" />
          {subjectName} · {revision.revisionNumber}
        </h1>
        {revision.reasonMd ? (
          <p className="text-muted-foreground whitespace-pre-line text-sm">
            {revision.reasonMd}
          </p>
        ) : null}
        <p className="text-muted-foreground text-xs">
          영향 조문 {articles.length}건
          {revision.promulgatedAt ? ` · 공포 ${revision.promulgatedAt}` : ""}
          {revision.publishedAt
            ? ` · 발행 ${revision.publishedAt.slice(0, 10)}`
            : ""}
        </p>
      </header>

      {isDraft || isReview ? (
        <div className="mb-6 flex flex-wrap gap-2">
          {isDraft ? (
            <StatusTransitionButton
              lawRevisionId={revision.lawRevisionId}
              status="review"
              label="검토 단계로"
              icon={<ChevronRightIcon className="size-3.5" />}
            />
          ) : null}
          {isReview ? (
            <StatusTransitionButton
              lawRevisionId={revision.lawRevisionId}
              status="draft"
              label="초안으로 되돌리기"
              icon={<ChevronRightIcon className="size-3.5 rotate-180" />}
              variant="outline"
            />
          ) : null}
          <PublishDialog
            lawRevisionId={revision.lawRevisionId}
            disabled={articles.length === 0}
          />
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <p className="text-sm font-semibold">조문 목록 ({articles.length})</p>
          {articles.length === 0 ? (
            <div className="bg-muted/40 rounded-md border border-dashed p-6 text-center">
              <p className="text-muted-foreground text-sm">
                개정에 포함된 조문이 없습니다. 우측 카드로 조문을 추가하세요.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {articles.map((a) => (
                <ArticleCard
                  key={a.revisionId}
                  entry={a}
                  editable={!isPublished}
                />
              ))}
            </div>
          )}
        </div>

        {!isPublished ? (
          <AddArticleCard
            lawRevisionId={revision.lawRevisionId}
            lawId={law.lawId}
          />
        ) : (
          <Card>
            <CardContent className="space-y-2 px-4 py-4 text-xs">
              <p className="inline-flex items-center gap-1 font-semibold">
                <CheckCircle2Icon className="size-4 text-emerald-600" />
                발행됨
              </p>
              <p className="text-muted-foreground">
                이 개정은 발행되었습니다. 조문 스냅샷은 불변이며, 새 개정을
                만들어 후속 변경하세요.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

const KIND_BADGE: Record<ArticleChangeKind, "default" | "secondary" | "outline"> = {
  created: "default",
  amended: "secondary",
  deleted: "outline",
};

function ArticleCard({
  entry,
  editable,
}: {
  entry: RevisionArticleEntry;
  editable: boolean;
}) {
  const [open, setOpen] = useState(false);
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
    <Card>
      <CardHeader className="px-4 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={KIND_BADGE[entry.changeKind]} className="text-xs">
            {CHANGE_KIND_LABELS[entry.changeKind]}
          </Badge>
          <button
            type="button"
            className="hover:text-primary inline-flex items-center gap-1 text-sm font-medium"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? (
              <ChevronDownIcon className="size-3.5" />
            ) : (
              <ChevronRightIcon className="size-3.5" />
            )}
            {entry.displayLabel}
          </button>
          {editable ? (
            <div className="ml-auto flex gap-1">
              {!editing ? (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setEditing(true)}
                  aria-label="본문 수정"
                  className="size-7"
                >
                  <PencilIcon className="size-3.5" />
                </Button>
              ) : null}
              <delFetcher.Form method="post" action="/api/admin/law-revision">
                <input type="hidden" name="intent" value="remove_article" />
                <input
                  type="hidden"
                  name="revisionId"
                  value={entry.revisionId}
                />
                <Button
                  type="submit"
                  size="icon"
                  variant="ghost"
                  aria-label="개정에서 제거"
                  className="size-7 text-rose-600 hover:text-rose-700"
                  disabled={delFetcher.state !== "idle"}
                  onClick={(e) => {
                    if (
                      !confirm(
                        `"${entry.displayLabel}" 을 이 개정에서 제거하시겠습니까?`,
                      )
                    ) {
                      e.preventDefault();
                    }
                  }}
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </delFetcher.Form>
            </div>
          ) : null}
        </div>
      </CardHeader>
      {open ? (
        <CardContent className="space-y-3 px-4 pb-4 text-xs">
          {editing && editable ? (
            <EditArticleForm
              entry={entry}
              onClose={() => setEditing(false)}
            />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              <BodyPane title="현재 시행 본문 (Before)" body={entry.currentBodyJson} />
              <BodyPane
                title="개정 본문 (After)"
                body={entry.bodyJson}
                emphasize
              />
            </div>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}

function BodyPane({
  title,
  body,
  emphasize,
}: {
  title: string;
  body: unknown;
  emphasize?: boolean;
}) {
  const text = JSON.stringify(body ?? { blocks: [] }, null, 2);
  return (
    <div className="space-y-1">
      <p
        className={
          "text-[11px] font-semibold tracking-wide uppercase " +
          (emphasize ? "text-primary" : "text-muted-foreground")
        }
      >
        {title}
      </p>
      <pre
        className={
          "bg-muted/40 max-h-[420px] overflow-auto rounded-md border p-2 text-[11px] leading-relaxed " +
          (emphasize ? "border-primary/40" : "")
        }
      >
        {text}
      </pre>
    </div>
  );
}

function EditArticleForm({
  entry,
  onClose,
}: {
  entry: RevisionArticleEntry;
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const initialJson = JSON.stringify(
    entry.bodyJson ?? { blocks: [] },
    null,
    2,
  );
  const [draft, setDraft] = useState(initialJson);
  const [changeKind, setChangeKind] = useState<ArticleChangeKind>(
    entry.changeKind,
  );
  const isSaving = fetcher.state !== "idle";
  const hasError = fetcher.data && "error" in fetcher.data && fetcher.data.error;
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
      action="/api/admin/law-revision"
      className="space-y-2"
    >
      <input type="hidden" name="intent" value="update_article" />
      <input type="hidden" name="revisionId" value={entry.revisionId} />
      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-muted-foreground text-[11px]">변경 종류</Label>
        <select
          name="changeKind"
          value={changeKind}
          onChange={(e) => setChangeKind(e.target.value as ArticleChangeKind)}
          className="border-input bg-background h-7 rounded-md border px-2 text-xs"
        >
          <option value="created">신설</option>
          <option value="amended">개정</option>
          <option value="deleted">폐지</option>
        </select>
      </div>
      <Label className="text-muted-foreground text-[11px]">본문 JSON</Label>
      <textarea
        name="bodyJson"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={18}
        className="border-input bg-background w-full rounded-md border px-2 py-1 font-mono text-[11px] leading-relaxed"
      />
      {hasError ? (
        <p className="text-rose-600 text-xs">
          {(fetcher.data as { error: string }).error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          disabled={isSaving}
        >
          <XIcon className="size-3.5" /> 취소
        </Button>
        <Button type="submit" size="sm" disabled={isSaving}>
          <PencilIcon className="size-3.5" /> 저장
        </Button>
      </div>
    </fetcher.Form>
  );
}

function AddArticleCard({
  lawRevisionId,
  lawId,
}: {
  lawRevisionId: string;
  lawId: string;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const [articleNumber, setArticleNumber] = useState("");
  const [changeKind, setChangeKind] = useState<ArticleChangeKind>("amended");
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      setArticleNumber("");
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [fetcher.state, fetcher.data, navigate, location.pathname, location.search]);
  const err =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;

  return (
    <Card>
      <CardHeader className="px-4 pb-2">
        <p className="inline-flex items-center gap-1 text-sm font-semibold">
          <PlusIcon className="text-primary size-4" /> 조문 추가
        </p>
        <p className="text-muted-foreground text-xs">
          현재 시행 본문이 복사되어 편집 시작점이 됩니다.
        </p>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-2 px-4 py-3">
        <fetcher.Form
          method="post"
          action="/api/admin/law-revision"
          className="space-y-2"
        >
          <input type="hidden" name="intent" value="add_article" />
          <input type="hidden" name="lawRevisionId" value={lawRevisionId} />
          <input type="hidden" name="lawId" value={lawId} />
          <div>
            <Label className="text-muted-foreground text-[11px]">조문번호</Label>
            <Input
              name="articleNumber"
              value={articleNumber}
              onChange={(e) => setArticleNumber(e.target.value)}
              placeholder="예: 29 / 29의2"
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-muted-foreground text-[11px]">변경 종류</Label>
            <select
              name="changeKind"
              value={changeKind}
              onChange={(e) => setChangeKind(e.target.value as ArticleChangeKind)}
              className="border-input bg-background h-8 w-full rounded-md border px-2 text-xs"
            >
              <option value="amended">개정</option>
              <option value="created">신설</option>
              <option value="deleted">폐지</option>
            </select>
          </div>
          <Button
            type="submit"
            size="sm"
            className="h-8 w-full"
            disabled={fetcher.state !== "idle" || !articleNumber.trim()}
          >
            <PlusIcon className="size-3.5" /> 추가
          </Button>
          {err ? <p className="text-rose-600 text-xs">{err}</p> : null}
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}

function StatusTransitionButton({
  lawRevisionId,
  status,
  label,
  icon,
  variant = "secondary",
}: {
  lawRevisionId: string;
  status: LawRevisionStatus;
  label: string;
  icon?: React.ReactNode;
  variant?: "default" | "secondary" | "outline";
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
  }, [fetcher.state, fetcher.data, navigate, location.pathname, location.search]);
  return (
    <fetcher.Form method="post" action="/api/admin/law-revision">
      <input type="hidden" name="intent" value="update_meta" />
      <input type="hidden" name="lawRevisionId" value={lawRevisionId} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" size="sm" variant={variant} disabled={fetcher.state !== "idle"}>
        {icon} {label}
      </Button>
    </fetcher.Form>
  );
}

function PublishDialog({
  lawRevisionId,
  disabled,
}: {
  lawRevisionId: string;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isSaving = fetcher.state !== "idle";
  const hasError = fetcher.data && "error" in fetcher.data && fetcher.data.error;
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      setOpen(false);
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [fetcher.state, fetcher.data, navigate, location.pathname, location.search]);

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? "포함된 조문이 없습니다" : ""}
      >
        <RocketIcon className="size-3.5" /> 발행 (Publish)
      </Button>
    );
  }
  return (
    <fetcher.Form
      method="post"
      action="/api/admin/law-revision"
      className="bg-card flex flex-wrap items-end gap-2 rounded-md border p-3"
    >
      <input type="hidden" name="intent" value="publish" />
      <input type="hidden" name="lawRevisionId" value={lawRevisionId} />
      <div>
        <Label className="text-muted-foreground text-[11px]">공포일 *</Label>
        <Input
          name="promulgatedAt"
          type="date"
          required
          className="h-8 text-xs"
        />
      </div>
      <div>
        <Label className="text-muted-foreground text-[11px]">시행일 *</Label>
        <Input
          name="effectiveDate"
          type="date"
          required
          className="h-8 text-xs"
        />
      </div>
      <Button type="submit" size="sm" disabled={isSaving}>
        <RocketIcon className="size-3.5" /> 확정 발행
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(false)}
        disabled={isSaving}
      >
        <XIcon className="size-3.5" /> 취소
      </Button>
      {hasError ? (
        <p className="text-rose-600 text-xs w-full">
          {(fetcher.data as { error: string }).error}
        </p>
      ) : null}
    </fetcher.Form>
  );
}
