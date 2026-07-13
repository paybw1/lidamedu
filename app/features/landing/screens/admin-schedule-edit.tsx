// feat-12 현장강의 일정 등록/수정 — /admin/lecture-schedules/new · /:id/edit.
import { Form, Link, redirect } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";

import { getSchedule } from "../queries.server";

import type { Route } from "./+types/admin-schedule-edit";

export function meta() {
  return [{ title: "일정 편집 | 운영관리" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/dashboard");
  const row = params.scheduleId ? await getSchedule(client, params.scheduleId) : null;
  // 연결할 수 있는 강의 상품(course·tpass) — 결제·가격 권위.
  const { data: plans } = await client
    .from("subscription_plans")
    .select("code, name, price_krw, product_kind, is_active")
    .in("product_kind", ["course", "tpass"])
    .order("display_order", { ascending: true });
  return { role, row, plans: plans ?? [] };
}

const IN = "h-9 text-sm";
const SEL = "border-input bg-background h-9 rounded-md border px-2 text-sm";
const TA = "border-input bg-background w-full rounded-md border px-3 py-2 text-sm leading-relaxed";

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[13px]">
        {label}
        {hint ? <span className="text-muted-foreground ml-2 text-[11px] font-normal">{hint}</span> : null}
      </Label>
      {children}
    </div>
  );
}

export default function AdminScheduleEdit({ loaderData }: Route.ComponentProps) {
  const { role, row: s, plans } = loaderData;
  return (
    <AdminShell cluster="landing" role={role} title={s ? "일정 편집" : "일정 등록"} desc="공개를 켜야 랜딩·시간표에 노출됩니다.">
      <div className="mx-auto max-w-2xl p-5 md:p-8">
        <Link to="/admin/lecture-schedules" className="text-muted-foreground hover:text-foreground mb-4 inline-block text-sm">
          ← 일정 목록
        </Link>
        <Form method="post" action="/api/admin/landing" className="flex flex-col gap-4">
          <input type="hidden" name="entity" value="schedule" />
          <input type="hidden" name="intent" value="save" />
          {s ? <input type="hidden" name="id" value={s.schedule_id} /> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Row label="과목(표시)" hint='"특허법"'>
              <Input name="subject_label" required defaultValue={s?.subject_label} className={IN} />
            </Row>
            <Row label="과목 코드" hint="patent/trademark/design/civil/civil-procedure/science">
              <Input name="subject_code" defaultValue={s?.subject_code ?? ""} className={IN} />
            </Row>
            <Row label="강좌명" hint='"기본이론 정규반"'>
              <Input name="title" required defaultValue={s?.title} className={IN} />
            </Row>
            <Row label="강사" hint='"임병웅 대표변리사"'>
              <Input name="instructor_name" required defaultValue={s?.instructor_name} className={IN} />
            </Row>
            <Row label="개강일">
              <Input type="date" name="start_date" defaultValue={s?.start_date ?? ""} className={IN} />
            </Row>
            <Row label="요일" hint='"월·목"'>
              <Input name="day_label" defaultValue={s?.day_label ?? ""} className={IN} />
            </Row>
            <Row label="시간" hint='"19:00–22:00"'>
              <Input name="time_label" defaultValue={s?.time_label ?? ""} className={IN} />
            </Row>
            <Row label="형태">
              <select name="format" defaultValue={s?.format ?? "offline"} className={SEL}>
                <option value="offline">현장</option>
                <option value="live">실시간</option>
                <option value="video">영상</option>
              </select>
            </Row>
            <Row label="정원">
              <Input type="number" name="capacity" defaultValue={s?.capacity ?? 40} className={IN} />
            </Row>
            <Row label="신청 인원" hint="잔여 = 정원 − 신청">
              <Input type="number" name="enrolled" defaultValue={s?.enrolled ?? 0} className={IN} />
            </Row>
            <Row label="상태">
              <select name="status" defaultValue={s?.status ?? "open"} className={SEL}>
                <option value="open">접수중</option>
                <option value="soon">임박</option>
                <option value="waitlist">대기접수</option>
                <option value="closed">마감</option>
              </select>
            </Row>
            <Row label="표시 순서" hint="작을수록 위">
              <Input type="number" name="display_order" defaultValue={s?.display_order ?? 0} className={IN} />
            </Row>
          </div>

          {/* 과정(course) 판매 정보 — 상세 페이지의 결제금액·소개·목차·수강신청 */}
          <div className="bg-muted/40 flex flex-col gap-4 rounded-lg border p-4">
            <p className="text-muted-foreground text-[12px]">
              상세 페이지를 수강신청 화면으로 — 연결 상품의 가격이 결제금액으로 표시되고, 장바구니·수강신청이 활성화됩니다.
            </p>
            <Row label="연결 강의 상품" hint="결제·가격 권위. 미연결 시 '수강신청'은 카탈로그로 이동">
              <select name="plan_code" defaultValue={s?.plan_code ?? ""} className={SEL}>
                <option value="">(연결 안 함)</option>
                {plans.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name} · {p.price_krw.toLocaleString("ko-KR")}원
                    {p.is_active ? "" : " (비활성)"}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="과정소개" hint="마크다운 지원">
              <textarea name="intro_md" rows={5} defaultValue={s?.intro_md ?? ""} className={TA} />
            </Row>
            <Row label="강의목차" hint="마크다운 지원(목록·표)">
              <textarea name="curriculum_md" rows={6} defaultValue={s?.curriculum_md ?? ""} className={TA} />
            </Row>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="published" defaultChecked={s?.published ?? true} /> 공개(랜딩·시간표 노출)
          </label>

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button asChild variant="ghost">
              <Link to="/admin/lecture-schedules">취소</Link>
            </Button>
            <Button type="submit">{s ? "저장" : "등록"}</Button>
          </div>
        </Form>
      </div>
    </AdminShell>
  );
}
