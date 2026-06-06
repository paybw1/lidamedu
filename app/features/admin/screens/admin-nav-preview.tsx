// nav 리디자인 미리보기 — 정적 목업, 실 이동 X.
// 데스크톱 사이드바 + 모바일 하단탭 한 화면에서 비교 + active/펼침 시뮬레이션.
// 승인 후 실 라우팅 + 기존 드롭다운 제거 단계로 넘어감.

import {
  AlertTriangleIcon,
  BarChart3Icon,
  BookOpenIcon,
  CalendarCheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  HighlighterIcon,
  HomeIcon,
  MoreHorizontalIcon,
  NewspaperIcon,
  PenLineIcon,
  RotateCcwIcon,
  SettingsIcon,
  SmartphoneIcon,
  SparklesIcon,
  UsersIcon,
} from "lucide-react";
import { useState } from "react";
import { data } from "react-router";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-nav-preview";

export const meta: Route.MetaFunction = () => [
  { title: "nav 리디자인 미리보기 | Lidam Patent Attorney Academy" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });
  return { role };
}

// ── 데이터 (미리보기용 정적) ─────────────────────────────────────────────

type NavLink = { label: string; to: string; meta?: string };
type NavGroup = {
  // id 는 풀의 키 — NavGroupId 로 좁히는 곳은 호출처에서 keyof 로 추론.
  // 여기 직접 NavGroupId 쓰면 풀 정의와 순환 참조.
  id: string;
  label: string;
  Icon: typeof HomeIcon;
  items: NavLink[];
};

// 모든 nav 그룹 풀 — id 로 식별. 핵심·가끔은 "어느 위치에 놓을지" 의 문제이고,
// 그룹 자체 정의는 풀에 한 번만. 향후 사용자 커스터마이징 시 풀에서 자유 배치.
const NAV_GROUP_POOL = {
  today: {
    id: "today" as const,
    label: "오늘 할 일",
    Icon: CalendarCheckIcon,
    items: [{ label: "오늘 할 일", to: "/study/today" }],
  },
  review: {
    id: "review" as const,
    label: "복습",
    Icon: RotateCcwIcon,
    items: [
      { label: "복습", to: "/study/srs" },
      { label: "카드 암기", to: "/srs" },
    ],
  },
  subjects: {
    id: "subjects" as const,
    label: "학습과목",
    Icon: BookOpenIcon,
    items: [], // 특별 — SUBJECT_SECTIONS 로 별도 렌더
  },
  aids: {
    id: "aids" as const,
    label: "학습지원",
    Icon: HighlighterIcon,
    items: [
      { label: "오답노트", to: "/study/wrong-note" },
      { label: "하이라이트", to: "/study/highlights" },
      { label: "즐겨찾기", to: "/study/bookmarks" },
      { label: "포스트잇", to: "/study/notes" },
      { label: "메모", to: "/study/comments" },
      { label: "AI Q&A", to: "/ai" },
    ],
  },
  manage: {
    id: "manage" as const,
    label: "학습관리",
    Icon: BarChart3Icon,
    items: [
      { label: "학습 목표 · 진도", to: "/goals" },
      { label: "학습 통계", to: "/study/stats" },
      { label: "과제", to: "/assignments" },
      { label: "정오문제 응시 이력", to: "/me/ox-sessions" },
    ],
  },
  info: {
    id: "info" as const,
    label: "학습정보",
    Icon: NewspaperIcon,
    items: [
      { label: "법 개정", to: "/latest/laws" },
      { label: "최근 판례", to: "/latest/cases" },
      { label: "1차 기출문제", to: "/latest/mcq?kind=past_exam" },
      { label: "2차 기출문제", to: "/latest/essay" },
      { label: "논문", to: "/latest/papers" },
      { label: "추록·정오표", to: "/latest/book-updates" },
    ],
  },
  mock: {
    id: "mock" as const,
    label: "모의고사",
    Icon: PenLineIcon,
    items: [
      { label: "1차 모의고사", to: "/latest/mcq?kind=mock" },
      { label: "2차 모의고사 (온라인 GS)", to: "/gs" },
      { label: "응시 결과", to: "/me/exam-results" },
    ],
  },
  community: {
    id: "community" as const,
    label: "커뮤니티",
    Icon: UsersIcon,
    items: [
      { label: "공지사항", to: "/announcements" },
      { label: "자유게시판", to: "/community/free" },
      { label: "스터디 모집", to: "/community/study" },
      { label: "Q&A", to: "/qna" },
      { label: "합격 후기", to: "/community/review" },
    ],
  },
} satisfies Record<string, NavGroup>;

