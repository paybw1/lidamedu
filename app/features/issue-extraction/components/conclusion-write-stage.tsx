// 공통 — ③ 결론 + ④ 강약·목차 백지 작성.
// 각 쟁점에 (a) 결론 direction (b) 짧은 근거 (c) 강약 3단계
// + 하단에 답안 목차 textarea 1개.
// 모범 결론·권장 강약은 절대 노출 X (백지).

import { PencilLineIcon, SendIcon } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";
import { Chip } from "~/features/community/components/community-ui";

import type {
  ConclusionsMap,
  EmphasisMap,
  IssueEmphasis,
  MasterIssue,
} from "../lib/types";

interface ConclusionWriteStageProps {
  /** 쟁점 목록 — 처음부터 노출(②와 달리 학생이 보면서 결론·강약을 입력). */
  masterIssues: MasterIssue[];
  initialConclusions: ConclusionsMap | null;
  initialEmphasis: EmphasisMap | null;
  initialOutlineMd: string;
  actionUrl: string;
  autosaveIntent?: string;
  submitIntent?: string;
  hiddenFields: Record<string, string>;
  hint?: ReactNode;
}

const EMPHASIS_VALUES: IssueEmphasis[] = ["strong", "medium", "weak"];
const EMPHASIS_LABEL: Record<IssueEmphasis, string> = {
  strong: "강",
  medium: "중",
  weak: "약",
};

