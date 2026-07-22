// SRS v2 ④ — /srs 카드 복습 화면.
// 앞면 표시 → "정답 보기" → 뒷면 + 4 grade 버튼 → 다음 카드.
// elapsed_ms = 카드 표시 시점 ~ grade 클릭까지 ms.
import type { Route } from "./+types/srs-review";

import {
  ArrowRightIcon,
  CheckCircle2Icon,
  ClockIcon,
  EyeIcon,
  NotebookPenIcon,
  RotateCcwIcon,
  SparklesIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, data, redirect, useFetcher, useLocation } from "react-router";

import { PageHeader, StudentShell, Surface } from "~/core/components/student";
import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { studentDisabledSubjectsFor } from "~/core/lib/nav-groups";
import { GuideHelpButton } from "~/features/guide/components/guide-help-button";
import { cn } from "~/core/lib/utils";
import { hasMyAnalysisConsent } from "~/features/exam-results/queries.server";
import {
  getDueCountsByType,
  getReviewQueue,
  isKindBacklogged,
  updateUserFilterSettings,
} from "~/features/srs/srs.server";
import { MyAnalysisOffNotice } from "~/features/study/components/my-analysis-off-notice";
import { StudyMgmtTabs } from "~/features/study/components/study-mgmt-tabs";
import { getMembershipAccess } from "~/features/subscriptions/membership.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

function subjectLabel(slug: string): string {
  return LAW_SUBJECTS[slug as LawSubjectSlug]?.shortName ?? slug;
}

// 카드 원본(조문/판례)의 학습과목 화면 경로. 조문은 law_ref("patent#29")의 번호로,
// 판례는 case_id 로 링크. 없으면 null(버튼 미표시).
function sourceHref(item: {
  subject: string;
  sourceType: string | null;
  sourceId: string | null;
  lawRef: string | null;
}): string | null {
  if (item.sourceType === "case" && item.sourceId) {
    return `/subjects/${item.subject}/cases/${item.sourceId}`;
  }
  if (item.sourceType === "article") {
    const num =
      item.lawRef && item.lawRef.includes("#")
        ? item.lawRef.split("#")[1]
        : null;
    if (num) return `/subjects/${item.subject}/articles/${num}`;
  }
  return null;
}

// 조문/판례 화면으로 넘어가는 링크 + 복귀용 srsReturn(현재 필터 + 이 카드) 부착.
function recordHrefFor(
  item: {
    itemId: string;
    subject: string;
    sourceType: string | null;
    sourceId: string | null;
    lawRef: string | null;
  },
  filter: { sourceType: string | null; subject: string | null },
): string | null {
  const base = sourceHref(item);
  if (!base) return null;
  const ret = new URLSearchParams();
  if (filter.sourceType) ret.set("type", filter.sourceType);
  if (filter.subject) ret.set("subject", filter.subject);
  ret.set("card", item.itemId);
  const returnUrl = `/srs?${ret.toString()}`;
  return `${base}?srsReturn=${encodeURIComponent(returnUrl)}`;
}

export const meta: Route.MetaFunction = () => [{ title: "암기 카드 | 리담" }];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login?next=/srs");
  // 학습관리 탭 노출 판정(종합반 전용 과제·상담) — StudyMgmtTabs 배선용.
  const access = await getMembershipAccess(client, user.id);
  const mgmtNav = {
    gradeStaff: access.grade === "staff",
    features: access.features,
  };
  // feat-8-026b A 게이트 — 미동의/철회 시 암기 미표시(데이터는 보존, 재동의 시 복구).
  if (!(await hasMyAnalysisConsent(client, user.id))) {
    return { myAnalysisOff: true as const, mgmtNav };
  }
  // feat-2-024 — 종류(조문/판례)·과목 필터 + 종류별 밀림 배지.
  const url = new URL(request.url);
  const typeParam = url.searchParams.get("type");
  const subjectParam = url.searchParams.get("subject");
  const sourceType =
    typeParam === "article" || typeParam === "case" ? typeParam : null;
  const subject =
    subjectParam &&
    (LAW_SUBJECT_SLUGS as readonly string[]).includes(subjectParam)
      ? subjectParam
      : null;
  // 학생에게 비활성인 준비 중 과목은 SRS 에서도 숨김 — staff 전체·종합반은 개방 과목(민법) 포함.
  const excludeSubjects = studentDisabledSubjectsFor(access.grade);
  const [queue, dueByType] = await Promise.all([
    getReviewQueue(client, user.id, { sourceType, subject, excludeSubjects }),
    getDueCountsByType(client, user.id, excludeSubjects),
  ]);
  return {
    myAnalysisOff: false as const,
    mgmtNav,
    excludedSubjects: excludeSubjects,
    ...queue,
    filter: { sourceType, subject },
    cardDue: {
      article: {
        due: dueByType.article.due,
        backlogged: isKindBacklogged(dueByType.article),
      },
      case: {
        due: dueByType.case.due,
        backlogged: isKindBacklogged(dueByType.case),
      },
    },
  };
}

