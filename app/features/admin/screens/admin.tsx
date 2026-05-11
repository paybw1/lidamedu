// 운영자 메뉴 진입 (feat-7-001, 7-002)
// - staff (instructor/admin): 콘텐츠 관리 허브 — 모든 도구의 단일 진입점
// - 학생: 권한 안내 + 가능한 액션 안내 화면
// - 비로그인: /login 으로 리다이렉트

import {
  ArrowRightIcon,
  BarChart3Icon,
  BookOpenIcon,
  ChartLineIcon,
  CheckSquareIcon,
  ClipboardListIcon,
  CoinsIcon,
  FileEditIcon,
  GavelIcon,
  ListChecksIcon,
  LockIcon,
  MegaphoneIcon,
  NetworkIcon,
  NewspaperIcon,
  ShieldCheckIcon,
  TrendingUpIcon,
  UsersIcon,
} from "lucide-react";
import { Link, data, redirect } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin";

export const meta: Route.MetaFunction = () => [{ title: "운영자 | Lidam Edu" }];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login?next=/admin");
  const role = await getStaffRole(client, user.id);
  return { role, userEmail: user.email ?? null };
}

interface AdminCardData {
  to: string;
  title: string;
  subtitle: string;
  icon: typeof FileEditIcon;
  badge?: string;
}

// 콘텐츠 관리 카드 — 운영자가 자주 쓰는 작업 위주.
const CONTENT_CARDS: AdminCardData[] = [
  {
    to: "/admin/laws/patent/revisions",
    title: "법 개정 워크스페이스",
    subtitle: "특허법 draft → review → publish (조문 단위 편집 + 트랜잭션 발행)",
    icon: FileEditIcon,
  },
  {
    to: "/admin/blanks",
    title: "빈칸 자료 관리",
    subtitle: "강사별 빈칸 set 등록·편집",
    icon: FileEditIcon,
  },
  {
    to: "/admin/problems",
    title: "객관식 문제 관리",
    subtitle: "출처/유형/극성/연도/scope 분류 + 지문 유형 보강",
    icon: ListChecksIcon,
  },
  {
    to: "/admin/problems/by-system",
    title: "체계도 기반 문제 편집",
    subtitle: "01 총칙/보칙 ~ 08 국제출원 단위로 한 화면에서 일괄 편집",
    icon: NetworkIcon,
  },
  {
    to: "/admin/problems/ox",
    title: "정오문제 관리",
    subtitle: "OX 후보 지문 일괄 검토 — ox_truth / OX 불가 인라인 토글",
    icon: CheckSquareIcon,
  },
  {
    to: "/admin/cases?law=patent",
    title: "판례 매핑 관리",
    subtitle: "자동 추출 안 된 case 의 관련 조문 수동 매핑 / 잘못된 매핑 삭제",
    icon: GavelIcon,
  },
  {
    to: "/latest/mcq",
    title: "MCQ 문제집 (기출·모의)",
    subtitle: "기출 자동 재생성 + 모의고사 팩 생성·편집",
    icon: ListChecksIcon,
    badge: "최신 정보",
  },
  {
    to: "/latest/papers",
    title: "논문 · 학술 자료",
    subtitle: "논문 등록·수정 + 관련 조문/판례 링크",
    icon: NewspaperIcon,
    badge: "최신 정보",
  },
  {
    to: "/latest/book-updates",
    title: "도서 추록 · 정오표",
    subtitle: "수험서 추록·정오표 등록·수정",
    icon: BookOpenIcon,
    badge: "최신 정보",
  },
];

const STATS_CARDS: AdminCardData[] = [
  {
    to: "/admin/blanks/stats",
    title: "빈칸 학습 통계",
    subtitle: "내용·주체·시기 모드 정답률 / 약점 분석",
    icon: BarChart3Icon,
  },
  {
    to: "/admin/problems/stats",
    title: "문제 통계 분석",
    subtitle: "객관식·정오문제 풀이 정답률 / 어려운 문제 TOP / 연도별 추이",
    icon: TrendingUpIcon,
  },
];

const USER_CARDS: AdminCardData[] = [
  {
    to: "/admin/users",
    title: "사용자 관리",
    subtitle: "가입자 일람·역할 변경 (수험생/강사/원장)",
    icon: UsersIcon,
    badge: "원장 전용",
  },
  {
    to: "/admin/cohorts",
    title: "반 / 기수 관리",
    subtitle: "강사별 반 CRUD + 학생 멤버 할당",
    icon: BookOpenIcon,
  },
  {
    to: "/admin/announcements",
    title: "공지사항 발송",
    subtitle: "전체 / 반 / 개별 사용자 대상 공지 작성·발행",
    icon: MegaphoneIcon,
  },
];

