import { ArrowLeftIcon, ArrowRightIcon, FileQuestionIcon } from "lucide-react";
import { Link, data, redirect } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/core/components/ui/table";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  BLANK_LAW_SLUGS,
  BLANK_LAW_TABS,
  isBlankLawSlug,
  type BlankLawSlug,
} from "~/features/blanks/lib/blank-law-slugs";
import { listBlankSetsWithStatus } from "~/features/blanks/queries.server";
import { articleDisplayPrefix } from "~/features/laws/lib/identifier";

import type { Route } from "./+types/admin-blanks-list";

export const meta: Route.MetaFunction = () => [
  { title: "빈칸 자료 관리 | Lidam Edu" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw data("Unauthorized", { status: 401 });
  }
  const { data: profile } = await client
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .maybeSingle();
  const role = profile?.role ?? "student";
  if (role !== "instructor" && role !== "admin") {
    throw data("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const lawParam = url.searchParams.get("law");
  // 빈칸 자료 대상 4과목 외 슬러그이면 기본 patent 로 정규화.
  if (lawParam && !isBlankLawSlug(lawParam)) {
    const next = new URL(request.url);
    next.searchParams.set("law", "patent");
    throw redirect(`${next.pathname}${next.search}`);
  }
  const lawCode: BlankLawSlug =
    lawParam && isBlankLawSlug(lawParam) ? lawParam : "patent";
  // ?owner=mine | all | <uuid>. 기본 mine (본인 owner 만)
  const ownerParam = url.searchParams.get("owner") ?? "mine";
  const ownerId =
    ownerParam === "all"
      ? undefined
      : ownerParam === "mine"
        ? user.id
        : ownerParam;
  const sets = await listBlankSetsWithStatus(client, lawCode, ownerId);

  // 해당 법령의 article (level='article') 카운트 — 0 이면 조문 미업로드 안내.
  const { data: lawRow } = await client
    .from("laws")
    .select("law_id")
    .eq("law_code", lawCode)
    .maybeSingle();
  let articleCount = 0;
  if (lawRow) {
    const { count } = await client
      .from("articles")
      .select("article_id", { count: "exact", head: true })
      .eq("law_id", lawRow.law_id)
      .eq("level", "article")
      .is("deleted_at", null);
    articleCount = count ?? 0;
  }

  // chapter 필터 chip = 그 장의 편집 화면으로 진입하는 트리거 (목록 행 필터 X).
  // chapter 목록은 실제로 set 이 매핑된 chapter 만 (path 정렬 — queries.server.ts 가 path 순 반환).
  const chapterMap = new Map<string, { chapterId: string; displayLabel: string }>();
  let hasUngrouped = false;
  for (const s of sets) {
    if (s.chapterId && s.chapterLabel) {
      if (!chapterMap.has(s.chapterId)) {
        chapterMap.set(s.chapterId, {
          chapterId: s.chapterId,
          displayLabel: s.chapterLabel,
        });
      }
    } else {
      hasUngrouped = true;
    }
  }
  const chapters = [...chapterMap.values()];
  if (hasUngrouped) {
    chapters.push({ chapterId: "__ungrouped__", displayLabel: "미분류" });
  }

  // owner 목록 (filter dropdown용)
  const { data: owners } = await client
    .from("article_blank_sets")
    .select("owner_id, profiles!owner_id(name)")
    .order("owner_id");
  const ownerMap = new Map<string, string>();
  for (const o of owners ?? []) {
    if (!ownerMap.has(o.owner_id)) {
      ownerMap.set(o.owner_id, o.profiles?.name ?? "(이름없음)");
    }
  }
  const ownerList = [...ownerMap.entries()].map(([id, name]) => ({ id, name }));

  return {
    lawCode,
    sets,
    currentOwner: ownerParam,
    currentUserId: user.id,
    ownerList,
    chapters,
    articleCount,
  };
}

export default function AdminBlanksList({ loaderData }: Route.ComponentProps) {
  const {
    lawCode,
    sets,
    currentOwner,
    currentUserId,
    ownerList,
    chapters,
    articleCount,
  } = loaderData;
  const total = sets.reduce((s, x) => s + x.totalBlanks, 0);
  const filled = sets.reduce((s, x) => s + x.filledBlanks, 0);
  const unmapped = total - filled;
  const articlesWithUnmapped = sets.filter((s) => s.unmappedBlanks > 0).length;
  const lawName =
    BLANK_LAW_TABS.find((t) => t.slug === lawCode)?.name ?? lawCode;
  const articlesEmpty = articleCount === 0;

  // 행 사이 chapter group header 를 끼워 넣기 위한 sentinel.
  type RowSentinel =
    | { kind: "group"; chapterId: string; label: string }
    | { kind: "row"; set: (typeof sets)[number] };
  const renderRows: RowSentinel[] = [];
  let lastGroupKey: string | null = null;
  for (const s of sets) {
    const key = s.chapterId ?? "__ungrouped__";
    if (key !== lastGroupKey) {
      renderRows.push({
        kind: "group",
        chapterId: key,
        label: s.chapterLabel ?? "미분류",
      });
      lastGroupKey = key;
    }
    renderRows.push({ kind: "row", set: s });
  }

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
          운영자 · 콘텐츠 관리
        </p>
        <h1 className="text-2xl font-bold tracking-tight">빈칸 자료 관리</h1>
        <p className="text-muted-foreground text-sm">
          강사마다 자기 빈칸 자료를 따로 만들어 관리합니다. 본인이 만든 자료만 바로 편집할 수 있고, 다른 강사의 자료를 고치고 싶다면 "내 자료로 복사"한 뒤 수정하세요.
        </p>
        <div className="flex flex-wrap items-center gap-1.5 pt-2">
          <span className="text-muted-foreground text-xs">법령:</span>
          {BLANK_LAW_TABS.map((t) => (
            <LawTabLink
              key={t.slug}
              slug={t.slug}
              current={lawCode}
              currentOwner={currentOwner}
            >
              {t.name}
            </LawTabLink>
          ))}
        </div>
        {articlesEmpty ? null : (
          <>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-muted-foreground text-xs">강사 필터:</span>
              <OwnerLink law={lawCode} owner="mine" current={currentOwner}>
                내 자료
              </OwnerLink>
              <OwnerLink law={lawCode} owner="all" current={currentOwner}>
                전체
              </OwnerLink>
              {ownerList
                .filter((o) => o.id !== currentUserId)
                .map((o) => (
                  <OwnerLink
                    key={o.id}
                    law={lawCode}
                    owner={o.id}
                    current={currentOwner}
                  >
                    {o.name}
                  </OwnerLink>
                ))}
            </div>
            {chapters.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-muted-foreground text-xs">
                  편집 그룹:
                </span>
                <ChapterEditLink law={lawCode} chapterId="__all__">
                  전체
                </ChapterEditLink>
                {chapters.map((c) => (
                  <ChapterEditLink
                    key={c.chapterId}
                    law={lawCode}
                    chapterId={c.chapterId}
                  >
                    {c.displayLabel}
                  </ChapterEditLink>
                ))}
              </div>
            ) : null}
          </>
        )}
      </header>

      {articlesEmpty ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="bg-muted text-muted-foreground rounded-full p-3">
              <FileQuestionIcon className="size-6" />
            </div>
            <h2 className="text-base font-bold">
              {lawName} 조문이 아직 업로드되지 않았습니다
            </h2>
            <p className="text-muted-foreground max-w-md text-sm">
              조문이 업로드되면 자동으로 이 페이지에서 빈칸 자료를 만들 수
              있습니다. 다른 법령을 보려면 위 법령 탭을 선택하세요.
            </p>
          </CardContent>
        </Card>
      ) : (
      <>
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <KpiCard label="조문 수" value={String(sets.length)} />
        <KpiCard label="총 빈칸" value={String(total)} />
        <KpiCard label="정답 입력 완료" value={`${filled}`} subtle={`${total > 0 ? Math.round((filled / total) * 100) : 0}%`} />
        <KpiCard
          label="미매칭"
          value={String(unmapped)}
          subtle={`${articlesWithUnmapped}개 조문`}
          warn={unmapped > 0}
        />
      </div>

      <Card>
        <CardHeader>
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            조문별 진행 상태
          </p>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">조문</TableHead>
                <TableHead>제목</TableHead>
                <TableHead className="w-32">강사 / 버전</TableHead>
                <TableHead className="w-20 text-right">전체</TableHead>
                <TableHead className="w-20 text-right">완료</TableHead>
                <TableHead className="w-20 text-right">미매칭</TableHead>
                <TableHead className="w-32"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {renderRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground py-8 text-center text-sm">
                    빈칸 자료가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                renderRows.map((r) => {
                  if (r.kind === "group") {
                    return (
                      <TableRow
                        key={`group-${r.chapterId}`}
                        className="bg-muted/40 hover:bg-muted/40"
                      >
                        <TableCell
                          colSpan={7}
                          className="text-muted-foreground py-1.5 text-xs font-semibold tracking-wide uppercase"
                        >
                          {r.label}
                        </TableCell>
                      </TableRow>
                    );
                  }
                  const s = r.set;
                  const mine = s.ownerId === currentUserId;
                  return (
                    <TableRow key={s.setId}>
                      <TableCell className="font-mono text-xs">
                        {s.articleNumber
                          ? articleDisplayPrefix(s.articleNumber)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {s.articleLabel.replace(/^제\d+조(?:의\d+)?\s*/, "")}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span
                          className={
                            mine
                              ? "text-primary font-medium"
                              : "text-muted-foreground"
                          }
                        >
                          {ownerName(s.ownerId, ownerList)}
                        </span>
                        <span className="text-muted-foreground">
                          {" "}· {s.displayName ?? s.version}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.totalBlanks}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.filledBlanks}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.unmappedBlanks > 0 ? (
                          <Badge variant="destructive" className="font-mono">
                            {s.unmappedBlanks}
                          </Badge>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400">0</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Link
                          to={`/admin/blanks/${s.setId}`}
                          viewTransition
                          className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                        >
                          {mine ? "편집" : "보기"}{" "}
                          <ArrowRightIcon className="size-3" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      </>
      )}
    </div>
  );
}

function LawTabLink({
  slug,
  current,
  currentOwner,
  children,
}: {
  slug: BlankLawSlug;
  current: BlankLawSlug;
  currentOwner: string;
  children: React.ReactNode;
}) {
  const active = slug === current;
  // 법령을 바꿀 때 owner 필터는 유지, chapter/기타 sub state 는 reset.
  const params = new URLSearchParams();
  params.set("law", slug);
  if (currentOwner !== "mine") params.set("owner", currentOwner);
  return (
    <Link
      to={`/admin/blanks?${params.toString()}`}
      className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background text-muted-foreground border-input hover:bg-accent"
      }`}
    >
      {children}
    </Link>
  );
}

function OwnerLink({
  law,
  owner,
  current,
  children,
}: {
  law: string;
  owner: string;
  current: string;
  children: React.ReactNode;
}) {
  const active = owner === current;
  return (
    <Link
      to={`/admin/blanks?law=${law}&owner=${owner}`}
      className={`rounded-md border px-2 py-0.5 text-xs ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background text-muted-foreground border-input hover:bg-accent"
      }`}
    >
      {children}
    </Link>
  );
}

function ChapterEditLink({
  law,
  chapterId,
  children,
}: {
  law: string;
  chapterId: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={`/admin/blanks/law/${law}?chapter=${encodeURIComponent(chapterId)}`}
      viewTransition
      className="bg-primary/10 text-primary border-primary/30 hover:bg-primary hover:text-primary-foreground hover:border-primary inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold transition"
    >
      {children}
      <ArrowRightIcon className="size-3" />
    </Link>
  );
}

function ownerName(
  ownerId: string,
  ownerList: { id: string; name: string }[],
): string {
  return ownerList.find((o) => o.id === ownerId)?.name ?? "(이름없음)";
}

function KpiCard({
  label,
  value,
  subtle,
  warn,
}: {
  label: string;
  value: string;
  subtle?: string;
  warn?: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 py-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className={`text-2xl font-bold tabular-nums ${warn ? "text-amber-600 dark:text-amber-400" : ""}`}>
          {value}
        </p>
        {subtle ? (
          <p className="text-muted-foreground text-xs">{subtle}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