// feat-2-023c — 카드 구성(중요도 하한 + 즐겨찾기만) 저장. 현재 페이지 action 이라
// 별도 리소스 라우트 없이 항상 매칭(리로드/배포 시 라우트 누락 404 방지).
export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ ok: false as const }, { status: 401 });
  const fd = await request.formData();
  const importanceMin = Number(fd.get("importanceMin") ?? 0);
  const bookmarkMin = Number(fd.get("bookmarkMin") ?? 0);
  await updateUserFilterSettings(client, user.id, {
    importanceMin: Number.isFinite(importanceMin) ? importanceMin : 0,
    bookmarkMin: Number.isFinite(bookmarkMin) ? bookmarkMin : 0,
  });
  return data({ ok: true as const });
}

type Grade = 0 | 3 | 4 | 5;

interface GradeButtonSpec {
  grade: Grade;
  label: string;
  shortcut: string;
  tone: string;
}

const GRADES: GradeButtonSpec[] = [
  {
    grade: 0,
    label: "다시 외우기",
    shortcut: "1",
    tone: "bg-rose-500 hover:bg-rose-600 text-white",
  },
  {
    grade: 3,
    label: "어려웠음",
    shortcut: "2",
    tone: "bg-amber-500 hover:bg-amber-600 text-white",
  },
  {
    grade: 4,
    label: "보통",
    shortcut: "3",
    tone: "bg-emerald-500 hover:bg-emerald-600 text-white",
  },
  {
    grade: 5,
    label: "쉬웠음",
    shortcut: "4",
    tone: "bg-sky-500 hover:bg-sky-600 text-white",
  },
];

export default function SrsReview({ loaderData }: Route.ComponentProps) {
  if (loaderData.myAnalysisOff)
    return <MyAnalysisOffNotice feature="암기 카드" />;
  return <SrsReviewInner data={loaderData} />;
}

function SrsReviewInner({
  data,
}: {
  data: Extract<Route.ComponentProps["loaderData"], { myAnalysisOff: false }>;
}) {
  const { today, items, dueCount, newCount, newIntroducedToday, settings } =
    data;
  const location = useLocation();
  // 조문/판례 화면으로 넘어갔다 돌아왔을 때(?card=<itemId>) 그 카드로 복귀.
  const [cursor, setCursor] = useState(() => {
    const restore = new URLSearchParams(location.search).get("card");
    if (!restore) return 0;
    const i = items.findIndex((it) => it.itemId === restore);
    return i >= 0 ? i : 0;
  });
  const [flipped, setFlipped] = useState(false);
  const shownAtRef = useRef<number>(Date.now());
  const fetcher = useFetcher<{
    ok?: boolean;
    error?: string;
    result?: { newState: string; newInterval: number; newDueDate: string };
  }>();

  // 카드 진입 시 타이머 리셋.
  useEffect(() => {
    shownAtRef.current = Date.now();
    setFlipped(false);
  }, [cursor]);

  // 제출 성공 시 다음 카드로 진행.
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      setCursor((c) => c + 1);
    }
  }, [fetcher.state, fetcher.data]);

  // 키보드 단축키 — Space=뒤집기, 1/2/3/4=채점.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (!flipped) {
        if (e.code === "Space") {
          e.preventDefault();
          setFlipped(true);
        }
        return;
      }
      const idx = ["1", "2", "3", "4"].indexOf(e.key);
      if (idx >= 0 && fetcher.state === "idle") {
        e.preventDefault();
        submit(GRADES[idx].grade);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped, cursor, fetcher.state]);

  const current = items[cursor];
  const done = cursor >= items.length;
  const progress = useMemo(
    () => ({ done: cursor, total: items.length }),
    [cursor, items.length],
  );

  function submit(grade: Grade) {
    if (!current) return;
    const elapsedMs = Date.now() - shownAtRef.current;
    const form = new FormData();
    form.set("itemId", current.itemId);
    form.set("grade", String(grade));
    form.set("elapsedMs", String(elapsedMs));
    fetcher.submit(form, {
      method: "post",
      action: "/api/srs/review",
    });
  }

  return (
    <>
      <StudyMgmtTabs
        isStaff={data.mgmtNav.gradeStaff}
        features={data.mgmtNav.features}
      />
      <StudentShell width="wide">
        <PageHeader
          area="manage"
          title="오늘의 암기 카드"
          description={today}
          actions={
            <div className="flex items-center gap-2">
              <Link
                to="/srs/stats"
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-semibold underline-offset-2 hover:underline"
              >
                통계
              </Link>
              <GuideHelpButton screenKey="srs-cards" />
            </div>
          }
        />

        <ChipFilters
          filter={data.filter}
          cardDue={data.cardDue}
          subjectSlugs={LAW_SUBJECT_SLUGS.filter(
            (s) => !data.excludedSubjects.includes(s),
          )}
        />

        <CardFilterSettings
          importanceMin={settings.importanceMin}
          bookmarkMin={settings.bookmarkMin}
        />

        {/* 카드 카운터 */}
        <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Counter label="오늘 암기" value={dueCount} tone="rose" />
          <Counter
            label="새 카드"
            value={newCount}
            tone="sky"
            hint={`오늘 ${newIntroducedToday}/${settings.newPerDay}`}
          />
          <Counter
            label="진행"
            value={`${progress.done}/${progress.total}`}
            tone="neutral"
          />
          <Counter
            label="남은 카드"
            value={Math.max(0, progress.total - progress.done)}
            tone="amber"
          />
        </div>

        {/* 본문 */}
        {done ? (
          <CompleteCard total={items.length} />
        ) : current ? (
          <CardArea
            item={current}
            recordHref={recordHrefFor(current, data.filter)}
            flipped={flipped}
            submitting={fetcher.state !== "idle"}
            onFlip={() => setFlipped(true)}
            onGrade={submit}
          />
        ) : (
          <EmptyCard />
        )}

        {/* 알림 */}
        {fetcher.data?.error ? (
          <p className="mt-3 text-center text-xs text-rose-600 dark:text-rose-400">
            ✗ {fetcher.data.error}
          </p>
        ) : null}
      </StudentShell>
    </>
  );
}