type NavGroupId = keyof typeof NAV_GROUP_POOL;

// 디폴트 핵심 4탭 — user preference 가 없을 때 fallback.
// (사용자 커스터마이징은 이번 범위 외 — 자리만 남겨둠.)
const DEFAULT_CORE_TAB_IDS = [
  "today",
  "review",
  "subjects",
  "aids",
] as const satisfies ReadonlyArray<NavGroupId>;

/**
 * 핵심 탭 id 반환.
 *
 * FUTURE: user preference 로 교체 가능.
 *   - loader/hook 에서 user_nav_prefs 같은 row 조회
 *   - 결과 없으면 DEFAULT_CORE_TAB_IDS 반환
 *   - 결과의 id 들이 NAV_GROUP_POOL 에 존재하는지 검증 후 반환
 * 지금은 default 고정 — 동작은 하드코딩과 동일.
 */
function getCoreTabIds(): ReadonlyArray<NavGroupId> {
  return DEFAULT_CORE_TAB_IDS;
}

/**
 * { core, secondary } 분리 — 풀에서 핵심 빼면 나머지가 가끔.
 * 사이드바·하단탭은 이 함수만 호출해서 렌더.
 */
function useNavLayout(): { core: NavGroup[]; secondary: NavGroup[] } {
  const coreIds = getCoreTabIds();
  const coreSet = new Set<NavGroupId>(coreIds);
  const core = coreIds.map((id) => NAV_GROUP_POOL[id]);
  const secondary = (Object.keys(NAV_GROUP_POOL) as NavGroupId[])
    .filter((id) => !coreSet.has(id))
    .map((id) => NAV_GROUP_POOL[id]);
  return { core, secondary };
}

// 학습과목 — 1차/2차 2섹션.
const SUBJECT_SECTIONS = [
  {
    label: "1차 · 객관식",
    rows: [
      {
        group: "산업재산권법",
        items: [
          { label: "특허법", to: "/subjects/patent" },
          { label: "상표법", to: "/subjects/trademark" },
          { label: "디자인보호법", to: "/subjects/design" },
        ],
      },
      { group: "민법", items: [{ label: "민법", to: "/subjects/civil" }] },
      {
        group: "자연과학",
        items: [
          { label: "물리", to: "/subjects/science/physics" },
          { label: "화학", to: "/subjects/science/chemistry" },
          { label: "생물", to: "/subjects/science/biology" },
          { label: "지구과학", to: "/subjects/science/earth-science" },
        ],
      },
    ],
  },
  {
    label: "2차 · 주관식",
    rows: [
      {
        group: "산업재산권법",
        items: [
          { label: "특허법", to: "/subjects/patent" },
          { label: "상표법", to: "/subjects/trademark" },
          { label: "디자인보호법", to: "/subjects/design" },
        ],
      },
      {
        group: "민사소송법",
        items: [{ label: "민사소송법", to: "/subjects/civil-procedure" }],
      },
    ],
  },
];

const FLAT_HOME = { label: "대시보드", to: "/dashboard", Icon: HomeIcon };
const FLAT_ADMIN = { label: "운영관리", to: "/admin", Icon: SettingsIcon };

// active 시뮬용 — 현재 경로 가정.
const SIMULATED_ACTIVE_PATH = "/study/today";

// ── 컴포넌트 ──────────────────────────────────────────────────────────────

type PreviewMode =
  | "a-expanded" // A안 — 사이드바 펼침 (기본)
  | "a-icon" // A안 — 사이드바 아이콘만
  | "a-hidden" // A안 — 사이드바 완전 숨김
  | "b-topbar" // B안 — 상단 가로바
  | "mobile"; // 모바일 하단탭

