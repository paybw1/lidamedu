// feat-6-011 고객센터 — 학생 문의 목록(/support). 내 문의 + 공개 문의(FAQ). RLS 가시성.
import { LockIcon, MessageCircleQuestionIcon, PlusIcon } from "lucide-react";
import { Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { CohortBoardShell } from "~/features/cohort-boards/components/cohort-board-shell";
import makeServerClient from "~/core/lib/supa-client.server";

import {
  CS_CATEGORY_LABEL,
  CS_STATUS_LABEL,
  type CsStatus,
} from "../labels";
import { listInquiries, type CsInquiryRow } from "../queries.server";

import type { Route } from "./+types/support-list";

export function meta() {
  return [{ title: "고객센터 | 리담변리사학원" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data(null, { status: 401 });
  const rows = await listInquiries(client);
  const mine = rows.filter((r) => r.authorId === user.id);
  const others = rows.filter((r) => r.authorId !== user.id); // 공개 문의(비공개는 RLS 로 이미 제외)
  return { mine, others };
}

const STATUS_VARIANT: Record<CsStatus, "default" | "secondary" | "outline"> = {
  open: "outline",
  answered: "default",
  closed: "secondary",
};

function InquiryRow({ it, mine }: { it: CsInquiryRow; mine: boolean }) {
  return (
    <li>
      <Link
        to={`/lecture/support/${it.inquiryId}`}
        className="hover:bg-muted/40 flex items-center gap-3 px-4 py-3"
      >
        <span className="text-muted-foreground w-12 shrink-0 text-xs tabular-nums">
          #{it.displayNo}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {it.isPrivate ? (
              <LockIcon className="text-muted-foreground size-3 shrink-0" />
            ) : null}
            <span className="truncate text-sm font-medium">{it.title}</span>
          </span>
          <span className="text-muted-foreground mt-0.5 flex items-center gap-2 text-[11px]">
            <span>{CS_CATEGORY_LABEL[it.category]}</span>
            <span>·</span>
            <span>{it.createdAt.slice(0, 10)}</span>
            {it.replyCount > 0 ? <span>· 답글 {it.replyCount}</span> : null}
          </span>
        </span>
        {mine ? (
          <Badge variant={STATUS_VARIANT[it.status]} className="shrink-0 text-[11px]">
            {CS_STATUS_LABEL[it.status]}
          </Badge>
        ) : (
          <Badge variant="secondary" className="shrink-0 text-[11px]">
            공개
          </Badge>
        )}
      </Link>
    </li>
  );
}

export default function SupportList({ loaderData }: Route.ComponentProps) {
  const { mine, others } = loaderData;
  return (
    <CohortBoardShell
      title="고객센터"
      desc="결제·수강·교재·계정·사이트 이용 등 궁금한 점을 문의하세요. 운영자가 답변드립니다."
      width="narrow"
      headerRight={
        <Button asChild size="sm">
          <Link to="/lecture/support/new">
            <PlusIcon className="size-4" /> 문의하기
          </Link>
        </Button>
      }
    >
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-bold">내 문의</h2>
        {mine.length === 0 ? (
          <div className="border-border text-muted-foreground rounded-xl border border-dashed py-10 text-center text-sm">
            <MessageCircleQuestionIcon className="mx-auto mb-2 size-6 opacity-40" />
            아직 남긴 문의가 없습니다.
          </div>
        ) : (
          <ul className="divide-border bg-card divide-y rounded-xl border">
            {mine.map((it) => (
              <InquiryRow key={it.inquiryId} it={it} mine />
            ))}
          </ul>
        )}
      </section>

      {others.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-bold">공개된 문의</h2>
          <ul className="divide-border bg-card divide-y rounded-xl border">
            {others.map((it) => (
              <InquiryRow key={it.inquiryId} it={it} mine={false} />
            ))}
          </ul>
        </section>
      ) : null}
    </CohortBoardShell>
  );
}
