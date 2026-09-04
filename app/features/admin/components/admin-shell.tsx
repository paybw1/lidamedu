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
  FileTextIcon,
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
  SearchIcon,
  SendIcon,
  SettingsIcon,
  TrendingUpIcon,
  UserCogIcon,
  UsersIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "react-router";

import { ROLE_LABEL, roleAtLeast, type UserRole } from "~/core/lib/roles";
import { cn } from "~/core/lib/utils";
import { AdminCommandPalette } from "~/features/admin/components/admin-command-palette";
import { openAdminCommandPalette } from "~/features/admin/components/admin-palette-event";
import {
  useRememberCurrentQuery,
  useRememberedQueries,
} from "~/features/admin/hooks/use-list-return";
import { useMyDuties } from "~/features/admin/hooks/use-my-duties";
import type { StaffDuty } from "~/features/admin/lib/duties";
import { REVIEWS_ENABLED } from "~/features/lms/reviews-config";

export type AdminClusterId =
  | "hub"
  | "laws"
  | "cases"
  | "problems"
  | "subjective"
  | "blanks"
  | "relations"
  | "checks"
  | "lms"
  | "products"
  | "sales"
  | "my-activity"
  | "students"
  | "cohorts"
  | "instructors"
  | "gs"
  | "analytics"
  | "comms"
  | "ai-qna"
  | "landing"
  | "ops"
  // feat-11-011 P3 — 강의·판매 관리 모드의 업무군(요청서 §1.2 열 개). 학습 관리 모드의
  // 클러스터와 섞이지 않도록 접두어를 둔다.
  | "c-dashboard"
  | "c-catalog"
  | "c-media"
  | "c-enroll"
  | "c-members"
  | "c-orders"
  | "c-books"
  | "c-promo"
  | "c-stats"
  | "c-site"
  | "c-system";

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
  // ★duty 로 접근하는 화면은 minRole 대신 duty 를 지정한다.
  minRole?: UserRole;
  // feat-11-011 P0 — 이 duty 를 배정받은 스태프(+원장)에게만 노출.
  // ★loader 의 hasDutyAccess 와 **같은 값**을 적어야 한다. 어긋나면 열리지 않는
  //   메뉴가 다시 보이게 되고, 그게 "접근 안 되는 페이지" 신고의 원인이었다.
  duty?: StaffDuty;
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
    screens: [
      { label: "허브", to: "/admin" },
      // feat-11-011 P5 — 강의·판매 운영 현황(오늘의 결제·환불요청·배송대기·만료예정).
      { label: "운영 대시보드", to: "/admin/dashboard", minRole: "manager" },
    ],
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
      // 도해특허법 열람·검수 — staff 전용(수험생 비노출).
      { label: "도해특허법", to: "/admin/dohae" },
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
      // feat-2-035 — 2차 대비 도식(사실관계→쟁점→법조문→법리→포섭→결론).
      { label: "판례 도식", to: "/admin/case-diagrams" },
      { label: "하급심 판결문", to: "/admin/cases/lower-court" },
      { label: "강의노트 사례연구 검토", to: "/admin/case-study-review" },
      // errata — 세 화면 모두 cluster="cases" 로 렌더된다(교재 추록·정오표).
      // 판정은 staff 가 하고 발행만 원장·관리자다(화면 안에서 갈린다) — minRole 을 걸지 않는다.
      { label: "판 대조 검수", to: "/admin/book-diff" },
      { label: "추록·정오표 시트", to: "/admin/errata-sheets" },
      { label: "추록 발행분 수정", to: "/admin/errata-items", minRole: "manager" },
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
      { label: "기출 시험번호 매칭", to: "/admin/problems/exam-number" },
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
    // 주관식(2차 논술)은 객관식과 별도 축 — 목록·편집·채점기준 관리가 흐름이 다름.
    id: "subjective",
    section: "content",
    label: "주관식 문제 (2차)",
    Icon: FileTextIcon,
    screens: [
      { label: "주관식 문제 보기", to: "/admin/problems?format=subjective" },
    ],
  },
  {
    id: "blanks",
    section: "content",
    label: "암기 자료",
    Icon: PencilLineIcon,
    screens: [
      { label: "빈칸 자료 세트", to: "/admin/blanks" },
      // feat-2-029 S5 — 판례 빈칸 후보(OX 기출 유래) 승인 큐.
      { label: "판례 빈칸 승인", to: "/admin/blanks/cases" },
      // OX 기출 유래 조문 빈칸 후보 승인 큐.
      { label: "조문 빈칸 승인", to: "/admin/blanks/article-candidates" },
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
      // feat-14-N1-b — 검수 대기를 한 화면에서(문제·도식·2차 훈련).
      { label: "콘텐츠 검수", to: "/admin/review" },
      { label: "콘텐츠 완성도", to: "/admin/laws/health" },
      { label: "데이터 가져오기 점검", to: "/admin/seeds/preview" },
      { label: "전문 PDF 미적재", to: "/admin/cases/pdf-missing" },
      { label: "체계도 배치 점검", to: "/admin/cases/violations" },
      { label: "고아 하이라이트 점검", to: "/admin/cases/orphan-highlights" },
      { label: "연결 누락 점검", to: "/admin/relations/gaps" },
      { label: "본문 찾아 고치기", to: "/admin/tools/find-replace" },
    ],
  },
  {
    // feat-11 — 영상 강의 LMS (시리즈·에디션·회차·영상·수강권) + 도서몰. 커머스 축.
    id: "lms",
    section: "commerce",
    label: "강의·도서몰",
    Icon: ClapperboardIcon,
    screens: [
      // feat-11-008 P4 — 강의개설(판매 상품 통합 목록: 검색·수정·목차·수강생 진입점).
      { label: "강의개설", to: "/admin/lectures", minRole: "admin" },
      // 강의 콘텐츠(회차·영상 심화) — 내부 구조는 시리즈/연도판 유지, 용어만 운영 용어.
      { label: "강의 콘텐츠", to: "/admin/lms/courses", duty: "lms_video_admin" },
      // feat-11-008 P3 — 강의·상품 공용 분류 관리(카탈로그 탭 SSOT).
      { label: "강의 카테고리", to: "/admin/lecture-categories" },
      // feat-11-008 P5 — 콘텐츠관리 분리: 라이브러리(원본 동기화·검색) / 강의그룹(회차 구성).
      { label: "콘텐츠 라이브러리", to: "/admin/lms/contents", duty: "lms_video_admin" },
      { label: "강의그룹", to: "/admin/lms/groups", minRole: "admin" },
      // 수강 후기 일단 숨김(REVIEWS_ENABLED) — 재오픈 시 자동 복원.
      // ★조건부 spread 는 문맥 타입을 못 받아 duty 가 string 으로 넓어진다 —
      //   같은 배열의 다른 항목까지 함께 넓어지므로 명시 타입을 붙인다.
      ...(REVIEWS_ENABLED
        ? ([
            { label: "수강평·교재평", to: "/admin/lms/reviews", duty: "lms_video_admin" },
          ] as NavScreen[])
        : []),
      { label: "영상 수강권", to: "/admin/lms/enrollments", duty: "lms_cs" },
      // feat-11-010 — 유료 수강기간 연장 결제·원복 이력.
      { label: "수강기간 연장 이력", to: "/admin/lms/extensions" },
      { label: "기기 관리", to: "/admin/lms/devices", duty: "lms_cs" },
      // feat-11-004 4c — 도서몰.
      { label: "도서 관리", to: "/admin/books", duty: "lms_video_admin" },
      { label: "세트·번들", to: "/admin/book-bundles", duty: "lms_video_admin" },
      { label: "배송 관리", to: "/admin/shipments", duty: "lms_orders_admin" },
    ],
  },
  {
    // 내 활동 — 내가 학생/반에 한 조치(상담 코멘트·과제)와 상대 반응을 한곳에.
    id: "my-activity",
    section: "students",
    label: "내 활동",
    Icon: SendIcon,
    screens: [{ label: "내 활동(상담·과제)", to: "/admin/my-activity" }],
  },
  {
    // 회원 관리 — 사람 축(수강생·강사·접속·탈퇴·위험군). 상품/종합반/매출과 분리.
    id: "students",
    section: "students",
    label: "회원 관리",
    Icon: UsersIcon,
    screens: [
      { label: "수강생 관리", to: "/admin/users", duty: "student_admin_access" },
      // P1 — 체험→유료 전환 추적(만료 임박 워크리스트·전환율).
      { label: "체험 전환", to: "/admin/trial-conversion" },
      { label: "접속이력 관리", to: "/admin/access-logs", minRole: "admin" },
      { label: "탈퇴 관리", to: "/admin/withdrawals", minRole: "admin" },
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
      { label: "등업 신청", to: "/admin/cohort-requests", minRole: "manager" },
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
      { label: "강사 담당·권한", to: "/admin/instructors", minRole: "admin" },
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
      { label: "수강권 관리", to: "/admin/subscriptions", minRole: "manager" },
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
      { label: "주문 관리 (항목·환불)", to: "/admin/orders", duty: "lms_orders_admin" },
      { label: "강사 배분 기준", to: "/admin/settlements/rules", minRole: "manager" },
      { label: "강사 정산", to: "/admin/settlements", minRole: "manager" },
      // feat-8-029 P6 — 도서 배분 기준 + 도서 정산(계산·지급).
      { label: "도서 배분 기준", to: "/admin/settlements/books", minRole: "manager" },
      { label: "도서 정산", to: "/admin/settlements/book-runs", minRole: "manager" },
      { label: "Q&A 답변 적립", to: "/admin/settlements/qna-rewards", minRole: "manager" },
      // feat-13 할인 쿠폰.
      { label: "쿠폰 관리", to: "/admin/coupons" },
      // feat-11-011 — 적립 정책 · 쿠폰 전환 · 이용내역.
      { label: "포인트 관리", to: "/admin/points", minRole: "manager" },
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
      { label: "합격 결과", to: "/admin/exam-results", minRole: "manager" },
      { label: "합격자 사례", to: "/admin/analytics/passers", minRole: "manager" },
      { label: "합격 vs 불합격 패턴", to: "/admin/analytics/failure-patterns", minRole: "manager" },
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
      { label: "팝업 공지", to: "/admin/popup-notices", minRole: "manager" },
      { label: "고객센터 문의", to: "/admin/cs-inquiries" },
      { label: "FAQ 관리", to: "/admin/support-faqs" },
      { label: "커뮤니티 신고", to: "/admin/community/reports", minRole: "manager" },
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
      { label: "Q&A 답변자 지정", to: "/admin/qna/answerers", minRole: "manager" },
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
      // feat-11-009 — 메인화면 자체를 블록으로 조립. 배너·소식 등은 아래 각 화면이 소유.
      { label: "메인화면 관리", to: "/admin/main-page" },
      { label: "히어로 배너", to: "/admin/landing-banners" },
      { label: "공부방법·맛보기 영상", to: "/admin/lecture-videos" },
      { label: "현장강의 일정", to: "/admin/lecture-schedules" },
      { label: "리담소식", to: "/admin/lecture-news" },
      { label: "시험정보", to: "/admin/exam-info" },
      { label: "시험 공고", to: "/admin/exam-notices" },
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
      { label: "감사 기록", to: "/admin/audit-logs", minRole: "manager" },
      { label: "받은 알림함", to: "/admin/inbox" },
      { label: "이용 가이드 관리", to: "/admin/guides", minRole: "manager" },
      // feat-11-008 P2 — 이벤트·소개용 풀페이지 제작(/page/:code).
      { label: "페이지관리", to: "/admin/pages", minRole: "admin" },
      { label: "버그 리포트", to: "/admin/bug-reports" },
    ],
  },
];

