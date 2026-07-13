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
const DEL = "text-muted-foreground shrink-0";

// 두 문자열 필드 배열 편집기(과목·영어·과목특징 공용).
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
            className={DEL}
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

// N개 문자열 필드 배열 편집기(시험시간표·연도별 통계 등 표 형태).
function MultiFieldList({
  items,
  columns,
  onChange,
  addLabel,
}: {
  items: Record<string, string>[];
  columns: { key: string; label: string; w?: number }[];
  onChange: (items: Record<string, string>[]) => void;
  addLabel: string;
}) {
  const patch = (i: number, key: string, val: string) =>
    onChange(items.map((it, j) => (j === i ? { ...it, [key]: val } : it)));
  const blank = () => Object.fromEntries(columns.map((c) => [c.key, ""]));
  return (
    <div className="flex flex-col gap-2">
      {items.map((it, i) => (
        <div
          key={i}
          className="flex flex-wrap items-center gap-2 rounded-md border p-2"
        >
          {columns.map((c) => (
            <Input
              key={c.key}
              value={it[c.key] ?? ""}
              placeholder={c.label}
              onChange={(e) => patch(i, c.key, e.target.value)}
              className={IN}
              style={{ width: c.w ?? 110 }}
            />
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={DEL}
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
          onClick={() => onChange([...items, blank()])}
        >
          + {addLabel}
        </Button>
      </div>
    </div>
  );
}

// 단일 문자열 배열 편집기(원칙·해석 노트 등).
function StringList({
  items,
  placeholder,
  onChange,
  addLabel,
}: {
  items: string[];
  placeholder: string;
  onChange: (items: string[]) => void;
  addLabel: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((v, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={v}
            placeholder={placeholder}
            onChange={(e) =>
              onChange(items.map((x, j) => (j === i ? e.target.value : x)))
            }
            className={`${IN} flex-1`}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={DEL}
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
          onClick={() => onChange([...items, ""])}
        >
          + {addLabel}
        </Button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
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
                    placeholder="유형(예: 객관식 5지택일)"
                    onChange={(e) => setCard(i, { kind: e.target.value })}
                    className={`${IN} w-48`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={DEL}
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
          <Label className="mt-2 text-[13px]">일정 안내(선택)</Label>
          <Input
            value={d.scheduleNote}
            onChange={(e) => set({ scheduleNote: e.target.value })}
            className={IN}
          />
        </Section>

        <Section title="제1차 과목">
          <TwoFieldList
            items={d.firstSubjects}
            keys={["name", "desc"]}
            placeholders={["과목명", "설명"]}
            addLabel="과목 추가"
            onChange={(v) =>
              set({ firstSubjects: v as ExamInfoData["firstSubjects"] })
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

        <Section title="과목별 시험시간">
          <MultiFieldList
            items={d.examTimes}
            columns={[
              { key: "section", label: "구분", w: 70 },
              { key: "period", label: "교시", w: 90 },
              { key: "subject", label: "과목", w: 130 },
              { key: "entry", label: "입실완료", w: 90 },
              { key: "time", label: "시험시간", w: 170 },
              { key: "count", label: "문항수", w: 70 },
            ]}
            addLabel="교시 추가"
            onChange={(v) => set({ examTimes: v as ExamInfoData["examTimes"] })}
          />
          <Label className="mt-2 text-[13px]">시험시간 안내(선택)</Label>
          <Input
            value={d.examTimesNote}
            onChange={(e) => set({ examTimesNote: e.target.value })}
            className={IN}
          />
        </Section>

        <Section title="영어 대체시험">
          <TwoFieldList
            items={d.english}
            keys={["name", "score"]}
            placeholders={["시험명(예: TOEIC)", "기준 점수(예: 775)"]}
            addLabel="시험 추가"
            onChange={(v) => set({ english: v as ExamInfoData["english"] })}
          />
          <Label className="mt-2 text-[13px]">영어 안내 문구</Label>
          <textarea
            rows={2}
            value={d.englishNote}
            onChange={(e) => set({ englishNote: e.target.value })}
            className={TA}
          />
          <Label className="mt-1 text-[13px]">인정기간</Label>
          <textarea
            rows={2}
            value={d.englishValidity}
            onChange={(e) => set({ englishValidity: e.target.value })}
            className={TA}
          />
          <Label className="mt-1 text-[13px]">TIP</Label>
          <textarea
            rows={2}
            value={d.englishTip}
            onChange={(e) => set({ englishTip: e.target.value })}
            className={TA}
          />
        </Section>

        <Section title="연도별 통계">
          <MultiFieldList
            items={d.yearlyStats}
            columns={[
              { key: "year", label: "연도", w: 64 },
              { key: "applied", label: "1차 응시(대상)", w: 120 },
              { key: "cut", label: "커트라인", w: 76 },
              { key: "passed", label: "1차 합격", w: 76 },
              { key: "rate", label: "응시율/합격률", w: 130 },
              { key: "second", label: "2차 대상", w: 90 },
              { key: "final", label: "최종 합격", w: 90 },
              { key: "ratio", label: "최종 경쟁률", w: 90 },
            ]}
            addLabel="연도 추가"
            onChange={(v) =>
              set({ yearlyStats: v as ExamInfoData["yearlyStats"] })
            }
          />
          <Label className="mt-2 text-[13px]">해석·주의(선택)</Label>
          <StringList
            items={d.statNotes}
            placeholder="한 줄 해석"
            addLabel="항목 추가"
            onChange={(statNotes) => set({ statNotes })}
          />
        </Section>

        <Section title="1차 공부방법론">
          <Label className="text-[13px]">핵심 원칙</Label>
          <StringList
            items={d.studyPrinciples}
            placeholder="원칙 한 줄"
            addLabel="원칙 추가"
            onChange={(studyPrinciples) => set({ studyPrinciples })}
          />
          <Label className="mt-2 text-[13px]">과목 특징</Label>
          <TwoFieldList
            items={d.subjectNotes}
            keys={["name", "desc"]}
            placeholders={["과목명", "특징"]}
            addLabel="과목 추가"
            onChange={(v) =>
              set({ subjectNotes: v as ExamInfoData["subjectNotes"] })
            }
          />
          <Label className="mt-2 text-[13px]">추천 학습 흐름</Label>
          <textarea
            rows={3}
            value={d.studyFlow}
            onChange={(e) => set({ studyFlow: e.target.value })}
            className={TA}
          />
        </Section>

        <Section title="자주 묻는 질문(Q&A)">
          <div className="flex flex-col gap-3">
            {d.faq.map((it, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={it.q}
                    placeholder="질문"
                    onChange={(e) =>
                      set({
                        faq: d.faq.map((x, j) =>
                          j === i ? { ...x, q: e.target.value } : x,
                        ),
                      })
                    }
                    className={`${IN} flex-1`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={DEL}
                    onClick={() =>
                      set({ faq: d.faq.filter((_, j) => j !== i) })
                    }
                  >
                    삭제
                  </Button>
                </div>
                <textarea
                  rows={3}
                  value={it.a}
                  placeholder="답변"
                  onChange={(e) =>
                    set({
                      faq: d.faq.map((x, j) =>
                        j === i ? { ...x, a: e.target.value } : x,
                      ),
                    })
                  }
                  className={TA}
                />
              </div>
            ))}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => set({ faq: [...d.faq, { q: "", a: "" }] })}
              >
                + 질문 추가
              </Button>
            </div>
          </div>
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
