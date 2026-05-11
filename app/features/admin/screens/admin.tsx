import {
  ArrowRightIcon,
  BarChart3Icon,
  ChartLineIcon,
  CheckSquareIcon,
  ClipboardListIcon,
  CoinsIcon,
  FileEditIcon,
  GavelIcon,
  ListChecksIcon,
  NetworkIcon,
  TrendingUpIcon,
} from "lucide-react";
import { Link } from "react-router";

import { Card, CardContent, CardHeader } from "~/core/components/ui/card";

import type { Route } from "./+types/admin";

export const meta: Route.MetaFunction = () => [{ title: "운영자 | Lidam Edu" }];

export default function Admin() {
  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          운영자
        </p>
        <h1 className="text-2xl font-bold tracking-tight">콘텐츠 관리</h1>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <AdminCard
          to="/admin/blanks"
          title="빈칸 자료 관리"
          subtitle="강사별 빈칸 set 등록·편집"
          icon={FileEditIcon}
        />
        <AdminCard
          to="/admin/blanks/stats"
          title="빈칸 학습 통계"
          subtitle="내용·주체·시기 모드 정답률 / 약점 분석"
          icon={BarChart3Icon}
        />
        <AdminCard
          to="/admin/problems"
          title="객관식 문제 관리"
          subtitle="출처/유형/극성/연도/scope 분류 + 지문 유형 보강"
          icon={ListChecksIcon}
        />
        <AdminCard
          to="/admin/problems/by-system"
          title="체계도 기반 문제 편집"
          subtitle="01 총칙/보칙 ~ 08 국제출원 단위로 한 화면에서 일괄 편집"
          icon={NetworkIcon}
        />
        <AdminCard
          to="/admin/problems/ox"
          title="정오문제 관리"
          subtitle="OX 후보 지문 일괄 검토 — ox_truth / OX 불가 인라인 토글"
          icon={CheckSquareIcon}
        />
        <AdminCard
          to="/admin/problems/stats"
          title="문제 통계 분석"
          subtitle="객관식·정오문제 풀이 정답률 / 어려운 문제 TOP / 연도별 추이"
          icon={TrendingUpIcon}
        />
        <AdminCard
          to="/admin/gs"
          title="온라인 GS 관리"
          subtitle="정기 모의고사 회차·문제 등록 / 채점 / 동료 채점 / 분쟁 문항"
          icon={ClipboardListIcon}
        />
        <AdminCard
          to="/admin/gs/series"
          title="GS 시리즈 통계"
          subtitle="8회 시리즈 학생별 추이 / 누적 z-score / 회차별 평균·분포"
          icon={ChartLineIcon}
        />
        <AdminCard
          to="/admin/gs/points"
          title="GS 포인트 관리"
          subtitle="우수 답안 자동 지급 + 학생별 잔액 / 수동 지급·차감"
          icon={CoinsIcon}
        />
        <AdminCard
          to="/admin/cases?law=patent"
          title="판례 매핑 관리"
          subtitle="자동 추출 안 된 case 의 관련 조문 수동 매핑 / 잘못된 매핑 삭제"
          icon={GavelIcon}
        />
      </div>
    </div>
  );
}

function AdminCard({
  to,
  title,
  subtitle,
  icon: Icon,
}: {
  to: string;
  title: string;
  subtitle?: string;
  icon: typeof FileEditIcon;
}) {
  return (
    <Link
      to={to}
      viewTransition
      className="group block transition-colors"
    >
      <Card className="h-full hover:border-primary">
        <CardHeader>
          <Icon className="text-primary size-5" />
        </CardHeader>
        <CardContent>
          <h2 className="font-semibold">{title}</h2>
          {subtitle ? (
            <p className="text-muted-foreground mt-1 text-xs">{subtitle}</p>
          ) : null}
          <span className="text-primary mt-3 inline-flex items-center gap-1 text-xs">
            이동 <ArrowRightIcon className="size-3 transition-transform group-hover:translate-x-0.5" />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
