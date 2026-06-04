// 운영자 영역 공통 셸 — 9클러스터 사이드바 + breadcrumb + 페이지 헤더.
// 키트 lidam-admin/Shell.jsx 디자인. brief §5.2.
// 모든 /admin/* 화면은 <AdminShell>로 감싸 일관된 네비게이션을 얻는다.

import {
  AwardIcon,
  BellIcon,
  ChevronDownIcon,
  GavelIcon,
  GraduationCapIcon,
  LayoutDashboardIcon,
  Link2Icon,
  ListChecksIcon,
  type LucideIcon,
  PanelLeftIcon,
  PencilLineIcon,
  ScaleIcon,
  TrendingUpIcon,
  UsersIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router";

import { cn } from "~/core/lib/utils";
import { ROLE_LABEL, type UserRole } from "~/core/lib/roles";

export type AdminClusterId =
  | "hub"
  | "laws"
  | "cases"
  | "problems"
  | "blanks"
  | "relations"
  | "students"
  | "cohorts"
  | "gs"
  | "analytics"
  | "comms";

interface NavScreen {
  label: string;
  to: string;
}

interface NavCluster {
  id: AdminClusterId;
  label: string;
  Icon: LucideIcon;
  screens: NavScreen[];
}

// 9 클러스터 — 사이드바에는 안정적(비-파라미터) 라우트만 노출.
// 상세·편집 화면(:id 파라미터)은 드릴다운으로 진입하며 breadcrumb 으로 위치를 표시.
export const ADMIN_NAV: NavCluster[] = [
  {
    id: "hub",
    label: "운영관리 허브",
    Icon: LayoutDashboardIcon,
    screens: [{ label: "허브", to: "/admin" }],
  },
  {
    id: "laws",
    label: "법령·개정",
    Icon: GavelIcon,
    screens: [
      { label: "법령 허브", to: "/admin/laws" },
      { label: "콘텐츠 완성도", to: "/admin/laws/health" },
      { label: "단원 체계도", to: "/admin/systematic-tree" },
      { label: "데이터 가져오기 점검", to: "/admin/seeds/preview" },
    ],
  },
  {
    id: "cases",
    label: "판례",
    Icon: ScaleIcon,
    screens: [
      { label: "판례·조문 매칭", to: "/admin/cases" },
      { label: "판례·기출 매칭", to: "/admin/relations/exam-cases" },
      { label: "판례 등록", to: "/admin/cases/edit" },
      { label: "전문 PDF 미적재", to: "/admin/cases/pdf-missing" },
      { label: "판례 쟁점훈련 출제", to: "/admin/case-training" },
      { label: "체계도 배치 점검", to: "/admin/cases/violations" },
      { label: "고아 하이라이트 점검", to: "/admin/cases/orphan-highlights" },
      { label: "강의노트 사례연구 검토", to: "/admin/case-study-review" },
    ],
  },
  {
    id: "problems",
    label: "객관식 문제 · OX",
    Icon: ListChecksIcon,
    screens: [
      // 출제 흐름 순서대로 — AI 초안 → 강사 검토 → 직접 출제/목록 → 팩 → 통합 시험.
      { label: "AI 문제 초안 만들기", to: "/admin/problems/ai-gen" },
      { label: "검토 대기 문제", to: "/admin/problems/review" },
      { label: "문제 직접 만들기", to: "/admin/problems/new" },
      { label: "전체 문제 보기", to: "/admin/problems" },
      { label: "OX 검수", to: "/admin/problems/ox" },
      { label: "정답률·통계", to: "/admin/problems/stats" },
      // 학생용 라우트(/latest/mcq) — staff 진입 시 picker 노출.
      // ?kind=mock 은 가상 통합 필터 (mock_full + mock_progressive) — 한 화면.
      { label: "모의고사 팩 관리", to: "/latest/mcq?kind=mock" },
      { label: "통합 모의고사 (3교시)", to: "/admin/mcq-exams" },
    ],
  },
  {
    id: "blanks",
    label: "빈칸 자료",
    Icon: PencilLineIcon,
    screens: [
      { label: "빈칸 자료 세트", to: "/admin/blanks" },
      { label: "빈칸 정답률", to: "/admin/blanks/stats" },
    ],
  },
  {
    id: "relations",
    label: "연관관계",
    Icon: Link2Icon,
    screens: [
      { label: "연결 누락 점검", to: "/admin/relations/gaps" },
      { label: "연결 일괄 등록", to: "/admin/relations/bulk" },
    ],
  },
  {
    // 수강생 — 학생 중심 (사용자/위험군/수강권). 반·강의(cohorts) 와 분리.
    id: "students",
    label: "수강생",
    Icon: UsersIcon,
    screens: [
      { label: "수강생 목록", to: "/admin/users" },
      { label: "위험 수강생 (7일 무접속)", to: "/admin/cohorts/at-risk" },
      // feat-7-014 — manager+ 전용. 메뉴는 노출, loader 에서 차단.
      { label: "수강권 관리", to: "/admin/subscriptions" },
    ],
  },
  {
    // 반·강의 — 반 단위 + 커리큘럼. 수강생(students) 와 분리.
    id: "cohorts",
    label: "반·강의",
    Icon: GraduationCapIcon,
    screens: [
      { label: "반 목록", to: "/admin/cohorts" },
      { label: "커리큘럼 관리", to: "/admin/curricula" },
    ],
  },
  {
    id: "gs",
    label: "주관식 문제",
    Icon: AwardIcon,
    screens: [
      { label: "주관식 회차", to: "/admin/gs" },
      { label: "주관식 시리즈", to: "/admin/gs/series" },
      { label: "포인트 관리", to: "/admin/gs/points" },
      // §3 GS 비용 가드 — 운영자 가시성.
      { label: "AI·OCR 사용량", to: "/admin/gs/usage" },
    ],
  },
  {
    id: "analytics",
    label: "합격자 분석",
    Icon: TrendingUpIcon,
    screens: [
      { label: "합격 결과", to: "/admin/exam-results" },
      { label: "합격자 사례", to: "/admin/analytics/passers" },
      { label: "합격 vs 불합격 패턴", to: "/admin/analytics/failure-patterns" },
    ],
  },
  {
    id: "comms",
    label: "공지·알림·감사",
    Icon: BellIcon,
    screens: [
      { label: "공지 발송", to: "/admin/announcements" },
      { label: "받은 알림함", to: "/admin/inbox" },
      { label: "감사 기록", to: "/admin/audit-logs" },
      { label: "커뮤니티 신고", to: "/admin/community/reports" },
      { label: "주관식 첨삭 대기", to: "/admin/subjective-reviews" },
      // feat-9-005 — AI Q&A 운영 (피드백 + 지표 + 평가 세트 + 월별 사용량 + 색인 상태).
      { label: "AI Q&A 부정 피드백", to: "/admin/ai-qna/feedback" },
      { label: "AI Q&A 지표", to: "/admin/ai-qna/metrics" },
      { label: "AI Q&A 평가 세트", to: "/admin/ai-qna/eval" },
      { label: "AI Q&A 월별 사용량", to: "/admin/ai-qna/usage" },
      { label: "AI Q&A 색인 상태", to: "/admin/ai-qna/embed-status" },
      // feat-9-006 — AI Q&A 운영 설정 (한도/토큰 캡).
      { label: "AI Q&A 한도 설정", to: "/admin/ai-qna/settings" },
    ],
  },
];

function clusterById(id: AdminClusterId): NavCluster {
  return ADMIN_NAV.find((c) => c.id === id) ?? ADMIN_NAV[0];
}

/* ── Sidebar ──────────────────────────────────────────────────────────── */

function ClusterGroup({
  cluster,
  activeCluster,
  pathname,
  collapsed,
}: {
  cluster: NavCluster;
  activeCluster: AdminClusterId;
  pathname: string;
  collapsed: boolean;
}) {
  const isActiveCluster = cluster.id === activeCluster;
  const [open, setOpen] = useState(isActiveCluster);
  const onlyOne = cluster.screens.length === 1;
  const { Icon } = cluster;

  if (collapsed) {
    return (
      <Link
        to={cluster.screens[0].to}
        title={cluster.label}
        className={cn(
          "mx-auto flex size-10 items-center justify-center rounded-lg transition-colors",
          isActiveCluster
            ? "bg-sidebar-primary/10 text-sidebar-primary"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/40",
        )}
      >
        <Icon className="size-[18px]" />
      </Link>
    );
  }

  return (
    <div>
      {onlyOne ? (
        <Link
          to={cluster.screens[0].to}
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors",
            isActiveCluster
              ? "bg-sidebar-primary/10 text-sidebar-primary font-bold"
              : "text-sidebar-foreground hover:bg-sidebar-accent/40 font-semibold",
          )}
        >
          <Icon className="size-4 shrink-0" />
          <span className="flex-1">{cluster.label}</span>
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
            isActiveCluster
              ? "text-sidebar-primary font-bold"
              : "text-sidebar-foreground hover:bg-sidebar-accent/40 font-semibold",
          )}
        >
          <Icon className="size-4 shrink-0" />
          <span className="flex-1">{cluster.label}</span>
          <ChevronDownIcon
            className={cn(
              "text-muted-foreground size-3 transition-transform",
              open ? "rotate-0" : "-rotate-90",
            )}
          />
        </button>
      )}
      {!onlyOne && open ? (
        <ul className="mt-0.5 flex flex-col gap-0.5 pl-[34px]">
          {cluster.screens.map((s) => {
            const isActive = pathname === s.to;
            return (
              <li key={s.to}>
                <Link
                  to={s.to}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative block rounded-md px-2.5 py-1.5 text-xs transition-colors",
                    isActive
                      ? "bg-sidebar-primary/10 text-sidebar-primary font-bold"
                      : "text-sidebar-foreground/75 hover:bg-sidebar-accent/40 font-medium",
                  )}
                >
                  {isActive ? (
                    <span
                      aria-hidden
                      className="bg-sidebar-primary absolute top-1.5 bottom-1.5 -left-3 w-[3px] rounded-full"
                    />
                  ) : null}
                  {s.label}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function AdminSidebar({
  activeCluster,
  pathname,
  role,
}: {
  activeCluster: AdminClusterId;
  pathname: string;
  role?: UserRole | null;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside
      className={cn(
        "bg-sidebar border-sidebar-border sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 flex-col overflow-hidden border-r py-[18px] transition-[width] md:flex",
        collapsed ? "w-16 px-2" : "w-[220px] px-2",
      )}
    >
      <div className="mb-3 flex items-center gap-2 px-2">
        <span className="bg-sidebar-primary text-sidebar-primary-foreground inline-flex size-[26px] shrink-0 items-center justify-center rounded-md text-[13px] font-extrabold">
          L
        </span>
        {!collapsed ? (
          <>
            <span className="text-sidebar-foreground flex-1 text-sm font-extrabold tracking-tight">
              운영관리
            </span>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="사이드바 접기"
              className="text-muted-foreground hover:text-foreground p-1"
            >
              <PanelLeftIcon className="size-3.5" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="사이드바 펴기"
            className="text-muted-foreground hover:text-foreground mx-auto p-1"
          >
            <PanelLeftIcon className="size-3.5" />
          </button>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {ADMIN_NAV.map((c) => (
          <ClusterGroup
            key={c.id}
            cluster={c}
            activeCluster={activeCluster}
            pathname={pathname}
            collapsed={collapsed}
          />
        ))}
      </nav>

      {!collapsed && role ? (
        <div className="border-sidebar-border mt-3 border-t px-2.5 pt-3">
          <span
            className={cn(
              "inline-flex h-[22px] items-center rounded-full px-2 text-[11px] font-semibold",
              role === "admin"
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : role === "manager"
                  ? "bg-sidebar-primary/15 text-sidebar-primary"
                  : "border-sidebar-primary/40 text-sidebar-primary border",
            )}
          >
            {ROLE_LABEL[role]}
          </span>
        </div>
      ) : null}
    </aside>
  );
}

/* ── Breadcrumb + PageHeader ──────────────────────────────────────────── */

function AdminBreadcrumb({
  cluster,
  title,
}: {
  cluster: NavCluster;
  title: ReactNode;
}) {
  return (
    <div className="border-border bg-background/90 sticky top-14 z-10 flex items-center gap-1.5 border-b px-5 py-2.5 text-xs backdrop-blur md:px-8">
      <Link to="/admin" className="text-muted-foreground hover:text-foreground">
        운영관리
      </Link>
      <ChevronRightSep />
      {cluster.id === "hub" ? (
        <span className="text-foreground font-semibold">허브</span>
      ) : (
        <>
          <span className="text-muted-foreground">{cluster.label}</span>
          <ChevronRightSep />
          <span className="text-foreground truncate font-semibold">
            {title}
          </span>
        </>
      )}
    </div>
  );
}

function ChevronRightSep() {
  return (
    <span aria-hidden className="text-muted-foreground/50">
      ›
    </span>
  );
}

function AdminPageHeader({
  cluster,
  title,
  desc,
  headerRight,
}: {
  cluster: NavCluster;
  title: ReactNode;
  desc?: ReactNode;
  headerRight?: ReactNode;
}) {
  const { Icon } = cluster;
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 space-y-1.5">
        <p className="text-primary inline-flex items-center gap-1.5 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
          <Icon className="size-3" />
          ADMIN · {cluster.label}
        </p>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {desc ? (
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
            {desc}
          </p>
        ) : null}
      </div>
      {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
    </div>
  );
}

/* ── AdminShell ───────────────────────────────────────────────────────── */

// 모든 /admin/* 화면의 공통 셸. 화면은 cluster·title·desc 를 넘기고 본문을 children 으로.
export function AdminShell({
  cluster,
  title,
  desc,
  headerRight,
  width = 1280,
  role,
  children,
}: {
  cluster: AdminClusterId;
  title: ReactNode;
  desc?: ReactNode;
  headerRight?: ReactNode;
  /** 본문 최대 폭(px). 워크스페이스류는 1400 등. */
  width?: number;
  role?: UserRole | null;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const navCluster = clusterById(cluster);
  return (
    <div className="bg-background flex min-h-[calc(100vh-3.5rem)]">
      <AdminSidebar
        activeCluster={cluster}
        pathname={pathname}
        role={role}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminBreadcrumb cluster={navCluster} title={title} />
        <main
          className="mx-auto w-full flex-1 px-5 pt-6 pb-16 md:px-8"
          style={{ maxWidth: width }}
        >
          <AdminPageHeader
            cluster={navCluster}
            title={title}
            desc={desc}
            headerRight={headerRight}
          />
          {children}
        </main>
      </div>
    </div>
  );
}
