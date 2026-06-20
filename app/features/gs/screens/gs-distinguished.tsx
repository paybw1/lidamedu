// 학생 — 회차 우수 답안 모음.
// 공개(is_published=true) 마킹된 답안만. 작성자 이름은 익명/공개 옵션에 따라.
// 답안 페이지는 admin client 로 signed URL 발급 (peer-review 와 동일 패턴).

import { AwardIcon, CrownIcon, EyeIcon } from "lucide-react";
import { data } from "react-router";

import { Card, CardContent } from "~/core/components/ui/card";
import { cn } from "~/core/lib/utils";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { MockExamShell } from "~/features/mcq-exams/components/mock-exam-shell";
import {
  Chip,
  EmptyState,
  Section,
} from "~/features/community/components/community-ui";
import {
  type GsAttachment,
  type GsQuestion,
  getGsRound,
  listGsQuestions,
} from "~/features/gs/queries.server";
import { listPublishedDistinctionsForRound } from "~/features/gs/queries-distinctions.server";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/gs-distinguished";

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
  {
    title: loaderData?.round
      ? `${loaderData.round.title} 우수 답안 | Lidam Patent Attorney Academy`
      : "우수 답안 | Lidam Patent Attorney Academy",
  },
];

interface PageItem {
  pageNumber: number;
  attachment: GsAttachment;
  signedUrl: string | null;
}

