import {
  ArrowRightIcon,
  BarChart3Icon,
  FileEditIcon,
  ListChecksIcon,
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
