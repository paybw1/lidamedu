// feat-6-011 고객센터 — 문의 작성(/support/new). 제출=/api/cs/inquiry create → 상세로 redirect.
import { data, useNavigation } from "react-router";
import { Form } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import { CohortBoardShell } from "~/features/cohort-boards/components/cohort-board-shell";
import makeServerClient from "~/core/lib/supa-client.server";

import { CS_CATEGORY_LABEL, CS_CATEGORY_ORDER } from "../labels";

import type { Route } from "./+types/support-new";

export function meta() {
  return [{ title: "문의하기 | 리담변리사학원" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data(null, { status: 401 });
  return null;
}

export default function SupportNew() {
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  return (
    <CohortBoardShell
      title="문의하기"
      width="narrow"
      backLink={{ to: "/lecture/support", label: "고객센터" }}
    >
      <Form method="post" action="/api/cs/inquiry" className="flex flex-col gap-4">
        <input type="hidden" name="intent" value="create" />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="category">분류</Label>
          <select
            id="category"
            name="category"
            defaultValue="etc"
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          >
            {CS_CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CS_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="title">제목</Label>
          <Input
            id="title"
            name="title"
            required
            maxLength={200}
            placeholder="문의 제목을 입력하세요"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bodyMd">내용</Label>
          <textarea
            id="bodyMd"
            name="bodyMd"
            required
            maxLength={20000}
            rows={10}
            placeholder="문의 내용을 자세히 적어 주세요. 결제·계정 관련 문의 시 개인정보(비밀번호 등)는 입력하지 마세요."
            className="border-input bg-background rounded-md border px-3 py-2 text-sm leading-relaxed"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="hidden" name="isPrivate" value="false" />
          <input type="checkbox" name="isPrivate" value="true" defaultChecked />
          비공개 문의 (작성자와 운영자만 볼 수 있습니다)
        </label>
        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "등록 중…" : "문의 등록"}
          </Button>
        </div>
      </Form>
    </CohortBoardShell>
  );
}
