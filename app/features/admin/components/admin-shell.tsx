// 운영자 영역 공통 셸 — 4개 섹션·클러스터 사이드바 + breadcrumb + 페이지 헤더.
// 키트 lidam-admin/Shell.jsx 디자인. brief §5.2.
// 모든 /admin/* 화면은 <AdminShell>로 감싸 일관된 네비게이션을 얻는다.
import {
  AwardIcon,
  BanknoteIcon,
  BellIcon,
  ChevronDownIcon,
  ClapperboardIcon,
  ClipboardCheckIcon,
  GavelIcon,
  GraduationCapIcon,
  LayoutDashboardIcon,
  Link2Icon,
  ListChecksIcon,
  type LucideIcon,
  MegaphoneIcon,
  MessageCircleQuestionIcon,
  PackageIcon,
  PanelLeftIcon,
  PencilLineIcon,
  ScaleIcon,
  SettingsIcon,
  TrendingUpIcon,
  UserCogIcon,
  UsersIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, useLocation } from "react-router";

import { ROLE_LABEL, roleAtLeast, type UserRole } from "~/core/lib/roles";
import { cn } from "~/core/lib/utils";

export type AdminClusterId =
  | "hub"
  | "laws"
  | "cases"
  | "problems"
  | "blanks"
  | "relations"
  | "checks"
  | "lms"
  | "products"
  | "sales"
  | "students"
  | "cohorts"
  | "instructors"
  | "gs"
  | "analytics"
  | "comms"
  | "ai-qna"
  | "landing"
  | "ops";

// 상위 섹션 — 클러스터를 5개 도메인으로 묶어 사이드바·허브에서 그룹 표시.
// (커머스를 별도 축으로 분리 — 상품·매출·정산·도서몰이 '수강생 운영/콘텐츠'에 섞이던 문제 해소.)
export type AdminSectionId =
  | "content"
  | "commerce"
  | "students"
  | "exam"
  | "system";

export const ADMIN_SECTIONS: { id: AdminSectionId; label: string }[] = [
  { id: "content", label: "콘텐츠" },
  { id: "commerce", label: "커머스·판매" },
  { id: "students", label: "수강생·반" },
  { id: "exam", label: "시험·분석" },
  { id: "system", label: "운영·시스템" },
];

interface NavScreen {
  label: string;
  to: string;
  // 이 역할 이상만 사이드바·허브에 노출. loader 가드는 별개 유지(이중 방어).
  // ★duty 로 접근하거나 가드가 불확실한 화면엔 지정하지 않는다(오hide 방지).
  minRole?: UserRole;
}

interface NavCluster {
  id: AdminClusterId;
  // hub 는 섹션에 속하지 않고 사이드바·허브 최상단에 단독 노출.
  section?: AdminSectionId;
  label: string;
  Icon: LucideIcon;
  screens: NavScreen[];
}

