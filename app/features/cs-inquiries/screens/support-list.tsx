// feat-6-011 고객센터 — 학생 문의 목록(/support). 내 문의 + 공개 문의(FAQ). RLS 가시성.
import { LockIcon, MessageCircleQuestionIcon, PlusIcon } from "lucide-react";
import { Link } from "react-router";

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
  // ★비로그인도 연다(feat-11-012 P3) — 상단 메뉴에 상시 노출돼 처음 온 사람이 먼저 누르는
  //   자리인데 종전에는 401 오류 화면이었다. 랜딩의 진입점 3곳(FAQ 하단·최종 CTA·오시는 길)이
  //   전부 여기로 온다. 접근통제는 RLS 가 강제한다 — 비공개 문의는 애초에 내려오지 않는다.
  const rows = await listInquiries(client);
  const mine = user ? rows.filter((r) => r.authorId === user.id) : [];
  const others = user
    ? rows.filter((r) => r.authorId !== user.id)
    : rows; // 비로그인에게는 RLS 가 걸러 준 공개 문의만 남는다
  return { mine, others, isAuthed: !!user };
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
  const { mine, others, isAuthed } = loaderData;
  return (
    <CohortBoardShell
      title="고객센터"
      desc="결제·수강·교재·계정·사이트 이용 등 궁금한 점을 문의하세요. 운영자가 답변드립니다."
      width="narrow"
      headerRight={
        <Button asChild size="sm">
          <Link to={isAuthed ? "/lecture/support/new" : "/login"}>
            <PlusIcon className="size-4" />{" "}
            {isAuthed ? "문의하기" : "로그인하고 문의하기"}
          </Link>
        </Button>
      }
    >
      {/* 자주 묻는 질문(FAQ)은 랜딩(/lecture/home) 하단으로 이동. 여기서는 문의만. */}
      {isAuthed ? (
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
      ) : null}

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