export default function AdminNavPreview({ loaderData }: Route.ComponentProps) {
  const { role } = loaderData;
  const [mode, setMode] = useState<PreviewMode>("a-expanded");
  const isStaff = role === "admin" || role === "instructor";

  return (
    <AdminShell cluster="cases" title="nav 리디자인 미리보기 (정적)">
      {/* 안내 */}
      <div className="border-amber-300/40 bg-amber-50/40 dark:border-amber-700/40 dark:bg-amber-950/30 mb-4 flex items-start gap-2 rounded-xl border p-3">
        <AlertTriangleIcon className="text-amber-600 dark:text-amber-400 mt-0.5 size-4 shrink-0" />
        <div className="text-xs leading-relaxed">
          <p className="font-semibold">정적 미리보기 — 실 이동 X</p>
          <p className="text-muted-foreground mt-1">
            모든 항목은 <code>href="#"</code> 더미. 모양·구성·active·펼침 확인용.
            승인 시 §2 데스크톱 사이드바 → §3 모바일 하단탭 → §4 기존 드롭다운 제거 순으로 실배선.
          </p>
        </div>
      </div>

      {/* 토글 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold">데스크톱:</p>
        <ModeButton mode={mode} target="a-expanded" set={setMode}>
          A안 — 사이드바 펼침
        </ModeButton>
        <ModeButton mode={mode} target="a-icon" set={setMode}>
          A안 — 아이콘만
        </ModeButton>
        <ModeButton mode={mode} target="a-hidden" set={setMode}>
          A안 — 숨김
        </ModeButton>
        <ModeButton mode={mode} target="b-topbar" set={setMode}>
          B안 — 상단 가로바
        </ModeButton>
        <span className="mx-2 h-4 w-px bg-border" />
        <ModeButton mode={mode} target="mobile" set={setMode}>
          <SmartphoneIcon className="mr-1 size-3 inline" /> 모바일
        </ModeButton>
        <span className="text-muted-foreground ml-2 text-xs">
          현재 경로: <code>{SIMULATED_ACTIVE_PATH}</code>
        </span>
      </div>

      {/* 미리보기 */}
      {mode === "mobile" ? (
        <MobilePreview isStaff={isStaff} />
      ) : mode === "b-topbar" ? (
        <TopBarPreview isStaff={isStaff} />
      ) : (
        <SidebarPreview isStaff={isStaff} variant={mode} />
      )}

      {/* 그룹 분류 의도 */}
      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <IntentCard
          title="핵심 (매일)"
          rows={["오늘 할 일", "복습", "학습과목", "학습지원"]}
          tone="emerald"
        />
        <IntentCard
          title="가끔 (주 1~2회)"
          rows={["학습관리", "학습정보", "모의고사", "커뮤니티"]}
          tone="amber"
        />
        <IntentCard
          title="Flat (특별)"
          rows={["대시보드 (홈)", "운영관리 (staff)"]}
          tone="default"
        />
      </section>
    </AdminShell>
  );
}

function ModeButton({
  mode,
  target,
  set,
  children,
}: {
  mode: PreviewMode;
  target: PreviewMode;
  set: (m: PreviewMode) => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      size="sm"
      variant={mode === target ? "default" : "outline"}
      onClick={() => set(target)}
      className="h-7 text-xs"
    >
      {children}
    </Button>
  );
}

function IntentCard({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: string[];
  tone: "emerald" | "amber" | "default";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-300/40 bg-emerald-50/40 dark:border-emerald-700/40 dark:bg-emerald-950/30"
      : tone === "amber"
        ? "border-amber-300/40 bg-amber-50/40 dark:border-amber-700/40 dark:bg-amber-950/30"
        : "border-border bg-card";
  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <p className="text-xs font-semibold">{title}</p>
      <ul className="text-muted-foreground mt-1 space-y-0.5 text-xs">
        {rows.map((r) => (
          <li key={r}>• {r}</li>
        ))}
      </ul>
    </div>
  );
}

// ── 학습과목 더미 본문 ────────────────────────────────────────────────────
// 두 안 모두 같은 본문 위에 깔아 본문 폭 차이를 체감.

