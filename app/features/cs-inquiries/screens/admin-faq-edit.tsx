// 고객센터 FAQ 등록/편집 — /admin/support-faqs/new · /:faqId/edit. staff 전용.
import { Form, Link, redirect } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";

import { getSupportFaq } from "../faq.server";

import type { Route } from "./+types/admin-faq-edit";

export function meta() {
  return [{ title: "FAQ 편집 | 운영관리" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/dashboard");
  const faq = params.faqId ? await getSupportFaq(client, params.faqId) : null;
  return { role, faq };
}

const IN = "h-9 text-sm";
const TA =
  "border-input bg-background w-full rounded-md border px-3 py-2 text-sm leading-relaxed";
const CATEGORIES = ["동영상·기기", "결제·취소·환불", "수강·교재", "회원정보", "기타"];

export default function AdminFaqEdit({ loaderData }: Route.ComponentProps) {
  const { role, faq: f } = loaderData;
  return (
    <AdminShell
      cluster="comms"
      role={role}
      title={f ? "FAQ 편집" : "FAQ 등록"}
      desc="공개를 켜야 고객센터에 노출됩니다."
    >
      <div className="mx-auto max-w-2xl p-5 md:p-8">
        <Link
          to="/admin/support-faqs"
          className="text-muted-foreground hover:text-foreground mb-4 inline-block text-sm"
        >
          ← FAQ 목록
        </Link>
        <Form
          method="post"
          action="/api/admin/support-faq"
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="intent" value="save" />
          {f ? <input type="hidden" name="id" value={f.faqId} /> : null}

          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[13px]">카테고리</Label>
              <Input
                name="category"
                required
                list="faq-cats"
                defaultValue={f?.category ?? CATEGORIES[0]}
                className={IN}
              />
              <datalist id="faq-cats">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[13px]">표시 순서</Label>
              <Input
                name="sortOrder"
                type="number"
                defaultValue={f?.sortOrder ?? 0}
                className={`${IN} w-28`}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px]">질문</Label>
            <Input
              name="question"
              required
              maxLength={300}
              defaultValue={f?.question}
              className={IN}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px]">답변</Label>
            <textarea
              name="answer"
              rows={8}
              defaultValue={f?.answer ?? ""}
              className={TA}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="published"
              defaultChecked={f?.published ?? true}
            />{" "}
            공개
          </label>

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button asChild variant="ghost">
              <Link to="/admin/support-faqs">취소</Link>
            </Button>
            <Button type="submit">{f ? "저장" : "등록"}</Button>
          </div>
        </Form>
      </div>
    </AdminShell>
  );
}
