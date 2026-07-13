// 시험정보 편집 — /admin/exam-info. staff 전용. 구조화 폼(동적 행) → 단일 JSONB 문서 저장.
//   상태를 React 로 관리하고 hidden "data" 필드에 전체 문서 JSON 을 직렬화해 제출.
//   저장 액션은 /api/admin/landing(entity=exam_info).
import { useState, type ReactNode } from "react";
import { Link, redirect, useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";

import type { ExamCard, ExamInfoData } from "../lib/exam-info";
import { getExamInfo } from "../queries.server";

import type { Route } from "./+types/admin-exam-info";

export function meta() {
  return [{ title: "시험정보 편집 | 운영관리" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/dashboard");
  const info = await getExamInfo(client);
  return { role, info };
}

const IN = "h-9 text-sm";
const TA =
  "border-input bg-background w-full rounded-md border px-3 py-2 text-sm leading-relaxed";

// 두 문자열 필드 배열 편집기(과목·영어·통계·일정행 공용).
function TwoFieldList({
  items,
  keys,
  placeholders,
  onChange,
  addLabel,
}: {
  items: Record<string, string>[];
  keys: [string, string];
  placeholders: [string, string];
  onChange: (items: Record<string, string>[]) => void;
  addLabel: string;
}) {
  const [k1, k2] = keys;
  const patch = (i: number, key: string, val: string) =>
    onChange(items.map((it, j) => (j === i ? { ...it, [key]: val } : it)));
  return (
    <div className="flex flex-col gap-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={it[k1] ?? ""}
            placeholder={placeholders[0]}
            onChange={(e) => patch(i, k1, e.target.value)}
            className={`${IN} w-40 shrink-0`}
          />
          <Input
            value={it[k2] ?? ""}
            placeholder={placeholders[1]}
            onChange={(e) => patch(i, k2, e.target.value)}
            className={`${IN} flex-1`}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground shrink-0"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            삭제
          </Button>
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...items, { [k1]: "", [k2]: "" }])}
        >
          + {addLabel}
        </Button>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function AdminExamInfo({ loaderData }: Route.ComponentProps) {
  const { role, info } = loaderData;
  const fetcher = useFetcher();
  const err =
    fetcher.data && typeof fetcher.data === "object" && "error" in fetcher.data
      ? String((fetcher.data as { error: unknown }).error)
      : null;

  // 편집 상태는 React 로 관리. hidden data 로 직렬화 제출.
  const [d, setD] = useState<ExamInfoData>(info);
  const set = (patch: Partial<ExamInfoData>) =>
    setD((p: ExamInfoData) => ({ ...p, ...patch }));

  const setCard = (i: number, patch: Partial<ExamCard>) =>
    set({ schedule: d.schedule.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  const saving = fetcher.state !== "idle";

  return (
    <AdminShell
      cluster="landing"
      role={role}
      title="시험정보 편집"
      desc="강의 플랫폼 리담안내 › 시험정보(/lecture/exam-info)에 노출되는 내용입니다."
    >
      <fetcher.Form
        method="post"
        action="/api/admin/landing"
        className="mx-auto flex max-w-3xl flex-col gap-5 p-5 md:p-8"
      >
        <input type="hidden" name="entity" value="exam_info" />
        <input type="hidden" name="intent" value="save" />
        <input type="hidden" name="data" value={JSON.stringify(d)} />

        <div className="flex items-center justify-between">
          <Link
            to="/lecture/exam-info"
            target="_blank"
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            공개 페이지 미리보기 ↗
          </Link>
          <Button type="submit" disabled={saving}>
            {saving ? "저장 중…" : "저장"}
          </Button>
        </div>

        {err ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {err}
          </p>
        ) : null}

        <Section title="머리말">
          <textarea
            rows={2}
            value={d.intro}
            onChange={(e) => set({ intro: e.target.value })}
            className={TA}
          />
        </Section>

        <Section title="시험 일정">
          <div className="flex flex-col gap-4">
            {d.schedule.map((card, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={card.title}
                    placeholder="제목(예: 제1차 시험)"
                    onChange={(e) => setCard(i, { title: e.target.value })}
                    className={`${IN} flex-1`}
                  />
                  <Input
                    value={card.kind}
                    placeholder="유형(예: 객관식 5지선다)"
                    onChange={(e) => setCard(i, { kind: e.target.value })}
                    className={`${IN} w-48`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground shrink-0"
                    onClick={() =>
                      set({ schedule: d.schedule.filter((_, j) => j !== i) })
                    }
                  >
                    카드 삭제
                  </Button>
                </div>
                <TwoFieldList
                  items={card.rows}
                  keys={["label", "value"]}
                  placeholders={["항목(예: 시험일)", "내용(예: 2026. 2. 28.(토))"]}
                  addLabel="행 추가"
                  onChange={(rows) =>
                    setCard(i, { rows: rows as ExamCard["rows"] })
                  }
                />
              </div>
            ))}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  set({
                    schedule: [...d.schedule, { title: "", kind: "", rows: [] }],
                  })
                }
              >
                + 일정 카드 추가
              </Button>
            </div>
          </div>
        </Section>

        <Section title="제1차 과목">
          <TwoFieldList
            items={d.firstSubjects}
            keys={["name", "desc"]}
            placeholders={["과목명", "설명"]}
            addLabel="과목 추가"
            onChange={(firstSubjects) =>
              set({ firstSubjects: firstSubjects as ExamInfoData["firstSubjects"] })
            }
          />
          <Label className="mt-2 text-[13px]">1차 합격 기준</Label>
          <textarea
            rows={2}
            value={d.firstCriteria}
            onChange={(e) => set({ firstCriteria: e.target.value })}
            className={TA}
          />
        </Section>

        <Section title="제2차 과목">
          <Label className="text-[13px]">필수과목</Label>
          <Input
            value={d.secondRequired}
            onChange={(e) => set({ secondRequired: e.target.value })}
            className={IN}
          />
          <Label className="mt-1 text-[13px]">선택과목</Label>
          <Input
            value={d.secondElective}
            onChange={(e) => set({ secondElective: e.target.value })}
            className={IN}
          />
          <Label className="mt-1 text-[13px]">2차 합격 기준</Label>
          <textarea
            rows={2}
            value={d.secondCriteria}
            onChange={(e) => set({ secondCriteria: e.target.value })}
            className={TA}
          />
        </Section>

        <Section title="영어 대체시험 인정 점수">
          <TwoFieldList
            items={d.english}
            keys={["name", "score"]}
            placeholders={["시험명(예: TOEIC)", "기준 점수(예: 775)"]}
            addLabel="시험 추가"
            onChange={(english) =>
              set({ english: english as ExamInfoData["english"] })
            }
          />
          <Label className="mt-2 text-[13px]">영어 안내 문구</Label>
          <textarea
            rows={2}
            value={d.englishNote}
            onChange={(e) => set({ englishNote: e.target.value })}
            className={TA}
          />
        </Section>

        <Section title="주요 통계">
          <TwoFieldList
            items={d.stats}
            keys={["value", "label"]}
            placeholders={["수치(예: 3,541명)", "설명(예: 2025년 제1차 응시)"]}
            addLabel="통계 추가"
            onChange={(stats) => set({ stats: stats as ExamInfoData["stats"] })}
          />
        </Section>

        <Section title="출처 안내">
          <textarea
            rows={3}
            value={d.source}
            onChange={(e) => set({ source: e.target.value })}
            className={TA}
          />
        </Section>

        <div className="flex justify-end border-t pt-4">
          <Button type="submit" disabled={saving}>
            {saving ? "저장 중…" : "저장"}
          </Button>
        </div>
      </fetcher.Form>
    </AdminShell>
  );
}
