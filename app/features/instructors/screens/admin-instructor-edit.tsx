// feat-6-012 강사소개 — 운영자 강사 등록/수정(/admin/instructors/new · /:id/edit). staff. 저장=/api/admin/instructor.
import { Form, Link, redirect } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import { AdminShell } from "~/features/admin/components/admin-shell";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";

import { getInstructorById, type InstructorDetail } from "../queries.server";

import type { Route } from "./+types/admin-instructor-edit";

export function meta() {
  return [{ title: "강사 편집 | 운영관리" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/dashboard");
  const instructor = params.instructorId
    ? await getInstructorById(client, params.instructorId)
    : null;
  return { role, instructor };
}

const IN = "h-9 text-sm";
const TA =
  "border-input bg-background w-full rounded-md border px-3 py-2 text-sm leading-relaxed";

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

export default function AdminInstructorEdit({ loaderData }: Route.ComponentProps) {
  const { instructor: it } = loaderData;
  const metricsText = (it?.metrics ?? [])
    .map((m) => [m.value, m.unit, m.label].join(" | "))
    .join("\n");
  const booksText = (it?.books ?? []).map((b) => [b.title, b.label].join(" | ")).join("\n");

  return (
    <AdminShell
      cluster="comms"
      role={loaderData.role}
      title={it ? `강사 편집 · ${it.name}` : "강사 등록"}
      desc="게시(published)를 켜야 공개 강사진에 노출됩니다."
    >
      <div className="mx-auto max-w-3xl p-5 md:p-8">
        <Link to="/admin/instructors" className="text-muted-foreground hover:text-foreground mb-4 inline-block text-sm">
          ← 강사 목록
        </Link>
        <Form method="post" action="/api/admin/instructor" encType="multipart/form-data" className="flex flex-col gap-5">
          <input type="hidden" name="intent" value="save" />
          {it ? <input type="hidden" name="instructorId" value={it.instructorId} /> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Row label="이름" ><Input name="name" required defaultValue={it?.name} className={IN} /></Row>
            <Row label="slug" hint="URL(영소문자·숫자·하이픈)"><Input name="slug" required defaultValue={it?.slug} placeholder="lim-byungwoong" className={IN} /></Row>
            <Row label="계열">
              <select name="category" defaultValue={it?.category ?? "ip_law"} className="border-input bg-background h-9 rounded-md border px-2 text-sm">
                <option value="ip_law">산업재산권법</option>
                <option value="civil_law">민사법</option>
                <option value="science">자연과학</option>
              </select>
            </Row>
            <Row label="담당 과목(표시)" hint='"상표법 · 디자인보호법"'><Input name="subjectLabel" required defaultValue={it?.subjectLabel} className={IN} /></Row>
            <Row label="과목 코드" hint="쉼표구분, 강의 연동용"><Input name="subjectCodes" defaultValue={(it?.subjectCodes ?? []).join(", ")} placeholder="patent, trademark" className={IN} /></Row>
            <Row label="직책" hint='"특허법인 리담 대표변리사"'><Input name="title" defaultValue={it?.title ?? ""} className={IN} /></Row>
            <Row label="역할 라벨" hint='"특허법 전임"'><Input name="roleLabel" defaultValue={it?.roleLabel ?? ""} className={IN} /></Row>
            <Row label="표시 순서" hint="작을수록 위"><Input name="displayOrder" type="number" defaultValue={it?.displayOrder ?? 0} className={IN} /></Row>
          </div>

          <Row label="모노그램" hint="사진 없을 때 표시(한자·이니셜 1자)"><Input name="monogram" defaultValue={it?.monogram ?? ""} maxLength={2} className={`${IN} w-24`} /></Row>

          <Row label="프로필 사진" hint="업로드 시 모노그램 대체">
            {it?.photoPath ? (
              <img src={it.photoPath} alt="" className="border-border mb-2 h-28 w-auto rounded-md border object-cover" />
            ) : null}
            <input type="file" name="photo" accept="image/*" className="text-sm" />
          </Row>

          <Row label="핵심 명제(헤드라인)" hint="히어로 한 줄">
            <textarea name="headline" rows={2} defaultValue={it?.headline ?? ""} className={TA} />
          </Row>

          <Row label="신뢰 지표" hint="한 줄에 하나 · '값 | 단위 | 라벨' (예: 제37 | 회 | 변리사시험 합격)">
            <textarea name="metrics" rows={4} defaultValue={metricsText} className={TA} placeholder="제37 | 회 | 변리사시험 합격" />
          </Row>

          <div className="grid gap-4 sm:grid-cols-2">
            <Row label="학력" hint="한 줄에 하나">
              <textarea name="education" rows={4} defaultValue={(it?.education ?? []).join("\n")} className={TA} />
            </Row>
            <Row label="경력" hint="한 줄에 하나">
              <textarea name="career" rows={4} defaultValue={(it?.career ?? []).join("\n")} className={TA} />
            </Row>
          </div>

          <Row label="저서" hint="한 줄에 하나 · '제목 | 라벨' (예: 리담특허법 | 기본서)">
            <textarea name="books" rows={4} defaultValue={booksText} className={TA} placeholder="리담특허법 | 기본서" />
          </Row>

          <Row label="강의 철학" hint="첫 문단은 인용구로 강조, 문단은 빈 줄로 구분">
            <textarea name="philosophyMd" rows={5} defaultValue={it?.philosophyMd ?? ""} className={TA} />
          </Row>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="published" defaultChecked={it?.published ?? false} /> 공개(게시) — 켜면 강사진에 노출
          </label>

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button asChild variant="ghost"><Link to="/admin/instructors">취소</Link></Button>
            <Button type="submit">{it ? "저장" : "등록"}</Button>
          </div>
        </Form>
      </div>
    </AdminShell>
  );
}
