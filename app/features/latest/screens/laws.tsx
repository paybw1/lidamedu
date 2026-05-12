// 법 개정 색인 — PPT 색인표 양식.
// 10개 컬럼(No / 구분 / 명칭 / 법률번호 / 개정일 / 시행일 / 개정이유 / 신구조문대비표 / 개정해설 / 동영상)
// + 영향 조문/즐겨찾기 chip. 첨부 O 클릭 시 행 아래 본문 패널 인라인 노출.

import {
  ArrowRightIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  FileTextIcon,
  FilterXIcon,
  NewspaperIcon,
  PlayIcon,
  SearchIcon,
} from "lucide-react";
import { Fragment, useState } from "react";
import { Form, Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  listRecentLawRevisions,
  type LawRevisionKind,
  type RecentRevisionItem,
} from "~/features/laws/queries.server";
import { MarkdownView } from "~/features/problems/components/markdown-view";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/laws";

export const meta: Route.MetaFunction = () => [
  { title: "법 개정 | Lidam Edu" },
];

interface Filters {
  q: string;
  subject?: LawSubjectSlug;
}

const KIND_SUFFIX: Record<LawRevisionKind, string> = {
  act: "",
  decree: " 시행령",
  rule: " 시행규칙",
};

const SUBJECT_CATEGORY_LABEL: Record<LawSubjectSlug, string> = {
  patent: "특허",
  trademark: "상표",
  design: "디자인",
  civil: "민법",
  "civil-procedure": "민소",
};

type AttachmentKind = "reason" | "comparison" | "explanation" | "video";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const subjectRaw = url.searchParams.get("subject");
  const subject: LawSubjectSlug | undefined =
    subjectRaw &&
    (LAW_SUBJECT_SLUGS as readonly string[]).includes(subjectRaw)
      ? (subjectRaw as LawSubjectSlug)
      : undefined;
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const filters: Filters = { q, subject };

  const revisions = await listRecentLawRevisions(client, 100, user.id, {
    subject: filters.subject,
    query: filters.q || undefined,
  });
  return { revisions, filters };
}

