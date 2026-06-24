// feat-6-010 반별 게시판 — 학생·강사 게시판 목록(소속 반 게시판 합집합). RLS 가 접근 가능한 board 만 반환.
import { LayersIcon, MessageSquareIcon } from "lucide-react";
import { Link, redirect } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { Chip, EmptyState } from "~/features/community/components/community-ui";

import { CohortBoardShell } from "../components/cohort-board-shell";
import { WRITE_SCOPE_SHORT } from "../labels";
import { listAccessibleBoards } from "../queries.server";

import type { Route } from "./+types/cohort-board-list";

export const meta: Route.MetaFunction = () => [
  { title: "반별 게시판 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const boards = await listAccessibleBoards(client);
  return { boards };
}

export default function CohortBoardList({ loaderData }: Route.ComponentProps) {
  const { boards } = loaderData;
  return (
    <CohortBoardShell title="반별 게시판" desc="내가 속한 반의 게시판입니다.">
      {boards.length === 0 ? (
        <EmptyState
          icon={LayersIcon}
          tone="subdued"
          title="게시판이 없습니다"
          body="아직 소속된 반의 게시판이 없습니다. 반에 배정되면 여기에 표시됩니다."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {boards.map((b) => (
            <li key={b.boardId}>
              <Link
                to={`/cohort-boards/${b.boardId}`}
                viewTransition
                className="border-border bg-card hover:border-primary/30 block rounded-2xl border p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <Chip tone={b.writeScope === "staff" ? "amber" : "primary"}>
                    {WRITE_SCOPE_SHORT[b.writeScope]}
                  </Chip>
                  <span className="text-muted-foreground ml-auto inline-flex items-center gap-1 text-[11px] tabular-nums">
                    <MessageSquareIcon className="size-3" /> {b.postCount}
                  </span>
                </div>
                <p className="text-[15px] leading-snug font-bold tracking-tight">
                  {b.title}
                </p>
                {b.description ? (
                  <p className="text-muted-foreground mt-1 line-clamp-2 text-[13px]">
                    {b.description}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </CohortBoardShell>
  );
}
