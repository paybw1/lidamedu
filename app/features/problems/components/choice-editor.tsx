// 운영자 admin UI 의 객관식 한 지문(choice) 편집 카드.
// type(조문/판례/이론) 토글에 따라 조문번호 / 판례번호 입력란 노출.
// 해설(explanation_md) 변경 시 비어있는 ref 필드를 자동 prefill.
// polarity + format 이 자동 OX 적용 가능하면 빈 oxTruth 를 정답 여부로부터 추론. 사용자가 직접 OX 를 만지면 자동 모드 해제.

import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "~/core/lib/utils";
import { ExplanationEditor } from "~/features/problems/components/explanation-editor";
import {
  CHOICE_TYPE_COLOR,
  CHOICE_TYPE_LABEL,
  type OxTruth,
  type ProblemChoice,
  type ProblemChoiceType,
  type ProblemFormat,
  type ProblemPolarity,
} from "~/features/problems/labels";
import {
  deriveChoiceOxTruth,
  isForceOxIneligibleFormat,
} from "~/features/problems/lib/auto-ox";
import { extractArticleNumber, extractCaseNumber } from "~/features/problems/extract";

const CHOICE_TYPES: ProblemChoiceType[] = ["statute", "precedent", "theory"];

export function ChoiceEditor({
  choice,
  selectedAsCorrect,
  onCorrect,
  layout = "default",
  polarity = null,
  format,
  bulkOxSignal,
}: {
  choice: ProblemChoice;
  selectedAsCorrect: boolean;
  onCorrect: () => void;
  layout?: "default" | "compact";
  polarity?: ProblemPolarity | null;
  format: ProblemFormat;
  // 부모에서 "전체 OX 불가 체크/해제" 를 수행했을 때 사용하는 신호.
  // epoch 가 바뀔 때마다 ineligible 값을 자식 state 에 적용한다.
  bulkOxSignal?: { epoch: number; ineligible: boolean };
}) {
  // 사례형(mc_case) 기본 종류는 "조문" — 사례 의존 지문은 조문 적용 판단이 보통.
  const initialType =
    choice.choiceType ??
    (isForceOxIneligibleFormat(format)
      ? ("statute" as ProblemChoiceType)
      : guessTypeFromText(choice.explanationMd ?? ""));
  const [type, setType] = useState<ProblemChoiceType | "">(
    (initialType ?? "") as ProblemChoiceType | "",
  );
  const [explanation, setExplanation] = useState<string>(choice.explanationMd ?? "");
  const [articleNumber, setArticleNumber] = useState<string>(
    choice.relatedArticleNumber ?? "",
  );
  const [caseNumber, setCaseNumber] = useState<string>(
    choice.relatedCaseNumber ?? "",
  );
  // 사례형(mc_case) 은 사례 의존이라 단독 OX 가 성립하지 않음 → 미설정 상태(persisted ineligible=false + ox_truth 없음)면 자동 체크.
  const [oxIneligible, setOxIneligible] = useState<boolean>(
    choice.oxIneligible ||
      (isForceOxIneligibleFormat(format) && choice.oxTruth == null),
  );
  // 자동 OX: 저장된 oxTruth 가 비어있으면 polarity+정답으로부터 추론.
  // 사용자가 OX 를 직접 클릭하거나 ×(지우기) 누르면 oxAutoMode=false 로 굳어 더 이상 자동 갱신하지 않는다.
  const initialAutoOx = useMemo(
    () =>
      choice.oxTruth == null
        ? deriveChoiceOxTruth({
            polarity,
            format,
            isCorrect: choice.isCorrect,
            oxIneligible: choice.oxIneligible,
          })
        : null,
    // 마운트 시 1회 — 의존성 변경에 따른 재계산은 별도 effect 가 담당.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [oxTruth, setOxTruth] = useState<OxTruth | "">(
    (choice.oxTruth ?? initialAutoOx ?? "") as OxTruth | "",
  );
  const oxAutoModeRef = useRef<boolean>(choice.oxTruth == null);

  // 정답 라디오 변경 시 — 자동 모드라면 OX 도 따라간다.
  useEffect(() => {
    if (!oxAutoModeRef.current) return;
    const next = deriveChoiceOxTruth({
      polarity,
      format,
      isCorrect: selectedAsCorrect,
      oxIneligible,
    });
    setOxTruth((next ?? "") as OxTruth | "");
  }, [selectedAsCorrect, polarity, format, oxIneligible]);

  // 부모에서 format 이 사례형(mc_case) 으로 변경되면 OX 불가 + 종류 조문 기본을 즉시 반영.
  // 저장 전이라도 운영자가 메타를 바꿀 때 의미 있는 default 가 보이도록.
  const prevFormatRef = useRef<ProblemFormat>(format);
  useEffect(() => {
    if (prevFormatRef.current === format) return;
    const wasForce = isForceOxIneligibleFormat(prevFormatRef.current);
    const nowForce = isForceOxIneligibleFormat(format);
    prevFormatRef.current = format;
    if (nowForce && !wasForce) {
      setOxIneligible(true);
      setOxTruth("");
      setType((t) => (t ? t : "statute"));
    }
  }, [format]);

  // bulkOxSignal — 부모에서 전체 OX 불가 일괄 토글 시 epoch 가 증가. 그 때마다 적용.
  const lastBulkEpochRef = useRef<number | null>(null);
  useEffect(() => {
    if (!bulkOxSignal) return;
    if (lastBulkEpochRef.current === bulkOxSignal.epoch) return;
    lastBulkEpochRef.current = bulkOxSignal.epoch;
    setOxIneligible(bulkOxSignal.ineligible);
    if (bulkOxSignal.ineligible) {
      setOxTruth("");
      oxAutoModeRef.current = false;
    }
  }, [bulkOxSignal]);

  const handleManualOx = (v: OxTruth) => {
    oxAutoModeRef.current = false;
    setOxTruth(v);
  };
  const handleClearOx = () => {
    oxAutoModeRef.current = false;
    setOxTruth("");
  };

  // 해설이 바뀔 때 비어있는 ref 필드만 자동 채움. 운영자 수동 입력은 보존.
  // 이미 값이 있는 필드는 건드리지 않는다.
  // - 판례: caseNumber 우선, articleNumber 도 함께 추출 (판례 + 관련 조문 동시 보관).
  // - 그 외: articleNumber 만.
  useEffect(() => {
    if (type === "precedent") {
      if (!caseNumber) {
        const ext = extractCaseNumber(explanation);
        if (ext) setCaseNumber(ext);
      }
      if (!articleNumber) {
        const ext = extractArticleNumber(explanation);
        if (ext) setArticleNumber(ext);
      }
    } else if (type === "statute" || type === "theory" || type === "") {
      if (!articleNumber) {
        const ext = extractArticleNumber(explanation);
        if (ext) setArticleNumber(ext);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explanation, type]);

  const cls = type
    ? CHOICE_TYPE_COLOR[type as ProblemChoiceType]
    : "bg-muted text-muted-foreground";

  const padCls = layout === "compact" ? "p-2 space-y-2" : "p-3 space-y-2";
  const fontCls = layout === "compact" ? "text-xs" : "text-sm";

  return (
    <div className={cn("border-input rounded-md border", padCls)}>
      <input type="hidden" name={`choice_${choice.choiceIndex}_id`} value={choice.choiceId} />

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "bg-muted text-foreground inline-flex items-center justify-center rounded-full font-bold",
            layout === "compact" ? "size-5 text-[11px]" : "size-6 text-xs",
          )}
        >
          {choice.choiceIndex}
        </span>
        <label className="inline-flex items-center gap-1 text-[11px]">
          <input
            type="radio"
            name="correctIndex"
            value={choice.choiceIndex}
            checked={selectedAsCorrect}
            onChange={onCorrect}
          />
          정답
        </label>
        {/* OX 라벨 — O / X / 미판정. 부적합이면 disabled. */}
        <div className="inline-flex items-center gap-0.5 rounded-md border border-input p-0.5 text-[11px]">
          {(["O", "X"] as const).map((v) => (
            <label
              key={v}
              className={cn(
                "cursor-pointer rounded px-1.5 py-0.5 font-bold",
                oxIneligible && "cursor-not-allowed opacity-40",
                oxTruth === v && v === "O" && "bg-emerald-600 text-white",
                oxTruth === v && v === "X" && "bg-rose-600 text-white",
                oxTruth !== v && "text-muted-foreground hover:bg-muted",
              )}
            >
              <input
                type="radio"
                name={`choice_${choice.choiceIndex}_ox_truth`}
                value={v}
                checked={oxTruth === v}
                disabled={oxIneligible}
                onChange={() => handleManualOx(v)}
                className="sr-only"
              />
              {v}
            </label>
          ))}
          <button
            type="button"
            disabled={oxIneligible || oxTruth === ""}
            onClick={handleClearOx}
            className={cn(
              "text-muted-foreground hover:text-foreground rounded px-1 py-0.5 text-[10px]",
              (oxIneligible || oxTruth === "") && "opacity-30",
            )}
            title="OX 라벨 지우기"
          >
            ×
          </button>
        </div>
        <label
          className={cn(
            "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]",
            oxIneligible
              ? "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
              : "text-muted-foreground",
          )}
          title="단독 OX 문제로 분리할 수 없는 지문 (예: 보기묶음 ‘①, ④’, 사례 의존)"
        >
          <input
            type="checkbox"
            name={`choice_${choice.choiceIndex}_ox_ineligible`}
            value="1"
            checked={oxIneligible}
            onChange={(e) => {
              setOxIneligible(e.target.checked);
              if (e.target.checked) setOxTruth("");
            }}
          />
          OX 불가
        </label>
        <div className="ml-auto">
          {/* 박스형(mc_box) 의 choice 는 보기묶음(예: "㉮㉯") 이라 분류·관련조문 불필요 → 셀렉트 숨기고 빈 값으로 hidden 제출. */}
          {format === "mc_box" ? (
            <input
              type="hidden"
              name={`choice_${choice.choiceIndex}_type`}
              value=""
            />
          ) : (
            <select
              name={`choice_${choice.choiceIndex}_type`}
              value={type}
              onChange={(e) => setType(e.target.value as ProblemChoiceType | "")}
              className={cn(
                "border-input rounded-md border px-2 py-1 text-[11px] font-medium",
                cls,
              )}
            >
              <option value="">미분류</option>
              {CHOICE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CHOICE_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <ExplanationEditor
        compact
        name={`choice_${choice.choiceIndex}_body`}
        defaultValue={choice.bodyMd}
        rows={2}
        placeholder="지문(보기) 본문"
        className={fontCls}
      />

      <ExplanationEditor
        compact
        name={`choice_${choice.choiceIndex}_explanation`}
        value={explanation}
        onChange={setExplanation}
        rows={2}
        placeholder="해설 (답안 hwp 에서 자동 분류 + 운영자 보강)"
      />

      {/* 조문번호 / 판례번호.
          - 박스형: 보기묶음 choice 라 ref 불필요 → 모두 hidden 빈 값으로 제출.
          - 판례: 판례번호(주) + 관련 조문(부) 둘 다 노출.
          - 조문/이론/미분류: 관련 조문만 노출. */}
      {format === "mc_box" ? (
        <>
          <input type="hidden" name={`choice_${choice.choiceIndex}_article_number`} value="" />
          <input type="hidden" name={`choice_${choice.choiceIndex}_case_number`} value="" />
        </>
      ) : type === "precedent" ? (
        <div className="space-y-2">
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
              판례번호
            </span>
            <input
              type="text"
              name={`choice_${choice.choiceIndex}_case_number`}
              value={caseNumber}
              onChange={(e) => setCaseNumber(e.target.value)}
              placeholder="대법원 2013도10265"
              className="border-input bg-background h-8 rounded-md border px-2 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
              관련 조문 (선택)
            </span>
            <input
              type="text"
              name={`choice_${choice.choiceIndex}_article_number`}
              value={articleNumber}
              onChange={(e) => setArticleNumber(e.target.value)}
              placeholder="29 / 28의2 (해당하는 조문이 있을 때)"
              className="border-input bg-background h-8 rounded-md border px-2 text-xs"
            />
          </label>
        </div>
      ) : (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
              관련 조문
            </span>
            <input
              type="text"
              name={`choice_${choice.choiceIndex}_article_number`}
              value={articleNumber}
              onChange={(e) => setArticleNumber(e.target.value)}
              placeholder="29 / 28의2"
              className="border-input bg-background h-8 rounded-md border px-2 text-xs"
            />
          </label>
          {/* type 변경 시 case_number 보존을 위해 hidden input 으로 캐리. */}
          <input
            type="hidden"
            name={`choice_${choice.choiceIndex}_case_number`}
            value=""
          />
        </>
      )}
    </div>
  );
}

// 해설 텍스트로부터 type 추정 — 사용자가 type 을 미설정한 경우의 기본값.
function guessTypeFromText(text: string): ProblemChoiceType | null {
  if (!text) return null;
  if (extractCaseNumber(text)) return "precedent";
  if (extractArticleNumber(text)) return "statute";
  return null;
}
