// 하이라이트 "복습 정리본" — 인쇄 → PDF 저장. 공용 StudyPrintShell 사용.

import { data } from "react-router";

import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { highlightColorLabel, type HighlightColor } from "~/features/annotations/labels";
import {
  getHighlightColorAliases,
  listAllHighlights,
} from "~/features/annotations/queries.server";
import {
  StudyPrintShell,
  SubjectGroupHeading,
  groupBySubject,
} from "~/features/study/components/study-print-shell";
import { getPrintWatermark } from "~/features/study/queries-print.server";

import type { Route } from "./+types/highlights-print";

type HighlightItem = Awaited<ReturnType<typeof listAllHighlights>>[number];
type ColorAliases = Awaited<ReturnType<typeof getHighlightColorAliases>>;

// 색상별 좌측 라인 — 잉크 절약 위해 배경 채움 대신 테두리만.
const BAR: Record<HighlightColor, string> = {
  yellow: "border-amber-400",
  green: "border-emerald-500",
  red: "border-rose-400",
  blue: "border-sky-400",
  underline: "border-neutral-400",
};

// 문맥 속 하이라이트 표시 — 하이라이트 부분만 옅은 색(작은 면적이라 잉크 부담 적음).
const MARK: Record<HighlightColor, string> = {
  yellow: "bg-amber-200/70",
  green: "bg-emerald-200/70",
  red: "bg-rose-200/70",
  blue: "bg-sky-200/70",
  underline: "underline decoration-2 underline-offset-2",
};

export const meta: Route.MetaFunction = () => [
  { title: "하이라이트 복습 정리본 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const [items, aliases, watermark] = await Promise.all([
    listAllHighlights(client, user.id),
    getHighlightColorAliases(client, user.id),
    getPrintWatermark(client, user.id),
  ]);
  return data({ items, aliases, watermark }, { headers });
}

export default function HighlightsPrint({ loaderData }: Route.ComponentProps) {
  const { items, aliases, watermark } = loaderData;
  const groups = groupBySubject(items);

  return (
    <StudyPrintShell
      docTitle="하이라이트 복습 정리본"
      subtitle={`전체 과목 · 하이라이트 ${items.length}개 (최근 작성 순)`}
      watermark={watermark}
      empty={items.length === 0}
      emptyText="하이라이트가 없습니다."
    >
      {groups.map((g) => (
        <div key={g.key} className="mb-5">
          <SubjectGroupHeading name={g.name} count={g.items.length} />
          <div className="space-y-3">
            {g.items.map((h) => (
              <HighlightBlock key={h.highlightId} item={h} aliases={aliases} />
            ))}
          </div>
        </div>
      ))}
    </StudyPrintShell>
  );
}

function HighlightBlock({
  item,
  aliases,
}: {
  item: HighlightItem;
  aliases: ColorAliases;
}) {
  return (
    <article className="pb-avoid rounded-md border border-neutral-200 p-4">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-bold tracking-tight text-neutral-800">
          {item.primaryLabel}
        </span>
        <span className="shrink-0 rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-500">
          {highlightColorLabel(item.color, aliases)}
        </span>
      </div>
      {item.secondaryLabel ? (
        <p className="text-xs text-neutral-500">{item.secondaryLabel}</p>
      ) : null}
      {item.bodySnippet ? (
        <p className="mt-1 text-[12px] leading-relaxed text-neutral-500">
          {item.bodySnippet}
        </p>
      ) : null}
      <div className={cn("mt-2 border-l-2 py-1 pl-3", BAR[item.color])}>
        {item.excerpt || item.beforeCtx || item.afterCtx ? (
          <p className="text-sm leading-relaxed text-neutral-700">
            {item.beforeCtx ? (
              <span className="text-neutral-400">…{item.beforeCtx}</span>
            ) : null}
            <mark
              className={cn(
                "rounded-sm px-0.5 font-semibold text-neutral-900",
                MARK[item.color],
              )}
              style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
            >
              {item.excerpt || "(발췌 없음)"}
            </mark>
            {item.afterCtx ? (
              <span className="text-neutral-400">{item.afterCtx}…</span>
            ) : null}
          </p>
        ) : (
          <span className="text-[13px] text-neutral-400 italic">
            (발췌 텍스트 없음)
          </span>
        )}
      </div>
    </article>
  );
}
