// feat-7-048 D5 — 과목 선택. 법과목은 단원에서 자동 파생되므로 보통 비워 두고,
// 자연과학·기타처럼 파생 근거가 없을 때 고른다. 값 형식은 "kind:code".
import {
  SUBJECT_COLOR_CLASS,
  defaultColorFor,
  subjectOptions,
  type SubjectColorKey,
} from "~/features/study-plans/subject-axis";
import { cn } from "~/core/lib/utils";

export function SubjectSelect({
  name = "subject",
  defaultKind,
  defaultCode,
  colorOverrides,
  label = "과목",
  hint,
}: {
  name?: string;
  defaultKind?: string | null;
  defaultCode?: string | null;
  colorOverrides?: Record<string, string>;
  label?: string;
  hint?: string;
}) {
  const current =
    defaultKind && defaultCode ? `${defaultKind}:${defaultCode}` : "";
  const colorOf = (kind: string, code: string): SubjectColorKey => {
    const o = colorOverrides?.[`${kind}:${code}`];
    return o && o in SUBJECT_COLOR_CLASS
      ? (o as SubjectColorKey)
      : defaultColorFor(kind, code);
  };
  return (
    <div>
      <label className="text-muted-foreground text-[11px]">
        {label}
        {hint ? <span className="ml-1 opacity-80">{hint}</span> : null}
      </label>
      <div className="mt-0.5 flex items-center gap-1.5">
        {current ? (
          <span
            className={cn(
              "size-2.5 shrink-0 rounded-full",
              SUBJECT_COLOR_CLASS[
                colorOf(defaultKind as string, defaultCode as string)
              ].dot,
            )}
          />
        ) : null}
        <select
          name={name}
          defaultValue={current}
          className="border-input bg-background h-8 w-full rounded-md border px-1.5 text-xs"
        >
          <option value="">단원에서 자동 판단</option>
          {subjectOptions().map((o) => (
            <option key={`${o.kind}:${o.code}`} value={`${o.kind}:${o.code}`}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
