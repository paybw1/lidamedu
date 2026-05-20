// feat-4-A-117 — 운영자 case-study 미매칭 슬라이드 검토 화면.
// /admin/case-study-review
//
// 흐름: 슬라이드 PDF iframe 옆에 사건번호 검색 input + "연결" 버튼.
// 한 슬라이드를 여러 판례에 반복 연결 가능 (사용자 요청 "복수면 중복 업로드").
// 처리 완료 토글로 카드 숨김 (미해결 목록에서 제외).

import {
  CheckCircle2Icon,
  ChevronRightIcon,
  Loader2Icon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { data, useFetcher } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  LECTURE_NOTES_BUCKET,
  getBookNameBySlug,
  listSlideCandidates,
  type CaseSearchResult,
  type SlideCandidateLinkedCase,
  type SlideCandidateRow,
} from "~/features/lectures/queries.server";

import type { Route } from "./+types/admin-case-study-review";

export const meta: Route.MetaFunction = () => [
  { title: "강의노트 case study 검토 | Lidam" },
];

const COURT_LABEL: Record<string, string> = {
  supreme: "대법원",
  patent_court: "특허법원",
  high_court: "고등법원",
  district_court: "지방법원",
};

interface CandidateWithSignedUrl extends SlideCandidateRow {
  signedUrl: string | null;
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
  const showResolved = url.searchParams.get("resolved") === "1";
  const candidates = await listSlideCandidates(client, {
    includeResolved: showResolved,
  });

  // signed URL 한 시간짜리 (검토 작업이라 길게)
  const signedUrls = await Promise.all(
    candidates.map((c) =>
      client.storage
        .from(LECTURE_NOTES_BUCKET)
        .createSignedUrl(c.pdfUrl, 3600)
        .then((r) => r.data?.signedUrl ?? null),
    ),
  );
  const withUrls: CandidateWithSignedUrl[] = candidates.map((c, i) => ({
    ...c,
    signedUrl: signedUrls[i],
  }));

  // 통계 (전체 / 미해결)
  const { count: totalCount } = await client
    .from("lecture_slide_candidates")
    .select("candidate_id", { count: "exact", head: true });
  const { count: unresolvedCount } = await client
    .from("lecture_slide_candidates")
    .select("candidate_id", { count: "exact", head: true })
    .is("resolved_at", null);

  return {
    candidates: withUrls,
    showResolved,
    totalCount: totalCount ?? 0,
    unresolvedCount: unresolvedCount ?? 0,
    role,
  };
}

