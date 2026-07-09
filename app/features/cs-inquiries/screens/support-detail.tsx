// feat-6-011 고객센터 — 문의 상세(/support/:id). 문의+답글 스레드 + 답글/종료. 학생·staff 공용.
import { CheckCircle2Icon, LockIcon, ShieldCheckIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { data, useFetcher } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { CohortBoardShell } from "~/features/cohort-boards/components/cohort-board-shell";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { MarkdownView } from "~/features/problems/components/markdown-view";

import { CS_CATEGORY_LABEL, CS_STATUS_LABEL } from "../labels";
import { getInquiryDetail } from "../queries.server";

import type { Route } from "./+types/support-detail";

export function meta({ data: d }: Route.MetaArgs) {
  return [{ title: `${d?.inquiry?.title ?? "문의"} | 고객센터` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data(null, { status: 401 });
  if (!params.inquiryId) throw data("Not found", { status: 404 });
  const inquiry = await getInquiryDetail(client, params.inquiryId);
  if (!inquiry) throw data("문의를 찾을 수 없습니다", { status: 404 });
  const isStaff = (await getStaffRole(client, user.id)) !== null;
  return { inquiry, isStaff, isAuthor: inquiry.authorId === user.id };
}

const API = "/api/cs/inquiry";

export default function SupportDetail({ loaderData }: Route.ComponentProps) {
  const { inquiry, isStaff, isAuthor } = loaderData;
  const replyFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (replyFetcher.state === "idle" && replyFetcher.data?.ok) {
      formRef.current?.reset();
    }
  }, [replyFetcher.state, replyFetcher.data]);
  const canReply = (isStaff || isAuthor) && inquiry.status !== "closed";

  return (
    <CohortBoardShell
      title={
        <span className="flex items-center gap-2">
          {inquiry.isPrivate ? (
            <LockIcon className="text-muted-foreground size-4" />
          ) : null}
          {inquiry.title}
        </span>
      }
      desc={
        <span className="flex items-center gap-2 text-xs">
          <span>#{inquiry.displayNo}</span>
          <span>·</span>
          <span>{CS_CATEGORY_LABEL[inquiry.category]}</span>
          <span>·</span>
          <span>{inquiry.createdAt.slice(0, 10)}</span>
          <Badge
            variant={inquiry.status === "answered" ? "default" : "outline"}
            className="ml-1 text-[11px]"
          >
            {CS_STATUS_LABEL[inquiry.status]}
          </Badge>
        </span>
      }
      width="narrow"
      backLink={{
        to: isStaff ? "/admin/cs-inquiries" : "/lecture/support",
        label: isStaff ? "문의 관리" : "고객센터",
      }}
    >
      {/* 문의 본문 */}
      <article className="bg-card rounded-xl border p-4">
        <MarkdownView
          text={inquiry.bodyMd}
          trusted={false}
          className="text-sm leading-relaxed"
        />
      </article>

      {/* 답글 스레드 */}
      {inquiry.replies.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {inquiry.replies.map((r) => (
            <li
              key={r.replyId}
              className={
                r.role === "staff"
                  ? "border-primary/30 bg-primary/5 rounded-xl border p-4"
                  : "bg-muted/40 rounded-xl border p-4"
              }
            >
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold">
                {r.role === "staff" ? (
                  <>
                    <ShieldCheckIcon className="text-primary size-3.5" /> 운영자
                  </>
                ) : (
                  "작성자"
                )}
                <span className="text-muted-foreground font-normal">
                  {r.createdAt.slice(0, 10)}
                </span>
              </p>
              <MarkdownView
                text={r.bodyMd}
                trusted={false}
                className="text-sm leading-relaxed"
              />
            </li>
          ))}
        </ul>
      ) : null}

      {/* 답글 작성 */}
      {canReply ? (
        <replyFetcher.Form
          ref={formRef}
          method="post"
          action={API}
          className="mt-4 flex flex-col gap-2"
        >
          <input type="hidden" name="intent" value="reply" />
          <input type="hidden" name="inquiryId" value={inquiry.inquiryId} />
          <textarea
            name="bodyMd"
            required
            maxLength={20000}
            rows={4}
            placeholder={isStaff ? "답변을 입력하세요" : "추가 문의를 입력하세요"}
            className="border-input bg-background rounded-md border px-3 py-2 text-sm leading-relaxed"
          />
          {replyFetcher.data?.error ? (
            <p className="text-xs text-rose-600">{replyFetcher.data.error}</p>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={replyFetcher.state !== "idle"}>
              {isStaff ? "답변 등록" : "추가 문의"}
            </Button>
          </div>
        </replyFetcher.Form>
      ) : inquiry.status === "closed" ? (
        <p className="text-muted-foreground mt-4 flex items-center gap-1.5 text-xs">
          <CheckCircle2Icon className="size-3.5" /> 종료된 문의입니다.
        </p>
      ) : null}

      {/* 상태·삭제 */}
      {isStaff || isAuthor ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
          {inquiry.status !== "closed" ? (
            <StatusButton
              inquiryId={inquiry.inquiryId}
              intent="close"
              label="문의 종료"
            />
          ) : (
            <StatusButton
              inquiryId={inquiry.inquiryId}
              intent="reopen"
              label="문의 재개"
            />
          )}
          <StatusButton
            inquiryId={inquiry.inquiryId}
            intent="delete"
            label="삭제"
            danger
          />
        </div>
      ) : null}
    </CohortBoardShell>
  );
}

function StatusButton({
  inquiryId,
  intent,
  label,
  danger,
}: {
  inquiryId: string;
  intent: "close" | "reopen" | "delete";
  label: string;
  danger?: boolean;
}) {
  const fetcher = useFetcher();
  return (
    <fetcher.Form
      method="post"
      action={API}
      onSubmit={(e) => {
        if (intent === "delete" && !confirm("이 문의를 삭제할까요?")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <Button
        type="submit"
        size="sm"
        variant={danger ? "ghost" : "outline"}
        className={danger ? "text-rose-600 hover:text-rose-700" : undefined}
        disabled={fetcher.state !== "idle"}
      >
        {label}
      </Button>
    </fetcher.Form>
  );
}