export default function LatestLaws({ loaderData }: Route.ComponentProps) {
  const { revisions, filters } = loaderData;
  const filterActive = !!filters.subject || filters.q !== "";
  const [open, setOpen] = useState<{
    revisionId: string;
    kind: AttachmentKind;
  } | null>(null);

  return (
    <div className="mx-auto w-full max-w-screen-xl px-3 py-6 md:px-8 md:py-8">
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <NewspaperIcon className="size-3.5" /> 최신 정보
        </p>
        <h1 className="text-2xl font-bold tracking-tight">법 개정 색인</h1>
        <p className="text-muted-foreground text-sm">
          {revisions.length}건
          {filters.subject ? ` · ${LAW_SUBJECTS[filters.subject].name}` : ""}
          {filters.q ? ` · "${filters.q}" 검색` : ""} · 공시일 내림차순. 첨부
          항목(<strong>O</strong>)을 클릭하면 본문을 바로 펼쳐 볼 수 있습니다.
        </p>
      </header>

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
            placeholder="법명·개정 번호 검색"
            className="pl-9"
          />
        </div>
        <select
          name="subject"
          defaultValue={filters.subject ?? ""}
          className="border-input bg-background h-9 rounded-md border px-2 text-xs"
        >
          <option value="">전체 과목</option>
          {LAW_SUBJECT_SLUGS.map((s) => (
            <option key={s} value={s}>
              {LAW_SUBJECTS[s].name}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" className="h-9">
          적용
        </Button>
      </Form>
      {filterActive ? (
        <div className="mb-4">
          <Button
            asChild
            type="button"
            size="sm"
            variant="ghost"
            className="h-7"
          >
            <Link to="/latest/laws">
              <FilterXIcon className="size-3.5" /> 초기화
            </Link>
          </Button>
        </div>
      ) : null}

      {revisions.length === 0 ? (
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            조건에 맞는 법 개정이 없습니다.
          </p>
        </div>
      ) : (
        <div
          className="overflow-x-auto rounded-md border"
          data-testid="latest-laws-list"
        >
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-[11px] font-semibold tracking-wide">
              <tr>
                <Th className="w-[3rem] text-center">No</Th>
                <Th className="w-[3.5rem] text-center">구분</Th>
                <Th>명칭</Th>
                <Th>법률 등의 번호</Th>
                <Th className="w-[6rem] text-center">개정일</Th>
                <Th className="w-[6rem] text-center">시행일</Th>
                <Th className="w-[5rem] text-center">개정이유</Th>
                <Th className="w-[6.5rem] text-center">신구조문대비표</Th>
                <Th className="w-[5rem] text-center">개정해설</Th>
                <Th className="w-[5rem] text-center">동영상</Th>
              </tr>
            </thead>
            <tbody>
              {revisions.map((r, idx) => {
                const expanded =
                  open?.revisionId === r.lawRevisionId ? open.kind : null;
                return (
                  <Fragment key={r.lawRevisionId}>
                    <tr className="border-t">
                      <Td className="text-center tabular-nums">{idx + 1}</Td>
                      <Td className="text-center">
                        <Badge variant="outline" className="text-[10.5px]">
                          {SUBJECT_CATEGORY_LABEL[r.lawCode as LawSubjectSlug] ??
                            r.lawCode}
                        </Badge>
                      </Td>
                      <Td>
                        <Link
                          to={`/subjects/${r.lawCode}`}
                          className="font-medium hover:underline"
                          viewTransition
                        >
                          {(LAW_SUBJECTS[r.lawCode as LawSubjectSlug]?.name ??
                            r.lawName) + KIND_SUFFIX[r.revisionKind]}
                        </Link>
                        <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1.5 text-[10.5px]">
                          {r.affectedArticleCount > 0 ? (
                            <span>영향 조문 {r.affectedArticleCount}건</span>
                          ) : null}
                          {r.myBookmarkedAffectedCount > 0 ? (
                            <Badge
                              variant="default"
                              className="bg-amber-500 text-[10px] hover:bg-amber-600"
                            >
                              ★ 내 즐겨찾기 {r.myBookmarkedAffectedCount}
                            </Badge>
                          ) : null}
                          <Link
                            to={`/subjects/${r.lawCode}`}
                            viewTransition
                            className="text-primary ml-auto inline-flex items-center gap-0.5"
                          >
                            보러가기
                            <ArrowRightIcon className="size-2.5" />
                          </Link>
                        </div>
                      </Td>
                      <Td className="tabular-nums">
                        {r.revisionNumber ?? "—"}
                      </Td>
                      <Td className="text-center tabular-nums">
                        {r.promulgatedAt ?? "—"}
                      </Td>
                      <Td className="text-center tabular-nums">
                        {r.effectiveDate ?? "—"}
                      </Td>
                      <AttachmentCell
                        active={r.hasReason}
                        expanded={expanded === "reason"}
                        onClick={() =>
                          setOpen(
                            expanded === "reason"
                              ? null
                              : { revisionId: r.lawRevisionId, kind: "reason" },
                          )
                        }
                      />
                      <AttachmentCell
                        active={r.hasComparison}
                        expanded={expanded === "comparison"}
                        onClick={() =>
                          setOpen(
                            expanded === "comparison"
                              ? null
                              : {
                                  revisionId: r.lawRevisionId,
                                  kind: "comparison",
                                },
                          )
                        }
                      />
                      <AttachmentCell
                        active={r.hasExplanation}
                        expanded={expanded === "explanation"}
                        onClick={() =>
                          setOpen(
                            expanded === "explanation"
                              ? null
                              : {
                                  revisionId: r.lawRevisionId,
                                  kind: "explanation",
                                },
                          )
                        }
                      />
                      <AttachmentCell
                        active={r.hasVideo}
                        expanded={expanded === "video"}
                        onClick={() =>
                          setOpen(
                            expanded === "video"
                              ? null
                              : { revisionId: r.lawRevisionId, kind: "video" },
                          )
                        }
                      />
                    </tr>
                    {expanded ? (
                      <tr className="bg-muted/30 border-t">
                        <td colSpan={10} className="px-4 py-4">
                          <AttachmentPanel
                            kind={expanded}
                            revision={r}
                            onClose={() => setOpen(null)}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={cn("px-3 py-2 text-left whitespace-nowrap", className)}>
      {children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={cn("px-3 py-2 align-top", className)}>{children}</td>
  );
}

function AttachmentCell({
  active,
  expanded,
  onClick,
}: {
  active: boolean;
  expanded: boolean;
  onClick: () => void;
}) {
  if (!active) {
    return <Td className="text-muted-foreground text-center">—</Td>;
  }
  return (
    <Td className="text-center">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "border-primary/40 text-primary hover:bg-primary/10 inline-flex h-6 min-w-[2rem] items-center justify-center gap-0.5 rounded-md border px-1.5 text-[11px] font-bold",
          expanded && "bg-primary/15",
        )}
      >
        O
        <ChevronDownIcon
          className={cn(
            "size-3 transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>
    </Td>
  );
}

const ATTACHMENT_TITLE: Record<AttachmentKind, string> = {
  reason: "개정이유",
  comparison: "신구조문대비표",
  explanation: "개정해설",
  video: "동영상",
};

function AttachmentPanel({
  kind,
  revision: r,
  onClose,
}: {
  kind: AttachmentKind;
  revision: RecentRevisionItem;
  onClose: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold">{ATTACHMENT_TITLE[kind]}</p>
        <span className="text-muted-foreground text-[11px]">
          {r.lawName}
          {KIND_SUFFIX[r.revisionKind]} · {r.revisionNumber ?? "—"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-7"
          onClick={onClose}
        >
          닫기
        </Button>
      </div>
      {kind === "reason" ? (
        <div className="bg-background rounded-md border p-4">
          {r.reasonMd ? (
            <MarkdownView text={r.reasonMd} />
          ) : (
            <p className="text-muted-foreground text-sm">내용이 없습니다.</p>
          )}
        </div>
      ) : null}
      {kind === "explanation" ? (
        <PdfView title="개정해설" url={r.explanationPdf} />
      ) : null}
      {kind === "comparison" ? (
        <PdfView title="신구조문대비표" url={r.comparisonPdf} />
      ) : null}
      {kind === "video" ? <VideoView url={r.videoUrl} /> : null}
    </div>
  );
}

function PdfView({ title, url }: { title: string; url: string | null }) {
  if (!url) {
    return (
      <p className="text-muted-foreground text-sm">첨부 파일이 없습니다.</p>
    );
  }
  return (
    <div className="space-y-2">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
      >
        <ExternalLinkIcon className="size-3" /> 새 탭에서 열기
        <FileTextIcon className="size-3" /> PDF
      </a>
      <iframe
        title={title}
        src={url}
        className="bg-muted h-[70vh] w-full rounded-md border"
      />
    </div>
  );
}

function VideoView({ url }: { url: string | null }) {
  if (!url) {
    return (
      <p className="text-muted-foreground text-sm">동영상 URL 이 없습니다.</p>
    );
  }
  const embedUrl = toEmbedUrl(url);
  return (
    <div className="space-y-2">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
      >
        <PlayIcon className="size-3" /> 새 탭에서 열기 · {url}
      </a>
      {embedUrl ? (
        <div className="aspect-video w-full overflow-hidden rounded-md border">
          <iframe
            title="개정 동영상"
            src={embedUrl}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          이 URL 은 인라인 임베드를 지원하지 않습니다. 위 링크로 새 탭에서
          열어주세요.
        </p>
      )}
    </div>
  );
}

// YouTube / Vimeo 임베드 URL 변환. 그 외는 null (외부 링크만 노출).
function toEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
      // /shorts/ID or /embed/ID
      const m = u.pathname.match(/^\/(?:embed|shorts)\/([\w-]+)/);
      if (m) return `https://www.youtube.com/embed/${m[1]}`;
    }
    if (host === "youtu.be") {
      const id = u.pathname.slice(1);
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host === "vimeo.com") {
      const m = u.pathname.match(/^\/(\d+)/);
      if (m) return `https://player.vimeo.com/video/${m[1]}`;
    }
  } catch {
    return null;
  }
  return null;
}
