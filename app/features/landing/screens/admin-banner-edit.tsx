// feat-12 히어로 배너 등록/수정 — /admin/landing-banners/new · /:id/edit.
import { Form, Link, redirect } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";

import { getBanner } from "../queries.server";

import type { Route } from "./+types/admin-banner-edit";

export function meta() {
  return [{ title: "배너 편집 | 운영관리" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/dashboard");
  const row = params.bannerId ? await getBanner(client, params.bannerId) : null;
  return { role, row };
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

export default function AdminBannerEdit({ loaderData }: Route.ComponentProps) {
  const { role, row: b } = loaderData;
  return (
    <AdminShell cluster="comms" role={role} title={b ? "배너 편집" : "배너 추가"} desc="종류에 따라 우측 카드가 달라집니다. 일정형=개강 임박 카드, 프로모션=대형 숫자, 합격속보=배지.">
      <div className="mx-auto max-w-2xl p-5 md:p-8">
        <Link to="/admin/landing-banners" className="text-muted-foreground hover:text-foreground mb-4 inline-block text-sm">
          ← 배너 목록
        </Link>
        <Form method="post" action="/api/admin/landing" className="flex flex-col gap-4">
          <input type="hidden" name="entity" value="banner" />
          <input type="hidden" name="intent" value="save" />
          {b ? <input type="hidden" name="id" value={b.banner_id} /> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Row label="종류" hint="우측 카드 형태">
              <select name="kind" defaultValue={b?.kind ?? "promo"} className={SEL}>
                <option value="schedule">일정형(개강 임박 카드)</option>
                <option value="promo">프로모션(대형 숫자)</option>
                <option value="passer">합격속보(배지)</option>
                <option value="custom">일반(텍스트만)</option>
              </select>
            </Row>
            <Row label="강조색">
              <select name="accent" defaultValue={b?.accent ?? "gilt"} className={SEL}>
                <option value="gilt">금박</option>
                <option value="blue">블루</option>
                <option value="green">그린</option>
              </select>
            </Row>
          </div>

          <Row label="윗줄(eyebrow)" hint='"지금 진행중 · 무료체험"'>
            <Input name="eyebrow" defaultValue={b?.eyebrow ?? ""} className={IN} />
          </Row>
          <Row label="제목(headline)">
            <textarea name="headline" rows={2} required defaultValue={b?.headline ?? ""} className={TA} />
          </Row>
          <Row label="강조 문구(highlight)" hint="제목 안에서 금박 강조할 부분(제목에 포함된 문자열)">
            <Input name="highlight" defaultValue={b?.highlight ?? ""} className={IN} />
          </Row>
          <Row label="설명(sub)">
            <textarea name="sub" rows={2} defaultValue={b?.sub ?? ""} className={TA} />
          </Row>

          <div className="grid gap-4 sm:grid-cols-2">
            <Row label="기본 버튼 라벨"><Input name="cta_label" defaultValue={b?.cta_label ?? ""} className={IN} /></Row>
            <Row label="기본 버튼 링크" hint="/lecture/catalog 등"><Input name="cta_href" defaultValue={b?.cta_href ?? ""} className={IN} /></Row>
            <Row label="보조 버튼 라벨"><Input name="secondary_label" defaultValue={b?.secondary_label ?? ""} className={IN} /></Row>
            <Row label="보조 버튼 링크"><Input name="secondary_href" defaultValue={b?.secondary_href ?? ""} className={IN} /></Row>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Row label="대형 숫자(값)" hint="프로모션용 예:15 / 20"><Input name="big_value" defaultValue={b?.big_value ?? ""} className={IN} /></Row>
            <Row label="대형 숫자(단위)" hint='"일" / "%"'><Input name="big_unit" defaultValue={b?.big_unit ?? ""} className={IN} /></Row>
          </div>

          <Row label="배지 목록" hint="합격속보용. 한 줄에 하나">
            <textarea name="badges" rows={3} defaultValue={(b?.badges ?? []).join("\n")} className={TA} placeholder={"특허·상표 고득점\n동차 합격"} />
          </Row>

          <Row label="표시 순서" hint="작을수록 먼저">
            <Input type="number" name="display_order" defaultValue={b?.display_order ?? 0} className={`${IN} w-28`} />
          </Row>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="published" defaultChecked={b?.published ?? true} /> 공개(랜딩 히어로에 노출)
          </label>

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button asChild variant="ghost"><Link to="/admin/landing-banners">취소</Link></Button>
            <Button type="submit">{b ? "저장" : "추가"}</Button>
          </div>
        </Form>
      </div>
    </AdminShell>
  );
}