/* ── 부속 컴포넌트 ────────────────────────────────────────────────── */

// feat-2-024 — 종류·과목 칩 필터(기본 전체) + 종류별 due 배지.
function srsHref(type: string | null, subject: string | null): string {
  const p = new URLSearchParams();
  if (type) p.set("type", type);
  if (subject) p.set("subject", subject);
  const s = p.toString();
  return s ? `/srs?${s}` : "/srs";
}

function FilterChip({
  active,
  to,
  children,
}: {
  active: boolean;
  to: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      preventScrollReset
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card hover:border-primary hover:text-link",
      )}
    >
      {children}
    </Link>
  );
}

function DueBadge({ stat }: { stat: { due: number; backlogged: boolean } }) {
  if (stat.due <= 0) return null;
  return (
    <span
      className={cn(
        "rounded-full px-1.5 text-[10px] font-bold tabular-nums",
        stat.backlogged
          ? "bg-rose-500 text-white"
          : "bg-muted text-muted-foreground",
      )}
    >
      {stat.due}
    </span>
  );
}

function ChipFilters({
  filter,
  cardDue,
  subjectSlugs,
}: {
  filter: { sourceType: string | null; subject: string | null };
  cardDue: {
    article: { due: number; backlogged: boolean };
    case: { due: number; backlogged: boolean };
  };
  /** 표시할 과목 칩 — 학생은 비활성 과목 제외 목록, staff 는 전체. */
  subjectSlugs: readonly string[];
}) {
  const { sourceType, subject } = filter;
  return (
    <div className="mb-5 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground mr-1 text-[11px] font-semibold">
          종류
        </span>
        <FilterChip active={sourceType === null} to={srsHref(null, subject)}>
          전체
        </FilterChip>
        <FilterChip
          active={sourceType === "article"}
          to={srsHref("article", subject)}
        >
          조문
          <DueBadge stat={cardDue.article} />
        </FilterChip>
        <FilterChip
          active={sourceType === "case"}
          to={srsHref("case", subject)}
        >
          판례
          <DueBadge stat={cardDue.case} />
        </FilterChip>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground mr-1 text-[11px] font-semibold">
          과목
        </span>
        <FilterChip active={subject === null} to={srsHref(sourceType, null)}>
          전체
        </FilterChip>
        {subjectSlugs.map((slug) => (
          <FilterChip
            key={slug}
            active={subject === slug}
            to={srsHref(sourceType, slug)}
          >
            {subjectLabel(slug)}
          </FilterChip>
        ))}
      </div>
    </div>
  );
}

