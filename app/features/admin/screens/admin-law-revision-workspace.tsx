// 법 개정 워크스페이스 상세 (feat-7-004).
// draft 상태에서 조문 추가/수정/삭제 후 발행.

import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  Code2Icon,
  FileEditIcon,
  PencilIcon,
  PlusIcon,
  RocketIcon,
  Trash2Icon,
  WandSparklesIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { ArticleBlockEditor } from "~/features/laws/components/article-block-editor";
import { articleBodySchema } from "~/features/laws/lib/article-body";
import {
  type EditableArticleBody,
  bodyToEditable,
  editableToBody,
} from "~/features/laws/lib/article-body-marker";
import { getLawByCode, getStaffRole } from "~/features/laws/queries.server";
import {
  CHANGE_KIND_LABELS,
  LAW_REVISION_KIND_LABELS,
  LAW_REVISION_STATUS_LABELS,
  type ArticleChangeKind,
  type LawRevisionKind,
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

  // 조문 추가 자동완성용 — 이 법령의 모든 실 조문 (level='article').
  const { data: allArticlesRaw } = await client
    .from("articles")
    .select("article_number, display_label, path")
    .eq("law_id", law.lawId)
    .eq("level", "article")
    .is("deleted_at", null)
    .order("path", { ascending: true });
  const allArticles = (allArticlesRaw ?? [])
    .filter(
      (a): a is { article_number: string; display_label: string; path: unknown } =>
        a.article_number != null,
    )
    .map((a) => ({
      articleNumber: a.article_number,
      displayLabel: a.display_label,
    }));

  return {
    lawCode,
    allArticles,
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
  const { lawCode, subjectName, law, revision, articles, allArticles } =
    loaderData;
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

      <AttachmentForm
        lawRevisionId={revision.lawRevisionId}
        editable={!isPublished}
        initial={{
          revisionKind: revision.revisionKind,
          reasonMd: revision.reasonMd ?? "",
          comparisonPdf: revision.comparisonPdf ?? "",
          explanationPdf: revision.explanationPdf ?? "",
          videoUrl: revision.videoUrl ?? "",
        }}
      />

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
            allArticles={allArticles}
            existingRevisionArticleNumbers={
              new Set(
                articles
                  .map((a) => a.articleNumber)
                  .filter((n): n is string => n != null),
              )
            }
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

type EditMode = "easy" | "json";

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

  const initialJson = useMemo(
    () => JSON.stringify(entry.bodyJson ?? { blocks: [] }, null, 2),
    [entry.bodyJson],
  );
  const initialEasy = useMemo<EditableArticleBody | null>(() => {
    try {
      const parsed = articleBodySchema.safeParse(
        entry.bodyJson ?? { blocks: [] },
      );
      if (!parsed.success) return null;
      return bodyToEditable(parsed.data);
    } catch {
      return null;
    }
  }, [entry.bodyJson]);

  const [mode, setMode] = useState<EditMode>(initialEasy ? "easy" : "json");
  const [easy, setEasy] = useState<EditableArticleBody | null>(initialEasy);
  const [jsonText, setJsonText] = useState(initialJson);
  const [changeKind, setChangeKind] = useState<ArticleChangeKind>(
    entry.changeKind,
  );

  const isSaving = fetcher.state !== "idle";
  const serverError =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;

  // 저장 직전 jsonText 를 mode 에 맞게 산출.
  const computedJsonText = useMemo(() => {
    if (mode === "easy" && easy) {
      try {
        return JSON.stringify(editableToBody(easy), null, 2);
      } catch {
        return jsonText;
      }
    }
    return jsonText;
  }, [mode, easy, jsonText]);

  const validation = useMemo(() => {
    try {
      const parsed = JSON.parse(computedJsonText);
      const result = articleBodySchema.safeParse(parsed);
      if (!result.success) {
        return {
          ok: false as const,
          error: result.error.issues[0]?.message ?? "구조 오류",
        };
      }
      return { ok: true as const };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : "JSON 오류",
      };
    }
  }, [computedJsonText]);

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

  const switchToEasy = () => {
    try {
      const parsed = articleBodySchema.safeParse(JSON.parse(jsonText));
      if (!parsed.success) return;
      setEasy(bodyToEditable(parsed.data));
      setMode("easy");
    } catch {
      /* validation.error 로 표시됨 */
    }
  };
  const switchToJson = () => {
    if (easy) {
      try {
        setJsonText(JSON.stringify(editableToBody(easy), null, 2));
      } catch {
        /* keep jsonText */
      }
    }
    setMode("json");
  };

  return (
    <fetcher.Form
      method="post"
      action="/api/admin/law-revision"
      className="space-y-3"
    >
      <input type="hidden" name="intent" value="update_article" />
      <input type="hidden" name="revisionId" value={entry.revisionId} />
      <input type="hidden" name="changeKind" value={changeKind} />
      <input type="hidden" name="bodyJson" value={computedJsonText} />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50/60 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-200">
        <div>
          <p className="font-semibold">개정 본문 편집</p>
          <p className="mt-0.5 leading-relaxed">
            <strong>쉬운 편집</strong> 으로 카드별 텍스트 수정. 강조는{" "}
            <code className="text-[10.5px]">__밑줄__</code> ·{" "}
            <code className="text-[10.5px]">[강조]</code> ·{" "}
            <code className="text-[10.5px]">((소제목))</code> 마커.
          </p>
        </div>
        <div className="inline-flex overflow-hidden rounded-md border border-amber-400/40 bg-white text-[11px] dark:bg-amber-950/40">
          <button
            type="button"
            onClick={switchToEasy}
            disabled={isSaving || initialEasy === null}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1",
              mode === "easy"
                ? "bg-amber-500 text-white"
                : "hover:bg-amber-100 dark:hover:bg-amber-900/40",
              initialEasy === null && "cursor-not-allowed opacity-50",
            )}
            title={
              initialEasy === null
                ? "본문 구조가 깨져 있어 JSON 모드에서만 편집 가능"
                : "카드별 텍스트 수정 + 마커 토글"
            }
          >
            <WandSparklesIcon className="size-3" />
            쉬운 편집
          </button>
          <button
            type="button"
            onClick={switchToJson}
            disabled={isSaving}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1",
              mode === "json"
                ? "bg-amber-500 text-white"
                : "hover:bg-amber-100 dark:hover:bg-amber-900/40",
            )}
            title="고급 — 본문 JSON 직접 편집"
          >
            <Code2Icon className="size-3" />
            JSON
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-muted-foreground text-[11px]">변경 종류</Label>
        <select
          value={changeKind}
          onChange={(e) => setChangeKind(e.target.value as ArticleChangeKind)}
          className="border-input bg-background h-7 rounded-md border px-2 text-xs"
        >
          <option value="created">신설</option>
          <option value="amended">개정</option>
          <option value="deleted">폐지</option>
        </select>
      </div>

      {mode === "easy" && easy ? (
        <ArticleBlockEditor value={easy} onChange={setEasy} />
      ) : (
        <textarea
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          rows={18}
          className="border-input bg-background w-full rounded-md border px-2 py-1 font-mono text-[11px] leading-relaxed"
        />
      )}

      {!validation.ok ? (
        <p className="text-xs text-rose-600">
          본문 검증 실패: {validation.error}
        </p>
      ) : null}
      {serverError ? (
        <p className="text-xs text-rose-600">{serverError}</p>
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
        <Button
          type="submit"
          size="sm"
          disabled={isSaving || !validation.ok}
        >
          <PencilIcon className="size-3.5" /> 저장
        </Button>
      </div>
    </fetcher.Form>
  );
}