function SubjectViewerMock() {
  return (
    <div className="flex h-full overflow-hidden">
      {/* 좌측 조문 트리 */}
      <div className="w-[180px] shrink-0 overflow-y-auto border-r border-border bg-muted/10 p-3">
        <p className="text-muted-foreground mb-2 text-[10px] font-bold tracking-widest uppercase">
          특허법
        </p>
        <ul className="space-y-0.5 text-xs">
          {[
            "제1장 총칙",
            "  제1조 목적",
            "  제2조 정의",
            "제2장 특허요건",
            "  제29조 ★ 특허요건",
            "  제30조 공지예외",
            "  제33조 출원인",
            "제3장 출원",
            "  제42조 명세서",
            "  제45조 단일성",
            "제4장 심사",
            "  제62조 거절결정",
          ].map((s) => (
            <li
              key={s}
              className={cn(
                "rounded px-1.5 py-0.5",
                s.includes("제29조")
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-muted-foreground hover:bg-muted/50",
              )}
            >
              {s}
            </li>
          ))}
        </ul>
      </div>

      {/* 중앙 본문 — flex-1 — 사이드바/가로바 영향에 따라 폭 가변 */}
      <div className="flex-1 overflow-y-auto p-6">
        <p className="text-muted-foreground text-[11px] tracking-widest uppercase">
          특허법
        </p>
        <h2 className="mt-1 text-xl font-bold">제29조 특허요건</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          1973.2.8 제정 · 최근 개정 2024.4.21
        </p>
        <div className="prose dark:prose-invert mt-4 max-w-none text-sm leading-relaxed">
          <p>
            ① 산업상 이용할 수 있는 발명으로서 다음 각 호의 어느 하나에 해당하는
            것을 제외하고는 그 발명에 대하여 특허를 받을 수 있다.
          </p>
          <p className="ml-4">
            1. 특허출원 전에 국내 또는 국외에서 공공연히 알려진 발명
            <br />
            2. 특허출원 전에 국내 또는 국외에서 공공연히 실시된 발명
            <br />
            3. 특허출원 전에 국내 또는 국외에서 반포된 간행물에 게재된 발명
            또는 전기통신회선을 통하여 공중이 이용할 수 있는 발명
          </p>
          <p>
            ② 특허출원 전에 그 발명이 속하는 기술분야에서 통상의 지식을 가진
            사람이 제1항 각 호의 어느 하나에 해당하는 발명에 의하여 쉽게 발명할
            수 있는 것일 때에는 그 발명에 대해서는 제1항에도 불구하고 특허를
            받을 수 없다.
          </p>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="border-border h-20 rounded-xl border bg-muted/20 flex items-center justify-center text-[10px] text-muted-foreground"
            >
              관련 판례 / 기출 / 메모 카드 (더미)
            </div>
          ))}
        </div>
      </div>

      {/* 우측 학습 패널 */}
      <div className="w-[240px] shrink-0 overflow-y-auto border-l border-border bg-muted/10 p-3">
        <p className="text-muted-foreground mb-2 text-[10px] font-bold tracking-widest uppercase">
          학습 패널
        </p>
        <div className="space-y-2 text-xs">
          <button className="border-border w-full rounded-lg border bg-card px-2 py-1.5 text-left hover:bg-muted">
            ⭐ 즐겨찾기
          </button>
          <button className="border-border w-full rounded-lg border bg-card px-2 py-1.5 text-left hover:bg-muted">
            📝 포스트잇
          </button>
          <button className="border-border w-full rounded-lg border bg-card px-2 py-1.5 text-left hover:bg-muted">
            🤖 AI Q&A
          </button>
          <div className="border-border mt-3 rounded-lg border bg-card p-2">
            <p className="text-[10px] font-semibold">하이라이트</p>
            <p className="text-muted-foreground mt-0.5 text-[10px]">
              본문에서 텍스트 선택 시 활성
            </p>
          </div>
          <div className="border-border rounded-lg border bg-card p-2">
            <p className="text-[10px] font-semibold">관련 판례 (3)</p>
            <ul className="text-muted-foreground mt-0.5 text-[10px]">
              <li>2012후726</li>
              <li>2023후11340</li>
              <li>...</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 데스크톱 사이드바 (A안 — 3 변형) ──────────────────────────────────────

type SidebarVariant = "a-expanded" | "a-icon" | "a-hidden";

