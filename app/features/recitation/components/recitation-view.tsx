// 암기 모드 — 조/항/호/목 + 소제목 골격을 유지하면서 본문은 학생이 직접 입력.
// 자판 입력 + 음성(Speech Recognition, ko-KR) 양쪽 지원. 입력값과 정답(cumulative inline text)
// 의 유사도를 실시간으로 계산해 시각화하고, "확인" 버튼으로 attempt 를 batch 저장.

import {
  CheckCircle2Icon,
  EyeIcon,
  EyeOffIcon,
  MicIcon,
  MicOffIcon,
  RotateCcwIcon,
  SaveIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { useVoiceRecognition } from "~/core/hooks/use-voice-recognition";
import { cn } from "~/core/lib/utils";
import type { ArticleBody, Block, Inline } from "~/features/laws/lib/article-body";

import {
  RECITATION_PASS_THRESHOLD,
  computeSimilarity,
  isRecitationComplete,
} from "../lib/similarity";

interface RecitationBlock {
  blockIndex: number;
  label: string; // ① / 1. / 가. 등
  subtitle: string | null;
  expectedText: string;
  depth: number;
}

interface Props {
  articleId: string;
  articleLabel: string;
  body: ArticleBody;
}

export function RecitationView({ articleId, articleLabel, body }: Props) {
  const fetcher = useFetcher();
  const [inputs, setInputs] = useState<Record<number, string>>({});
  const [reveal, setReveal] = useState(false);
  const [activeVoiceIdx, setActiveVoiceIdx] = useState<number | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const textareaRefs = useRef<Map<number, HTMLTextAreaElement>>(new Map());

  // walkBlocks pre-order 와 정합되는 bi(block_index) 를 계산하면서 학생이 외울 block 만 추출.
  // 추출 대상:
  //   - clause / item / sub: 법조문의 일반 구조 (조-항-호-목)
  //   - para: 항/호/목이 없는 단순 조문 (예: 제1조 목적) — body 가 para 로만 구성된 경우
  // 제외:
  //   - amendment_note 만 포함된 para (메타) → expectedText 가 빈 문자열이라 skip
  //   - header_refs / title_marker / sub_article_group: 외울 대상 아님 (단 sub_article_group 안의
  //     preface / sub-article 의 clause 등은 재귀로 진입)
  // bi 는 walkBlocks 와 정합되도록 모든 block 마다 증가.
  const recitationBlocks = useMemo<RecitationBlock[]>(() => {
    const out: RecitationBlock[] = [];
    let bi = 0;
    const visit = (blocks: Block[], depth: number) => {
      for (const block of blocks) {
        const myBi = bi;
        bi++;
        if (
          block.kind === "clause" ||
          block.kind === "item" ||
          block.kind === "sub"
        ) {
          const expected = block.inline.map(inlineCumulativeText).join("");
          out.push({
            blockIndex: myBi,
            label: block.label,
            subtitle: block.subtitle ?? null,
            expectedText: expected,
            depth,
          });
          visit(block.children, depth + 1);
        } else if (block.kind === "para") {
          const expected = block.inline.map(inlineCumulativeText).join("");
          if (expected.trim().length > 0) {
            out.push({
              blockIndex: myBi,
              label: "본문",
              subtitle: null,
              expectedText: expected,
              depth,
            });
          }
          // para 는 children 없음.
        } else if (block.kind === "sub_article_group") {
          if (block.preface) visit(block.preface, depth);
          for (const sa of block.articles) {
            visit(sa.blocks, depth);
          }
        }
        // header_refs / title_marker — bi 만 증가, push 안 함.
      }
    };
    visit(body.blocks, 0);
    return out;
  }, [body]);

  const setInputAt = useCallback((blockIndex: number, value: string) => {
    setInputs((prev) => ({ ...prev, [blockIndex]: value }));
  }, []);

  // 음성 인식 — final transcript 가 들어올 때마다 active textarea 에 append.
  const voice = useVoiceRecognition({
    lang: "ko-KR",
    onFinal: (text) => {
      if (activeVoiceIdx === null) return;
      setInputs((prev) => ({
        ...prev,
        [activeVoiceIdx]:
          (prev[activeVoiceIdx] ?? "") +
          (prev[activeVoiceIdx] ? " " : "") +
          text,
      }));
    },
  });

  const toggleVoice = useCallback(
    (blockIndex: number) => {
      if (!voice.isSupported) return;
      if (activeVoiceIdx === blockIndex) {
        // 같은 textarea 재클릭 → 정지.
        voice.stop();
        setActiveVoiceIdx(null);
      } else {
        // 다른 textarea 활성화 — 기존 세션 정리 후 재시작.
        if (voice.listening) voice.stop();
        setActiveVoiceIdx(blockIndex);
        // textarea focus
        const ta = textareaRefs.current.get(blockIndex);
        ta?.focus();
        voice.start();
      }
    },
    [voice, activeVoiceIdx],
  );

  // 음성 세션이 자동으로 끝나면 (timeout / error) activeVoiceIdx 정리.
  useEffect(() => {
    if (!voice.listening && activeVoiceIdx !== null) {
      setActiveVoiceIdx(null);
    }
    // listening 상태에 따라 active 동기화 — listening 만 dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.listening]);

  // 각 block 의 유사도 — input 변경마다 즉시 갱신.
  const similarities = useMemo<Record<number, number>>(() => {
    const out: Record<number, number> = {};
    for (const rb of recitationBlocks) {
      const input = inputs[rb.blockIndex] ?? "";
      out[rb.blockIndex] = computeSimilarity(input, rb.expectedText);
    }
    return out;
  }, [inputs, recitationBlocks]);

  const totalAttempted = recitationBlocks.filter(
    (rb) => (inputs[rb.blockIndex] ?? "").trim().length > 0,
  ).length;
  const totalCompleted = recitationBlocks.filter((rb) =>
    isRecitationComplete(similarities[rb.blockIndex] ?? 0),
  ).length;
  const overallSimilarity =
    recitationBlocks.length > 0
      ? recitationBlocks.reduce(
          (sum, rb) => sum + (similarities[rb.blockIndex] ?? 0),
          0,
        ) / recitationBlocks.length
      : 0;

  const handleSubmit = useCallback(() => {
    const attempts = recitationBlocks
      .filter((rb) => (inputs[rb.blockIndex] ?? "").trim().length > 0)
      .map((rb) => ({
        blockIndex: rb.blockIndex,
        userInput: inputs[rb.blockIndex] ?? "",
        expectedText: rb.expectedText,
        similarity: similarities[rb.blockIndex] ?? 0,
      }));
    if (attempts.length === 0) return;
    const fd = new FormData();
    fd.set("articleId", articleId);
    fd.set("attempts", JSON.stringify(attempts));
    fetcher.submit(fd, { method: "post", action: "/api/recitation/attempt" });
  }, [articleId, inputs, recitationBlocks, similarities, fetcher]);

  const handleReset = useCallback(() => {
    if (voice.listening) voice.stop();
    setActiveVoiceIdx(null);
    setInputs({});
    setReveal(false);
    setResetKey((k) => k + 1);
  }, [voice]);

  const submitting = fetcher.state !== "idle";
  const submitResult = fetcher.data as
    | { ok: boolean; saved?: number; error?: string }
    | undefined;

  return (
    <div className="space-y-3" key={resetKey}>
      <div className="bg-muted/40 flex flex-wrap items-center gap-3 rounded-md border border-dashed px-3 py-2 text-xs">
        <span className="font-medium">
          암기 진행: {totalCompleted} / {recitationBlocks.length}
        </span>
        <span className="text-muted-foreground">
          평균 유사도 {Math.round(overallSimilarity * 100)}%
        </span>
        {voice.isSupported ? null : (
          <span className="text-amber-600 dark:text-amber-400">
            * 이 브라우저는 음성 인식 미지원 (Chrome / Edge 권장)
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant={reveal ? "default" : "outline"}
            size="sm"
            onClick={() => setReveal((v) => !v)}
            className="h-7 gap-1 text-xs"
          >
            {reveal ? (
              <EyeOffIcon className="size-3.5" />
            ) : (
              <EyeIcon className="size-3.5" />
            )}
            {reveal ? "정답 숨기기" : "정답 모두 보기"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="h-7 gap-1 text-xs"
          >
            <RotateCcwIcon className="size-3.5" /> 다시 풀기
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || totalAttempted === 0}
            className="h-7 gap-1 text-xs"
          >
            <SaveIcon className="size-3.5" />
            {submitting ? "저장 중…" : "확인 / 저장"}
          </Button>
        </div>
      </div>

      {submitResult?.ok ? (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          {submitResult.saved}개 시도가 저장되었습니다.
        </div>
      ) : null}
      {submitResult?.error ? (
        <div className="rounded-md border border-rose-500/40 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
          저장 실패: {submitResult.error}
        </div>
      ) : null}

      <div className="space-y-2">
        {recitationBlocks.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            이 조문에는 암기 가능한 항/호/목이 없습니다.
          </p>
        ) : null}
        {recitationBlocks.map((rb) => {
          const sim = similarities[rb.blockIndex] ?? 0;
          const complete = isRecitationComplete(sim);
          const input = inputs[rb.blockIndex] ?? "";
          const voiceActive = activeVoiceIdx === rb.blockIndex;
          return (
            <div
              key={rb.blockIndex}
              style={{ paddingLeft: `${rb.depth * 16}px` }}
              className="space-y-1.5"
            >
              <div className="flex items-baseline gap-1.5">
                <span className="text-primary text-sm font-semibold">
                  {rb.label}
                </span>
                {rb.subtitle ? (
                  <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-xs font-semibold">
                    ({rb.subtitle})
                  </span>
                ) : null}
                <SimilarityChip similarity={sim} hasInput={input.length > 0} />
              </div>

              <div className="flex items-start gap-2">
                <textarea
                  ref={(el) => {
                    if (el) textareaRefs.current.set(rb.blockIndex, el);
                    else textareaRefs.current.delete(rb.blockIndex);
                  }}
                  value={input}
                  onChange={(e) => setInputAt(rb.blockIndex, e.target.value)}
                  rows={Math.max(2, Math.ceil(rb.expectedText.length / 60))}
                  placeholder="여기에 외운 본문을 입력하거나 마이크로 말하세요."
                  className={cn(
                    "border-input bg-background flex-1 resize-y rounded-md border px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/40",
                    complete
                      ? "border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/30"
                      : sim > 0.5
                        ? "border-amber-400"
                        : "",
                  )}
                />
                {voice.isSupported ? (
                  <Button
                    type="button"
                    variant={voiceActive ? "default" : "outline"}
                    size="icon"
                    onClick={() => toggleVoice(rb.blockIndex)}
                    aria-label={voiceActive ? "음성 인식 중지" : "음성 인식 시작"}
                    title={voiceActive ? "음성 인식 중지" : "음성 입력 (ko-KR)"}
                    className={cn(
                      "size-9 shrink-0",
                      voiceActive && "animate-pulse",
                    )}
                  >
                    {voiceActive ? (
                      <MicIcon className="size-4" />
                    ) : (
                      <MicOffIcon className="size-4" />
                    )}
                  </Button>
                ) : null}
              </div>

              {voiceActive && voice.interim ? (
                <p className="text-muted-foreground italic px-3 text-xs">
                  …{voice.interim}
                </p>
              ) : null}

              {reveal ? (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-950/20 px-3 py-2 text-sm leading-relaxed">
                  {rb.expectedText}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <p className="text-muted-foreground px-1 text-[11px]">
        * 정답 임계치 {Math.round(RECITATION_PASS_THRESHOLD * 100)}% — 띄어쓰기/구두점 차이는
        무시하고 글자 단위로 비교합니다. 음성 인식은 마침표 없이 인식되므로 텍스트 수정 후 저장
        가능.
      </p>
      <span className="sr-only">{articleLabel}</span>
    </div>
  );
}

function SimilarityChip({
  similarity,
  hasInput,
}: {
  similarity: number;
  hasInput: boolean;
}) {
  if (!hasInput) return null;
  const pct = Math.round(similarity * 100);
  const complete = isRecitationComplete(similarity);
  return (
    <Badge
      variant="outline"
      className={cn(
        "ml-auto h-5 gap-0.5 px-1.5 text-[10px] tabular-nums",
        complete
          ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
          : pct > 50
            ? "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
            : "border-rose-400 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
      )}
    >
      {complete ? <CheckCircle2Icon className="size-3" /> : null}
      {pct}%
    </Badge>
  );
}

// inline 토큰 → 학생이 외워야 할 본문 텍스트. amendment_note (메타) 와 footnote 는 제외.
function inlineCumulativeText(t: Inline): string {
  if (t.type === "amendment_note") return "";
  if (t.type === "footnote") return "";
  if (t.type === "ref_article" || t.type === "ref_law") return t.raw;
  if (
    t.type === "text" ||
    t.type === "underline" ||
    t.type === "subtitle" ||
    t.type === "annotation"
  ) {
    return t.text;
  }
  return "";
}
