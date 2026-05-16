// 법 개정 목록 (feat-7-004). 한 법령의 모든 개정(draft/review/published).

import {
  ArrowLeftIcon,
  ChevronRightIcon,
  FileEditIcon,
  PlusIcon,
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
import makeServerClient from "~/core/lib/supa-client.server";
import { getLawByCode, getStaffRole } from "~/features/laws/queries.server";
import {
  LAW_REVISION_STATUS_LABELS,
  type LawRevisionListItem,
  type LawRevisionStatus,
} from "~/features/law-revisions/labels";
import { listLawRevisionsForAdmin } from "~/features/law-revisions/queries.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-law-revisions";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d || !d.law) return [{ title: "법 개정 | Lidam Patent Attorney Academy" }];
  return [{ title: `${d.law.shortLabel ?? d.law.displayLabel} 개정 | Lidam Patent Attorney Academy` }];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  const lawCodeRaw = params.lawCode ?? "";
  if (!(LAW_SUBJECT_SLUGS as readonly string[]).includes(lawCodeRaw)) {
    throw data("Unknown law", { status: 404 });
  }
  const lawCode = lawCodeRaw as LawSubjectSlug;
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const law = await getLawByCode(client, lawCode);
  if (!law) throw data("Law not seeded", { status: 404 });
  const revisions = await listLawRevisionsForAdmin(client, { lawCode });
  return { law, lawCode, revisions };
}

const STATUS_VARIANT: Record<
  LawRevisionStatus,
  "default" | "secondary" | "outline"
> = {
  draft: "outline",
  review: "secondary",
  published: "default",
};

export default function AdminLawRevisions({
  loaderData,
}: Route.ComponentProps) {
  const { law, lawCode, revisions } = loaderData;
  const [showAdd, setShowAdd] = useState(false);
  const subject = LAW_SUBJECTS[lawCode];
  const drafts = revisions.filter((r) => r.status === "draft");
  const reviews = revisions.filter((r) => r.status === "review");
  const published = revisions.filter((r) => r.status === "published");

  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <Link
        to="/admin"
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ArrowLeftIcon className="size-3" /> 운영자
      </Link>
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          콘텐츠 관리 · 법 개정
        </p>
        <div className="flex items-center justify-between gap-2">
          <h1 className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight">
            <FileEditIcon className="text-primary size-6" />
            {subject.name} 개정 워크스페이스
          </h1>
          {!showAdd ? (
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <PlusIcon className="size-3.5" /> 새 개정 (Draft)
            </Button>
          ) : null}
        </div>
        <p className="text-muted-foreground text-sm">
          초안 {drafts.length} · 검토 {reviews.length} · 발행 {published.length}
        </p>
      </header>

      {showAdd ? (
        <div className="mb-4">
          <CreateRevisionForm
            lawId={law.lawId}
            onClose={() => setShowAdd(false)}
          />
        </div>
      ) : null}

      <Section title="초안 (Draft)" revisions={drafts} lawCode={lawCode} />
      <Section title="검토 (Review)" revisions={reviews} lawCode={lawCode} />
      <Section
        title="발행 (Published)"
        revisions={published}
        lawCode={lawCode}
        readonly
      />
    </div>
  );
}

function Section({
  title,
  revisions,
  lawCode,
  readonly,
}: {
  title: string;
  revisions: LawRevisionListItem[];
  lawCode: LawSubjectSlug;
  readonly?: boolean;
}) {
  if (revisions.length === 0) {
    return (
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold">{title}</h2>
        <p className="text-muted-foreground text-xs">
          {readonly ? "발행된 개정이 없습니다." : "초안이 없습니다."}
        </p>
      </section>
    );
  }
  return (
    <section className="mb-6 space-y-2">
      <h2 className="text-sm font-semibold">
        {title}{" "}
        <span className="text-muted-foreground text-xs">
          ({revisions.length})
        </span>
      </h2>
      <div className="grid gap-2">
        {revisions.map((r) => (
          <RevisionRow
            key={r.lawRevisionId}
            revision={r}
            lawCode={lawCode}
            readonly={readonly}
          />
        ))}
      </div>
    </section>
  );
}

