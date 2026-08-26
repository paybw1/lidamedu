// 암기 모드 — 조/항/호/목 골격만 남기고 본문은 학생이 직접 입력.
// ★항 소제목(예: ① (산업상 이용가능성))은 표시하지 않는다 — 본문 내용을 그대로 알려 주는
//   힌트라 암기가 성립하지 않는다(원장 지시 2026-08-19). 정답은 "정답 보기"로만 확인.
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
  ScrollIcon,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { useVoiceRecognition } from "~/core/hooks/use-voice-recognition";
import { cn } from "~/core/lib/utils";
import type {
  ArticleBody,
  Block,
  Inline,
  SubArticleEntry,
} from "~/features/laws/lib/article-body";

import {
  RECITATION_PASS_THRESHOLD,
  computeSimilarityNormalized,
  isRecitationComplete,
  normalizeForComparison,
} from "../lib/similarity";

// 표시용(유사도 칩·진행률) state 를 묶어서 갱신하는 주기. 타이핑 중 렌더를 만들지 않기 위한 값.
const DISPLAY_SYNC_MS = 250;

interface RecitationBlock {
  blockIndex: number;
  label: string; // ① / 1. / 가. 등
  expectedText: string;
  /** 비교용 정규화 정답 — 키 입력마다 재정규화하지 않도록 1회 계산해 보관. */
  expectedNorm: string;
  depth: number;
}

// "함께 공부할 조문"(시행령·시행규칙 등 위임 조문) — 암기 대상이 아니라 참고용으로 본문을 그대로
// 보여 주는 섹션. 학생이 어떤 조문을 함께 봐야 하는지(예: 시행령 제6조) 내용까지 확인할 수 있게 한다.
interface RefSection {
  key: string;
  source: string;
  preface: Block[] | null;
  articles: SubArticleEntry[];
}

