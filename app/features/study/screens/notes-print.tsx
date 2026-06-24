// 포스트잇(메모) "복습 정리본" — 인쇄 → PDF 저장. 공용 StudyPrintShell 사용.

import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { listAllMemos } from "~/features/annotations/queries.server";
import {
  StudyPrintShell,
  SubjectGroupHeading,
  groupBySubject,
} from "~/features/study/components/study-print-shell";
import { getPrintWatermark } from "~/features/study/queries-print.server";

import type { Route } from "./+types/notes-print";

type MemoItem = Awaited<ReturnType<typeof listAllMemos>>[number];

export const meta: Route.MetaFunction = () => [
  { title: "포스트잇 복습 정리본 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const [items, watermark] = await Promise.all([
    listAllMemos(client, user.id),
    getPrintWatermark(client, user.id),
  ]);
  return data({ items, watermark }, { headers });
}

export default function NotesPrint({ loaderData }: Route.ComponentProps) {
  const { items, watermark } = loaderData;
  const groups = groupBySubject(items);

  return (
    <StudyPrintShell
      docTitle="포스트잇 복습 정리본"
      subtitle={`전체 과목 · 포스트잇 ${items.length}개 (최근 수정 순)`}
      watermark={watermark}
      empty={items.length === 0}
      emptyText="포스트잇이 없습니다."
    >
      {groups.map((g) => (
        <div key={g.key} className="mb-5">
          <SubjectGroupHeading name={g.name} count={g.items.length} />
          <div className="space-y-3">
            {g.items.map((m) => (
              <MemoBlock key={m.memoId} item={m} />
            ))}
          </div>
        </div>
      ))}
    </StudyPrintShell>
  );
}

function MemoBlock({ item }: { item: MemoItem }) {
  return (
    <article className="pb-avoid rounded-md border border-neutral-200 p-4">
      <div className="mb-1 text-[15px] font-bold tracking-tight text-neutral-800">
        {item.primaryLabel}
      </div>
      {item.secondaryLabel ? (
        <p className="text-xs text-neutral-500">{item.secondaryLabel}</p>
      ) : null}
      {item.snippet ? (
        <div className="mt-1.5 border-l-2 border-neutral-200 py-1 pl-3 text-[12px] leading-relaxed text-neutral-500">
          {item.snippet}
        </div>
      ) : null}
      <div className="mt-2 border-l-2 border-neutral-400 py-1 pl-3 text-[13.5px] leading-relaxed whitespace-pre-line text-neutral-800">
        {item.bodyMd}
      </div>
    </article>
  );
}
