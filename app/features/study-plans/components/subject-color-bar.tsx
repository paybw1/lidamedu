// feat-7-048 D6 — 과목 색 지정. 팔레트 키만 저장한다(hex 금지 — 다크 모드 정합).
// 계획 항목 탭에 두고, 여기서 고른 색이 공부 통계·하루 상세 타일에 그대로 쓰인다.
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";

import { cn } from "~/core/lib/utils";
import {
  SUBJECT_COLOR_CLASS,
  SUBJECT_COLOR_KEYS,
  defaultColorFor,
  subjectName,
  type SubjectColorKey,
} from "~/features/study-plans/subject-axis";

const API = "/api/study-plan";

export function SubjectColorBar({
  subjects,
  colorOverrides,
  onSaved,
}: {
  /** 이 달 계획·기록에 등장한 과목들. 미분류는 넘기지 않는다. */
  subjects: Array<{ kind: string; code: string }>;
  colorOverrides: Record<string, string>;
  onSaved: () => void;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "ok" in fetcher.data && fetcher.data.ok) {
      onSaved();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);
  if (subjects.length === 0) return null;

  const colorOf = (kind: string, code: string): SubjectColorKey => {
    const o = colorOverrides[`${kind}:${code}`];
    return o && o in SUBJECT_COLOR_CLASS
      ? (o as SubjectColorKey)
      : defaultColorFor(kind, code);
  };

  const save = (kind: string, code: string, colorKey: SubjectColorKey) => {
    const fd = new FormData();
    fd.set("intent", "set_subject_color");
    fd.set("subject", `${kind}:${code}`);
    fd.set("colorKey", colorKey);
    fetcher.submit(fd, { method: "post", action: API });
    setOpen(null);
    // 갱신은 위 effect 에서 — 응답 전에 로더를 다시 돌리면 옛 색이 그대로 온다.
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground text-[11px]">과목 색</span>
      {subjects.map(({ kind, code }) => {
        const key = `${kind}:${code}`;
        return (
          <span key={key} className="relative">
            <button
              type="button"
              onClick={() => setOpen(open === key ? null : key)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                SUBJECT_COLOR_CLASS[colorOf(kind, code)].chip,
              )}
            >
              <span
                className={cn(
                  "size-2 rounded-full",
                  SUBJECT_COLOR_CLASS[colorOf(kind, code)].dot,
                )}
              />
              {subjectName(kind, code)}
            </button>
            {open === key ? (
              <span className="bg-popover absolute top-full left-0 z-20 mt-1 flex gap-1 rounded-lg border p-1.5 shadow-md">
                {SUBJECT_COLOR_KEYS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={SUBJECT_COLOR_CLASS[c].label}
                    onClick={() => save(kind, code, c)}
                    className={cn(
                      "size-5 rounded-full",
                      SUBJECT_COLOR_CLASS[c].dot,
                      colorOf(kind, code) === c && "ring-foreground/60 ring-2",
                    )}
                  />
                ))}
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