function clusterById(id: AdminClusterId): NavCluster {
  return ADMIN_NAV.find((c) => c.id === id) ?? ADMIN_NAV[0];
}

// 사이드바 클러스터 접힘 상태(사용자가 접은 것만 기억) — feat-11-008 P0.
function readAdminNavOpen(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(
      window.localStorage.getItem("adminNavOpen") ?? "{}",
    ) as Record<string, boolean>;
  } catch {
    return {};
  }
}

// 역할·담당 맞춤 내비 — 화면을 minRole 과 duty 로 필터하고, 남은 화면이 없는
// 클러스터는 제거. hub(섹션 없음)는 항상 유지. 사이드바·팔레트·허브 공용.
//
// ★duties 를 안 넘기면 duty 화면은 원장에게만 보인다. 관리자에게 "열리지 않는 메뉴"를
//   보여 주는 것보다 잠시 안 보이는 편이 낫다 — 눌러서 오류를 만나는 게 최악이다.
export function visibleAdminNav(
  role: UserRole | null | undefined,
  duties?: ReadonlySet<StaffDuty> | null,
  mode: AdminModeId = "study",
): NavCluster[] {
  const allowed = (s: NavScreen) => {
    if (s.minRole && !roleAtLeast(role, s.minRole)) return false;
    if (!s.duty) return true;
    return role === "admin" || Boolean(duties?.has(s.duty));
  };
  const source =
    mode === "commerce"
      ? COMMERCE_NAV
      : // 학습 관리 모드에서는 커머스가 가져간 클러스터를 뺀다(양쪽에 다 보이면 어디가
        // 정본인지 알 수 없다). 공용 클러스터는 양쪽에 남는다.
        ADMIN_NAV.filter((c) => !COMMERCE_ONLY_CLUSTERS.has(c.id));
  return source
    .map((c) => ({ ...c, screens: c.screens.filter(allowed) }))
    .filter((c) => !c.section || c.screens.length > 0);
}

