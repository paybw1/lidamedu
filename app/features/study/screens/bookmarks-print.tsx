// 즐겨찾기 "복습 정리본" — 인쇄 → PDF 저장. 공용 StudyPrintShell 사용.

import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { listAllBookmarks } from "~/features/annotations/queries.server";
import {
  StudyPrintShell,
  SubjectGroupHeading,
  groupBySubject,
} from "~/features/study/components/study-print-shell";
import { getPrintWatermark } from "~/features/study/queries-print.server";

import type { Route } from "./+types/bookmarks-print";

type BookmarkItem = Awaited<ReturnType<typeof listAllBookmarks>>[number];

export const meta: Route.MetaFunction = () => [
  { title: "즐겨찾기 복습 정리본 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const [items, watermark] = await Promise.all([
    listAllBookmarks(client, user.id),
    getPrintWatermark(client, user.id),
  ]);
  return data({ items, watermark }, { headers });
}

export default function BookmarksPrint({ loaderData }: Route.ComponentProps) {
  const { items, watermark } = loaderData;
  const groups = groupBySubject(items);

  return (
    <StudyPrintShell
      docTitle="즐겨찾기 복습 정리본"
      subtitle={`전체 과목 · 즐겨찾기 ${items.length}개 (별점 높은 순)`}
      watermark={watermark}
      empty={items.length === 0}
      emptyText="즐겨찾기가 없습니다."
    >
      {groups.map((g) => (
        <div key={g.key} className="mb-5">
          <SubjectGroupHeading name={g.name} count={g.items.length} />
          <div className="space-y-3">
            {g.items.map((b) => (
              <BookmarkBlock key={`${b.targetType}:${b.targetId}`} item={b} />
            ))}
          </div>
        </div>
      ))}
    </StudyPrintShell>
  );
}

function BookmarkBlock({ item }: { item: BookmarkItem }) {
  return (
    <article className="pb-avoid rounded-md border border-neutral-200 p-4">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-bold tracking-tight text-neutral-800">
          {item.primaryLabel}
        </span>
        <span className="shrink-0 text-xs text-amber-500">
          {"★".repeat(Math.max(1, item.starLevel))}
        </span>
      </div>
      {item.secondaryLabel ? (
        <p className="text-xs text-neutral-500">{item.secondaryLabel}</p>
      ) : null}
      {item.bodySnippet ? (
        <p className="mt-1 text-[13px] leading-relaxed text-neutral-700">
          {item.bodySnippet}
        </p>
      ) : null}
      {item.notePreview ? (
        <div className="mt-2 border-l-2 border-neutral-300 py-1 pl-3 text-[12px] leading-relaxed text-neutral-600">
          <span className="mr-1 font-bold">메모</span>
          {item.notePreview}
        </div>
      ) : null}
    </article>
  );
}