function AddArticleCard({
  lawRevisionId,
  lawId,
  allArticles,
  existingRevisionArticleNumbers,
}: {
  lawRevisionId: string;
  lawId: string;
  allArticles: Array<{ articleNumber: string; displayLabel: string }>;
  existingRevisionArticleNumbers: Set<string>;
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

  // 자동완성 후보: 이미 이 개정에 추가된 조문은 제외.
  const filtered = useMemo(() => {
    const q = articleNumber.trim();
    return allArticles
      .filter((a) => !existingRevisionArticleNumbers.has(a.articleNumber))
      .filter((a) =>
        q === "" ||
        a.articleNumber.toLowerCase().includes(q.toLowerCase()) ||
        a.displayLabel.toLowerCase().includes(q.toLowerCase()),
      )
      .slice(0, 30);
  }, [allArticles, articleNumber, existingRevisionArticleNumbers]);

  const exactMatch = useMemo(
    () => allArticles.find((a) => a.articleNumber === articleNumber.trim()),
    [allArticles, articleNumber],
  );
  const alreadyAdded = existingRevisionArticleNumbers.has(articleNumber.trim());

  return (
    <Card>
      <CardHeader className="px-4 pb-2">
        <p className="inline-flex items-center gap-1 text-sm font-semibold">
          <PlusIcon className="text-primary size-4" /> 조문 추가
        </p>
        <p className="text-muted-foreground text-xs">
          개정/폐지 시 현재 시행 본문이 복사되어 편집 시작점이 됩니다.
          신설은 빈 본문에서 시작.
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
            <Label className="text-muted-foreground text-[11px]">조문</Label>
            <Input
              name="articleNumber"
              value={articleNumber}
              onChange={(e) => setArticleNumber(e.target.value)}
              placeholder="조 번호 또는 조 제목 검색 — 예: 29 / 29의2 / 신규성"
              list="article-suggestions"
              autoComplete="off"
              className="h-8 text-xs"
            />
            <datalist id="article-suggestions">
              {filtered.map((a) => (
                <option
                  key={a.articleNumber}
                  value={a.articleNumber}
                  label={a.displayLabel}
                />
              ))}
            </datalist>
            {articleNumber.trim() ? (
              exactMatch ? (
                <p className="text-muted-foreground mt-1 text-[10.5px]">
                  ✓ {exactMatch.displayLabel}
                </p>
              ) : alreadyAdded ? (
                <p className="text-rose-600 mt-1 text-[10.5px]">
                  이미 이 개정에 포함된 조문입니다.
                </p>
              ) : (
                <p className="text-amber-600 mt-1 text-[10.5px]">
                  존재하지 않는 조문번호 — 신설 시에만 사용
                </p>
              )
            ) : null}
          </div>
          <div>
            <Label className="text-muted-foreground text-[11px]">변경 종류</Label>
            <select
              name="changeKind"
              value={changeKind}
              onChange={(e) => setChangeKind(e.target.value as ArticleChangeKind)}
              className="border-input bg-background h-8 w-full rounded-md border px-2 text-xs"
            >
              <option value="amended">개정 (기존 조문 수정)</option>
              <option value="created">신설 (새 조문 추가)</option>
              <option value="deleted">폐지 (조문 삭제)</option>
            </select>
          </div>
          <Button
            type="submit"
            size="sm"
            className="h-8 w-full"
            disabled={
              fetcher.state !== "idle" || !articleNumber.trim() || alreadyAdded
            }
          >
            <PlusIcon className="size-3.5" /> 추가
          </Button>
          {err ? <p className="text-rose-600 text-xs">{err}</p> : null}
        </fetcher.Form>
        {allArticles.length > 0 ? (
          <p className="text-muted-foreground border-t pt-2 text-[10.5px]">
            전체 조문 {allArticles.length}건 ·
            드롭다운 또는 직접 입력으로 검색
          </p>
        ) : null}
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

// 첨부 폼 — 종류/개정이유/동영상은 메타 폼,
// 신구조문대비표·개정해설은 PDF 파일 업로드 슬롯.
function AttachmentForm({
  lawRevisionId,
  editable,
  initial,
}: {
  lawRevisionId: string;
  editable: boolean;
  initial: {
    revisionKind: LawRevisionKind;
    reasonMd: string;
    comparisonPdf: string;
    explanationPdf: string;
    videoUrl: string;
  };
}) {
  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <p className="text-sm font-semibold">학생 노출 첨부</p>
        <p className="text-muted-foreground text-xs">
          /latest/laws 색인에서 각 칸의 <strong>O</strong> 표시 + 클릭 시 본문
          노출. 비어있으면 — 로 표시되어 학생에게 노출되지 않습니다.
          {!editable
            ? " 발행된 개정은 수정할 수 없습니다."
            : ""}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <MetaForm
          lawRevisionId={lawRevisionId}
          editable={editable}
          initial={{
            revisionKind: initial.revisionKind,
            reasonMd: initial.reasonMd,
            videoUrl: initial.videoUrl,
          }}
        />
        <PdfUploadSlot
          lawRevisionId={lawRevisionId}
          field="comparison_pdf"
          label="신구조문대비표 PDF"
          currentUrl={initial.comparisonPdf}
          editable={editable}
        />
        <PdfUploadSlot
          lawRevisionId={lawRevisionId}
          field="explanation_pdf"
          label="개정해설 PDF"
          currentUrl={initial.explanationPdf}
          editable={editable}
        />
      </CardContent>
    </Card>
  );
}

function MetaForm({
  lawRevisionId,
  editable,
  initial,
}: {
  lawRevisionId: string;
  editable: boolean;
  initial: {
    revisionKind: LawRevisionKind;
    reasonMd: string;
    videoUrl: string;
  };
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isSaving = fetcher.state !== "idle";
  const error =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;
  const saved =
    fetcher.state === "idle" &&
    fetcher.data &&
    "ok" in fetcher.data &&
    fetcher.data.ok;
  useEffect(() => {
    if (saved) {
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [saved, navigate, location.pathname, location.search]);
  return (
    <fetcher.Form
      method="post"
      action="/api/admin/law-revision"
      className="space-y-3"
    >
      <input type="hidden" name="intent" value="update_meta" />
      <input type="hidden" name="lawRevisionId" value={lawRevisionId} />
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label className="text-xs">종류</Label>
          <select
            name="revisionKind"
            defaultValue={initial.revisionKind}
            disabled={!editable}
            className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm disabled:opacity-60"
          >
            {(Object.keys(LAW_REVISION_KIND_LABELS) as LawRevisionKind[]).map(
              (k) => (
                <option key={k} value={k}>
                  {LAW_REVISION_KIND_LABELS[k]}
                </option>
              ),
            )}
          </select>
        </div>
        <div>
          <Label className="text-xs">동영상 URL (YouTube / Vimeo 등)</Label>
          <Input
            name="videoUrl"
            type="url"
            defaultValue={initial.videoUrl}
            placeholder="https://youtube.com/..."
            disabled={!editable}
            className="h-9 text-xs"
          />
        </div>
      </div>
      <div>
        <Label className="text-xs">개정이유 (Markdown)</Label>
        <Textarea
          name="reasonMd"
          defaultValue={initial.reasonMd}
          rows={4}
          maxLength={20000}
          disabled={!editable}
          placeholder="개정 배경·취지·주요 변경 사항 요약"
          className="text-xs"
        />
      </div>
      {editable ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={isSaving}>
            {isSaving ? "저장 중..." : "메타 저장"}
          </Button>
          {error ? (
            <span className="text-xs text-rose-600">{error}</span>
          ) : null}
          {saved ? (
            <span className="text-xs text-emerald-600">저장됨</span>
          ) : null}
        </div>
      ) : null}
    </fetcher.Form>
  );
}

function PdfUploadSlot({
  lawRevisionId,
  field,
  label,
  currentUrl,
  editable,
}: {
  lawRevisionId: string;
  field: "comparison_pdf" | "explanation_pdf";
  label: string;
  currentUrl: string;
  editable: boolean;
}) {
  const upFetcher = useFetcher<{ ok?: true; error?: string; url?: string }>();
  const rmFetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const busy =
    upFetcher.state !== "idle" || rmFetcher.state !== "idle";
  const error =
    (upFetcher.data && "error" in upFetcher.data && upFetcher.data.error) ||
    (rmFetcher.data && "error" in rmFetcher.data && rmFetcher.data.error) ||
    null;
  const upSaved =
    upFetcher.state === "idle" &&
    upFetcher.data &&
    "ok" in upFetcher.data &&
    upFetcher.data.ok;
  const rmSaved =
    rmFetcher.state === "idle" &&
    rmFetcher.data &&
    "ok" in rmFetcher.data &&
    rmFetcher.data.ok;
  useEffect(() => {
    if (upSaved || rmSaved) {
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [upSaved, rmSaved, navigate, location.pathname, location.search]);

  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      {currentUrl ? (
        <div className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-md border p-2 text-xs">
          <a
            href={currentUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary inline-flex items-center gap-1 truncate hover:underline"
            title={currentUrl}
          >
            현재 파일 열기 ↗
          </a>
          {editable ? (
            <rmFetcher.Form
              method="post"
              action="/api/admin/law-revision"
              className="ml-auto"
            >
              <input type="hidden" name="intent" value="remove_pdf" />
              <input type="hidden" name="field" value={field} />
              <input
                type="hidden"
                name="lawRevisionId"
                value={lawRevisionId}
              />
              <Button
                type="submit"
                size="sm"
                variant="ghost"
                disabled={busy}
                className="text-rose-600 hover:text-rose-700"
              >
                삭제
              </Button>
            </rmFetcher.Form>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">미첨부</p>
      )}
      {editable ? (
        <upFetcher.Form
          method="post"
          action="/api/admin/law-revision"
          encType="multipart/form-data"
          className="flex flex-wrap items-center gap-2"
        >
          <input type="hidden" name="intent" value="upload_pdf" />
          <input type="hidden" name="field" value={field} />
          <input type="hidden" name="lawRevisionId" value={lawRevisionId} />
          <input
            type="file"
            name="file"
            accept="application/pdf"
            required
            className="text-xs"
          />
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "업로드 중..." : currentUrl ? "교체" : "업로드"}
          </Button>
          {error ? (
            <span className="text-xs text-rose-600">{error}</span>
          ) : null}
        </upFetcher.Form>
      ) : null}
    </div>
  );
}