/* ── 관리자 모드 (feat-11-011 P3) ──────────────────────────────────────────
   /admin 은 학습 플랫폼(법령·판례·문제·2차·종합반)과 강의·판매를 한 사이드바에 담고
   있었다. 0903 요청서의 열 개 업무군은 **동영상 서비스 기준**이라 그대로 덮으면 학습
   플랫폼 화면 서른 개가 갈 곳을 잃는다. 그래서 모드를 나눈다.

   ★URL 은 하나도 바뀌지 않는다 — 배치와 이름만 옮긴다. 기존 북마크가 그대로 산다.
   ★공용 화면(회원·CRM·공지·시스템)은 **한 벌만 두고 양쪽에서 같은 URL 로** 들어간다
     (요청서 §1.4 "동일 기능의 대표 URL 은 하나"). */

export type AdminModeId = "study" | "commerce";

export const ADMIN_MODES: { id: AdminModeId; label: string; home: string }[] = [
  { id: "study", label: "학습 관리", home: "/admin" },
  { id: "commerce", label: "강의·판매 관리", home: "/admin/lectures" },
];

/** 화면 메타(라벨·minRole·duty)의 단일 출처 = ADMIN_NAV. 커머스 모드는 경로만 나열한다. */
const SCREEN_BY_PATH = new Map<string, NavScreen>();
for (const c of ADMIN_NAV) for (const s of c.screens) SCREEN_BY_PATH.set(s.to, s);

