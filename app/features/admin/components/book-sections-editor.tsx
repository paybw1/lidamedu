// feat-3-213 — 판례집 구조화 본문(book_sections) 편집기. admin-case-edit 전용.
//
// 상표 판례 뷰어의 표시 SSOT 는 cases.book_sections — 이 편집기가 유일한 수정 경로.
// SummaryItemsEditor 와 동일 패턴: 로컬 상태 + hidden input(JSON) + flushSync 로
// "변경 저장" 클릭 직전 stale FormData race 방지.
//
// 섹션이 하나도 없으면 저장 시 book_sections=null → 뷰어는 기존 generic 렌더(특허 등).
import { GripVerticalIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { flushSync } from "react-dom";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Textarea } from "~/core/components/ui/textarea";
import type {
  BookSection,
  BookSectionBlock,
  BookSectionCell,
} from "~/features/cases/labels";

// 교재 표준 섹션 구분 — 구분(key)별 허용 제목 변형 (원장 확정 용어, 2026-07-07).
//   본심의 판단 = 대법원 판결이면 "대법원의 판단", 특허법원 확정 판결이면 "특허법원의 판단" 등
//   원심의 판단 = "특허법원의 판단"(대법원 판결의 원심), "심판원의 판단" 등
const SECTION_CHOICES: { key: string; group: string; labels: string[] }[] = [
  { key: "mark", group: "쟁점상표", labels: ["쟁점상표"] },
  { key: "issues", group: "사안의 쟁점", labels: ["사안의 쟁점"] },
  { key: "facts", group: "사실관계", labels: ["사실관계"] },
  {
    key: "lower",
    group: "원심의 판단",
    labels: ["원심의 판단", "전심의 판단", "특허법원의 판단", "심판원의 판단"],
  },
  { key: "doctrine", group: "관련 법리", labels: ["관련 법리"] },
  {
    key: "holding",
    group: "본심의 판단",
    labels: ["본심의 판단", "대법원의 판단", "특허법원의 판단"],
  },
  { key: "index", group: "인덱스", labels: ["인덱스"] },
  { key: "related-cases", group: "관련판례", labels: ["관련판례"] },
  { key: "comment", group: "평석 (출처 입력)", labels: ["평석"] },
  { key: "reference", group: "참고 (제목 입력)", labels: ["참고", "참고 1", "참고 2"] },
];

// "reference-2" 같은 파생 key 도 기본 구분으로 조회.
const choiceForKey = (key: string) =>
  SECTION_CHOICES.find((c) => c.key === key.replace(/-\d+$/, ""));

const emptyCell = (): BookSectionCell => ({ text: "", images: [] });

