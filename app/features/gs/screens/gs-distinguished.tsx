// 학생 — 회차 우수 답안 모음.
// 공개(is_published=true) 마킹된 답안만. 작성자 이름은 익명/공개 옵션에 따라.
// 답안 페이지는 admin client 로 signed URL 발급 (peer-review 와 동일 패턴).

import { ArrowLeftIcon, AwardIcon, CrownIcon, EyeIcon } from "lucide-react";
import { Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Separator } from "~/core/components/ui/separator";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
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
      ? `${loaderData.round.title} 우수 답안 | Lidam Edu`
      : "우수 답안 | Lidam Edu",
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
    <div className="mx-auto w-full max-w-screen-lg px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <Link
          to={`/gs/${round.roundId}/result`}
          className="text-muted-foreground inline-flex items-center gap-1 text-xs hover:underline"
        >
          <ArrowLeftIcon className="size-3" /> 내 결과로
        </Link>
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <AwardIcon className="size-3.5" /> 우수 답안
        </p>
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">
          {round.title}
        </h1>
        <p className="text-muted-foreground text-sm">
          {LAW_SUBJECTS[round.subject]?.name ?? round.subject}
          {round.roundNumber ? ` · ${round.roundNumber}회` : ""} · 운영자가
          공개한 우수 답안
        </p>
      </header>

      {items.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            아직 공개된 우수 답안이 없습니다.
          </CardContent>
        </Card>
      ) : null}

      {roundItems.length > 0 ? (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CrownIcon className="text-amber-500 size-5" />
              <h2 className="text-sm font-semibold tracking-tight">
                회차 종합 우수자 ({roundItems.length}명)
              </h2>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {roundItems.map((it) => (
              <DistinguishedItem key={it.distinction.distinctionId} item={it} />
            ))}
          </CardContent>
        </Card>
      ) : null}

      {questions.map((q) => {
        const list = byQuestion.get(q.questionId) ?? [];
        if (list.length === 0) return null;
        return (
          <Card key={q.questionId} className="mb-6">
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  #{q.orderIndex + 1}
                </Badge>
                <h2 className="text-sm font-semibold tracking-tight">
                  {q.title ?? `문 ${q.orderIndex + 1}`}
                </h2>
                <Badge variant="secondary" className="text-[10px]">
                  {q.maxScore}점 만점
                </Badge>
                <Badge variant="outline" className="ml-auto text-[10px]">
                  우수 {list.length}명
                </Badge>
              </div>
            </CardHeader>
            <Separator />
            <CardContent className="space-y-4 pt-4">
              <div className="bg-muted/30 rounded-md border p-3">
                <p className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase mb-1">
                  문제
                </p>
                <p className="font-serif text-sm leading-relaxed whitespace-pre-line">
                  {q.bodyMd}
                </p>
              </div>
              {q.modelAnswerMd ? (
                <div className="bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-700/40 rounded-md border p-3">
                  <p className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase mb-1">
                    모범답안
                  </p>
                  <p className="font-serif text-sm leading-relaxed whitespace-pre-line">
                    {q.modelAnswerMd}
                  </p>
                </div>
              ) : null}
              {list.map((it) => (
                <DistinguishedItem
                  key={it.distinction.distinctionId}
                  item={it}
                />
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function DistinguishedItem({ item }: { item: Item }) {
  return (
    <div
      data-testid={`distinguished-${item.distinction.distinctionId}`}
      className="bg-amber-50/40 dark:bg-amber-950/15 border-amber-200/60 dark:border-amber-700/30 rounded-md border p-3"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge className="bg-amber-500 text-white text-[10px] hover:bg-amber-500">
          <CrownIcon className="size-3" /> 우수
        </Badge>
        {item.authorName ? (
          <span className="text-foreground text-sm font-semibold">
            {item.authorName}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs italic">
            익명 답안
          </span>
        )}
        {item.distinction.reason ? (
          <span className="text-muted-foreground text-[11px]">
            · {item.distinction.reason}
          </span>
        ) : null}
        <span className="text-muted-foreground ml-auto text-[10px] tabular-nums">
          +{item.distinction.pointsAwarded}P
        </span>
      </div>
      <div className="space-y-2">
        {item.pages.map((p) => {
          const isImage = p.attachment.mime.startsWith("image/");
          return (
            <div
              key={`${p.pageNumber}-${p.attachment.path}`}
              className="bg-background rounded border p-2"
            >
              <div className="flex items-center gap-2 text-[11px]">
                <Badge variant="outline" className="text-[10px]">
                  페이지 {p.pageNumber}
                </Badge>
                <span className="text-muted-foreground">
                  ({p.attachment.mime.split("/")[1]?.toUpperCase() ?? "FILE"})
                </span>
                {p.signedUrl ? (
                  <a
                    href={p.signedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary ml-auto inline-flex items-center gap-0.5 hover:underline"
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
                  className="mt-2 max-h-[480px] w-full rounded border object-contain bg-background"
                />
              ) : !isImage && p.signedUrl ? (
                <a
                  href={p.signedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-background hover:bg-muted mt-2 block rounded border p-3 text-center text-xs"
                >
                  PDF 풀사이즈 열기
                </a>
              ) : null}
            </div>
          );
        })}
        {item.ocrTexts.length > 0 ? (
          <details className="bg-background rounded border p-2">
            <summary className="text-muted-foreground cursor-pointer text-[11px]">
              OCR 텍스트 펼치기
            </summary>
            <p className="mt-2 whitespace-pre-line font-mono text-[11px] leading-snug">
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