// 클러스터 — 사이드바에는 안정적(비-파라미터) 라우트만 노출.
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
    section: "content",
    label: "법령·개정",
    Icon: GavelIcon,
    screens: [
      { label: "법령 허브", to: "/admin/laws" },
      { label: "단원 체계도", to: "/admin/systematic-tree" },
      { label: "강의노트 위치 확인", to: "/admin/lecture-locations" },
    ],
  },
  {
    id: "cases",
    section: "content",
    label: "판례",
    Icon: ScaleIcon,
    screens: [
      { label: "판례·조문 매칭", to: "/admin/cases" },
      { label: "판례·기출 매칭", to: "/admin/relations/exam-cases" },
      { label: "판례 등록", to: "/admin/cases/edit" },
      { label: "판례 쟁점훈련 출제", to: "/admin/case-training" },
      { label: "강의노트 사례연구 검토", to: "/admin/case-study-review" },
    ],
  },
  {
    id: "problems",
    section: "content",
    label: "객관식 문제 · 정오문제",
    Icon: ListChecksIcon,
    screens: [
      // 출제 흐름 순서대로 — AI 초안 → 강사 검토 → 직접 출제/목록 → 팩 → 통합 시험.
      { label: "AI 문제 초안 만들기", to: "/admin/problems/ai-gen" },
      { label: "검토 대기 문제", to: "/admin/problems/review" },
      { label: "기출 해설 검수", to: "/admin/problems/explanations" },
      { label: "지문 텍스트 검수", to: "/admin/problems/text-conversion" },
      { label: "문제 직접 만들기", to: "/admin/problems/new" },
      { label: "전체 문제 보기", to: "/admin/problems" },
      { label: "정오문제 검수", to: "/admin/problems/ox" },
      { label: "정답률·통계", to: "/admin/problems/stats" },
      // 학생용 라우트(/latest/mcq) — staff 진입 시 picker 노출.
      // ?kind=mock 은 가상 통합 필터 (mock_full + mock_progressive) — 한 화면.
      { label: "모의고사 문제집 관리", to: "/latest/mcq?kind=mock" },
      { label: "통합 모의고사 (3교시)", to: "/admin/mcq-exams" },
    ],
  },
  {
    id: "blanks",
    section: "content",
    label: "암기 자료",
    Icon: PencilLineIcon,
    screens: [
      { label: "빈칸 자료 세트", to: "/admin/blanks" },
      { label: "빈칸 정답률", to: "/admin/blanks/stats" },
      // feat-2-023 — 암기 카드(SRS v2) 조문·판례 생성.
      { label: "암기 카드 생성", to: "/admin/srs-cards" },
    ],
  },
  {
    id: "relations",
    section: "content",
    label: "연관관계",
    Icon: Link2Icon,
    screens: [{ label: "연결 일괄 등록", to: "/admin/relations/bulk" }],
  },
  {
    // 데이터 무결성 점검 — 각 콘텐츠 클러스터에 흩어져 있던 health 화면을 한곳에.
    id: "checks",
    section: "content",
    label: "데이터 점검",
    Icon: ClipboardCheckIcon,
    screens: [
      { label: "콘텐츠 완성도", to: "/admin/laws/health" },
      { label: "데이터 가져오기 점검", to: "/admin/seeds/preview" },
      { label: "전문 PDF 미적재", to: "/admin/cases/pdf-missing" },
      { label: "체계도 배치 점검", to: "/admin/cases/violations" },
      { label: "고아 하이라이트 점검", to: "/admin/cases/orphan-highlights" },
      { label: "연결 누락 점검", to: "/admin/relations/gaps" },
    ],
  },
  {
    // feat-11 — 영상 강의 LMS (시리즈·에디션·회차·영상·수강권) + 도서몰. 커머스 축.
    id: "lms",
    section: "commerce",
    label: "강의·도서몰",
    Icon: ClapperboardIcon,
    screens: [
      { label: "강의 시리즈·에디션", to: "/admin/lms/courses" },
      { label: "영상 수강권", to: "/admin/lms/enrollments" },
      { label: "기기 관리", to: "/admin/lms/devices" },
      // feat-11-004 4c — 도서몰.
      { label: "도서 관리", to: "/admin/books" },
      { label: "세트·번들", to: "/admin/book-bundles" },
      { label: "배송 관리", to: "/admin/shipments" },
    ],
  },
  {
    // 회원 관리 — 사람 축(수강생·강사·접속·탈퇴·위험군). 상품/종합반/매출과 분리.
    id: "students",
    section: "students",
    label: "회원 관리",
    Icon: UsersIcon,
    screens: [
      { label: "수강생 관리", to: "/admin/users" },
      // P1 — 체험→유료 전환 추적(만료 임박 워크리스트·전환율).
      { label: "체험 전환", to: "/admin/trial-conversion" },
      { label: "접속이력 관리", to: "/admin/access-logs" },
      { label: "탈퇴 관리", to: "/admin/withdrawals" },
      { label: "위험 수강생 (7일 무접속)", to: "/admin/cohorts/at-risk" },
      { label: "등급 체험 테스트", to: "/admin/membership-test", minRole: "admin" },
    ],
  },
  {
    // 종합반 관리 — 반 단위 운영(반·게시판·커리큘럼).
    id: "cohorts",
    section: "students",
    label: "종합반 관리",
    Icon: GraduationCapIcon,
    screens: [
      { label: "반 관리", to: "/admin/cohorts" },
      // pricing "종합반 등업 신청" 접수 → 승인(반 배정=등업)/반려.
      { label: "등업 신청", to: "/admin/cohort-requests" },
      { label: "반별 게시판 관리", to: "/admin/cohort-boards" },
      { label: "커리큘럼 관리", to: "/admin/curricula" },
    ],
  },
  {
    // 강사 관리 — 담당·권한 + 강사소개 프로필 통합(배분·정산은 커머스로).
    id: "instructors",
    section: "students",
    label: "강사 관리",
    Icon: UserCogIcon,
    screens: [
      // feat-7-041 — 강사 담당 과목(콘텐츠 쓰기 권한) + 배분 규칙 연결.
      { label: "강사 담당·권한", to: "/admin/instructors" },
      { label: "강사소개 관리", to: "/admin/instructor-profiles" },
    ],
  },
  {
    // 상품 관리 — 상품 정의(요금·할인)와 학생별 보유(수강권). 거래(매출·정산)와 분리.
    id: "products",
    section: "commerce",
    label: "상품 관리",
    Icon: PackageIcon,
    screens: [
      // feat-8-028 — manager+ 상품·요금·할인.
      { label: "상품·요금 관리", to: "/admin/pricing", minRole: "manager" },
      { label: "할인 관리", to: "/admin/discounts", minRole: "manager" },
      // feat-7-014 — 수강권 = 상품의 학생별 인스턴스(재량 부여·연장·취소).
      { label: "수강권 관리", to: "/admin/subscriptions" },
    ],
  },
  {
    // 매출·정산 관리 — 거래 축(주문결제·강사 배분·정산·적립). manager+ 전용(loader 차단).
    id: "sales",
    section: "commerce",
    label: "매출·정산 관리",
    Icon: BanknoteIcon,
    screens: [
      { label: "주문·결제 관리", to: "/admin/payments", minRole: "manager" },
      // feat-8-029 P2 — 항목(강의/교재)별 매출 통계.
      { label: "매출 통계", to: "/admin/sales/stats", minRole: "manager" },
      // feat-8-029 P5 — 정기구독 통계.
      { label: "구독 통계", to: "/admin/subscriptions/stats", minRole: "manager" },
      // feat-11-004 4a — 항목 단위 주문·부분 환불.
      { label: "주문 관리 (항목·환불)", to: "/admin/orders" },
      { label: "강사 배분 기준", to: "/admin/settlements/rules", minRole: "manager" },
      { label: "강사 정산", to: "/admin/settlements", minRole: "manager" },
      // feat-8-029 P6 — 도서 배분 기준 + 도서 정산(계산·지급).
      { label: "도서 배분 기준", to: "/admin/settlements/books", minRole: "manager" },
      { label: "도서 정산", to: "/admin/settlements/book-runs", minRole: "manager" },
      { label: "Q&A 답변 적립", to: "/admin/settlements/qna-rewards", minRole: "manager" },
      // feat-13 할인 쿠폰.
      { label: "쿠폰 관리", to: "/admin/coupons" },
    ],
  },
  {
    id: "gs",
    section: "exam",
    label: "주관식 문제",
    Icon: AwardIcon,
    screens: [
      { label: "주관식 회차", to: "/admin/gs" },
      { label: "주관식 시리즈", to: "/admin/gs/series" },
      // 주관식 채점 대기 — 주관식 운영 흐름에 속하므로 gs 클러스터로.
      { label: "주관식 첨삭 대기", to: "/admin/subjective-reviews" },
      { label: "포인트 관리", to: "/admin/gs/points" },
      // §3 GS 비용 가드 — 운영자 가시성.
      { label: "AI·OCR 사용량", to: "/admin/gs/usage" },
    ],
  },
  {
    // 합격자 분석 + 학습 분석(전체 학습현황) 통합. feat-7-041.
    id: "analytics",
    section: "exam",
    label: "학습·합격 분석",
    Icon: TrendingUpIcon,
    screens: [
      // 전체 학습현황(학원 전체 집계) — feat-7-041, manager+ 게이트.
      { label: "전체 학습현황", to: "/admin/analytics/students", minRole: "manager" },
      { label: "시험일 관리", to: "/admin/exam-schedules", minRole: "manager" },
      { label: "합격 결과", to: "/admin/exam-results" },
      { label: "합격자 사례", to: "/admin/analytics/passers" },
      { label: "합격 vs 불합격 패턴", to: "/admin/analytics/failure-patterns" },
    ],
  },
  {
    // 공지·커뮤니티 운영(슬림) — 랜딩 콘텐츠·Q&A·감사·알림은 별도 클러스터로 분리.
    id: "comms",
    section: "system",
    label: "공지·커뮤니티",
    Icon: BellIcon,
    screens: [
      { label: "공지 발송", to: "/admin/announcements" },
      { label: "대량 안내 발송", to: "/admin/broadcasts", minRole: "manager" },
      { label: "팝업 공지", to: "/admin/popup-notices" },
      { label: "고객센터 문의", to: "/admin/cs-inquiries" },
      { label: "커뮤니티 신고", to: "/admin/community/reports" },
    ],
  },
  {
    // Q&A 운영 통합 — 강사 답변(SLA·답변자) + AI Q&A(feat-9-005/006).
    id: "ai-qna",
    section: "system",
    label: "Q&A 운영",
    Icon: MessageCircleQuestionIcon,
    screens: [
      { label: "Q&A 답변 현황", to: "/admin/qna/sla", minRole: "manager" },
      { label: "Q&A 답변자 지정", to: "/admin/qna/answerers" },
      { label: "AI 부정 피드백", to: "/admin/ai-qna/feedback" },
      { label: "AI 지표", to: "/admin/ai-qna/metrics" },
      { label: "AI 평가 세트", to: "/admin/ai-qna/eval" },
      { label: "AI 월별 사용량", to: "/admin/ai-qna/usage" },
      { label: "AI 색인 상태", to: "/admin/ai-qna/embed-status" },
      { label: "AI 한도 설정", to: "/admin/ai-qna/settings" },
    ],
  },
  {
    // feat-12 강의 플랫폼 랜딩·마케팅 콘텐츠.
    id: "landing",
    section: "system",
    label: "강의 플랫폼 콘텐츠",
    Icon: MegaphoneIcon,
    screens: [
      { label: "히어로 배너", to: "/admin/landing-banners" },
      { label: "현장강의 일정", to: "/admin/lecture-schedules" },
      { label: "리담소식", to: "/admin/lecture-news" },
    ],
  },
  {
    // 시스템 — 관리자·인증·감사·알림·가이드·버그. (auth-settings 흡수)
    id: "ops",
    section: "system",
    label: "시스템",
    Icon: SettingsIcon,
    screens: [
      // 운영 업무별 알림 담당자 지정 (admin 전용).
      { label: "관리자 관리", to: "/admin/staff-duties", minRole: "admin" },
      // feat-000-017 — id/pw 로그인 노출 토글.
      { label: "로그인 방식", to: "/admin/auth", minRole: "admin" },
      { label: "감사 기록", to: "/admin/audit-logs" },
      { label: "받은 알림함", to: "/admin/inbox" },
      { label: "이용 가이드 관리", to: "/admin/guides" },
      { label: "버그 리포트", to: "/admin/bug-reports" },
    ],
  },
];