export function BookSectionsEditor({
  defaultSections,
}: {
  defaultSections: BookSection[];
}) {
  const [sections, setSections] = useState<BookSection[]>(defaultSections);
  const [presetValue, setPresetValue] = useState(
    `${SECTION_CHOICES[0].key}|${SECTION_CHOICES[0].labels[0]}`,
  );
  const set = (updater: (prev: BookSection[]) => BookSection[]) =>
    flushSync(() => setSections(updater));
  const patchSection = (si: number, p: Partial<BookSection>) =>
    set((prev) => prev.map((s, i) => (i === si ? { ...s, ...p } : s)));
  const patchBlock = (si: number, bi: number, block: BookSectionBlock) =>
    set((prev) =>
      prev.map((s, i) =>
        i === si
          ? { ...s, blocks: s.blocks.map((b, j) => (j === bi ? block : b)) }
          : s,
      ),
    );
  const move = (si: number, dir: -1 | 1) =>
    set((prev) => {
      const next = [...prev];
      const to = si + dir;
      if (to < 0 || to >= next.length) return prev;
      [next[si], next[to]] = [next[to], next[si]];
      return next;
    });

  return (
    <div className="space-y-3">
      <input type="hidden" name="bookSections" value={JSON.stringify(sections)} />

      {sections.length === 0 ? (
        <p className="text-muted-foreground text-xs leading-relaxed">
          구조화 본문이 없습니다 — 뷰어는 위의 요지·판시이유·비고 필드로 렌더합니다.
          섹션을 추가하면 이 판례는 교재 구조(쟁점상표 표 → 사안의 쟁점 → … → 평석)로
          표시되고, 위 필드들은 검색·목록 제목에만 쓰입니다.
        </p>
      ) : null}

      {sections.map((sec, si) => (
        <div
          key={si}
          className="border-input bg-muted/20 space-y-2 rounded-md border p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <GripVerticalIcon className="text-muted-foreground size-3.5" />
            {/* 구분 제목 — 정해진 변형에서 선택 (예: 본심의 판단 ↔ 대법원의 판단) */}
            {choiceForKey(sec.key) ? (
              <select
                value={sec.label}
                onChange={(e) => patchSection(si, { label: e.target.value })}
                className="border-input bg-background h-7 rounded-md border px-2 text-xs font-semibold"
              >
                {[
                  ...new Set([...(choiceForKey(sec.key)?.labels ?? []), sec.label]),
                ].map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                value={sec.label}
                onChange={(e) => patchSection(si, { label: e.target.value })}
                className="h-7 w-44 text-xs font-semibold"
                maxLength={60}
              />
            )}
            <span className="text-muted-foreground font-mono text-[10px]">
              {choiceForKey(sec.key)?.group ?? sec.key}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px]"
                disabled={si === 0}
                onClick={() => move(si, -1)}
              >
                ↑
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px]"
                disabled={si === sections.length - 1}
                onClick={() => move(si, 1)}
              >
                ↓
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 gap-1 px-2 text-[11px] text-rose-600 hover:text-rose-700"
                onClick={() => set((prev) => prev.filter((_, i) => i !== si))}
              >
                <Trash2Icon className="size-3" /> 섹션 삭제
              </Button>
            </div>
          </div>

          {/* 평석 → 출처 입력. 뷰어 섹션 헤더 우측 "출처: …" 로 표시. */}
          {sec.key === "comment" || sec.source ? (
            <Input
              value={sec.source ?? ""}
              onChange={(e) =>
                patchSection(si, {
                  source: e.target.value.trim() === "" ? null : e.target.value,
                })
              }
              placeholder="출처 — 예: (손천우, …, 대법원 판례해설 제126호(2020년 하), 법원도서관, 2021년, 508-530면 참고)"
              className="h-7 text-xs"
              maxLength={500}
            />
          ) : null}
          {/* 참고 → 제목 입력. 뷰어 섹션 헤더 우측 표시. */}
          {sec.key.startsWith("reference") || sec.title ? (
            <Input
              value={sec.title ?? ""}
              onChange={(e) =>
                patchSection(si, {
                  title: e.target.value.trim() === "" ? null : e.target.value,
                })
              }
              placeholder="제목 — 예: 특허청 심사관 및 특허심판원의 판단"
              className="h-7 text-xs"
              maxLength={300}
            />
          ) : null}

          {sec.blocks.map((b, bi) => (
            <div key={bi} className="group/block relative">
              {b.type === "p" ? (
                <div className="flex items-start gap-1.5">
                  <Textarea
                    value={b.text}
                    onChange={(e) =>
                      patchBlock(si, bi, { type: "p", text: e.target.value })
                    }
                    rows={Math.min(8, Math.max(2, Math.ceil(b.text.length / 90)))}
                    className="text-sm leading-relaxed"
                  />
                  <BlockRemoveButton
                    onClick={() =>
                      patchSection(si, {
                        blocks: sec.blocks.filter((_, j) => j !== bi),
                      })
                    }
                  />
                </div>
              ) : (
                <BookTableEditor
                  rows={b.rows}
                  onChange={(rows) => patchBlock(si, bi, { type: "table", rows })}
                  onRemove={() =>
                    patchSection(si, {
                      blocks: sec.blocks.filter((_, j) => j !== bi),
                    })
                  }
                />
              )}
            </div>
          ))}

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 gap-1 px-2 text-[11px]"
              onClick={() =>
                patchSection(si, {
                  blocks: [...sec.blocks, { type: "p", text: "" }],
                })
              }
            >
              <PlusIcon className="size-3" /> 문단
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 gap-1 px-2 text-[11px]"
              onClick={() =>
                patchSection(si, {
                  blocks: [
                    ...sec.blocks,
                    {
                      type: "table",
                      rows: [
                        [emptyCell(), emptyCell(), emptyCell()],
                        [emptyCell(), emptyCell(), emptyCell()],
                      ],
                    },
                  ],
                })
              }
            >
              <PlusIcon className="size-3" /> 표 (2×3)
            </Button>
          </div>
        </div>
      ))}

      <div className="flex items-center gap-2">
        <select
          value={presetValue}
          onChange={(e) => setPresetValue(e.target.value)}
          className="border-input bg-background h-7 rounded-md border px-2 text-xs"
        >
          {SECTION_CHOICES.map((c) =>
            c.labels.length === 1 ? (
              <option key={c.key} value={`${c.key}|${c.labels[0]}`}>
                {c.group}
              </option>
            ) : (
              <optgroup key={c.key} label={c.group}>
                {c.labels.map((l) => (
                  <option key={l} value={`${c.key}|${l}`}>
                    {l}
                  </option>
                ))}
              </optgroup>
            ),
          )}
        </select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-xs"
          onClick={() => {
            const [key, label] = presetValue.split("|");
            set((prev) => {
              // 같은 구분이 이미 있으면 key 에 -2, -3 접미 (참고 2개 등)
              const dup = prev.filter((s) => s.key.replace(/-\d+$/, "") === key).length;
              return [
                ...prev,
                {
                  key: dup > 0 ? `${key}-${dup + 1}` : key,
                  label,
                  blocks: [{ type: "p", text: "" }],
                  source: null,
                  title: null,
                },
              ];
            });
          }}
        >
          <PlusIcon className="size-3.5" /> 섹션 추가
        </Button>
      </div>
    </div>
  );
}

function BlockRemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-6 shrink-0 px-1.5 text-rose-600 hover:text-rose-700"
      aria-label="블록 삭제"
      onClick={onClick}
    >
      <Trash2Icon className="size-3" />
    </Button>
  );
}

// 표 편집 — 셀 텍스트(작은 textarea) + 셀 이미지 썸네일(제거 가능) + 행 추가/삭제.
// 셀 이미지 추가는 URL 붙여넣기(교재 이미지는 이미 storage 에 있으므로 URL 재사용).
function BookTableEditor({
  rows,
  onChange,
  onRemove,
}: {
  rows: BookSectionCell[][];
  onChange: (rows: BookSectionCell[][]) => void;
  onRemove: () => void;
}) {
  const patchCell = (ri: number, ci: number, p: Partial<BookSectionCell>) =>
    onChange(
      rows.map((row, i) =>
        i === ri ? row.map((c, j) => (j === ci ? { ...c, ...p } : c)) : row,
      ),
    );
  const cols = Math.max(...rows.map((r) => r.length));

  return (
    <div className="border-border space-y-1.5 rounded-md border border-dashed p-2">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
          표 ({rows.length}×{cols})
        </span>
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px]"
            onClick={() =>
              onChange([...rows, Array.from({ length: cols }, emptyCell)])
            }
          >
            <PlusIcon className="size-3" /> 행
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px]"
            disabled={rows.length <= 1}
            onClick={() => onChange(rows.slice(0, -1))}
          >
            − 행
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-2 text-[11px] text-rose-600 hover:text-rose-700"
            onClick={onRemove}
          >
            <Trash2Icon className="size-3" /> 표 삭제
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} className="border-border border p-1 align-top">
                    <Textarea
                      value={cell.text}
                      onChange={(e) => patchCell(ri, ci, { text: e.target.value })}
                      rows={1}
                      className="min-h-7 border-0 bg-transparent p-1 text-xs shadow-none focus-visible:ring-1"
                    />
                    {cell.images.map((img, ii) => (
                      <div
                        key={ii}
                        className="border-border mt-1 flex items-center gap-1.5 rounded border bg-white p-1"
                      >
                        <img
                          src={img.url}
                          alt={img.alt}
                          className="max-h-12 w-auto object-contain"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-5 px-1 text-rose-600"
                          aria-label="셀 이미지 제거"
                          onClick={() =>
                            patchCell(ri, ci, {
                              images: cell.images.filter((_, k) => k !== ii),
                            })
                          }
                        >
                          <Trash2Icon className="size-3" />
                        </Button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground mt-0.5 text-[10px] underline-offset-2 hover:underline"
                      onClick={() => {
                        const url = prompt(
                          "셀 이미지 URL (본문 이미지 카드에 업로드된 URL 붙여넣기):",
                        );
                        if (!url || !/^https:\/\//.test(url.trim())) return;
                        patchCell(ri, ci, {
                          images: [...cell.images, { url: url.trim(), alt: "" }],
                        });
                      }}
                    >
                      + 이미지
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
