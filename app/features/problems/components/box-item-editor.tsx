// 박스형 문제(mc_box) 의 박스 항목(예: ㉠/㉡/㈎/㈏ ...) 편집 카드.
// ChoiceEditor 와 같은 색인 컬럼(choice_type / 조문·판례 ref / OX truth / OX 불가)을
// 갖지만 정답 라디오는 없다 (박스 항목 자체는 정답 후보가 아님).
// 정답 choice body 에 marker 가 포함되면 "정답 그룹" 으로 보고 polarity 규칙으로 OX 자동 도출.

import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "~/core/lib/utils";
import { ExplanationEditor } from "~/features/problems/components/explanation-editor";
import {
  CHOICE_TYPE_COLOR,
  CHOICE_TYPE_LABEL,
  type OxTruth,
  type ProblemBoxItem,
  type ProblemChoiceType,
  type ProblemFormat,
  type ProblemPolarity,
} from "~/features/problems/labels";
import {
  deriveBoxItemOxTruth,
  isForceOxIneligibleFormat,
} from "~/features/problems/lib/auto-ox";
import { extractArticleNumber, extractCaseNumber } from "~/features/problems/extract";

const CHOICE_TYPES: ProblemChoiceType[] = ["statute", "precedent", "theory"];

export function BoxItemEditor({
  item,
  layout = "default",
  polarity = null,
  format,
  correctChoiceBody = null,
  bulkOxSignal,
  subNodeOptions,
}: {
  item: ProblemBoxItem;
  layout?: "default" | "compact";
  polarity?: ProblemPolarity | null;
  format: ProblemFormat;
  correctChoiceBody?: string | null;
  // 부모에서 "전체 OX 불가 체크/해제" 일괄 토글 시 epoch 가 증가.
  bulkOxSignal?: { epoch: number; ineligible: boolean };
  // feat-4-A-342 — 조문번호 → 체계도 소분류 옵션.
  subNodeOptions?: Record<string, { nodeId: string; label: string }[]>;
}) {
  // 사례형(mc_case) 기본 종류는 "조문".
  const initialType =
    item.choiceType ??
    (isForceOxIneligibleFormat(format)
      ? ("statute" as ProblemChoiceType)
      : guess(item.explanationMd ?? ""));
  const [type, setType] = useState<ProblemChoiceType | "">(
    (initialType ?? "") as ProblemChoiceType | "",
  );
  const [explanation, setExplanation] = useState<string>(item.explanationMd ?? "");
  const [articleNumber, setArticleNumber] = useState<string>(item.relatedArticleNumber ?? "");
  const [caseNumber, setCaseNumber] = useState<string>(item.relatedCaseNumber ?? "");
  // feat-4-A-342 — 보기항목 체계도 소분류.
  const [nodeId, setNodeId] = useState<string>(item.relatedNodeId ?? "");
  // 사례형(mc_case) 은 사례 의존이라 단독 OX 가 성립하지 않음 → 미설정이면 자동 체크.
  const [oxIneligible, setOxIneligible] = useState<boolean>(
    item.oxIneligible ||
      (isForceOxIneligibleFormat(format) && item.oxTruth == null),
  );
  // 자동 OX — 저장된 oxTruth 가 비어있을 때만 polarity+정답그룹으로부터 추론. 사용자가 직접 만지면 자동 모드 해제.
  const initialAutoOx = useMemo(
    () =>
      item.oxTruth == null
        ? deriveBoxItemOxTruth({
            polarity,
            format,
            marker: item.marker,
            correctChoiceBody,
            oxIneligible: item.oxIneligible,
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [oxTruth, setOxTruth] = useState<OxTruth | "">(
    (item.oxTruth ?? initialAutoOx ?? "") as OxTruth | "",
  );
  const oxAutoModeRef = useRef<boolean>(item.oxTruth == null);

  useEffect(() => {
    if (!oxAutoModeRef.current) return;
    const next = deriveBoxItemOxTruth({
      polarity,
      format,
      marker: item.marker,
      correctChoiceBody,
      oxIneligible,
    });
    setOxTruth((next ?? "") as OxTruth | "");
  }, [polarity, format, item.marker, correctChoiceBody, oxIneligible]);

  // 부모 format → 사례형 변경 시 OX 불가 + 조문 기본 즉시 반영.
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

  // bulkOxSignal — 부모에서 전체 OX 불가 일괄 토글 시 epoch 증가, 적용.
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
  const [body, setBody] = useState<string>(item.bodyMd);

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

  // feat-4-A-342 — 조문 변경 시 소분류 검증·해제.
  useEffect(() => {
    const opts = subNodeOptions?.[articleNumber.trim()] ?? [];
    setNodeId((cur) => (cur && !opts.some((o) => o.nodeId === cur) ? "" : cur));
  }, [articleNumber, subNodeOptions]);

  const cls = type
    ? CHOICE_TYPE_COLOR[type as ProblemChoiceType]
    : "bg-muted text-muted-foreground";
  const padCls = layout === "compact" ? "p-2 space-y-2" : "p-3 space-y-2";
  const fontCls = layout === "compact" ? "text-xs" : "text-sm";
  const prefix = `box_${item.boxItemId}`;
  const subNodeOpts = subNodeOptions?.[articleNumber.trim()] ?? [];
  const nodeField =
    subNodeOpts.length > 0 ? (
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
          체계도 소분류
        </span>
        <select
          name={`${prefix}_node_id`}
          value={nodeId}
          onChange={(e) => setNodeId(e.target.value)}
          className="border-input bg-background h-8 rounded-md border px-2 text-xs"
        >
          <option value="">(자동 — 문제 기준)</option>
          {subNodeOpts.map((o) => (
            <option key={o.nodeId} value={o.nodeId}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    ) : (
      <input type="hidden" name={`${prefix}_node_id`} value={nodeId} />
    );

  return (
    <div className={cn("border-input border-l-2 border-l-blue-500 rounded-md border", padCls)}>
      <input type="hidden" name={`${prefix}_id`} value={item.boxItemId} />

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-md bg-blue-100 px-1.5 font-bold text-blue-900 dark:bg-blue-950/50 dark:text-blue-200",
            layout === "compact" ? "h-5 text-[12px]" : "h-6 text-sm",
          )}
        >
          {item.marker}
        </span>
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
                name={`${prefix}_ox_truth`}
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
        >
          <input
            type="checkbox"
            name={`${prefix}_ox_ineligible`}
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
          <select
            name={`${prefix}_type`}
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
        </div>
      </div>

      <ExplanationEditor
        compact
        name={`${prefix}_body`}
        value={body}
        onChange={setBody}
        rows={2}
        placeholder="박스 항목 본문"
        className={fontCls}
      />

      <ExplanationEditor
        compact
        name={`${prefix}_explanation`}
        value={explanation}
        onChange={setExplanation}
        rows={2}
        placeholder="해설"
      />

      {type === "precedent" ? (
        <div className="space-y-2">
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
              판례번호
            </span>
            <input
              type="text"
              name={`${prefix}_case_number`}
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
              name={`${prefix}_article_number`}
              value={articleNumber}
              onChange={(e) => setArticleNumber(e.target.value)}
              placeholder="29 / 28의2"
              className="border-input bg-background h-8 rounded-md border px-2 text-xs"
            />
          </label>
          {nodeField}
        </div>
      ) : (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
              관련 조문
            </span>
            <input
              type="text"
              name={`${prefix}_article_number`}
              value={articleNumber}
              onChange={(e) => setArticleNumber(e.target.value)}
              placeholder="29 / 28의2"
              className="border-input bg-background h-8 rounded-md border px-2 text-xs"
            />
          </label>
          {nodeField}
          <input type="hidden" name={`${prefix}_case_number`} value="" />
        </>
      )}
    </div>
  );
}

function guess(text: string): ProblemChoiceType | null {
  if (!text) return null;
  if (extractCaseNumber(text)) return "precedent";
  if (extractArticleNumber(text)) return "statute";
  return null;
}