// feat-2-023c — 학생 암기카드 구성. 중요도(강사 ★)·즐겨찾기(내 ★) 각각 독립적으로
// 수준 선택(둘 다 '사용 안 함' 가능). 둘 다 켜면 두 조건 모두 만족하는 카드만(AND).
// 변경 즉시 저장 → 큐 재조회.
function CardFilterSettings({
  importanceMin,
  bookmarkMin,
}: {
  importanceMin: number;
  bookmarkMin: number;
}) {
  const fetcher = useFetcher();
  const [imp, setImp] = useState(importanceMin);
  const [fav, setFav] = useState(bookmarkMin);
  const save = (nextImp: number, nextFav: number) => {
    setImp(nextImp);
    setFav(nextFav);
    const fd = new FormData();
    fd.set("importanceMin", String(nextImp));
    fd.set("bookmarkMin", String(nextFav));
    // 현재 /srs 페이지 action 으로 저장(별도 라우트 404 방지) → 로더 재검증.
    fetcher.submit(fd, { method: "post" });
  };
  return (
    <div className="border-border bg-muted/30 mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-dashed px-3 py-2 text-xs">
      <span className="text-muted-foreground font-semibold">카드 구성</span>
      <label className="flex items-center gap-1.5">
        <span className="text-muted-foreground">강사 중요도</span>
        <select
          value={String(imp)}
          onChange={(e) => save(Number(e.currentTarget.value), fav)}
          className="border-input bg-background h-7 rounded border px-1.5 text-xs"
          aria-label="강사 중요도 하한"
        >
          <option value="0">사용 안 함</option>
          <option value="1">★ 이상</option>
          <option value="2">★★ 이상</option>
          <option value="3">★★★</option>
        </select>
      </label>
      <label className="flex items-center gap-1.5">
        <span className="text-muted-foreground">내 즐겨찾기</span>
        <select
          value={String(fav)}
          onChange={(e) => save(imp, Number(e.currentTarget.value))}
          className="border-input bg-background h-7 rounded border px-1.5 text-xs"
          aria-label="즐겨찾기 별 하한"
        >
          <option value="0">사용 안 함</option>
          <option value="1">★ 이상</option>
          <option value="2">★★ 이상</option>
          <option value="3">★★★ 이상</option>
          <option value="4">★★★★ 이상</option>
          <option value="5">★★★★★</option>
        </select>
      </label>
      {imp > 0 && fav > 0 ? (
        <span className="text-muted-foreground text-[11px]">
          · 두 조건 모두 만족
        </span>
      ) : null}
      {fetcher.state !== "idle" ? (
        <span className="text-muted-foreground">적용 중…</span>
      ) : null}
    </div>
  );
}

function Counter({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number | string;
  tone: "rose" | "sky" | "amber" | "neutral";
  hint?: string;
}) {
  const cls =
    tone === "rose"
      ? "border-rose-300/60 bg-rose-50/60 text-rose-700 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-300"
      : tone === "sky"
        ? "border-sky-300/60 bg-sky-50/60 text-sky-700 dark:border-sky-700/40 dark:bg-sky-950/30 dark:text-sky-300"
        : tone === "amber"
          ? "border-amber-300/60 bg-amber-50/60 text-amber-700 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-300"
          : "border-border bg-card text-muted-foreground";
  return (
    <div className={cn("rounded-xl border p-3", cls)}>
      <p className="font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
        {label}
      </p>
      <p className="text-foreground mt-1 text-xl font-extrabold tabular-nums">
        {value}
      </p>
      {hint ? (
        <p className="text-muted-foreground mt-0.5 text-[10px]">{hint}</p>
      ) : null}
    </div>
  );
}

type Item = Extract<
  Route.ComponentProps["loaderData"],
  { myAnalysisOff: false }
>["items"][number];

