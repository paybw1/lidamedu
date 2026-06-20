// 빈칸 자료 세트 목록 — P2 LIST/TABLE 패턴. AdminShell cluster="blanks".
// 원본 동작(loader/action/쿼리/리다이렉트/권한 체크) 보존. 시각만 변경.

import { ArrowRightIcon, FileQuestionIcon, PencilLineIcon } from "lucide-react";
import { Link, data, redirect } from "react-router";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  Bar,
  Chip,
  IndexTable,
  TD,
  TR,
} from "~/features/admin/components/admin-ui";
import {
  BLANK_LAW_TABS,
  isBlankLawSlug,
  type BlankLawSlug,
} from "~/features/blanks/lib/blank-law-slugs";
import { listBlankSetsWithStatus } from "~/features/blanks/queries.server";
import { articleDisplayPrefix } from "~/features/laws/lib/identifier";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-blanks-list";

export const meta: Route.MetaFunction = () => [
  { title: "빈칸 자료 관리 | Lidam Patent Attorney Academy" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw data("Unauthorized", { status: 401 });
  }
  const role = await getStaffRole(client, user.id);
  if (!role) {
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
    role,
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
    role,
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

  const fillPct = total > 0 ? Math.round((filled / total) * 100) : 0;

  return (
    <AdminShell
      cluster="blanks"
      role={role}
      title={`${lawName} 빈칸 자료`}
      desc="강사마다 자기 빈칸 자료를 따로 만들어 관리합니다. 본인이 만든 자료만 바로 편집할 수 있고, 다른 강사의 자료를 고치고 싶다면 '내 자료로 복사'한 뒤 수정하세요."
      headerRight={
        chapters.length > 0 ? (
          <Button asChild size="sm">
            <Link to={`/admin/blanks/law/${lawCode}`} viewTransition>
              <PencilLineIcon className="mr-1.5 size-3.5" />
              법령별 일괄 편집
            </Link>
          </Button>
        ) : undefined
      }
    >
      {/* 법령 탭 필터 */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground mr-1 text-[11px] font-semibold">
          법령
        </span>
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

      {articlesEmpty ? (
        /* 빈 상태 — 조문 미업로드 */
        <EmptyArticles lawName={lawName} />
      ) : (
        <>
          {/* KPI 행 */}
          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            <KpiCard label="조문 수" value={String(sets.length)} />
            <KpiCard label="총 빈칸" value={String(total)} />
            <KpiCard
              label="정답 입력 완료"
              value={String(filled)}
              subtle={`${fillPct}%`}
            />
            <KpiCard
              label="미매칭"
              value={String(unmapped)}
              subtle={`${articlesWithUnmapped}개 조문`}
              warn={unmapped > 0}
            />
          </div>

          {/* 강사 / 편집 그룹 필터 */}
          <div className="border-border bg-card mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground text-[11px] font-semibold whitespace-nowrap">
                강사
              </span>
              <OwnerChip law={lawCode} owner="mine" current={currentOwner}>
                내 자료
              </OwnerChip>
              <OwnerChip law={lawCode} owner="all" current={currentOwner}>
                전체
              </OwnerChip>
              {ownerList
                .filter((o) => o.id !== currentUserId)
                .map((o) => (
                  <OwnerChip
                    key={o.id}
                    law={lawCode}
                    owner={o.id}
                    current={currentOwner}
                  >
                    {o.name}
                  </OwnerChip>
                ))}
            </div>

            {chapters.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground text-[11px] font-semibold whitespace-nowrap">
                  편집 그룹
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
          </div>

          {/* 전체 진행률 막대 */}
          <div className="mb-4 space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground font-semibold">
                전체 진행률
              </span>
              <span className="text-foreground tabular-nums font-semibold">
                {filled} / {total} ({fillPct}%)
              </span>
            </div>
            <Bar value={filled} max={total} tone="auto" />
          </div>

          {/* 조문별 표 */}
          {renderRows.length === 0 ? (
            <EmptyFiltered />
          ) : (
            <IndexTable
              headers={[
                { label: "조문", width: "7rem" },
                { label: "제목" },
                { label: "강사 / 버전", width: "9rem" },
                { label: "전체", align: "right", width: "5rem" },
                { label: "완료", align: "right", width: "5rem" },
                { label: "미매칭", align: "right", width: "5rem" },
                { label: "", width: "5rem" },
              ]}
            >
              {renderRows.map((r) => {
                if (r.kind === "group") {
                  return (
                    <tr
                      key={`group-${r.chapterId}`}
                      className="bg-muted/40"
                    >
                      <td
                        colSpan={7}
                        className="text-muted-foreground px-3 py-1.5 text-[11px] font-semibold tracking-[0.04em] uppercase"
                      >
                        {r.label}
                      </td>
                    </tr>
                  );
                }
                const s = r.set;
                const mine = s.ownerId === currentUserId;
                const rowFillPct =
                  s.totalBlanks > 0
                    ? Math.round((s.filledBlanks / s.totalBlanks) * 100)
                    : 0;
                return (
                  <TR key={s.setId}>
                    <TD mono>
                      {s.articleNumber
                        ? articleDisplayPrefix(s.articleNumber)
                        : "—"}
                    </TD>
                    <TD>
                      <div className="space-y-0.5">
                        <span>
                          {s.articleLabel.replace(/^제\d+조(?:의\d+)?\s*/, "")}
                        </span>
                        {s.totalBlanks > 0 ? (
                          <Bar
                            value={s.filledBlanks}
                            max={s.totalBlanks}
                            tone="auto"
                            className="w-24"
                          />
                        ) : null}
                      </div>
                    </TD>
                    <TD soft>
                      <span
                        className={
                          mine
                            ? "text-link font-semibold"
                            : "text-muted-foreground"
                        }
                      >
                        {ownerName(s.ownerId, ownerList)}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}· {s.displayName ?? s.version}
                      </span>
                    </TD>
                    <TD align="right" mono>
                      {s.totalBlanks}
                    </TD>
                    <TD align="right" mono>
                      <span className="tabular-nums">
                        {s.filledBlanks}
                        <span className="text-muted-foreground text-[10px]">
                          {" "}({rowFillPct}%)
                        </span>
                      </span>
                    </TD>
                    <TD align="right" mono>
                      {s.unmappedBlanks > 0 ? (
                        <Chip tone="coral">{s.unmappedBlanks}</Chip>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">
                          0
                        </span>
                      )}
                    </TD>
                    <TD>
                      <Link
                        to={`/admin/blanks/${s.setId}`}
                        viewTransition
                        className="text-link inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                      >
                        {mine ? "편집" : "보기"}
                        <ArrowRightIcon className="size-3" />
                      </Link>
                    </TD>
                  </TR>
                );
              })}
            </IndexTable>
          )}
        </>
      )}
    </AdminShell>
  );
}

/* ── 로컬 서브컴포넌트 ─────────────────────────────────────────────────── */

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
  const params = new URLSearchParams();
  params.set("law", slug);
  if (currentOwner !== "mine") params.set("owner", currentOwner);
  return (
    <Link
      to={`/admin/blanks?${params.toString()}`}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background text-muted-foreground border-border hover:bg-muted"
      }`}
    >
      {children}
    </Link>
  );
}

function OwnerChip({
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
      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background text-muted-foreground border-border hover:bg-muted"
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
      className="bg-primary/10 text-link border-primary/30 hover:bg-primary hover:text-primary-foreground hover:border-primary inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition"
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
    <div className="border-border bg-card rounded-xl border p-4 shadow-sm">
      <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.04em] uppercase">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-extrabold tabular-nums ${
          warn ? "text-amber-600 dark:text-amber-400" : "text-foreground"
        }`}
      >
        {value}
      </p>
      {subtle ? (
        <p className="text-muted-foreground mt-0.5 text-[11px] tabular-nums">
          {subtle}
        </p>
      ) : null}
    </div>
  );
}