/** 경로 → 화면. 못 찾으면 경로를 그대로 보여 준다(조용히 사라지는 것보다 낫다). */
function screenAt(to: string): NavScreen {
  return SCREEN_BY_PATH.get(to) ?? { label: to, to };
}

const COMMERCE_GROUP_DEFS: {
  id: AdminClusterId;
  label: string;
  Icon: LucideIcon;
  paths: string[];
}[] = [
  { id: "c-dashboard", label: "대시보드", Icon: LayoutDashboardIcon, paths: ["/admin/dashboard", "/admin"] },
  {
    id: "c-catalog",
    label: "강의·상품관리",
    Icon: GraduationCapIcon,
    paths: [
      "/admin/lectures",
      "/admin/lms/courses",
      "/admin/lecture-categories",
      "/admin/instructor-profiles",
      "/admin/pricing",
      "/admin/discounts",
    ],
  },
  {
    id: "c-media",
    label: "영상자료관리",
    Icon: ClapperboardIcon,
    paths: ["/admin/lms/contents", "/admin/lms/groups"],
  },
  {
    id: "c-enroll",
    label: "수강운영관리",
    Icon: ClipboardCheckIcon,
    paths: [
      "/admin/lms/enrollments",
      "/admin/lms/extensions",
      "/admin/lms/devices",
      "/admin/subscriptions",
    ],
  },
  {
    id: "c-members",
    label: "회원·CRM",
    Icon: UsersIcon,
    paths: [
      "/admin/users",
      "/admin/trial-conversion",
      "/admin/access-logs",
      "/admin/withdrawals",
      "/admin/broadcasts",
    ],
  },
  {
    id: "c-orders",
    label: "주문·결제관리",
    Icon: BanknoteIcon,
    paths: ["/admin/orders", "/admin/payments"],
  },
  {
    id: "c-books",
    label: "교재·배송관리",
    Icon: PackageIcon,
    paths: ["/admin/books", "/admin/book-bundles", "/admin/shipments"],
  },
  {
    id: "c-promo",
    label: "쿠폰·포인트관리",
    Icon: AwardIcon,
    paths: ["/admin/coupons", "/admin/points"],
  },
  {
    id: "c-stats",
    label: "정산·통계",
    Icon: TrendingUpIcon,
    paths: [
      "/admin/sales/stats",
      "/admin/subscriptions/stats",
      "/admin/settlements",
      "/admin/settlements/rules",
      "/admin/settlements/book-runs",
      "/admin/settlements/books",
      "/admin/settlements/qna-rewards",
    ],
  },
  {
    id: "c-site",
    label: "사이트관리",
    Icon: MegaphoneIcon,
    paths: [
      "/admin/main-page",
      "/admin/landing-banners",
      "/admin/lecture-videos",
      "/admin/lecture-schedules",
      "/admin/lecture-news",
      "/admin/exam-info",
      "/admin/exam-notices",
      "/admin/pages",
      "/admin/announcements",
      "/admin/popup-notices",
      "/admin/support-faqs",
    ],
  },
  {
    id: "c-system",
    label: "시스템·보안",
    Icon: SettingsIcon,
    paths: [
      "/admin/staff-duties",
      "/admin/auth",
      "/admin/audit-logs",
      "/admin/bug-reports",
      "/admin/guides",
      "/admin/inbox",
    ],
  },
];