function CardArea({
  item,
  recordHref,
  flipped,
  submitting,
  onFlip,
  onGrade,
}: {
  item: Item;
  recordHref: string | null;
  flipped: boolean;
  submitting: boolean;
  onFlip: () => void;
  onGrade: (g: Grade) => void;
}) {
  const sourceNoun = item.sourceType === "case" ? "판례" : "조문";
  return (
    <Surface pad={0} tone="subtle">
      <div className="px-6 pt-6 pb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="bg-primary/10 text-link inline-flex h-5 items-center rounded-full px-2 font-mono text-[10px] font-bold tracking-[0.04em] uppercase">
            {subjectLabel(item.subject)}
          </span>
          {item.topic ? (
            <span className="text-muted-foreground text-[11px]">
              {item.topic}
            </span>
          ) : null}
          {item.kind === "new" ? (
            <span className="ml-auto inline-flex h-5 items-center rounded-full bg-sky-500/15 px-2 text-[10px] font-bold text-sky-700 dark:text-sky-300">
              새 카드
            </span>
          ) : (
            <span className="text-muted-foreground ml-auto inline-flex items-center gap-1 text-[10px] tabular-nums">
              <ClockIcon className="size-2.5" />
              {item.intervalDays}일 간격
            </span>
          )}
        </div>
      </div>
      <div className="px-6 pb-6">
        {/* Front */}
        <div className="border-border bg-muted/30 rounded-lg border p-5">
          <p className="text-muted-foreground mb-2 font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
            앞면 (질문)
          </p>
          <p className="text-foreground text-[15px] leading-relaxed whitespace-pre-line">
            {item.front}
          </p>
          {/* 조문 카드는 lawRef 가 "code#num" raw 값(링크용)이라 표시 노이즈 → 숨김.
              판례 카드의 관련 조문(사람이 읽는 참조)만 노출. */}
          {item.lawRef && item.sourceType !== "article" ? (
            <p className="text-muted-foreground mt-2 font-mono text-[11px]">
              관련 조문: {item.lawRef}
            </p>
          ) : null}
        </div>

        {/* 원본 조문/판례로 이동 — 안 떠오른 부분을 실시간 기록(포스트잇·하이라이트·즐겨찾기) */}
        {recordHref ? (
          <div className="mt-3 flex justify-center">
            <Link
              to={recordHref}
              className="border-border bg-card text-foreground hover:border-primary hover:text-link inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors"
            >
              <NotebookPenIcon className="size-3.5" />
              {sourceNoun}에서 기록하기
            </Link>
          </div>
        ) : null}

        {/* Back (flipped) */}
        {flipped ? (
          <div className="border-primary/30 bg-primary/5 mt-3 rounded-lg border p-5">
            <p className="text-link mb-2 font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
              뒷면 (정답)
            </p>
            <p className="text-foreground text-[15px] leading-relaxed whitespace-pre-line">
              {item.back}
            </p>
          </div>
        ) : null}

        {/* Action */}
        {!flipped ? (
          <div className="mt-4 flex justify-center">
            <Button type="button" size="lg" onClick={onFlip} className="gap-2">
              <EyeIcon className="size-4" />
              정답 보기
              <span className="text-primary-foreground/60 ml-1 font-mono text-[10px]">
                Space
              </span>
            </Button>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-muted-foreground mb-2 text-center font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
              얼마나 잘 떠올렸나요?
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {GRADES.map((g) => (
                <button
                  key={g.grade}
                  type="button"
                  onClick={() => onGrade(g.grade)}
                  disabled={submitting}
                  className={cn(
                    "h-12 rounded-lg text-sm font-bold transition-all disabled:opacity-50",
                    g.tone,
                  )}
                >
                  <span>{g.label}</span>
                  <span className="ml-1.5 font-mono text-[10px] opacity-70">
                    {g.shortcut}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Surface>
  );
}

function CompleteCard({ total }: { total: number }) {
  return (
    <Surface pad={0} tone="subtle" className="border-emerald-300/60">
      <div className="space-y-3 px-6 py-10 text-center">
        <CheckCircle2Icon className="mx-auto size-10 text-emerald-500" />
        <p className="text-foreground text-lg font-bold">오늘 암기 완료</p>
        <p className="text-muted-foreground text-sm">
          총 {total}건을 처리했습니다. 통계에서 결과를 확인해 보세요.
        </p>
        <div className="flex justify-center gap-2 pt-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/srs/stats">
              통계 보기 <ArrowRightIcon className="size-3.5" />
            </Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link to="/srs">
              <RotateCcwIcon className="size-3.5" /> 새로고침
            </Link>
          </Button>
        </div>
      </div>
    </Surface>
  );
}

function EmptyCard() {
  return (
    <Surface pad={0} tone="dashed">
      <div className="text-muted-foreground space-y-2 px-6 py-10 text-center text-sm">
        <SparklesIcon className="mx-auto size-8 opacity-30" />
        <p>오늘 외울 카드가 없습니다.</p>
        <p className="text-xs">
          내일 다시 들어오면 일정에 따라 새 카드와 복습 카드가 자동으로
          올라옵니다.
        </p>
      </div>
    </Surface>
  );
}