function RevisionRow({
  revision,
  lawCode,
  readonly,
}: {
  revision: LawRevisionListItem;
  lawCode: LawSubjectSlug;
  readonly?: boolean;
}) {
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
      <CardContent className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
        <Badge variant={STATUS_VARIANT[revision.status]} className="text-xs">
          {LAW_REVISION_STATUS_LABELS[revision.status]}
        </Badge>
        <Link
          to={`/admin/laws/${lawCode}/revisions/${revision.lawRevisionId}`}
          viewTransition
          className="hover:text-primary inline-flex items-center gap-1 font-medium"
        >
          {revision.revisionNumber}
          <ChevronRightIcon className="text-muted-foreground size-3" />
        </Link>
        <span className="text-muted-foreground text-xs tabular-nums">
          영향 조문 {revision.articleCount}
        </span>
        {revision.effectiveDate ? (
          <span className="text-muted-foreground text-xs tabular-nums">
            시행 {revision.effectiveDate}
          </span>
        ) : null}
        {revision.promulgatedAt ? (
          <span className="text-muted-foreground text-xs tabular-nums">
            공포 {revision.promulgatedAt}
          </span>
        ) : null}
        {revision.publishedAt ? (
          <span className="text-muted-foreground ml-auto text-xs tabular-nums">
            발행 {revision.publishedAt.slice(0, 10)}
          </span>
        ) : null}
        {!readonly ? (
          <delFetcher.Form
            method="post"
            action="/api/admin/law-revision"
            className="ml-auto"
          >
            <input type="hidden" name="intent" value="delete" />
            <input
              type="hidden"
              name="lawRevisionId"
              value={revision.lawRevisionId}
            />
            <Button
              type="submit"
              size="icon"
              variant="ghost"
              aria-label="삭제"
              className="size-7 text-rose-600 hover:text-rose-700"
              disabled={delFetcher.state !== "idle"}
              onClick={(e) => {
                if (
                  !confirm(
                    `"${revision.revisionNumber}" 초안을 삭제하시겠습니까? 포함된 조문 스냅샷도 함께 삭제됩니다.`,
                  )
                ) {
                  e.preventDefault();
                }
              }}
            >
              <Trash2Icon className="size-3.5" />
            </Button>
          </delFetcher.Form>
        ) : null}
      </CardContent>
      {revision.reasonMd ? (
        <CardContent className="border-t px-4 py-3">
          <p className="text-muted-foreground line-clamp-2 whitespace-pre-line text-xs">
            {revision.reasonMd}
          </p>
        </CardContent>
      ) : null}
    </Card>
  );
}

function CreateRevisionForm({
  lawId,
  onClose,
}: {
  lawId: string;
  onClose: () => void;
}) {
  const fetcher = useFetcher<{
    ok?: true;
    lawRevisionId?: string;
    error?: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isSaving = fetcher.state !== "idle";
  const hasError = fetcher.data && "error" in fetcher.data && fetcher.data.error;
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok &&
      fetcher.data.lawRevisionId
    ) {
      navigate(
        `${location.pathname.replace(/\/$/, "")}/${fetcher.data.lawRevisionId}`,
        { preventScrollReset: true },
      );
    }
  }, [fetcher.state, fetcher.data, navigate, location.pathname]);

  return (
    <fetcher.Form
      method="post"
      action="/api/admin/law-revision"
      className="bg-card space-y-3 rounded-md border p-4"
    >
      <input type="hidden" name="intent" value="create" />
      <input type="hidden" name="lawId" value={lawId} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[120px_1fr]">
        <Field label="개정 번호 *">
          <Input
            name="revisionNumber"
            required
            maxLength={100}
            className="h-8 text-xs"
            placeholder="예: 법률 제20300호"
          />
        </Field>
        <Field label="개정 이유">
          <textarea
            name="reasonMd"
            maxLength={5000}
            rows={4}
            className="border-input bg-background w-full rounded-md border px-2 py-1 text-xs"
            placeholder="개정 이유·배경"
          />
        </Field>
      </div>
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
          <PlusIcon className="size-3.5" /> 초안 생성
        </Button>
      </div>
    </fetcher.Form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Label className="text-muted-foreground text-[11px] sm:self-center">
        {label}
      </Label>
      <div>{children}</div>
    </>
  );
}