function EmptyArticles({ lawName }: { lawName: string }) {
  return (
    <div className="border-border bg-card flex flex-col items-center gap-3 rounded-xl border py-16 text-center shadow-sm">
      <div className="bg-muted text-muted-foreground rounded-full p-3">
        <FileQuestionIcon className="size-6" />
      </div>
      <h2 className="text-base font-bold">
        {lawName} 조문이 아직 업로드되지 않았습니다
      </h2>
      <p className="text-muted-foreground max-w-md text-sm">
        조문이 업로드되면 자동으로 이 페이지에서 빈칸 자료를 만들 수 있습니다.
        다른 법령을 보려면 위 법령 탭을 선택하세요.
      </p>
    </div>
  );
}

function EmptyFiltered() {
  return (
    <div className="border-border bg-card flex flex-col items-center gap-3 rounded-xl border py-16 text-center shadow-sm">
      <div className="bg-muted text-muted-foreground rounded-full p-3">
        <FileQuestionIcon className="size-6" />
      </div>
      <h2 className="text-base font-bold">해당 조건의 빈칸 자료가 없습니다</h2>
      <p className="text-muted-foreground max-w-sm text-sm">
        필터를 변경하거나 "내 자료로 복사" 후 편집을 시작하세요.
      </p>
    </div>
  );
}
