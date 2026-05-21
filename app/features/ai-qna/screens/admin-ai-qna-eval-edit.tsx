// feat-9-005 v1.1 — eval 항목 신규/편집 폼.
// URL:
//   /admin/ai-qna/eval/new                 — 빈 폼
//   /admin/ai-qna/eval/new?fromMessage=xxx — 👎 메시지에서 prefill
//   /admin/ai-qna/eval/:evalItemId          — 편집

import { Loader2Icon, SaveIcon } from "lucide-react";
import { useState } from "react";
import { Form, Link, data, redirect, useNavigation } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import { Textarea } from "~/core/components/ui/textarea";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  createEvalItem,
  getEvalItem,
  getEvalPrefillFromMessage,
  updateEvalItem,
} from "~/features/ai-qna/queries.staff.server";

import type { Route } from "./+types/admin-ai-qna-eval-edit";

export const meta: Route.MetaFunction = () => [
  { title: "AI Q&A eval 항목 | 운영자" },
];

const LAW_OPTIONS = [
  { code: "patent", label: "특허법" },
  { code: "trademark", label: "상표법" },
  { code: "design", label: "디자인보호법" },
  { code: "civil", label: "민법" },
  { code: "civil-procedure", label: "민사소송법" },
];

export async function loader({ params, request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/admin");

  const url = new URL(request.url);
  const fromMessage = url.searchParams.get("fromMessage");

  // 편집 모드 — params.evalItemId 존재.
  if (params.evalItemId) {
    const item = await getEvalItem(params.evalItemId);
    if (!item) throw data("Not found", { status: 404 });
    return { mode: "edit" as const, item, prefill: null };
  }
  // 신규 모드 + fromMessage prefill.
  if (fromMessage) {
    const prefill = await getEvalPrefillFromMessage(fromMessage);
    return { mode: "new" as const, item: null, prefill };
  }
  // 빈 폼.
  return { mode: "new" as const, item: null, prefill: null };
}

export async function action({ params, request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const question = String(fd.get("question") ?? "").trim();
  const referenceAnswer = String(fd.get("referenceAnswer") ?? "").trim();
  if (!question) return data({ error: "질문 필수" }, { status: 400 });
  if (!referenceAnswer)
    return data({ error: "참고 답변 필수" }, { status: 400 });

  const lawCodes = fd.getAll("lawCodes").map((v) => String(v));
  const difficulty = Number(fd.get("difficulty") ?? 3);
  const tags = String(fd.get("tags") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const notes = String(fd.get("notes") ?? "").trim() || null;
  const sourceMessageIdRaw = String(fd.get("sourceMessageId") ?? "").trim();
  const sourceMessageId = sourceMessageIdRaw.length > 0 ? sourceMessageIdRaw : null;

  if (params.evalItemId) {
    const res = await updateEvalItem(params.evalItemId, {
      question,
      referenceAnswer,
      lawCodes,
      difficulty,
      tags,
      notes,
    });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return redirect("/admin/ai-qna/eval");
  }

  const res = await createEvalItem(
    {
      question,
      referenceAnswer,
      lawCodes,
      difficulty,
      tags,
      notes,
      sourceMessageId,
    },
    user.id,
  );
  if (!res.ok) return data({ error: res.error }, { status: 400 });
  return redirect("/admin/ai-qna/eval");
}

export default function AdminAiQnaEvalEdit({ loaderData }: Route.ComponentProps) {
  const { mode, item, prefill } = loaderData;
  const navigation = useNavigation();
  const saving = navigation.state !== "idle";

  const [question, setQuestion] = useState<string>(
    item?.question ?? prefill?.question ?? "",
  );
  const [referenceAnswer, setReferenceAnswer] = useState<string>(
    item?.referenceAnswer ?? "",
  );
  const [lawCodes, setLawCodes] = useState<string[]>(item?.lawCodes ?? []);
  const [difficulty, setDifficulty] = useState<number>(item?.difficulty ?? 3);
  const [tags, setTags] = useState<string>(item?.tags?.join(", ") ?? "");
  const [notes, setNotes] = useState<string>(item?.notes ?? "");

  return (
    <AdminShell title={mode === "edit" ? "eval 편집" : "eval 신규"} cluster="comms">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold tracking-tight">
            {mode === "edit" ? "eval 항목 편집" : "신규 eval 항목"}
          </h1>
          <Button asChild size="sm" variant="ghost" className="rounded-full">
            <Link to="/admin/ai-qna/eval">목록으로</Link>
          </Button>
        </header>

        {prefill ? (
          <div className="border-amber-500/30 bg-amber-500/[0.04] rounded-2xl border p-3 text-xs">
            <p className="text-amber-700 font-semibold dark:text-amber-300">
              👎 메시지에서 prefill
            </p>
            <p className="text-muted-foreground mt-1">
              답변은 강사 정답으로 다시 작성하세요. AI 답변 본문은 참고:
            </p>
            <pre className="text-foreground/70 mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed">
              {prefill.assistantBody.slice(0, 800)}
              {prefill.assistantBody.length > 800 ? "…" : ""}
            </pre>
            {prefill.feedbackNote ? (
              <p className="text-foreground mt-2">
                사용자 사유: <em>{prefill.feedbackNote}</em>
              </p>
            ) : null}
            {prefill.citations.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {prefill.citations.map((c) => (
                  <Badge key={`${c.label}-${c.chunkId}`} variant="outline" className="font-normal text-[10px]">
                    [{c.label}] {c.headingPath || c.sourceType}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <Form method="post" className="space-y-5">
          {prefill ? (
            <input type="hidden" name="sourceMessageId" value={prefill.messageId} />
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="question" className="text-sm font-semibold">
              질문 *
            </Label>
            <Textarea
              id="question"
              name="question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              required
              maxLength={2000}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="referenceAnswer" className="text-sm font-semibold">
              참고 답변 (강사 정답) *
            </Label>
            <Textarea
              id="referenceAnswer"
              name="referenceAnswer"
              value={referenceAnswer}
              onChange={(e) => setReferenceAnswer(e.target.value)}
              rows={8}
              required
              maxLength={8000}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">과목 (다중)</Label>
              <div className="flex flex-wrap gap-1.5">
                {LAW_OPTIONS.map((l) => {
                  const active = lawCodes.includes(l.code);
                  return (
                    <button
                      type="button"
                      key={l.code}
                      onClick={() =>
                        setLawCodes((prev) =>
                          active ? prev.filter((c) => c !== l.code) : [...prev, l.code],
                        )
                      }
                      className={
                        active
                          ? "bg-primary text-primary-foreground rounded-full px-3 py-1 text-xs"
                          : "border-input hover:bg-muted rounded-full border px-3 py-1 text-xs"
                      }
                    >
                      {l.label}
                    </button>
                  );
                })}
              </div>
              {lawCodes.map((c) => (
                <input key={c} type="hidden" name="lawCodes" value={c} />
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="difficulty" className="text-sm font-semibold">
                난이도 (1~5)
              </Label>
              <select
                id="difficulty"
                name="difficulty"
                value={difficulty}
                onChange={(e) => setDifficulty(Number(e.target.value))}
                className="border-input bg-background h-9 w-32 rounded-md border px-2 text-sm"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tags" className="text-sm font-semibold">
              태그 (콤마 구분, 옵션)
            </Label>
            <Input
              id="tags"
              name="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="진보성, 신규성, 조약, ..."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-sm font-semibold">
              평가 메모 (옵션)
            </Label>
            <Textarea
              id="notes"
              name="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="이 항목에서 평가할 포인트 (예: 진보성 판단 기준 3 요소를 모두 언급해야 정답)"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={saving} className="rounded-full">
              {saving ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <SaveIcon className="size-3.5" />
              )}
              {mode === "edit" ? "저장" : "추가"}
            </Button>
            <Button asChild type="button" size="sm" variant="outline" className="rounded-full">
              <Link to="/admin/ai-qna/eval">취소</Link>
            </Button>
          </div>
        </Form>
      </div>
    </AdminShell>
  );
}
