import { ArrowRightIcon, FileEditIcon } from "lucide-react";
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
          description="조문 빈칸 정답 보강 (자동 추출 미매칭 항목)"
          icon={FileEditIcon}
        />
      </div>
    </div>
  );
}

function AdminCard({
  to,
  title,
  description,
  icon: Icon,
}: {
  to: string;
  title: string;
  description: string;
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
          <p className="text-muted-foreground mt-1 text-xs">{description}</p>
          <span className="text-primary mt-3 inline-flex items-center gap-1 text-xs">
            이동 <ArrowRightIcon className="size-3 transition-transform group-hover:translate-x-0.5" />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