interface Item {
  kind: "round" | "question";
  distinction: Awaited<
    ReturnType<typeof listPublishedDistinctionsForRound>
  >[number];
  questionId: string | null;
  pages: PageItem[];
  ocrTexts: string[];
  authorName: string | null;
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const roundId = params.roundId;
  if (!roundId) throw data("Missing roundId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const round = await getGsRound(client, roundId);
  if (!round) throw data("Round not found", { status: 404 });

  const distinctions = await listPublishedDistinctionsForRound(client, roundId);
  if (distinctions.length === 0) {
    return {
      round,
      questions: [] as GsQuestion[],
      items: [] as Item[],
    };
  }

  const questions = await listGsQuestions(client, roundId);

  // 답안지 페이지 + 매핑 + 작성자 이름 lookup (admin client 우회).
  const submissionIds = Array.from(
    new Set(distinctions.map((d) => d.submissionId)),
  );
  const { data: pageRows } = await adminClient
    .from("gs_submission_pages")
    .select("submission_id, page_number, attachment")
    .in("submission_id", submissionIds);
  const { data: mapRows } = await adminClient
    .from("gs_question_pages")
    .select("submission_id, question_id, page_number, order_index")
    .in("submission_id", submissionIds);
  const { data: subRows } = await adminClient
    .from("gs_submissions")
    .select("submission_id, user_id")
    .in("submission_id", submissionIds);

  const subUser = new Map<string, string>();
  for (const s of subRows ?? []) subUser.set(s.submission_id, s.user_id);
  const userIds = Array.from(new Set([...subUser.values()]));
  const { data: profiles } = await adminClient
    .from("profiles")
    .select("profile_id, name")
    .in("profile_id", userIds);
  const nameByUser = new Map<string, string | null>();
  for (const p of profiles ?? []) nameByUser.set(p.profile_id, p.name);

  // (submission, page) → attachment.
  const pageByKey = new Map<string, GsAttachment>();
  for (const r of pageRows ?? []) {
    const att = parseSingleAttachment(r.attachment);
    if (att) pageByKey.set(`${r.submission_id}:${r.page_number}`, att);
  }
  // (submission, question) → page numbers (order_index 순).
  const pagesByQ = new Map<string, number[]>();
  for (const m of (mapRows ?? []).slice().sort((a, b) => a.order_index - b.order_index)) {
    const key = `${m.submission_id}:${m.question_id}`;
    const arr = pagesByQ.get(key) ?? [];
    arr.push(m.page_number);
    pagesByQ.set(key, arr);
  }

  const signUrl = async (path: string): Promise<string | null> => {
    const { data: url } = await adminClient.storage
      .from("gs-answers")
      .createSignedUrl(path, 600);
    return url?.signedUrl ?? null;
  };

  const items: Item[] = [];
  for (const d of distinctions) {
    const uid = subUser.get(d.submissionId);
    const authorName = !d.isAnonymous && uid ? nameByUser.get(uid) ?? null : null;

    if (d.questionId) {
      const pageNums = pagesByQ.get(`${d.submissionId}:${d.questionId}`) ?? [];
      const pages: PageItem[] = [];
      const ocrParts: string[] = [];
      for (const n of pageNums) {
        const att = pageByKey.get(`${d.submissionId}:${n}`);
        if (!att) continue;
        const url = await signUrl(att.path);
        pages.push({ pageNumber: n, attachment: att, signedUrl: url });
        if (att.ocrText) ocrParts.push(att.ocrText);
      }
      items.push({
        kind: "question",
        distinction: d,
        questionId: d.questionId,
        pages,
        ocrTexts: ocrParts,
        authorName,
      });
    } else {
      // 회차 종합 — 답안지 모든 페이지(매핑 무관, 페이지 번호 순).
      const allNums = (pageRows ?? [])
        .filter((r) => r.submission_id === d.submissionId)
        .map((r) => r.page_number)
        .sort((a, b) => a - b);
      const pages: PageItem[] = [];
      const ocrParts: string[] = [];
      for (const n of allNums) {
        const att = pageByKey.get(`${d.submissionId}:${n}`);
        if (!att) continue;
        const url = await signUrl(att.path);
        pages.push({ pageNumber: n, attachment: att, signedUrl: url });
        if (att.ocrText) ocrParts.push(`[페이지 ${n}] ${att.ocrText}`);
      }
      items.push({
        kind: "round",
        distinction: d,
        questionId: null,
        pages,
        ocrTexts: ocrParts,
        authorName,
      });
    }
  }

  return { round, questions, items };
}

export default function GsDistinguished({ loaderData }: Route.ComponentProps) {
  const { round, questions, items } = loaderData;
  const roundItems = items.filter((it) => it.kind === "round");
  const byQuestion = new Map<string, Item[]>();
  for (const it of items) {
    if (it.questionId) {
      const list = byQuestion.get(it.questionId) ?? [];
      list.push(it);
      byQuestion.set(it.questionId, list);
    }
  }

  return (
    <MockExamShell
      category="gs"
      backLink={{ to: `/gs/${round.roundId}/result`, label: "내 결과" }}
      title={`우수 답안 · ${round.title}`}
      desc={`${LAW_SUBJECTS[round.subject]?.name ?? round.subject}${
        round.roundNumber ? ` · ${round.roundNumber}회` : ""
      } · 회차의 가장 완성도 높은 답안을 모았습니다. 본인 답안과 비교해 보세요.`}
    >
      {items.length === 0 ? (
        <EmptyState
          icon={AwardIcon}
          tone="subdued"
          title="아직 공개된 우수 답안이 없습니다"
          body="운영자가 우수 답안을 공개하면 이곳에 모입니다."
        />
      ) : null}

      {roundItems.length > 0 ? (
        <Section eyebrow={`회차 종합 우수자 (${roundItems.length}명)`}>
          <div className="space-y-2">
            {roundItems.map((it) => (
              <DistinguishedItem
                key={it.distinction.distinctionId}
                item={it}
                prominent
              />
            ))}
          </div>
        </Section>
      ) : null}

      {questions.map((q) => {
        const list = byQuestion.get(q.questionId) ?? [];
        if (list.length === 0) return null;
        return (
          <Section
            key={q.questionId}
            eyebrow="문항별 우수 답안"
            right={<Chip tone="outline">우수 {list.length}명</Chip>}
          >
            <Card>
              <CardContent className="space-y-3.5 py-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone="primary">문 {q.orderIndex + 1}</Chip>
                  <h2 className="text-[15px] font-bold tracking-tight">
                    {q.title ?? `문 ${q.orderIndex + 1}`}
                  </h2>
                  <Chip tone="neutral">{q.maxScore}점 만점</Chip>
                </div>
                <div className="bg-muted/50 rounded-xl border p-3.5">
                  <p className="text-muted-foreground mb-1 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
                    문제
                  </p>
                  <p className="text-foreground/85 text-sm leading-relaxed whitespace-pre-line">
                    {q.bodyMd}
                  </p>
                </div>
                {q.modelAnswerMd ? (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.07] p-3.5">
                    <p className="text-muted-foreground mb-1 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
                      모범답안
                    </p>
                    <p className="text-foreground/85 text-sm leading-relaxed whitespace-pre-line">
                      {q.modelAnswerMd}
                    </p>
                  </div>
                ) : null}
                <div className="space-y-2">
                  {list.map((it) => (
                    <DistinguishedItem
                      key={it.distinction.distinctionId}
                      item={it}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          </Section>
        );
      })}
    </MockExamShell>
  );
}

function DistinguishedItem({
  item,
  prominent = false,
}: {
  item: Item;
  prominent?: boolean;
}) {
  return (
    <div
      data-testid={`distinguished-${item.distinction.distinctionId}`}
      className={cn(
        "rounded-2xl border border-transparent bg-amber-500/[0.12] dark:bg-amber-500/[0.1]",
        prominent ? "p-5" : "p-3.5",
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-center gap-2",
          prominent ? "mb-3" : "mb-2.5",
        )}
      >
        {prominent ? (
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
            <CrownIcon className="size-5" />
          </span>
        ) : (
          <AwardIcon className="size-4 shrink-0 text-amber-500" />
        )}
        <div className="min-w-0 flex-1">
          {prominent ? (
            <Chip tone="amber" className="mb-1">
              <CrownIcon className="size-3" /> 회차 종합 1위
            </Chip>
          ) : null}
          <div className="flex flex-wrap items-baseline gap-1.5">
            {item.authorName ? (
              <span
                className={cn(
                  "font-bold tracking-tight",
                  prominent ? "text-base" : "text-[13px]",
                )}
              >
                {item.authorName}
              </span>
            ) : (
              <span className="text-muted-foreground text-xs italic">
                익명 답안
              </span>
            )}
            {!prominent && item.distinction.reason ? (
              <span className="text-muted-foreground text-[11px]">
                · {item.distinction.reason}
              </span>
            ) : null}
          </div>
        </div>
        <span className="ml-auto inline-flex items-baseline gap-0.5 font-extrabold tabular-nums text-amber-700 dark:text-amber-400">
          <span className={prominent ? "text-2xl" : "text-base"}>
            +{item.distinction.pointsAwarded}
          </span>
          <span className="text-muted-foreground text-xs font-semibold">P</span>
        </span>
      </div>
      {prominent && item.distinction.reason ? (
        <div className="bg-background mb-3 rounded-xl border-l-[3px] border-amber-500 p-3.5">
          <p className="text-foreground/85 text-[13.5px] leading-relaxed">
            <strong className="mr-1.5 font-bold text-amber-700 dark:text-amber-400">
              선정 사유
            </strong>
            {item.distinction.reason}
          </p>
        </div>
      ) : null}
      <div className="space-y-2">
        {item.pages.map((p) => {
          const isImage = p.attachment.mime.startsWith("image/");
          return (
            <div
              key={`${p.pageNumber}-${p.attachment.path}`}
              className="bg-background rounded-xl border p-2"
            >
              <div className="flex items-center gap-2 text-[11px]">
                <Chip tone="outline">페이지 {p.pageNumber}</Chip>
                <span className="text-muted-foreground">
                  ({p.attachment.mime.split("/")[1]?.toUpperCase() ?? "FILE"})
                </span>
                {p.signedUrl ? (
                  <a
                    href={p.signedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-link ml-auto inline-flex items-center gap-0.5 font-semibold hover:underline"
                  >
                    <EyeIcon className="size-3" /> 풀사이즈
                  </a>
                ) : null}
              </div>
              {isImage && p.signedUrl ? (
                <img
                  src={p.signedUrl}
                  alt={`페이지 ${p.pageNumber}`}
                  loading="lazy"
                  className="bg-background mt-2 max-h-[480px] w-full rounded-lg border object-contain"
                />
              ) : !isImage && p.signedUrl ? (
                <a
                  href={p.signedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-background hover:bg-muted mt-2 block rounded-lg border p-3 text-center text-xs font-medium"
                >
                  PDF 풀사이즈 열기
                </a>
              ) : null}
            </div>
          );
        })}
        {item.ocrTexts.length > 0 ? (
          <details className="bg-background rounded-xl border p-2">
            <summary className="text-muted-foreground cursor-pointer text-[11px] font-medium">
              OCR 텍스트 펼치기
            </summary>
            <p className="text-foreground/80 mt-2 font-mono text-[11px] leading-relaxed whitespace-pre-line">
              {item.ocrTexts.join("\n\n---\n\n")}
            </p>
          </details>
        ) : null}
      </div>
    </div>
  );
}

// 단일 첨부 파싱 (queries.server 의 parseAttachment 와 동일하지만 admin-client 직접 쿼리에 인라인).
function parseSingleAttachment(raw: unknown): GsAttachment | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.path !== "string" || typeof o.fileName !== "string") return null;
  const att: GsAttachment = {
    path: o.path,
    fileName: o.fileName,
    mime: typeof o.mime === "string" ? o.mime : "application/octet-stream",
    size: typeof o.size === "number" ? o.size : 0,
    createdAt:
      typeof o.createdAt === "string" ? o.createdAt : new Date().toISOString(),
  };
  if (typeof o.width === "number") att.width = o.width;
  if (typeof o.height === "number") att.height = o.height;
  if (typeof o.ocrText === "string") att.ocrText = o.ocrText;
  if (typeof o.ocrConfidence === "number") att.ocrConfidence = o.ocrConfidence;
  if (o.ocrLevel === "good" || o.ocrLevel === "warn" || o.ocrLevel === "bad") {
    att.ocrLevel = o.ocrLevel;
  }
  return att;
}
