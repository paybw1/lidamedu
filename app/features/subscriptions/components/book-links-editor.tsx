// feat-11-007 #14 — 강의별 주교재/부교재 연결 편집기(클라). 도서 선택 → 주/부·필수/선택·순서
//   지정. 값은 hidden input(bookLinks JSON)로 직렬화 → admin-plan action 이 syncPlanBookLinks 로 저장.
import { ArrowDownIcon, ArrowUpIcon, XIcon } from "lucide-react";
import { useState } from "react";

import type {
  BookRequirement,
  BookRole,
  PlanBookLink,
} from "../queries.server";

export interface BookPickItem {
  bookId: string;
  title: string;
  courseOnly?: boolean;
}

interface Row {
  bookId: string;
  role: BookRole;
  requirement: BookRequirement;
}

export function BookLinksEditor({
  books,
  value,
}: {
  books: BookPickItem[];
  value: PlanBookLink[];
}) {
  const [rows, setRows] = useState<Row[]>(
    value.map((v) => ({
      bookId: v.bookId,
      role: v.role,
      requirement: v.requirement,
    })),
  );
  const titleOf = (id: string) =>
    books.find((b) => b.bookId === id)?.title ?? "(삭제된 도서)";
  const available = books.filter((b) => !rows.some((r) => r.bookId === b.bookId));

  const add = (bookId: string) => {
    if (!bookId) return;
    setRows((r) => [...r, { bookId, role: "main", requirement: "optional" }]);
  };
  const patch = (i: number, p: Partial<Row>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...p } : row)));
  const remove = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) =>
    setRows((r) => {
      const j = i + dir;
      if (j < 0 || j >= r.length) return r;
      const next = r.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const sel =
    "border-input bg-background h-7 rounded-md border px-1.5 text-[11px]";
  return (
    <div className="border-border bg-muted/30 space-y-2 rounded-lg border border-dashed p-3">
      <p className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
        연결 교재 (주/부교재)
      </p>
      <p className="text-muted-foreground/70 text-[11px]">
        도서를 연결하면 수강신청·결제 화면에 주교재/부교재로 표시됩니다. 순서(↑/↓)는 표시 순서입니다.
      </p>
      {/* 직렬화 — action 이 파싱 */}
      <input type="hidden" name="bookLinks" value={JSON.stringify(rows)} />

      {rows.length > 0 ? (
        <ul className="space-y-1.5">
          {rows.map((row, i) => (
            <li
              key={row.bookId}
              className="border-border bg-background flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5"
            >
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
                {titleOf(row.bookId)}
              </span>
              <select
                value={row.role}
                onChange={(e) => patch(i, { role: e.currentTarget.value as BookRole })}
                className={sel}
                aria-label="주/부교재"
              >
                <option value="main">주교재</option>
                <option value="sub">부교재</option>
              </select>
              <select
                value={row.requirement}
                onChange={(e) =>
                  patch(i, {
                    requirement: e.currentTarget.value as BookRequirement,
                  })
                }
                className={sel}
                aria-label="필수/선택"
              >
                <option value="required">필수구매</option>
                <option value="optional">선택구매</option>
              </select>
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="text-muted-foreground hover:text-foreground inline-flex size-6 items-center justify-center rounded border disabled:opacity-30"
              >
                <ArrowUpIcon className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === rows.length - 1}
                className="text-muted-foreground hover:text-foreground inline-flex size-6 items-center justify-center rounded border disabled:opacity-30"
              >
                <ArrowDownIcon className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => remove(i)}
                className="inline-flex size-6 items-center justify-center rounded border border-rose-300 text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950/30"
                aria-label="연결 해제"
              >
                <XIcon className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground/60 text-[11px]">연결된 교재가 없습니다.</p>
      )}

      {available.length > 0 ? (
        <select
          value=""
          onChange={(e) => {
            add(e.currentTarget.value);
            e.currentTarget.value = "";
          }}
          className="border-input bg-background h-8 w-full rounded-md border px-2 text-[12px]"
        >
          <option value="">+ 교재 추가…</option>
          {available.map((b) => (
            <option key={b.bookId} value={b.bookId}>
              {b.title}
              {b.courseOnly ? " (강의전용)" : ""}
            </option>
          ))}
        </select>
      ) : books.length === 0 ? (
        <p className="text-muted-foreground/60 text-[11px]">
          등록된 도서가 없습니다. (도서 관리에서 먼저 등록)
        </p>
      ) : null}
    </div>
  );
}