const GS_CARDS: AdminCardData[] = [
  {
    to: "/admin/gs",
    title: "온라인 GS 관리",
    subtitle: "정기 모의고사 회차·문제 등록 / 채점 / 동료 채점 / 분쟁 문항",
    icon: ClipboardListIcon,
  },
  {
    to: "/admin/gs/series",
    title: "GS 시리즈 통계",
    subtitle: "8회 시리즈 학생별 추이 / 누적 z-score / 회차별 평균·분포",
    icon: ChartLineIcon,
  },
  {
    to: "/admin/gs/points",
    title: "GS 포인트 관리",
    subtitle: "우수 답안 자동 지급 + 학생별 잔액 / 수동 지급·차감",
    icon: CoinsIcon,
  },
];

export default function Admin({ loaderData }: Route.ComponentProps) {
  const { role } = loaderData;

  if (!role) {
    return <StudentGuidance />;
  }

  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <div className="flex items-center gap-2">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            운영자
          </p>
          <Badge variant="default" className="gap-1">
            <ShieldCheckIcon className="size-3" />
            {role === "admin" ? "원장" : "강사"}
          </Badge>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">콘텐츠 관리</h1>
        <p className="text-muted-foreground text-sm">
          학습 콘텐츠를 등록·수정하고 학습 통계를 분석합니다. 카드를 클릭해
          해당 도구로 이동하세요.
        </p>
      </header>

      <Section title="콘텐츠 등록·수정" cards={CONTENT_CARDS} />
      <Section
        title="사용자 · 반"
        cards={
          role === "admin"
            ? USER_CARDS
            : USER_CARDS.filter((c) => c.badge !== "원장 전용")
        }
      />
      <Section title="통계 · 분석" cards={STATS_CARDS} />
      <Section title="온라인 GS" cards={GS_CARDS} />
    </div>
  );
}

function Section({ title, cards }: { title: string; cards: AdminCardData[] }) {
  return (
    <section className="mb-6 space-y-3">
      <h2 className="text-sm font-semibold tracking-wide">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <AdminCard key={c.to} {...c} />
        ))}
      </div>
    </section>
  );
}

function AdminCard({ to, title, subtitle, icon: Icon, badge }: AdminCardData) {
  return (
    <Link to={to} viewTransition className="group block transition-colors">
      <Card className="h-full hover:border-primary">
        <CardHeader>
          <div className="flex items-center justify-between">
            <Icon className="text-primary size-5" />
            {badge ? (
              <Badge variant="outline" className="text-[10px]">
                {badge}
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-muted-foreground mt-1 text-xs">{subtitle}</p>
          <span className="text-primary mt-3 inline-flex items-center gap-1 text-xs">
            이동{" "}
            <ArrowRightIcon className="size-3 transition-transform group-hover:translate-x-0.5" />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}

// 학생이 운영자 메뉴를 클릭했을 때 — 권한 안내 + 가능한 액션으로 유도.
function StudentGuidance() {
  return (
    <div className="mx-auto w-full max-w-screen-md px-5 py-12 md:px-10 md:py-16">
      <Card className="border-amber-300/60 bg-amber-50/40 dark:border-amber-700/40 dark:bg-amber-950/20">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <LockIcon className="text-amber-600 dark:text-amber-400 size-5" />
            <h1 className="text-xl font-bold tracking-tight">
              운영자 전용 메뉴
            </h1>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed">
          <p>
            이 메뉴는 강사·원장이 학습 콘텐츠를 등록·수정·분석하는 도구입니다.
            수험생 계정에서는 접근할 수 없습니다.
          </p>
          <div className="space-y-2">
            <p className="font-semibold">대신 다음 활동을 추천합니다:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <Link
                  to="/dashboard"
                  viewTransition
                  className="text-primary hover:underline"
                >
                  대시보드
                </Link>
                에서 오늘의 학습 목표와 진척도 확인
              </li>
              <li>
                <Link
                  to="/subjects/patent"
                  viewTransition
                  className="text-primary hover:underline"
                >
                  특허법 학습
                </Link>{" "}
                또는{" "}
                <Link
                  to="/subjects/civil"
                  viewTransition
                  className="text-primary hover:underline"
                >
                  민법 학습
                </Link>{" "}
                으로 본격 학습 시작
              </li>
              <li>
                <Link
                  to="/latest/laws"
                  viewTransition
                  className="text-primary hover:underline"
                >
                  최신 정보 (법 개정 / 판례 / 문제 / 논문 / 도서 추록)
                </Link>{" "}
                탐색
              </li>
              <li>
                <Link
                  to="/goals"
                  viewTransition
                  className="text-primary hover:underline"
                >
                  학습 목표
                </Link>{" "}
                관리 — D-day 기준 권장 진도 확인
              </li>
            </ul>
          </div>
          <p className="text-muted-foreground text-xs">
            강사·원장 권한이 필요하다면 운영팀(contact@lidam.edu) 으로
            문의해주세요.
          </p>
          <div className="flex gap-2 pt-2">
            <Button asChild size="sm">
              <Link to="/dashboard">
                <ArrowRightIcon className="size-3.5" /> 대시보드로 이동
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/subjects/patent">특허법 학습 시작</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