function SidebarPreview({
  isStaff,
  variant,
}: {
  isStaff: boolean;
  variant: SidebarVariant;
}) {
  return (
    <div className="border-border overflow-hidden rounded-2xl border bg-muted/20">
      {/* 가짜 브라우저 헤더 */}
      <div className="border-border bg-muted/40 flex items-center gap-1.5 border-b px-3 py-2">
        <span className="size-2.5 rounded-full bg-rose-400" />
        <span className="size-2.5 rounded-full bg-amber-400" />
        <span className="size-2.5 rounded-full bg-emerald-400" />
        <span className="text-muted-foreground ml-2 font-mono text-[10px]">
          lidamipedu.com/subjects/patent/articles/29
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {variant === "a-expanded" && "사이드바 폭 260px"}
          {variant === "a-icon" && "사이드바 폭 60px (아이콘만)"}
          {variant === "a-hidden" && "사이드바 폭 0 (숨김)"}
        </span>
      </div>
      {/* 사이드바 + 본문 */}
      <div className="flex h-[640px]">
        {variant !== "a-hidden" ? (
          <SidebarA variant={variant} isStaff={isStaff} />
        ) : null}
        <main className="flex-1 overflow-hidden">
          <SubjectViewerMock />
        </main>
      </div>
    </div>
  );
}