// 암기 화면의 순서 있는 항목 — 외울 항/호/목(recite) 과 참고 조문 카드(ref) 가 본문 순서대로 섞인다.
type RecitationItem =
  | { type: "recite"; block: RecitationBlock }
  | { type: "ref"; ref: RefSection };

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
  // ★입력값의 소유자는 textarea(DOM) — 아래 ref 는 그 사본이다.
  //   value={...} 제어 컴포넌트로 두면 렌더 결과를 매번 textarea 에 되써서, 렌더가 타이핑을
  //   못 따라가는 순간 한글 조합이 끊긴다(아이패드에서 "타이핑이 매우 느려짐" · "직전 글자가
  //   따라옴", 2026-08-26 신고 2건). 렌더는 화면 표시만 담당하고 값은 DOM 이 갖는다.
  const valuesRef = useRef<Map<number, string>>(new Map());
  const syncTimerRef = useRef<number | null>(null);
  // 한글 조합 확정용 throwaway input — onPointerDownCapture 주석 참조.
  const flushInputRef = useRef<HTMLInputElement | null>(null);

  // walkBlocks pre-order 와 정합되는 bi(block_index) 를 계산하면서 본문 순서대로 항목을 추출.
  // 추출 대상:
  //   - clause / item / sub: 법조문의 일반 구조 (조-항-호-목) → 외울 항목(recite)
  //   - para: 항/호/목이 없는 단순 조문 (예: 제1조 목적) → 외울 항목(recite)
  //   - sub_article_group("함께 공부할 조문", 시행령·시행규칙 등) → 참고 카드(ref). 내용을 그대로
  //     보여 주기만 하고 암기 입력창으로 흩뿌리지 않는다. 학생이 그 조문이 뭔지 알 수 있어야 하기 때문.
  // 제외:
  //   - amendment_note 만 포함된 para (메타) → expectedText 가 빈 문자열이라 skip
  //   - header_refs / title_marker: 외울 대상 아님
  // bi 는 walkBlocks 와 정합되도록 모든 block 마다 증가 (sub_article 내부 block 도 bi-only 로 소진).
  const items = useMemo<RecitationItem[]>(() => {
    const out: RecitationItem[] = [];
    let bi = 0;
    // walkBlocks 와 동일하게 bi 만 증가시키는 count-only 순회 (참고 조문 내부용).
    const countOnly = (blocks: Block[]) => {
      for (const block of blocks) {
        bi++;
        if (
          block.kind === "clause" ||
          block.kind === "item" ||
          block.kind === "sub"
        ) {
          countOnly(block.children);
        } else if (block.kind === "sub_article_group") {
          if (block.preface) countOnly(block.preface);
          for (const sa of block.articles) countOnly(sa.blocks);
        }
      }
    };
    const visit = (blocks: Block[], depth: number) => {
      for (const block of blocks) {
        const myBi = bi;
        bi++;
        if (
          block.kind === "clause" ||
          block.kind === "item" ||
          block.kind === "sub"
        ) {
          const expected = cleanupExpected(
            block.inline.map(inlineCumulativeText).join(""),
          );
          out.push({
            type: "recite",
            block: {
              blockIndex: myBi,
              label: block.label,
              expectedText: expected,
              expectedNorm: normalizeForComparison(expected),
              depth,
            },
          });
          visit(block.children, depth + 1);
        } else if (block.kind === "para") {
          const expected = cleanupExpected(
            block.inline.map(inlineCumulativeText).join(""),
          );
          // 관련조문 ref 만 나열된 para (예: 제29조 ③~④ 사이) 는 조문 원문이 아니므로 제외.
          if (hasSubstance(expected)) {
            out.push({
              type: "recite",
              block: {
                blockIndex: myBi,
                label: "본문",
                expectedText: expected,
                expectedNorm: normalizeForComparison(expected),
                depth,
              },
            });
          }
          // para 는 children 없음.
        } else if (block.kind === "sub_article_group") {
          out.push({
            type: "ref",
            ref: {
              key: `ref-${myBi}`,
              source: block.source,
              preface: block.preface ?? null,
              articles: block.articles,
            },
          });
          // 참고 조문 내부는 암기 입력창으로 만들지 않되, bi 정합을 위해 소진한다.
          if (block.preface) countOnly(block.preface);
          for (const sa of block.articles) countOnly(sa.blocks);
        }
        // header_refs / title_marker — bi 만 증가, push 안 함.
      }
    };
    visit(body.blocks, 0);
    return out;
  }, [body]);

  const recitationBlocks = useMemo<RecitationBlock[]>(
    () =>
      items.flatMap((it) => (it.type === "recite" ? [it.block] : [])),
    [items],
  );

  const snapshot = useCallback((): Record<number, string> => {
    const out: Record<number, string> = {};
    for (const [k, v] of valuesRef.current) out[k] = v;
    return out;
  }, []);

  /** 표시용 state 를 지금 즉시 맞춘다(저장·포커스 이탈·음성 입력 직후). */
  const flushDisplay = useCallback(() => {
    if (syncTimerRef.current !== null) {
      window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    setInputs(snapshot());
  }, [snapshot]);

  // 키 입력 경로 — ref 기록은 즉시(렌더 없음), 화면 표시는 DISPLAY_SYNC_MS 마다 한 번.
  //   타이머를 되감지 않으므로(throttle) 계속 입력해도 유사도가 주기적으로 따라온다.
  const setInputAt = useCallback((blockIndex: number, value: string) => {
    valuesRef.current.set(blockIndex, value);
    if (syncTimerRef.current !== null) return;
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      setInputs(snapshot());
    }, DISPLAY_SYNC_MS);
  }, [snapshot]);

  /** 포커스를 벗어날 때 — 조합 확정분까지 반영하고 표시를 즉시 맞춘다. */
  const commitInputAt = useCallback(
    (blockIndex: number, value: string) => {
      valuesRef.current.set(blockIndex, value);
      flushDisplay();
    },
    [flushDisplay],
  );

  useEffect(
    () => () => {
      if (syncTimerRef.current !== null)
        window.clearTimeout(syncTimerRef.current);
    },
    [],
  );

  // 음성 인식 — final transcript 가 들어올 때마다 active textarea 에 append.
  const voice = useVoiceRecognition({
    lang: "ko-KR",
    onFinal: (text) => {
      if (activeVoiceIdx === null) return;
      // ★값의 소유자는 DOM — 표시용 state 를 읽어 이어붙이면 직전 타이핑을 덮어쓴다.
      const ta = textareaRefs.current.get(activeVoiceIdx);
      const prev = ta?.value ?? valuesRef.current.get(activeVoiceIdx) ?? "";
      const next = prev + (prev ? " " : "") + text;
      if (ta) ta.value = next;
      valuesRef.current.set(activeVoiceIdx, next);
      flushDisplay();
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

  // memo 행이 리렌더를 건너뛸 수 있도록 안정 참조 콜백 — toggleVoice 는 voice 상태에 따라
  // 매 렌더 새로 만들어지므로 ref 로 감싼다.
  const toggleVoiceRef = useRef(toggleVoice);
  toggleVoiceRef.current = toggleVoice;
  const stableToggleVoice = useCallback(
    (blockIndex: number) => toggleVoiceRef.current(blockIndex),
    [],
  );
  const registerTextarea = useCallback(
    (blockIndex: number, el: HTMLTextAreaElement | null) => {
      if (el) textareaRefs.current.set(blockIndex, el);
      else textareaRefs.current.delete(blockIndex);
    },
    [],
  );

  // 음성 세션이 자동으로 끝나면 (timeout / error) activeVoiceIdx 정리.
  useEffect(() => {
    if (!voice.listening && activeVoiceIdx !== null) {
      setActiveVoiceIdx(null);
    }
    // listening 상태에 따라 active 동기화 — listening 만 dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.listening]);

  // 각 block 의 유사도 — 입력이 바뀐 block 만 재계산(Levenshtein 은 본문 길이 제곱 비용이라
  // 키 입력마다 전 블록을 다시 돌리면 큰 조문에서 타이핑이 밀린다 — iPad 신고).
  const simCache = useRef<Map<number, { input: string; sim: number }>>(
    new Map(),
  );
  const similarities = useMemo<Record<number, number>>(() => {
    const out: Record<number, number> = {};
    for (const rb of recitationBlocks) {
      const input = inputs[rb.blockIndex] ?? "";
      const cached = simCache.current.get(rb.blockIndex);
      if (cached && cached.input === input) {
        out[rb.blockIndex] = cached.sim;
        continue;
      }
      const sim = computeSimilarityNormalized(input, rb.expectedNorm);
      simCache.current.set(rb.blockIndex, { input, sim });
      out[rb.blockIndex] = sim;
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
    // ★저장 직전에 textarea 를 다시 읽는다 — 표시용 state 는 묶어서 갱신하므로 마지막 몇 글자가
    //   아직 반영되지 않았을 수 있다. 유사도도 저장할 그 값으로 계산해 둘이 어긋나지 않게 한다.
    const attempts = recitationBlocks
      .map((rb) => ({
        rb,
        userInput:
          textareaRefs.current.get(rb.blockIndex)?.value ??
          valuesRef.current.get(rb.blockIndex) ??
          "",
      }))
      .filter(({ userInput }) => userInput.trim().length > 0)
      .map(({ rb, userInput }) => {
        valuesRef.current.set(rb.blockIndex, userInput);
        return {
          blockIndex: rb.blockIndex,
          userInput,
          expectedText: rb.expectedText,
          similarity: computeSimilarityNormalized(userInput, rb.expectedNorm),
        };
      });
    flushDisplay();
    if (attempts.length === 0) return;
    const fd = new FormData();
    fd.set("articleId", articleId);
    fd.set("attempts", JSON.stringify(attempts));
    fetcher.submit(fd, { method: "post", action: "/api/recitation/attempt" });
  }, [articleId, recitationBlocks, fetcher, flushDisplay]);

  const handleReset = useCallback(() => {
    if (voice.listening) voice.stop();
    setActiveVoiceIdx(null);
    valuesRef.current.clear();
    setInputs({});
    setReveal(false);
    setResetKey((k) => k + 1);
  }, [voice]);

  // ★아이패드에서 다른 입력창으로 터치 이동할 때의 한글 조합 이월 차단(2026-08-26 신고).
  //   iOS 는 조합 중인 글자를 확정하지 않은 채 캐럿만 옮겨, 직전 칸의 마지막 글자가 새로 누른
  //   칸 첫머리에 붙는다. 빈칸 모드에서 검증된 방법과 같다 — 화면 밖 throwaway input 으로
  //   포커스를 잠깐 옮겨(=다른 텍스트 필드로 이동) 조합을 직전 칸에 확정시킨 뒤, 다음 프레임에
  //   목표 textarea 로 착지한다.
  //   ★이미 내용이 있는 칸에는 개입하지 않는다 — 누른 자리에 캐럿을 놓는 기본 동작을 살려야
  //     오타 수정을 할 수 있다(이월 방어는 '빈 칸에 새 글자가 나타난다'가 전제).
  const onPointerDownCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    const active = document.activeElement;
    if (!(active instanceof HTMLTextAreaElement)) return;
    if (active.dataset.lidamRecite !== "1") return;
    const target =
      e.target instanceof Element
        ? e.target.closest<HTMLTextAreaElement>(
            'textarea[data-lidam-recite="1"]',
          )
        : null;
    // ★입력창 밖(빈 공간·버튼) 탭에는 개입하지 않는다 — 여기서 blur 하면 화면을 스크롤하려고
    //   짚었을 뿐인데 키보드가 닫힌다.
    if (!target || target === active) return;
    const flush = flushInputRef.current;
    if (target.value === "" && flush && e.pointerType !== "mouse") {
      e.preventDefault();
      flush.focus({ preventScroll: true });
      requestAnimationFrame(() => {
        target.focus({ preventScroll: true });
        const end = target.value.length;
        target.setSelectionRange(end, end);
      });
      return;
    }
    // 그 밖(마우스 클릭·이미 내용이 있는 칸) — 최소 개입으로 조합을 지금 칸에 확정시킨다.
    active.blur();
  };

  const submitting = fetcher.state !== "idle";
  const submitResult = fetcher.data as
    | { ok: boolean; saved?: number; error?: string }
    | undefined;

  return (
    <div
      className="space-y-3"
      key={resetKey}
      onPointerDownCapture={onPointerDownCapture}
    >
      {/* 한글 조합 확정용 throwaway input — 화면 밖(포커스만 받고 보이지 않음). 텍스트 필드라
          소프트 키보드가 유지되고, tabIndex=-1 이라 Tab 순회에 끼지 않는다. */}
      <input
        ref={flushInputRef}
        type="text"
        tabIndex={-1}
        aria-hidden="true"
        inputMode="text"
        autoComplete="off"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: "none",
          border: 0,
          padding: 0,
          zIndex: -1,
        }}
      />
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
        {items.map((it) => {
          if (it.type === "ref") {
            return <RefSectionCard key={it.ref.key} section={it.ref} />;
          }
          const rb = it.block;
          const voiceActive = activeVoiceIdx === rb.blockIndex;
          return (
            <ReciteRow
              key={rb.blockIndex}
              rb={rb}
              input={inputs[rb.blockIndex] ?? ""}
              sim={similarities[rb.blockIndex] ?? 0}
              reveal={reveal}
              voiceActive={voiceActive}
              voiceSupported={voice.isSupported}
              interim={voiceActive ? voice.interim : ""}
              onInput={setInputAt}
              onCommit={commitInputAt}
              onToggleVoice={stableToggleVoice}
              registerRef={registerTextarea}
            />
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

// 암기 입력 행 — memo: 타이핑 중인 행만 리렌더되고 나머지 행(긴 정답 미리보기 포함)은
// 건너뛴다. 콜백 props 는 부모에서 안정 참조로 내려온다.
const ReciteRow = memo(function ReciteRow({
  rb,
  input,
  sim,
  reveal,
  voiceActive,
  voiceSupported,
  interim,
  onInput,
  onCommit,
  onToggleVoice,
  registerRef,
}: {
  rb: RecitationBlock;
  input: string;
  sim: number;
  reveal: boolean;
  voiceActive: boolean;
  voiceSupported: boolean;
  interim: string;
  onInput: (blockIndex: number, value: string) => void;
  onCommit: (blockIndex: number, value: string) => void;
  onToggleVoice: (blockIndex: number) => void;
  registerRef: (blockIndex: number, el: HTMLTextAreaElement | null) => void;
}) {
  const complete = isRecitationComplete(sim);
  return (
    <div
      style={{ paddingLeft: `${rb.depth * 16}px` }}
      className="space-y-1.5"
    >
      <div className="flex items-baseline gap-1.5">
        <span className="text-link text-sm font-semibold">{rb.label}</span>
        <SimilarityChip similarity={sim} hasInput={input.length > 0} />
      </div>

      <div className="flex items-start gap-2">
        <textarea
          ref={(el) => registerRef(rb.blockIndex, el)}
          data-lidam-recite="1"
          // ★비제어 — 값의 소유자는 이 textarea 다(부모 주석 참조). defaultValue 는 마운트
          //   시점에만 쓰이고, "다시 풀기"는 key 리마운트로 초기화된다.
          defaultValue={input}
          onChange={(e) => onInput(rb.blockIndex, e.target.value)}
          onBlur={(e) => onCommit(rb.blockIndex, e.currentTarget.value)}
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
        {voiceSupported ? (
          <Button
            type="button"
            variant={voiceActive ? "default" : "outline"}
            size="icon"
            onClick={() => onToggleVoice(rb.blockIndex)}
            aria-label={voiceActive ? "음성 인식 중지" : "음성 인식 시작"}
            title={voiceActive ? "음성 인식 중지" : "음성 입력 (ko-KR)"}
            className={cn("size-9 shrink-0", voiceActive && "animate-pulse")}
          >
            {voiceActive ? (
              <MicIcon className="size-4" />
            ) : (
              <MicOffIcon className="size-4" />
            )}
          </Button>
        ) : null}
      </div>

      {voiceActive && interim ? (
        <p className="text-muted-foreground italic px-3 text-xs">…{interim}</p>
      ) : null}

      {reveal ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-950/20 px-3 py-2 text-sm leading-relaxed">
          {rb.expectedText}
        </div>
      ) : null}
    </div>
  );
});

// "함께 공부할 조문"(시행령·시행규칙 등) 참고 카드 — 암기 대상이 아니라 내용을 그대로 보여 준다.
// 본문 뷰어의 초록 박스와 동일한 정체성(색·라벨)을 유지해 학생이 같은 자료임을 인지하게 한다.
// memo: 내용이 정적(section 은 items memo 산출물)이라 타이핑 리렌더에서 제외.
const RefSectionCard = memo(function RefSectionCard({
  section,
}: {
  section: RefSection;
}) {
  return (
    <aside className="relative rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-700/40 dark:bg-emerald-950/10">
      <div className="mb-2.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10.5px] font-extrabold tracking-[0.06em] text-white uppercase dark:bg-emerald-600">
        <ScrollIcon className="size-2.5" /> 함께 공부할 조문 · {section.source}
      </div>
      {section.preface && section.preface.length > 0 ? (
        <div className="mb-2 rounded-md border border-amber-200/60 bg-amber-50 px-3 py-2 text-[12.5px] leading-relaxed dark:border-amber-700/40 dark:bg-amber-900/20">
          <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">
            코멘트
          </p>
          <RefBlocks blocks={section.preface} />
        </div>
      ) : null}
      <div className="space-y-2.5">
        {section.articles.map((sa, i) => (
          <div key={i} className="space-y-1">
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
              제{sa.number}조{sa.branch ? `의${sa.branch}` : ""} ({sa.title})
            </p>
            <div className="space-y-1 text-[13.5px] leading-relaxed text-emerald-950/90 dark:text-emerald-50/90">
              <RefBlocks blocks={sa.blocks} />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-[11px] text-emerald-700/80 dark:text-emerald-300/70">
        * 참고용으로 함께 표시되는 조문입니다 (암기 채점 대상 아님).
      </p>
    </aside>
  );
});

// 참고 조문 본문을 읽기 전용으로 렌더 — 조/항/호/목 라벨 + 텍스트. 입력창 없음.
function RefBlocks({
  blocks,
  depth = 0,
}: {
  blocks: Block[];
  depth?: number;
}) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.kind === "clause" || b.kind === "item" || b.kind === "sub") {
          const text = refInlineText(b.inline);
          return (
            <div key={i} style={{ paddingLeft: `${depth * 12}px` }}>
              <p>
                <span className="mr-1 font-semibold text-emerald-800 dark:text-emerald-200">
                  {b.label}
                </span>
                {b.subtitle ? (
                  <span className="mr-1 font-semibold">({b.subtitle})</span>
                ) : null}
                {text}
              </p>
              {b.children.length > 0 ? (
                <RefBlocks blocks={b.children} depth={depth + 1} />
              ) : null}
            </div>
          );
        }
        if (b.kind === "para") {
          const text = refInlineText(b.inline);
          if (!text.trim()) return null;
          return (
            <p key={i} style={{ paddingLeft: `${depth * 12}px` }}>
              {text}
            </p>
          );
        }
        // header_refs / title_marker / 중첩 sub_article_group 은 참고 카드에서 생략.
        return null;
      })}
    </>
  );
}

// 참고 조문 표시용 리터럴 텍스트 — 조문 원문 그대로. 강조 라벨·참조도 원문 글자를 보존하고,
// 개정 메타(amendment_note)·각주(footnote)는 잡음이라 제외.
function refInlineText(inline: Inline[]): string {
  return inline
    .map((t) => {
      switch (t.type) {
        case "text":
        case "underline":
        case "subtitle":
        case "annotation":
        case "ordinance_ref":
          return t.text;
        case "ref_article":
        case "ref_law":
          return t.raw;
        case "amendment_note":
        case "footnote":
          return "";
      }
    })
    .join("");
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

// inline 토큰 → 학생이 외워야 할 본문 텍스트.
// 제외: amendment_note·footnote(메타), ref_article/ref_law(관련조문 표기 — 조문 원문이 아님),
//       subtitle·annotation(강사 강조 라벨 — 예: "(예외)". 조문 원문이 아니라 입력 대상에서 뺀다).
function inlineCumulativeText(t: Inline): string {
  if (t.type === "text" || t.type === "underline") return t.text;
  return "";
}

// ref/라벨 토큰 제거 후 남는 구분자 꼬리(", , ")·앞뒤 공백 정리.
function cleanupExpected(s: string): string {
  return s.replace(/[\s,、·]+$/g, "").replace(/^\s+/, "");
}

// 실제 외울 내용이 있는지 — 구분자·구두점만 남은 block(관련조문 나열 para 등)은 암기 항목에서 제외.
function hasSubstance(s: string): boolean {
  return /[가-힣A-Za-z0-9]/.test(s);
}
