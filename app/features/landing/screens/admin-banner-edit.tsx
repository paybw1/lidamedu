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
  // 저장 실패 시 액션이 ?err= 로 되돌려보낸 메시지(조용한 실패 방지).
  const err = new URL(request.url).searchParams.get("err");
  return { role, row, err };
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
  const { role, row: b, err } = loaderData;
  return (
    <AdminShell cluster="landing" role={role} title={b ? "배너 편집" : "배너 추가"} desc="이미지/HTML 배너는 만든 그대로 노출됩니다. 단(tier)으로 히어로 아래 2·3단에 배치할 수 있습니다.">
      <div className="mx-auto max-w-2xl p-5 md:p-8">
        <Link to="/admin/landing-banners" className="text-muted-foreground hover:text-foreground mb-4 inline-block text-sm">
          ← 배너 목록
        </Link>
        {err ? (
          <p className="border-destructive/40 bg-destructive/10 text-destructive mb-4 rounded-md border px-3 py-2 text-sm">
            저장 실패: {err}
          </p>
        ) : null}
        <Form method="post" action="/api/admin/landing" encType="multipart/form-data" className="flex flex-col gap-4">
          <input type="hidden" name="entity" value="banner" />
          <input type="hidden" name="intent" value="save" />
          {b ? <input type="hidden" name="id" value={b.banner_id} /> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Row label="종류" hint="이미지/HTML은 만든 그대로 노출">
              <select name="kind" defaultValue={b?.kind ?? "image"} className={SEL}>
                <option value="image">이미지(직접 부착)</option>
                <option value="html">HTML(직접 작성)</option>
                <option value="schedule">일정형(개강 임박 카드)</option>
                <option value="promo">프로모션(대형 숫자)</option>
                <option value="passer">합격속보(배지)</option>
                <option value="custom">일반(텍스트만)</option>
              </select>
            </Row>
            <Row label="단(tier)" hint="1=메인 히어로 · 2·3=아래쪽 단">
              <select name="tier" defaultValue={String(b?.tier ?? 1)} className={SEL}>
                <option value="1">1단 (메인 히어로)</option>
                <option value="2">2단</option>
                <option value="3">3단</option>
              </select>
            </Row>
          </div>

          <div className="bg-muted/40 flex flex-col gap-4 rounded-lg border p-4">
            <p className="text-muted-foreground text-[12px]">
              이미지/HTML 배너용 · 종류를 이미지·HTML로 선택했을 때 사용합니다.
            </p>
            <Row label="배너 이미지" hint="이미지 종류일 때. 파일 업로드 또는 URL">
              <input type="file" name="image_file" accept="image/*" className="text-xs" />
              <Input name="image_url" defaultValue={b?.image_url ?? ""} placeholder="https://… (외부 URL)" className={IN} />
              {b?.image_url ? (
                <img src={b.image_url} alt="현재 배너" className="mt-1 max-h-32 rounded border object-contain" />
              ) : null}
            </Row>
            <Row label="HTML 내용" hint="HTML 종류일 때. 작성한 HTML 그대로 렌더">
              <textarea name="body_html" rows={5} defaultValue={b?.body_html ?? ""} className={`${TA} font-mono text-xs`} placeholder='<div style="text-align:center;padding:40px">…</div>' />
            </Row>
            <p className="text-muted-foreground text-[11px]">
              이미지 클릭 시 이동할 주소는 아래 <b>기본 버튼 링크</b>에 입력하세요.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Row label="강조색" hint="구조형(일정·프로모션 등) 배경색">
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
          <Row label="제목(headline)" hint="이미지/HTML 배너는 비워도 됩니다">
            <textarea name="headline" rows={2} defaultValue={b?.headline ?? ""} className={TA} />
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
