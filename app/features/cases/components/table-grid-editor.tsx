// 표 시각 편집기(스프레드시트형) — 파이프 마크다운 표 하나를 그리드로 편집.
// 셀 클릭 선택 → textarea 편집, 행/열 삽입·삭제, 셀 병합(← 왼쪽 / ↑ 위) 토글.
// 적용 시 serializeTableGrid 로 마크다운을 되돌려 onApply 에 넘긴다(호출측이 본문의
// 해당 표 블록만 교체). 병합·오프셋 규약은 table-grid.ts / case-markdown.ts SSOT.
import {
  ArrowDownToLineIcon,
  ArrowLeftToLineIcon,
  ArrowRightToLineIcon,
  ArrowUpToLineIcon,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import { renderTableHtml } from "~/features/cases/lib/case-markdown";
import {
  addColumn,
  addRow,
  isMergeMarker,
  MERGE_LEFT,
  MERGE_UP,
  parseTableGrid,
  removeColumn,
  removeRow,
  serializeTableGrid,
  type TableGrid,
  toggleMergeLeft,
  toggleMergeUp,
} from "~/features/cases/lib/table-grid";

function colCount(grid: TableGrid): number {
  return Math.max(1, ...grid.rows.map((r) => r.length));
}

export function TableGridEditor({
  initialMarkdown,
  onApply,
  onCancel,
}: {
  initialMarkdown: string;
  onApply: (markdown: string) => void;
  onCancel: () => void;
}) {
  const [grid, setGrid] = useState<TableGrid>(
    () => parseTableGrid(initialMarkdown) ?? { rows: [["", ""], ["", ""]] },
  );
  const [sel, setSel] = useState<{ r: number; c: number } | null>(null);
  const cols = colCount(grid);

  const previewHtml = useMemo(
    () => renderTableHtml(serializeTableGrid(grid)),
    [grid],
  );

  const setCell = (r: number, c: number, text: string) =>
    setGrid((g) => {
      const rows = g.rows.map((row) => [...row]);
      while (rows[r].length < cols) rows[r].push("");
      rows[r][c] = text;
      return { rows };
    });

  const selCellText =
    sel && grid.rows[sel.r] ? (grid.rows[sel.r][sel.c] ?? "") : null;
  const canMergeLeft = sel !== null && sel.c > 0;
  const canMergeUp = sel !== null && sel.r > 0;
  const selIsMergeLeft = selCellText === MERGE_LEFT;
  const selIsMergeUp = selCellText === MERGE_UP;

  return (
    <div className="border-border bg-card space-y-3 rounded-lg border p-3">
      {/* 툴바 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground mr-1 text-[11px] font-semibold">
          표 편집
        </span>
        <ToolBtn
          disabled={sel === null}
          onClick={() => sel && setGrid((g) => addRow(g, sel.r))}
          icon={<ArrowUpToLineIcon className="size-3" />}
          label="위에 행"
        />
        <ToolBtn
          disabled={sel === null}
          onClick={() => sel && setGrid((g) => addRow(g, sel.r + 1))}
          icon={<ArrowDownToLineIcon className="size-3" />}
          label="아래 행"
        />
        <ToolBtn
          disabled={sel === null || grid.rows.length <= 1}
          onClick={() =>
            sel &&
            setGrid((g) => {
              const next = removeRow(g, sel.r);
              setSel(null);
              return next;
            })
          }
          icon={<Trash2Icon className="size-3" />}
          label="행 삭제"
          tone="danger"
        />
        <span className="bg-border mx-1 h-4 w-px" />
        <ToolBtn
          disabled={sel === null}
          onClick={() => sel && setGrid((g) => addColumn(g, sel.c))}
          icon={<ArrowLeftToLineIcon className="size-3" />}
          label="왼쪽 열"
        />
        <ToolBtn
          disabled={sel === null}
          onClick={() => sel && setGrid((g) => addColumn(g, sel.c + 1))}
          icon={<ArrowRightToLineIcon className="size-3" />}
          label="오른쪽 열"
        />
        <ToolBtn
          disabled={sel === null || cols <= 1}
          onClick={() =>
            sel &&
            setGrid((g) => {
              const next = removeColumn(g, sel.c);
              setSel(null);
              return next;
            })
          }
          icon={<Trash2Icon className="size-3" />}
          label="열 삭제"
          tone="danger"
        />
        <span className="bg-border mx-1 h-4 w-px" />
        <ToolBtn
          disabled={!canMergeLeft}
          active={selIsMergeLeft}
          onClick={() => sel && setGrid((g) => toggleMergeLeft(g, sel.r, sel.c))}
          label={selIsMergeLeft ? "← 병합 해제" : "← 왼쪽과 병합"}
        />
        <ToolBtn
          disabled={!canMergeUp}
          active={selIsMergeUp}
          onClick={() => sel && setGrid((g) => toggleMergeUp(g, sel.r, sel.c))}
          label={selIsMergeUp ? "↑ 병합 해제" : "↑ 위와 병합"}
        />
      </div>

      {/* 그리드 */}
      <div className="overflow-x-auto">
        <table className="border-collapse text-[13px]">
          <tbody>
            {grid.rows.map((row, r) => (
              <tr key={r}>
                {Array.from({ length: cols }).map((_, c) => {
                  const text = row[c] ?? "";
                  const isSel = sel?.r === r && sel?.c === c;
                  const isHeader = r === 0;
                  const merge = isMergeMarker(text);
                  return (
                    <td
                      key={c}
                      onClick={() => setSel({ r, c })}
                      className={cn(
                        "border-border min-w-[7rem] border p-0 align-top",
                        isSel && "ring-primary ring-2 ring-inset",
                        isHeader && "bg-muted/50",
                      )}
                    >
                      {merge ? (
                        <div className="text-muted-foreground flex h-full min-h-[2.5rem] items-center justify-center gap-1 px-2 py-1 text-[11px] italic">
                          {text === MERGE_LEFT ? "← 병합됨" : "↑ 병합됨"}
                        </div>
                      ) : (
                        <textarea
                          value={text}
                          onChange={(e) => setCell(r, c, e.target.value)}
                          onFocus={() => setSel({ r, c })}
                          rows={2}
                          className={cn(
                            "block w-full resize-y bg-transparent px-2 py-1 outline-none",
                            isHeader && "font-semibold",
                          )}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground text-[11px]">
        셀을 클릭해 선택한 뒤 위 버튼으로 행·열을 넣거나 셀을 병합합니다. 첫 행은
        제목 행입니다.
      </p>

      {/* 미리보기 */}
      <div>
        <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">
          미리보기
        </p>
        <div
          className="case-prose text-[13px]"
          // renderTableHtml = DOMPurify sanitize 된 표 HTML (XSS 안전).
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          취소
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => onApply(serializeTableGrid(grid))}
        >
          표 적용
        </Button>
      </div>
    </div>
  );
}

function ToolBtn({
  onClick,
  disabled,
  active,
  icon,
  label,
  tone,
}: {
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  icon?: React.ReactNode;
  label: string;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors disabled:opacity-40",
        active
          ? "border-primary bg-primary/10 text-primary"
          : tone === "danger"
            ? "hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/20"
            : "hover:bg-accent",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
