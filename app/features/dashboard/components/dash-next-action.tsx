// 대시보드 최상단 "다음 행동" 카드 — 흩어진 신호(복습·과제·약점·추천)를 우선순위 1~3개로
// 압축해 "지금 이걸 하세요 + 원클릭 시작"을 제시. 링크형/실행형(POST) CTA 모두 지원.

import { ArrowRightIcon, Loader2Icon } from "lucide-react";
import { useEffect } from "react";
import { Link, useFetcher } from "react-router";
import { toast } from "sonner";

import { Button } from "~/core/components/ui/button";
import { Eyebrow, Surface } from "~/core/components/student";
import { cn } from "~/core/lib/utils";
import type { NextAction, NextActionTone } from "../lib/next-actions";

const TONE_DOT: Record<NextActionTone, string> = {
  urgent: "bg-rose-500",
  review: "bg-sky-500",
  improve: "bg-primary",
  default: "bg-muted-foreground",
};

function ActionCta({ action, primary }: { action: NextAction; primary: boolean }) {
  const size = primary ? "default" : "sm";
  const variant = primary ? "default" : "outline";
  // ★POST 는 fetcher 로 — 실패(약점 데이터 부족 등) 시 raw 400 페이지 대신 토스트.
  //   성공 시 action 의 redirect 를 fetcher 가 따라가 러너로 이동.
  const fetcher = useFetcher<{ error?: string }>();
  useEffect(() => {
    if (fetcher.data?.error) toast.error(fetcher.data.error);
  }, [fetcher.data]);

  if (action.cta.kind === "post") {
    const busy = fetcher.state !== "idle";
    return (
      <fetcher.Form method="post" action={action.cta.action}>
        {Object.entries(action.cta.fields ?? {}).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <Button
          type="submit"
          size={size}
          variant={variant}
          disabled={busy}
          className="gap-1.5"
        >
          {action.cta.label}
          {busy ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <ArrowRightIcon className="size-4" />
          )}
        </Button>
      </fetcher.Form>
    );
  }
  return (
    <Button asChild size={size} variant={variant} className="gap-1.5">
      <Link to={action.cta.href} viewTransition>
        {action.cta.label}
        <ArrowRightIcon className="size-4" />
      </Link>
    </Button>
  );
}

export function NextActionCard({ actions }: { actions: NextAction[] }) {
  if (actions.length === 0) return null;
  const [hero, ...rest] = actions;

  return (
    <Surface tone="default" pad={6}>
      <Eyebrow>다음 행동 · 지금 할 일</Eyebrow>

      {/* 최우선 행동 — 크게. */}
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-block size-2 shrink-0 rounded-full",
                TONE_DOT[hero.tone],
              )}
            />
            <h2 className="text-foreground text-lg font-semibold tracking-tight md:text-xl">
              {hero.title}
            </h2>
          </div>
          <p className="text-ink-soft mt-1 text-sm">{hero.subtitle}</p>
        </div>
        <div className="shrink-0">
          <ActionCta action={hero} primary />
        </div>
      </div>

      {/* 나머지 행동 — 콤팩트 행. */}
      {rest.length > 0 ? (
        <ul className="border-border/60 mt-4 flex flex-col gap-2.5 border-t pt-4">
          {rest.map((a) => (
            <li
              key={a.key}
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "inline-block size-2 shrink-0 rounded-full",
                    TONE_DOT[a.tone],
                  )}
                />
                <div className="min-w-0">
                  <p className="text-foreground truncate text-sm font-medium">
                    {a.title}
                  </p>
                  <p className="text-ink-soft truncate text-xs">{a.subtitle}</p>
                </div>
              </div>
              <div className="shrink-0">
                <ActionCta action={a} primary={false} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {/* 오늘 화면 전체 보기 — 기존 입구 보존. */}
      <div className="mt-4">
        <Link
          to="/study/today"
          className="text-link text-xs font-medium hover:underline"
          viewTransition
        >
          오늘 화면 전체 보기 →
        </Link>
      </div>
    </Surface>
  );
}