export const COMMERCE_NAV: NavCluster[] = COMMERCE_GROUP_DEFS.map((g) => ({
  id: g.id,
  section: "commerce",
  label: g.label,
  Icon: g.Icon,
  screens: g.paths.map(screenAt),
}));

/** 학습 관리 모드에서만 보이는 클러스터 = 커머스 모드가 가져간 것 외 전부. */
const COMMERCE_ONLY_CLUSTERS = new Set<AdminClusterId>(["lms", "products", "sales"]);

/** 현재 화면이 어느 모드에 속하는가. 판단이 안 서면 저장된 모드를 따른다. */
export function resolveAdminMode(
  cluster: AdminClusterId,
  stored: AdminModeId | null,
): AdminModeId {
  if (COMMERCE_ONLY_CLUSTERS.has(cluster)) return "commerce";
  if (cluster.startsWith("c-")) return "commerce";
  // 공용 클러스터(회원·공지·시스템·강사·사이트)는 마지막으로 고른 모드를 유지한다.
  // ★커머스 모드가 참조하는 화면이 속한 클러스터는 전부 여기 있어야 한다. 빠지면
  //   그 화면에 들어갔을 때 사이드바가 학습 관리로 튄다.
  const shared: AdminClusterId[] = [
    "students",
    "comms",
    "ops",
    "landing",
    "instructors",
    "hub",
  ];
  if (shared.includes(cluster)) return stored ?? "study";
  return "study";
}