function SidebarA({
  variant,
  isStaff,
}: {
  variant: Exclude<SidebarVariant, "a-hidden">;
  isStaff: boolean;
}) {
  const { core, secondary } = useNavLayout();
  const isIcon = variant === "a-icon";
  const [open, setOpen] = useState<Set<string>>(() =>
    isIcon ? new Set() : new Set(["subjects", "aids"]),
  );
  const toggle = (id: string) => {
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  return (
    <aside
      className={cn(
        "shrink-0 overflow-y-auto border-r border-border bg-card",
        isIcon ? "w-[60px] p-2" : "w-[260px] p-3",
      )}
    >
      {!isIcon && <SidebarSection label="핵심" />}
      {isIcon ? (
        <IconRow
          Icon={FLAT_HOME.Icon}
          label={FLAT_HOME.label}
          active={FLAT_HOME.to === SIMULATED_ACTIVE_PATH}
        />
      ) : (
        <SidebarFlat
          Icon={FLAT_HOME.Icon}
          label={FLAT_HOME.label}
          to={FLAT_HOME.to}
        />
      )}
      {core.map((g) => {
        const hasActive = g.items.some((i) => i.to === SIMULATED_ACTIVE_PATH);
        if (isIcon) {
          return (
            <IconRow
              key={g.id}
              Icon={g.Icon}
              label={g.label}
              active={hasActive}
            />
          );
        }
        if (g.id === "subjects") {
          return (
            <SidebarSubjects
              key={g.id}
              open={open.has("subjects")}
              onToggle={() => toggle("subjects")}
            />
          );
        }
        if (g.items.length === 1) {
          return (
            <SidebarFlat
              key={g.id}
              Icon={g.Icon}
              label={g.label}
              to={g.items[0].to}
            />
          );
        }
        return (
          <SidebarGroup
            key={g.id}
            group={g}
            open={open.has(g.id)}
            onToggle={() => toggle(g.id)}
          />
        );
      })}

      {!isIcon && <SidebarSection label="가끔" />}
      {secondary.map((g) => {
        const hasActive = g.items.some((i) => i.to === SIMULATED_ACTIVE_PATH);
        if (isIcon) {
          return (
            <IconRow
              key={g.id}
              Icon={g.Icon}
              label={g.label}
              active={hasActive}
            />
          );
        }
        return (
          <SidebarGroup
            key={g.id}
            group={g}
            open={open.has(g.id)}
            onToggle={() => toggle(g.id)}
          />
        );
      })}

      {isStaff ? (
        <>
          {!isIcon && <SidebarSection label="관리" />}
          {isIcon ? (
            <IconRow
              Icon={FLAT_ADMIN.Icon}
              label={FLAT_ADMIN.label}
              active={false}
            />
          ) : (
            <SidebarFlat
              Icon={FLAT_ADMIN.Icon}
              label={FLAT_ADMIN.label}
              to={FLAT_ADMIN.to}
            />
          )}
        </>
      ) : null}
    </aside>
  );
}

function IconRow({
  Icon,
  label,
  active,
}: {
  Icon: typeof HomeIcon;
  label: string;
  active: boolean;
}) {
  return (
    <div
      title={label}
      className={cn(
        "my-0.5 flex h-9 cursor-pointer items-center justify-center rounded-lg hover:bg-muted",
        active && "bg-primary/10 text-primary",
      )}
    >
      <Icon className="size-5" />
    </div>
  );
}

// ── B안 상단 가로바 ────────────────────────────────────────────────────────

function TopBarPreview({ isStaff }: { isStaff: boolean }) {
  const { core, secondary } = useNavLayout();
  return (
    <div className="border-border overflow-hidden rounded-2xl border bg-muted/20">
      {/* 가짜 브라우저 헤더 */}
      <div className="border-border bg-muted/40 flex items-center gap-1.5 border-b px-3 py-2">
        <span className="size-2.5 rounded-full bg-rose-400" />
        <span className="size-2.5 rounded-full bg-amber-400" />
        <span className="size-2.5 rounded-full bg-emerald-400" />
        <span className="text-muted-foreground ml-2 font-mono text-[10px]">
          lidamipedu.com/subjects/patent/articles/29
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          상단 가로바 56px + 본문 100% 폭
        </span>
      </div>
      {/* 상단 가로바 */}
      <div className="border-border flex items-center gap-1 border-b bg-card px-3 py-1.5">
        <div className="border-border mr-3 border-r pr-3 text-sm font-bold">
          리담
        </div>
        <TopBarFlat
          Icon={FLAT_HOME.Icon}
          label={FLAT_HOME.label}
          to={FLAT_HOME.to}
        />
        <span className="mx-1 h-4 w-px bg-border" />
        {core.map((g) => (
          <TopBarItem key={g.id} group={g} />
        ))}
        <TopBarMore secondary={secondary} />
        {isStaff ? (
          <>
            <span className="mx-1 h-4 w-px bg-border" />
            <TopBarFlat
              Icon={FLAT_ADMIN.Icon}
              label={FLAT_ADMIN.label}
              to={FLAT_ADMIN.to}
            />
          </>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <button className="bg-muted size-7 rounded-full text-[10px]">
            🔔
          </button>
          <div className="bg-primary/20 size-7 rounded-full" />
        </div>
      </div>
      {/* 본문 — full width */}
      <div className="h-[580px] overflow-hidden">
        <SubjectViewerMock />
      </div>
    </div>
  );
}

function TopBarFlat({
  Icon,
  label,
  to,
}: {
  Icon: typeof HomeIcon;
  label: string;
  to: string;
}) {
  const active = to === SIMULATED_ACTIVE_PATH;
  return (
    <button
      className={cn(
        "flex items-center gap-1 rounded-md px-2 py-1.5 text-xs hover:bg-muted",
        active && "bg-primary/10 text-primary font-semibold",
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

function TopBarItem({ group }: { group: NavGroup }) {
  const Icon = group.Icon;
  const hasActive = group.items.some((i) => i.to === SIMULATED_ACTIVE_PATH);
  return (
    <button
      className={cn(
        "flex items-center gap-1 rounded-md px-2 py-1.5 text-xs hover:bg-muted",
        hasActive && "bg-primary/10 text-primary font-semibold",
      )}
    >
      <Icon className="size-3.5" />
      {group.label}
      <ChevronDownIcon className="size-3" />
    </button>
  );
}

function TopBarMore({ secondary }: { secondary: NavGroup[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
      >
        <MoreHorizontalIcon className="size-3.5" />
        더보기
        <ChevronDownIcon className="size-3" />
      </button>
      {open ? (
        <div className="border-border bg-card absolute top-full left-0 z-10 mt-1 w-[260px] rounded-xl border p-2 shadow-lg">
          {secondary.map((g) => (
            <div key={g.id} className="mb-2">
              <p className="text-muted-foreground px-1 text-[10px] font-semibold">
                {g.label}
              </p>
              <div className="flex flex-col gap-0.5 pl-1">
                {g.items.map((it) => (
                  <a
                    key={it.to}
                    href="#"
                    className="text-muted-foreground hover:bg-muted hover:text-foreground rounded px-1.5 py-1 text-xs"
                  >
                    {it.label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SidebarSection({ label }: { label: string }) {
  return (
    <p className="text-muted-foreground mt-3 mb-1 px-2 text-[10px] font-bold tracking-widest uppercase">
      {label}
    </p>
  );
}

function SidebarFlat({
  Icon,
  label,
  to,
}: {
  Icon: typeof HomeIcon;
  label: string;
  to: string;
}) {
  const active = to === SIMULATED_ACTIVE_PATH;
  return (
    <a
      href="#"
      className={cn(
        "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm",
        active
          ? "bg-primary/10 text-primary font-semibold"
          : "text-foreground/80 hover:bg-muted",
      )}
    >
      <Icon className="size-4" />
      {label}
    </a>
  );
}

function SidebarGroup({
  group,
  open,
  onToggle,
}: {
  group: NavGroup;
  open: boolean;
  onToggle: () => void;
}) {
  const Icon = group.Icon;
  const hasActive = group.items.some((i) => i.to === SIMULATED_ACTIVE_PATH);
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted",
          hasActive ? "text-primary font-semibold" : "text-foreground/80",
        )}
      >
        <Icon className="size-4" />
        <span className="flex-1 text-left">{group.label}</span>
        {open ? (
          <ChevronDownIcon className="size-3" />
        ) : (
          <ChevronRightIcon className="size-3" />
        )}
      </button>
      {open ? (
        <div className="ml-6 flex flex-col gap-0.5 border-l border-border pl-2 py-1">
          {group.items.map((it) => {
            const active = it.to === SIMULATED_ACTIVE_PATH;
            return (
              <a
                key={it.to}
                href="#"
                className={cn(
                  "rounded-md px-2 py-1 text-xs",
                  active
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {it.label}
              </a>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function SidebarSubjects({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"
      >
        <BookOpenIcon className="size-4" />
        <span className="flex-1 text-left">학습과목</span>
        {open ? (
          <ChevronDownIcon className="size-3" />
        ) : (
          <ChevronRightIcon className="size-3" />
        )}
      </button>
      {open ? (
        <div className="ml-6 mt-1 border-l border-border pl-2">
          {SUBJECT_SECTIONS.map((section) => (
            <div key={section.label} className="mb-2">
              <p className="text-primary mt-1 mb-1 px-1 text-[9px] font-bold tracking-widest uppercase">
                {section.label}
              </p>
              {section.rows.map((row) => (
                <div key={row.group} className="mb-1">
                  <p className="text-muted-foreground px-1 text-[10px] font-semibold">
                    {row.group}
                  </p>
                  <div className="flex flex-wrap gap-1 px-1 py-0.5">
                    {row.items.map((it) => (
                      <a
                        key={`${section.label}-${row.group}-${it.label}`}
                        href="#"
                        className="border-border bg-muted/30 hover:border-primary hover:text-primary rounded-md border px-1.5 py-0.5 text-[10px]"
                      >
                        {it.label}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── 모바일 하단탭 + 더보기 시트 ────────────────────────────────────────────

// 모바일 탭은 라벨이 짧음 — 핵심 그룹 label 의 모바일 단축 매핑.
// 사용자 정의 그룹도 매핑 없으면 group.label 폴백.
const MOBILE_TAB_LABELS: Partial<Record<NavGroupId, string>> = {
  today: "오늘",
  review: "복습",
  subjects: "과목",
  aids: "지원",
  manage: "관리",
  info: "정보",
  mock: "모의",
  community: "커뮤니티",
};

function MobilePreview({ isStaff }: { isStaff: boolean }) {
  const { core, secondary } = useNavLayout();
  const [moreOpen, setMoreOpen] = useState(false);
  // activeTab — 핵심 그룹 id 또는 "more". 풀에서 동적이라 string 유지.
  const [activeTab, setActiveTab] = useState<string>(core[0]?.id ?? "today");
  // 모바일 하단탭 = 핵심 N + "더보기" 1. iOS/Android 권장 5탭이라 core 4 기준.
  const TABS = [
    ...core.map((g) => ({
      id: g.id,
      label: MOBILE_TAB_LABELS[g.id as NavGroupId] ?? g.label,
      Icon: g.Icon,
    })),
    { id: "more", label: "더보기", Icon: MoreHorizontalIcon },
  ];
  return (
    <div className="flex flex-wrap items-start gap-6">
      {/* 모바일 frame */}
      <div className="border-border relative h-[720px] w-[360px] overflow-hidden rounded-[2rem] border-4 bg-card shadow-lg">
        {/* status bar */}
        <div className="bg-muted/40 flex items-center justify-between border-b border-border px-4 py-2 text-[10px]">
          <span className="font-mono">9:41</span>
          <span>•••</span>
        </div>
        {/* content */}
        <div className="flex h-[calc(100%-90px)] flex-col overflow-y-auto p-4">
          <h2 className="text-base font-bold">
            {activeTab === "more"
              ? "더보기"
              : TABS.find((t) => t.id === activeTab)?.label}
          </h2>
          {activeTab === "more" ? (
            <div className="mt-3 space-y-3">
              {secondary.map((g) => (
                <div key={g.id}>
                  <p className="text-muted-foreground text-[10px] font-semibold">
                    {g.label}
                  </p>
                  <div className="mt-1 flex flex-col gap-0.5">
                    {g.items.map((it) => (
                      <a
                        key={`m-more-${it.to}`}
                        href="#"
                        className="rounded-md px-2 py-1.5 text-xs hover:bg-muted"
                      >
                        {it.label}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
              <div>
                <p className="text-muted-foreground text-[10px] font-semibold">
                  Flat
                </p>
                <a
                  href="#"
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
                >
                  <HomeIcon className="size-3" /> 대시보드
                </a>
                {isStaff ? (
                  <a
                    href="#"
                    className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
                  >
                    <SettingsIcon className="size-3" /> 운영관리
                  </a>
                ) : null}
              </div>
            </div>
          ) : activeTab === "subjects" ? (
            <div className="mt-3 space-y-3">
              {SUBJECT_SECTIONS.map((s) => (
                <div key={s.label}>
                  <p className="text-primary mb-1 text-[10px] font-bold tracking-widest uppercase">
                    {s.label}
                  </p>
                  {s.rows.map((row) => (
                    <div key={row.group} className="mb-1.5">
                      <p className="text-muted-foreground text-[10px] font-semibold">
                        {row.group}
                      </p>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {row.items.map((it) => (
                          <a
                            key={`m-${s.label}-${row.group}-${it.label}`}
                            href="#"
                            className="border-border bg-muted/30 rounded-md border px-2 py-1 text-[10px]"
                          >
                            {it.label}
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : activeTab === "today" ? (
            <>
              <p className="text-muted-foreground mt-1 text-xs">
                오늘 할 일 (current)
              </p>
              <div className="mt-3 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="border-border h-12 rounded-xl border bg-muted/30"
                  />
                ))}
              </div>
            </>
          ) : (
            // 그 외 핵심 그룹 — 일반 리스트 렌더 (items 가 있는 그룹).
            <div className="mt-3 flex flex-col gap-0.5">
              {core
                .find((g) => g.id === activeTab)
                ?.items.map((it) => (
                  <a
                    key={`m-${activeTab}-${it.to}`}
                    href="#"
                    className="rounded-md px-2 py-1.5 text-xs hover:bg-muted"
                  >
                    {it.label}
                  </a>
                ))}
            </div>
          )}
        </div>
        {/* 하단탭 */}
        <nav className="absolute bottom-0 left-0 right-0 border-t border-border bg-card">
          <div className="grid grid-cols-5">
            {TABS.map((t) => {
              const Icon = t.Icon;
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(t.id);
                    if (t.id === "more") setMoreOpen(true);
                  }}
                  className={cn(
                    "flex flex-col items-center gap-0.5 py-2 text-[10px]",
                    active
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-5" />
                  {t.label}
                </button>
              );
            })}
          </div>
          <div className="h-1.5" /> {/* iOS home indicator 자리 */}
        </nav>
      </div>

      {/* 설명 */}
      <div className="max-w-sm space-y-3 text-sm">
        <div>
          <p className="font-semibold">5탭 구조</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            오늘 · 복습 · 과목 · 지원 (핵심 4) + 더보기 1 = 5. iOS/Android 권장 최대.
          </p>
        </div>
        <div>
          <p className="font-semibold">더보기 시트</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            가끔 그룹(학습관리·학습정보·모의고사·커뮤니티) + Flat (대시보드·운영관리) 한 화면에 묶음.
          </p>
        </div>
        <div>
          <p className="font-semibold">과목 진입 — 2섹션</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            과목 탭 클릭 시 1차/2차 두 섹션이 칩 그리드로 즉시 펼침 (드릴다운 없음).
          </p>
        </div>
        <div>
          <p className="font-semibold">반응형 분기</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            <code>md(768px)</code> 이상: 사이드바 / 미만: 하단탭. 중간 폭(768~1024)도 사이드바 유지(접힘 가능).
          </p>
        </div>
        <div>
          <p className="font-semibold">터치 타깃</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            하단탭 높이 48~56px, 아이콘 20px, 라벨 10~11px. iOS 안전영역(home indicator) 1.5px 여백.
          </p>
        </div>
      </div>
    </div>
  );
}