function clusterById(id: AdminClusterId): NavCluster {
  return ADMIN_NAV.find((c) => c.id === id) ?? ADMIN_NAV[0];
}

// 역할 맞춤 내비 — 각 클러스터의 화면을 minRole 로 필터하고, 남은 화면이 없는
// 클러스터는 제거. hub(섹션 없음)는 항상 유지. 사이드바·허브 그리드 공용.
export function visibleAdminNav(role: UserRole | null | undefined): NavCluster[] {
  return ADMIN_NAV.map((c) => ({
    ...c,
    screens: c.screens.filter((s) => !s.minRole || roleAtLeast(role, s.minRole)),
  })).filter((c) => !c.section || c.screens.length > 0);
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
  const nav = visibleAdminNav(role);
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
        {/* hub — 섹션에 속하지 않는 단독 진입점 */}
        {nav.filter((c) => !c.section).map((c) => (
          <ClusterGroup
            key={c.id}
            cluster={c}
            activeCluster={activeCluster}
            pathname={pathname}
            collapsed={collapsed}
          />
        ))}
        {/* 4개 상위 섹션 — 헤더 + 소속 클러스터 */}
        {ADMIN_SECTIONS.map((section) => {
          const clusters = nav.filter((c) => c.section === section.id);
          if (clusters.length === 0) return null;
          return (
            <div key={section.id} className="mt-3 first:mt-2">
              {!collapsed ? (
                <p className="text-muted-foreground/70 px-2.5 pt-1 pb-1 font-mono text-[10px] font-bold tracking-[0.1em] uppercase">
                  {section.label}
                </p>
              ) : (
                <div className="border-sidebar-border/60 mx-2 my-1.5 border-t" />
              )}
              {clusters.map((c) => (
                <ClusterGroup
                  key={c.id}
                  cluster={c}
                  activeCluster={activeCluster}
                  pathname={pathname}
                  collapsed={collapsed}
                />
              ))}
            </div>
          );
        })}
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
        <p className="text-link inline-flex items-center gap-1.5 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
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
      <AdminSidebar activeCluster={cluster} pathname={pathname} role={role} />
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
