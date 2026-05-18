// 법 개정 — 관보식 색인표.
// 10개 컬럼(No / 구분 / 명칭 / 법률번호 / 개정일 / 시행일 / 개정이유 / 신구조문대비표 / 개정해설 / 동영상)
// + 영향 조문/즐겨찾기 chip. 첨부 O 클릭 시 행 아래 본문 패널 인라인 노출.
// 키트 lidam-latest/LawsScreen 디자인.

import {
  ChevronDownIcon,
  ExternalLinkIcon,
  FileTextIcon,
  PlayIcon,
  ScaleIcon,
  SearchXIcon,
  XIcon,
} from "lucide-react";
import { Fragment, useState } from "react";
import { Link, data } from "react-router";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import {
  FilterSelect,
  IndexCard,
  LatestEmpty,
  LatestFilterForm,
  Pill,
} from "~/features/latest/components/latest-list";
import { LatestShell } from "~/features/latest/components/latest-shell";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  listRecentLawRevisions,
  type LawRevisionKind,
  type RecentRevisionItem,
} from "~/features/laws/queries.server";
import { MarkdownView } from "~/features/problems/components/markdown-view";
import {
  FIRST_EXAM_LAW_SLUGS,
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  SECOND_EXAM_LAW_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/laws";

export const meta: Route.MetaFunction = () => [
  { title: "법 개정 | Lidam Patent Attorney Academy" },
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

const COLUMNS = [
  "No",
  "구분",
  "명칭",
  "법률 등의 번호",
  "개정일",
  "시행일",
  "개정이유",
  "신구조문대비표",
  "개정해설",
  "동영상",
];

export default function LatestLaws({ loaderData }: Route.ComponentProps) {
  const { revisions, filters } = loaderData;
  const filterActive = !!filters.subject || filters.q !== "";
  const [open, setOpen] = useState<{
    revisionId: string;
    kind: AttachmentKind;
  } | null>(null);

  const descParts = [`${revisions.length.toLocaleString("ko-KR")}건`];
  if (filters.subject) descParts.push(LAW_SUBJECTS[filters.subject].name);
  if (filters.q) descParts.push(`"${filters.q}" 검색`);

  return (
    <LatestShell
      category="laws"
      width="index"
      title="법 개정"
      desc={
        <>
          {descParts.join(" · ")} — 공시일 내림차순. 첨부 항목(
          <strong className="text-foreground">O</strong>)을 클릭하면 본문을
          바로 펼쳐 볼 수 있습니다.
        </>
      }
    >
      <LatestFilterForm
        search={{
          name: "q",
          placeholder: "법명·개정 번호 검색",
          defaultValue: filters.q,
        }}
        hasActive={filterActive}
        resetTo="/latest/laws"
      >
        <FilterSelect
          name="subject"
          ariaLabel="과목"
          defaultValue={filters.subject ?? ""}
          options={[{ value: "", label: "전체 과목" }]}
          optionGroups={[
            {
              label: "1차 · 객관식",
              options: FIRST_EXAM_LAW_SLUGS.map((s) => ({
                value: s,
                label: LAW_SUBJECTS[s].name,
              })),
            },
            {
              label: "2차 · 주관식",
              options: SECOND_EXAM_LAW_SLUGS.map((s) => ({
                value: s,
                label: LAW_SUBJECTS[s].name,
              })),
            },
          ]}
        />
      </LatestFilterForm>

      {revisions.length === 0 ? (
        <LatestEmpty
          icon={filterActive ? SearchXIcon : ScaleIcon}
          tone={filterActive ? "subdued" : "neutral"}
          title={
            filterActive
              ? "조건에 맞는 법 개정이 없습니다"
              : "아직 등록된 법 개정이 없습니다"
          }
          body={
            filterActive
              ? "검색어나 과목 필터를 바꿔 다시 찾아보세요."
              : "새 법령 개정이 공시되면 이곳에 색인표로 모입니다."
          }
        />
      ) : (
        <IndexCard testid="latest-laws-list">
          <table className="w-full min-w-[1000px] border-collapse">
            <thead>
              <tr className="border-border bg-muted/60 border-b">
                {COLUMNS.map((label, i) => (
                  <th
                    key={label}
                    className={cn(
                      "text-muted-foreground px-3 py-3 font-mono text-[11px] font-semibold tracking-[0.04em] whitespace-nowrap uppercase",
                      i >= 4 ? "text-center" : "text-left",
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {revisions.map((r, idx) => {
                const expanded =
                  open?.revisionId === r.lawRevisionId ? open.kind : null;
                const toggle = (kind: AttachmentKind) =>
                  setOpen(
                    expanded === kind
                      ? null
                      : { revisionId: r.lawRevisionId, kind },
                  );
                return (
                  <Fragment key={r.lawRevisionId}>
                    <tr
                      className={cn(
                        "border-border/60 border-b transition-colors",
                        expanded
                          ? "bg-primary/[0.04]"
                          : "hover:bg-muted/40",
                      )}
                    >
                      <Td className="text-muted-foreground text-center tabular-nums">
                        {idx + 1}
                      </Td>
                      <Td className="text-center">
                        <Pill tone="outline">
                          {SUBJECT_CATEGORY_LABEL[
                            r.lawCode as LawSubjectSlug
                          ] ?? r.lawCode}
                        </Pill>
                      </Td>
                      <Td>
                        <Link
                          to={`/subjects/${r.lawCode}`}
                          viewTransition
                          className="hover:text-primary text-[13px] font-semibold"
                        >
                          {(LAW_SUBJECTS[r.lawCode as LawSubjectSlug]?.name ??
                            r.lawName) + KIND_SUFFIX[r.revisionKind]}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {r.affectedArticleCount > 0 ? (
                            <span className="text-muted-foreground text-[11px]">
                              영향 조문 {r.affectedArticleCount}건
                            </span>
                          ) : null}
                          {r.myBookmarkedAffectedCount > 0 ? (
                            <Pill tone="amber">
                              ★ 내 즐겨찾기 {r.myBookmarkedAffectedCount}
                            </Pill>
                          ) : null}
                          <Link
                            to={`/subjects/${r.lawCode}`}
                            viewTransition
                            className="text-primary ml-auto text-[11px] font-semibold hover:underline"
                          >
                            보러가기 →
                          </Link>
                        </div>
                      </Td>
                      <Td className="text-[13px] tabular-nums">
                        {r.revisionNumber ?? "—"}
                      </Td>
                      <Td className="text-muted-foreground text-center text-[13px] tabular-nums">
                        {r.promulgatedAt ?? "—"}
                      </Td>
                      <Td className="text-muted-foreground text-center text-[13px] tabular-nums">
                        {r.effectiveDate ?? "—"}
                      </Td>
                      <AttachmentCell
                        active={r.hasReason}
                        expanded={expanded === "reason"}
                        onClick={() => toggle("reason")}
                      />
                      <AttachmentCell
                        active={r.hasComparison}
                        expanded={expanded === "comparison"}
                        onClick={() => toggle("comparison")}
                      />
                      <AttachmentCell
                        active={r.hasExplanation}
                        expanded={expanded === "explanation"}
                        onClick={() => toggle("explanation")}
                      />
                      <AttachmentCell
                        active={r.hasVideo}
                        expanded={expanded === "video"}
                        onClick={() => toggle("video")}
                      />
                    </tr>
                    {expanded ? (
                      <tr className="bg-primary/[0.04] border-border/60 border-b">
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
        </IndexCard>
      )}
    </LatestShell>
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
    <td className={cn("px-3 py-3 align-top", className)}>{children}</td>
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
    return (
      <Td className="text-muted-foreground/50 text-center text-[13px]">—</Td>
    );
  }
  return (
    <Td className="text-center">
      <button
        type="button"
        onClick={onClick}
        aria-expanded={expanded}
        className={cn(
          "inline-flex h-7 min-w-[2.25rem] items-center justify-center gap-0.5 rounded-full px-2 text-[11px] font-bold transition-colors",
          expanded
            ? "bg-primary text-primary-foreground"
            : "border-primary/40 text-primary hover:bg-primary/10 border",
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
        <p className="text-sm font-bold tracking-tight">
          {ATTACHMENT_TITLE[kind]}
        </p>
        <span className="text-muted-foreground text-[11px]">
          {r.lawName}
          {KIND_SUFFIX[r.revisionKind]} · {r.revisionNumber ?? "—"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-8 rounded-full"
          onClick={onClose}
        >
          <XIcon className="size-3.5" /> 닫기
        </Button>
      </div>
      {kind === "reason" ? (
        <div className="bg-card border-border rounded-xl border p-4">
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
        className="text-primary inline-flex items-center gap-1 text-xs font-semibold hover:underline"
      >
        <ExternalLinkIcon className="size-3" /> 새 탭에서 열기
        <FileTextIcon className="size-3" /> PDF
      </a>
      <iframe
        title={title}
        src={url}
        className="bg-muted border-border h-[70vh] w-full rounded-xl border"
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
        className="text-primary inline-flex items-center gap-1 text-xs font-semibold hover:underline"
      >
        <PlayIcon className="size-3" /> 새 탭에서 열기 · {url}
      </a>
      {embedUrl ? (
        <div className="border-border aspect-video w-full overflow-hidden rounded-xl border">
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