/** 커머스 모드에서 현재 경로가 속한 업무군. 강조 표시용. */
function activeCommerceGroup(pathname: string): AdminClusterId | null {
  let best: { id: AdminClusterId; len: number } | null = null;
  for (const g of COMMERCE_NAV) {
    for (const s of g.screens) {
      const base = s.to.split("?")[0];
      if ((pathname === base || pathname.startsWith(base + "/")) && (!best || base.length > best.len)) {
        best = { id: g.id, len: base.length };
      }
    }
  }
  return best?.id ?? null;
}

const ADMIN_MODE_KEY = "adminMode";

function readAdminMode(): AdminModeId | null {
  try {
    const v = window.localStorage.getItem(ADMIN_MODE_KEY);
    return v === "study" || v === "commerce" ? v : null;
  } catch {
    return null;
  }
}

/* ── Sidebar ──────────────────────────────────────────────────────────── */

function ClusterGroup({
  cluster,
  activeCluster,
  pathname,
  collapsed,
  remembered,
}: {
  cluster: NavCluster;
  activeCluster: AdminClusterId;
  pathname: string;
  collapsed: boolean;
  /** feat-11-011 P4 — 경로 → 마지막 쿼리스트링. 목록으로 돌아갈 때 필터를 되살린다. */
  remembered?: Record<string, string>;
}) {
  const hrefOf = (to: string) => (remembered?.[to] ? to + remembered[to] : to);
  const isActiveCluster = cluster.id === activeCluster;
  // 펼침 상태 — 기본 전체 펼침 유지(요청서: 하위 메뉴 이동 시 다른 메뉴가 사라지지 않아야 함).
  // 라우트 이동마다 AdminShell 이 재마운트되므로 사용자가 접은 클러스터만 localStorage 로 기억.
  // SSR 결정성(hydration)을 위해 초기값은 항상 true, 저장된 접힘은 mount 후 적용.
  // 활성 클러스터는 저장값과 무관하게 펼침 유지.
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (isActiveCluster) return;
    if (readAdminNavOpen()[cluster.id] === false) setOpen(false);
  }, [isActiveCluster, cluster.id]);
  const toggleOpen = () =>
    setOpen((v) => {
      const next = !v;
      try {
        const m = readAdminNavOpen();
        m[cluster.id] = next;
        window.localStorage.setItem("adminNavOpen", JSON.stringify(m));
      } catch {
        // localStorage 불가 환경(사파리 프라이빗 등) — 상태만 토글
      }
      return next;
    });
  const onlyOne = cluster.screens.length === 1;
  const { Icon } = cluster;

  if (collapsed) {
    return (
      <Link
        to={hrefOf(cluster.screens[0].to)}
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
          to={hrefOf(cluster.screens[0].to)}
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
          onClick={toggleOpen}
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
            // 상세 경로(/admin/settlements/:id 등)에서도 소속 메뉴가 활성으로 표시되도록 prefix 매칭.
            const isActive = pathname === s.to || pathname.startsWith(s.to + "/");
            return (
              <li key={s.to}>
                <Link
                  to={hrefOf(s.to)}
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
  const duties = useMyDuties(role);
  // SSR 결정성 — 초기 모드는 화면이 속한 모드로 정하고, 저장된 선택은 mount 뒤 적용한다.
  const [storedMode, setStoredMode] = useState<AdminModeId | null>(null);
  useEffect(() => setStoredMode(readAdminMode()), []);
  const mode = resolveAdminMode(activeCluster, storedMode);
  const nav = visibleAdminNav(role, duties, mode);
  const activeId =
    mode === "commerce" ? (activeCommerceGroup(pathname) ?? activeCluster) : activeCluster;
  // feat-11-011 P4 — 메뉴로 목록에 돌아갈 때 마지막 필터·검색어를 되살린다.
  const remembered = useRememberedQueries(nav.flatMap((c) => c.screens.map((x) => x.to)));

  const pickMode = (m: AdminModeId) => {
    try {
      window.localStorage.setItem(ADMIN_MODE_KEY, m);
    } catch {
      // localStorage 불가 환경 — 이동만 한다.
    }
  };
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

      {/* feat-11-011 P3 — 학습 관리 ↔ 강의·판매 관리. 학생 화면의 플랫폼 스위처와 같은 어법. */}
      {!collapsed ? (
        <div className="bg-sidebar-accent/40 mb-2 flex gap-0.5 rounded-lg p-0.5">
          {ADMIN_MODES.map((m) => (
            <Link
              key={m.id}
              to={m.home}
              onClick={() => pickMode(m.id)}
              className={cn(
                "flex-1 rounded-md px-2 py-1.5 text-center text-[11.5px] font-bold transition-colors",
                mode === m.id
                  ? "bg-sidebar text-sidebar-primary shadow-sm"
                  : "text-sidebar-foreground/60 hover:text-sidebar-foreground",
              )}
            >
              {m.label}
            </Link>
          ))}
        </div>
      ) : null}

      {/* 운영자 화면 검색(⌘K) 진입 — 91개 화면을 이름으로 점프. */}
      <button
        type="button"
        onClick={() => openAdminCommandPalette()}
        title="화면 찾기 (⌘K / Ctrl+K)"
        aria-label="운영자 화면 검색"
        className={cn(
          "text-sidebar-foreground/70 hover:bg-sidebar-accent/40 border-sidebar-border/70 mb-2 flex items-center gap-2 rounded-lg border transition-colors",
          collapsed ? "mx-auto size-10 justify-center" : "px-2.5 py-1.5",
        )}
      >
        <SearchIcon className="size-4 shrink-0" />
        {!collapsed ? (
          <>
            <span className="text-sidebar-foreground/60 flex-1 text-left text-[12px]">
              화면 찾기…
            </span>
            <kbd className="border-sidebar-border text-sidebar-foreground/50 rounded border px-1 py-0.5 font-mono text-[10px]">
              ⌘K
            </kbd>
          </>
        ) : null}
      </button>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {/* 강의·판매 관리 — 요청서 §1.2 열 개 업무군을 번호 순서 그대로. 섹션 머리글 없음. */}
        {mode === "commerce"
          ? nav.map((c) => (
              <ClusterGroup
                key={c.id}
                cluster={c}
                activeCluster={activeId}
                pathname={pathname}
                collapsed={collapsed}
                remembered={remembered}
              />
            ))
          : null}
        {/* hub — 섹션에 속하지 않는 단독 진입점 */}
        {mode === "study"
          ? nav.filter((c) => !c.section).map((c) => (
              <ClusterGroup
                key={c.id}
                cluster={c}
                activeCluster={activeId}
                pathname={pathname}
                collapsed={collapsed}
                remembered={remembered}
              />
            ))
          : null}
        {/* 4개 상위 섹션 — 헤더 + 소속 클러스터 (학습 관리 모드) */}
        {(mode === "study" ? ADMIN_SECTIONS : []).map((section) => {
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
                  activeCluster={activeId}
                  pathname={pathname}
                  collapsed={collapsed}
                  remembered={remembered}
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
    // 모바일은 상단 nav 가 숨어(topbar hidden md:flex) sticky 기준점이 없다 —
    // top-14 로 고정하면 허공에 떠서 스크롤을 따라다닌다 → md 미만은 문서 흐름대로.
    <div className="border-border bg-background/90 z-10 flex items-center gap-1.5 border-b px-5 py-2.5 text-xs backdrop-blur md:sticky md:top-14 md:px-8">
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
  // feat-11-011 P4 — 모든 운영자 화면의 마지막 쿼리를 기억한다(목록 60여 개를 안 고쳐도 된다).
  useRememberCurrentQuery();
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
      <AdminCommandPalette role={role ?? null} />
    </div>
  );
}