export default function AdminCaseStudyReview({
  loaderData,
}: Route.ComponentProps) {
  const { candidates, showResolved, totalCount, unresolvedCount, role } =
    loaderData;
  const resolvedCount = totalCount - unresolvedCount;

  return (
    <AdminShell
      cluster="cases"
      role={role}
      title="강의노트 case study 검토"
      desc="PPT 강의노트의 CASE STUDY 슬라이드 중 자동 매칭이 안 된 장표를 PDF 로 보고 사건번호 검색해서 판례에 연결합니다."
      headerRight={
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="tabular-nums">
            전체 {totalCount}
          </Badge>
          <Badge variant="outline" className="tabular-nums">
            미해결 {unresolvedCount}
          </Badge>
          <Badge variant="outline" className="tabular-nums">
            처리됨 {resolvedCount}
          </Badge>
          <a
            href={showResolved ? "?" : "?resolved=1"}
            className="text-primary text-xs underline-offset-4 hover:underline"
          >
            {showResolved ? "← 미해결만" : "처리됨 포함 →"}
          </a>
        </div>
      }
    >
      {candidates.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center">
          <CheckCircle2Icon className="text-emerald-500 mx-auto size-10" />
          <p className="text-muted-foreground mt-3 text-sm">
            {showResolved
              ? "등록된 후보 슬라이드가 없습니다."
              : "미해결 슬라이드가 없습니다. 수고하셨습니다 🎉"}
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {candidates.map((c) => (
            <li key={c.candidateId}>
              <CandidateCard candidate={c} />
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}

function CandidateCard({ candidate }: { candidate: CandidateWithSignedUrl }) {
  const [linkedCases, setLinkedCases] = useState<SlideCandidateLinkedCase[]>(
    candidate.linkedCases,
  );
  const [isResolved, setIsResolved] = useState<boolean>(
    candidate.resolvedAt != null,
  );
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  const bookName = getBookNameBySlug(candidate.bookSlug);

  function handleLinked(c: SlideCandidateLinkedCase) {
    setLinkedCases((prev) =>
      prev.some((p) => p.caseId === c.caseId) ? prev : [...prev, c],
    );
  }
  function handleUnlinked(caseId: string) {
    setLinkedCases((prev) => prev.filter((p) => p.caseId !== caseId));
  }
  function handleResolved(v: boolean) {
    setIsResolved(v);
    if (v) {
      // 완료 처리 후 카드 사라짐
      setTimeout(() => setHidden(true), 350);
    }
  }

  return (
    <article
      className={cn(
        "bg-card overflow-hidden rounded-xl border shadow-sm transition-opacity",
        isResolved && "opacity-60",
      )}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* PDF iframe */}
        <div className="bg-muted/30 border-b lg:border-r lg:border-b-0">
          {candidate.signedUrl ? (
            <iframe
              src={candidate.signedUrl}
              title={`${candidate.bookSlug} s.${candidate.slideIdx}`}
              className="block h-[480px] w-full"
            />
          ) : (
            <div className="text-muted-foreground flex h-[480px] items-center justify-center text-sm">
              PDF 로드 실패
            </div>
          )}
        </div>

        {/* 우측 컨트롤 */}
        <div className="flex flex-col gap-3 p-4">
          <div>
            <p className="text-muted-foreground text-[11px] font-mono uppercase tracking-wide">
              {candidate.bookSlug}
            </p>
            <h2 className="mt-0.5 text-sm font-semibold">
              {bookName}
            </h2>
            <p className="text-foreground mt-1 text-base font-bold tabular-nums">
              슬라이드 {candidate.slideIdx}
            </p>
          </div>

          {candidate.autoCandidates.length > 0 && (
            <div>
              <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wide">
                자동 추출 후보 (DB 미매칭)
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {candidate.autoCandidates.map((c) => (
                  <Badge
                    key={c}
                    variant="outline"
                    className="font-mono text-[10px]"
                  >
                    {c}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {candidate.bodyPreview && (
            <div>
              <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wide">
                본문 미리보기
              </p>
              <p className="text-foreground/80 mt-1 line-clamp-3 text-[11px] leading-relaxed">
                {candidate.bodyPreview}
              </p>
            </div>
          )}

          <CaseSearchBlock
            candidate={candidate}
            linkedCases={linkedCases}
            onLinked={handleLinked}
          />

          {linkedCases.length > 0 && (
            <LinkedList
              candidate={candidate}
              linkedCases={linkedCases}
              onUnlinked={handleUnlinked}
            />
          )}

          <div className="border-t pt-3">
            <ResolveToggle
              candidateId={candidate.candidateId}
              isResolved={isResolved}
              onResolved={handleResolved}
            />
          </div>
        </div>
      </div>
    </article>
  );
}

type SearchResponse =
  | { ok: true; intent: "search"; results: CaseSearchResult[] }
  | { ok: false; error: string };
type LinkResponse =
  | {
      ok: true;
      intent: "link";
      candidateId: string;
      caseId: string;
      resourceId: string;
      alreadyExists: boolean;
    }
  | { ok: false; error: string };
type UnlinkResponse =
  | { ok: true; intent: "unlink"; caseId: string; pdfUrl: string }
  | { ok: false; error: string };
type ResolveResponse =
  | {
      ok: true;
      intent: "resolve";
      candidateId: string;
      resolved: boolean;
    }
  | { ok: false; error: string };

function CaseSearchBlock({
  candidate,
  linkedCases,
  onLinked,
}: {
  candidate: CandidateWithSignedUrl;
  linkedCases: SlideCandidateLinkedCase[];
  onLinked: (c: SlideCandidateLinkedCase) => void;
}) {
  const search = useFetcher<SearchResponse>();
  const link = useFetcher<LinkResponse>();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CaseSearchResult[]>([]);

  useEffect(() => {
    const d = search.data;
    if (!d) return;
    if (d.ok && d.intent === "search") setResults(d.results);
  }, [search.data]);

  useEffect(() => {
    const d = link.data;
    if (!d) return;
    if (d.ok && d.intent === "link") {
      const r = results.find((x) => x.caseId === d.caseId);
      if (r) onLinked({ caseId: r.caseId, caseNumber: r.caseNumber, court: r.court });
    }
  }, [link.data, results, onLinked]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) return;
    const fd = new FormData();
    fd.set("intent", "search");
    fd.set("query", query.trim());
    search.submit(fd, {
      method: "post",
      action: "/api/admin/case-study-review",
    });
  }

  function handleLink(caseId: string) {
    const fd = new FormData();
    fd.set("intent", "link");
    fd.set("candidateId", candidate.candidateId);
    fd.set("caseId", caseId);
    fd.set("bookSlug", candidate.bookSlug);
    fd.set("slideIdx", String(candidate.slideIdx));
    fd.set("pdfUrl", candidate.pdfUrl);
    link.submit(fd, {
      method: "post",
      action: "/api/admin/case-study-review",
    });
  }

  const linkedIds = new Set(linkedCases.map((c) => c.caseId));
  const searching = search.state !== "idle";

  return (
    <div className="space-y-2">
      <form onSubmit={handleSearch} className="flex gap-1.5">
        <div className="relative flex-1">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="사건번호 (예: 2018후10923)"
            className="h-8 pl-7 text-sm"
            minLength={2}
            maxLength={40}
          />
        </div>
        <Button type="submit" size="sm" className="h-8" disabled={searching}>
          {searching ? <Loader2Icon className="size-3.5 animate-spin" /> : "검색"}
        </Button>
      </form>
      {search.data && !search.data.ok && (
        <p className="text-destructive text-xs">{search.data.error}</p>
      )}
      {results.length > 0 && (
        <ul className="border-border bg-background max-h-44 divide-y overflow-y-auto rounded-md border text-xs">
          {results.map((r) => {
            const already = linkedIds.has(r.caseId);
            return (
              <li
                key={r.caseId}
                className="hover:bg-muted/50 flex items-center gap-2 px-2.5 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-foreground truncate text-[11px]">
                    {r.caseNumber}
                  </p>
                  <p className="text-muted-foreground mt-0.5 truncate text-[10px]">
                    {COURT_LABEL[r.court ?? ""] ?? r.court ?? "법원 미상"}
                    {r.decidedAt ? ` · ${r.decidedAt}` : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={already ? "secondary" : "default"}
                  onClick={() => !already && handleLink(r.caseId)}
                  disabled={already || link.state !== "idle"}
                  className="h-6 text-[10px]"
                >
                  {already ? "연결됨" : (
                    <>
                      연결 <ChevronRightIcon className="size-3" />
                    </>
                  )}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {link.data && !link.data.ok && (
        <p className="text-destructive text-xs">{link.data.error}</p>
      )}
    </div>
  );
}

function LinkedList({
  candidate,
  linkedCases,
  onUnlinked,
}: {
  candidate: CandidateWithSignedUrl;
  linkedCases: SlideCandidateLinkedCase[];
  onUnlinked: (caseId: string) => void;
}) {
  const unlink = useFetcher<UnlinkResponse>();

  useEffect(() => {
    const d = unlink.data;
    if (!d) return;
    if (d.ok && d.intent === "unlink") onUnlinked(d.caseId);
  }, [unlink.data, onUnlinked]);

  function handleUnlink(caseId: string) {
    if (!window.confirm("이 판례에서 자료를 제거할까요?")) return;
    const fd = new FormData();
    fd.set("intent", "unlink");
    fd.set("caseId", caseId);
    fd.set("pdfUrl", candidate.pdfUrl);
    unlink.submit(fd, {
      method: "post",
      action: "/api/admin/case-study-review",
    });
  }

  return (
    <div>
      <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wide">
        연결된 판례 ({linkedCases.length})
      </p>
      <ul className="mt-1 space-y-1">
        {linkedCases.map((c) => (
          <li
            key={c.caseId}
            className="bg-primary/5 text-primary flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs"
          >
            <span className="font-mono text-[11px]">{c.caseNumber}</span>
            <span className="text-muted-foreground text-[10px]">
              {COURT_LABEL[c.court ?? ""] ?? c.court ?? ""}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => handleUnlink(c.caseId)}
              disabled={unlink.state !== "idle"}
              className="ml-auto h-5 w-5 p-0"
            >
              <XIcon className="size-3" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResolveToggle({
  candidateId,
  isResolved,
  onResolved,
}: {
  candidateId: string;
  isResolved: boolean;
  onResolved: (v: boolean) => void;
}) {
  const fetcher = useFetcher<ResolveResponse>();

  useEffect(() => {
    const d = fetcher.data;
    if (!d) return;
    if (d.ok && d.intent === "resolve") onResolved(d.resolved);
  }, [fetcher.data, onResolved]);

  function toggle() {
    const fd = new FormData();
    fd.set("intent", "resolve");
    fd.set("candidateId", candidateId);
    fd.set("resolved", isResolved ? "false" : "true");
    fetcher.submit(fd, {
      method: "post",
      action: "/api/admin/case-study-review",
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={isResolved ? "secondary" : "default"}
      onClick={toggle}
      disabled={fetcher.state !== "idle"}
      className="w-full"
    >
      {isResolved ? (
        <>
          <CheckCircle2Icon className="size-3.5" /> 처리됨 (되돌리기)
        </>
      ) : (
        <>
          <CheckCircle2Icon className="size-3.5" /> 이 슬라이드 처리 완료
        </>
      )}
    </Button>
  );
}