export function ConclusionWriteStage({
  masterIssues,
  initialConclusions,
  initialEmphasis,
  initialOutlineMd,
  actionUrl,
  autosaveIntent = "autosave",
  submitIntent = "submit",
  hiddenFields,
  hint,
}: ConclusionWriteStageProps) {
  const [conclusions, setConclusions] = useState<ConclusionsMap>(
    initialConclusions ?? {},
  );
  const [emphasis, setEmphasis] = useState<EmphasisMap>(initialEmphasis ?? {});
  const [outline, setOutline] = useState(initialOutlineMd);
  const autoFetcher = useFetcher<{ ok?: true; error?: string }>();
  const submitFetcher = useFetcher<{ ok?: true; error?: string }>();
  const revalidator = useRevalidator();
  const lastSavedRef = useRef<string>(
    serialize(conclusions, emphasis, outline),
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (
      submitFetcher.state === "idle" &&
      submitFetcher.data &&
      "ok" in submitFetcher.data &&
      submitFetcher.data.ok
    )
      revalidator.revalidate();
  }, [submitFetcher.state, submitFetcher.data, revalidator]);

  // autosave 1000ms.
  useEffect(() => {
    const cur = serialize(conclusions, emphasis, outline);
    if (cur === lastSavedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const fd = new FormData();
      fd.set("intent", autosaveIntent);
      for (const [k, v] of Object.entries(hiddenFields)) fd.set(k, v);
      fd.set("conclusions", JSON.stringify(conclusions));
      fd.set("emphasisMap", JSON.stringify(emphasis));
      fd.set("outlineMd", outline);
      autoFetcher.submit(fd, { method: "post", action: actionUrl });
      lastSavedRef.current = cur;
    }, 1000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conclusions, emphasis, outline]);

  const setDirection = (id: string, v: string) =>
    setConclusions((c) => ({
      ...c,
      [id]: { ...(c[id] ?? { direction: "" }), direction: v },
    }));
  const setRationale = (id: string, v: string) =>
    setConclusions((c) => ({
      ...c,
      [id]: { ...(c[id] ?? { direction: "" }), rationaleMd: v },
    }));
  const setEmph = (id: string, v: IssueEmphasis) =>
    setEmphasis((m) => ({ ...m, [id]: v }));

  const submit = () => {
    const filledCount = masterIssues.filter(
      (i) => (conclusions[i.issueId]?.direction ?? "").trim().length > 0,
    ).length;
    if (filledCount < Math.min(2, masterIssues.length)) {
      alert("최소 2개 쟁점의 결론은 적어 주세요.");
      return;
    }
    if (
      !confirm(
        "제출 후에는 모범 결론·권장 강약이 공개되고 자기채점 단계로 넘어갑니다. 제출하시겠습니까?",
      )
    )
      return;
    const fd = new FormData();
    fd.set("intent", submitIntent);
    for (const [k, v] of Object.entries(hiddenFields)) fd.set(k, v);
    fd.set("conclusions", JSON.stringify(conclusions));
    fd.set("emphasisMap", JSON.stringify(emphasis));
    fd.set("outlineMd", outline);
    submitFetcher.submit(fd, { method: "post", action: actionUrl });
  };

  return (
    <section className="space-y-4">
      <div className="border-primary/20 bg-primary/[0.04] flex items-start gap-2 rounded-2xl border p-3 text-xs leading-relaxed">
        <PencilLineIcon className="text-link mt-0.5 size-4 shrink-0" />
        <p className="text-foreground">
          {hint ?? (
            <>
              각 쟁점에 <strong>결론(방향)</strong>과 <strong>강약</strong>을
              표시하고, 아래에 답안 목차를 짜 보세요. 모범 결론은 제출 전에
              절대 보지 마세요.
            </>
          )}
        </p>
      </div>

      <ul className="space-y-3">
        {masterIssues.map((iss) => {
          const c = conclusions[iss.issueId] ?? { direction: "" };
          const e = emphasis[iss.issueId];
          return (
            <li
              key={iss.issueId}
              className="border-border bg-card space-y-2 rounded-xl border p-3 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <Chip tone={iss.importance === "core" ? "primary" : "outline"}>
                  {iss.importance === "core" ? "핵심" : "부차"}
                </Chip>
                <p className="text-foreground text-sm font-bold">
                  {iss.label}
                </p>
                {iss.refHint ? <Chip tone="outline">{iss.refHint}</Chip> : null}
              </div>
              {iss.descriptionMd ? (
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {iss.descriptionMd}
                </p>
              ) : null}
              <Input
                value={c.direction}
                onChange={(ev) => setDirection(iss.issueId, ev.target.value)}
                placeholder="결론 (예: 인정 / 부정 / 성립 / 불성립)"
                className="text-sm"
              />
              <Textarea
                value={c.rationaleMd ?? ""}
                onChange={(ev) => setRationale(iss.issueId, ev.target.value)}
                placeholder="짧은 근거(선택)"
                className="min-h-[50px] text-xs"
              />
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-[10px] font-bold uppercase">
                  강약
                </span>
                {EMPHASIS_VALUES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setEmph(iss.issueId, v)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-bold transition-colors",
                      e === v
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {EMPHASIS_LABEL[v]}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="border-border bg-card space-y-2 rounded-2xl border p-4 shadow-sm">
        <p className="text-muted-foreground font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
          답안 목차 (순서 · 분량 비중)
        </p>
        <Textarea
          value={outline}
          onChange={(e) => setOutline(e.target.value)}
          className="min-h-[180px] text-sm leading-relaxed"
          placeholder={`예:
I. 신규성 위반 (제29조 제1항) — 핵심, 분량 50%
  1. 공지된 발명과 동일성 판단
II. 진보성 (제29조 제2항) — 부차, 분량 30%
III. 출원경과 금반언 — 보조, 분량 20%`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-muted-foreground text-[11px]">
          {autoFetcher.state !== "idle"
            ? "저장 중…"
            : serialize(conclusions, emphasis, outline) === lastSavedRef.current
              ? "자동 저장됨"
              : "변경 — 곧 저장"}
        </span>
        <Button
          type="button"
          onClick={submit}
          className="ml-auto rounded-full"
          disabled={submitFetcher.state !== "idle"}
        >
          <SendIcon className="size-4" /> 제출 → 모범 결론·강약 보기
        </Button>
      </div>
    </section>
  );
}

function serialize(
  c: ConclusionsMap,
  e: EmphasisMap,
  o: string,
): string {
  return JSON.stringify({ c, e, o });
}
