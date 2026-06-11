// /subjects/science — 자연과학 허브. nav 의 "자연과학" 단일 진입점에서 도달하며
// 1차 4과목(물리·화학·생물·지구과학)을 한 화면에서 선택하게 한다.
// 진입 게이트(area_subjects)는 상위 subjects.layout 이 담당하므로 자체 로더 없음.

import { ArrowRightIcon } from "lucide-react";
import { Link } from "react-router";

import { SCIENCE_SUBJECTS } from "~/core/lib/subject-groups";

import type { Route } from "./+types/science-index";

export const meta: Route.MetaFunction = () => [
  { title: "자연과학 | Lidam Patent Attorney Academy" },
];

export default function ScienceIndex() {
  return (
    <div className="mx-auto w-full max-w-screen-lg px-4 py-8 sm:px-6 md:px-8 md:py-10">
      <header className="mb-6">
        <p className="text-primary font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
          1차 · 객관식
        </p>
        <h1 className="text-foreground mt-1 text-3xl font-extrabold tracking-tight">
          자연과학
        </h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          1차 필수 4과목 — 과목을 선택하세요.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {SCIENCE_SUBJECTS.map((s) => (
          <Link
            key={s.href}
            to={s.href}
            viewTransition
            prefetch="intent"
            className="border-border bg-card hover:border-primary hover:bg-accent/40 group flex items-center justify-between rounded-xl border p-5 shadow-sm transition-colors"
          >
            <div className="min-w-0">
              <p className="text-foreground text-lg font-bold">{s.name}</p>
              {s.meta ? (
                <p className="text-muted-foreground mt-0.5 text-xs">{s.meta}</p>
              ) : null}
            </div>
            <ArrowRightIcon className="text-muted-foreground group-hover:text-primary size-5 shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}
