// feat-12-002 강의 홈 짧은 영상 등록/수정 — /admin/lecture-videos/new · /:id/edit.
//   provider(유튜브/콜러스) 토글로 소스 입력을 전환. 콜러스는 콘텐츠 라이브러리에서 클립 선택.
import { useState } from "react";
import { Form, Link, redirect, useSearchParams } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";
import { listPickableContents } from "~/features/lms/queries.server";

import {
  LECTURE_VIDEO_CATEGORY_LABEL,
  LECTURE_VIDEO_CATEGORY_ORDER,
  type LectureVideoProvider,
} from "../labels";
import { getLectureVideo } from "../queries.server";

import type { Route } from "./+types/admin-lecture-video-edit";

export function meta() {
  return [{ title: "강의 홈 영상 편집 | 운영관리" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/dashboard");
  const row = params.videoId
    ? await getLectureVideo(client, params.videoId)
    : null;
  const contents = await listPickableContents(client);
  const { data: plans } = await client
    .from("subscription_plans")
    .select("plan_id, code, name, price_krw, product_kind, is_active")
    .in("product_kind", ["course", "tpass"])
    .order("display_order", { ascending: true });
  return { role, row, contents, plans: plans ?? [] };
}

const IN = "h-9 text-sm";
const SEL = "border-input bg-background h-9 rounded-md border px-2 text-sm";

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[13px]">
        {label}
        {hint ? (
          <span className="text-muted-foreground ml-2 text-[11px] font-normal">
            {hint}
          </span>
        ) : null}
      </Label>
      {children}
    </div>
  );
}

export default function AdminLectureVideoEdit({
  loaderData,
}: Route.ComponentProps) {
  const { role, row: v, contents, plans } = loaderData;
  const [params] = useSearchParams();
  const err = params.get("err");
  const [provider, setProvider] = useState<LectureVideoProvider>(
    (v?.provider as LectureVideoProvider) ?? "youtube",
  );

  return (
    <AdminShell
      cluster="landing"
      role={role}
      title={v ? "영상 편집" : "영상 등록"}
      desc="공개를 켜야 강의 홈에 노출됩니다."
    >
      <div className="mx-auto max-w-2xl p-5 md:p-8">
        <Link
          to="/admin/lecture-videos"
          className="text-muted-foreground hover:text-foreground mb-4 inline-block text-sm"
        >
          ← 영상 목록
        </Link>
        {err ? (
          <p className="mb-4 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
            {err}
          </p>
        ) : null}
        <Form
          method="post"
          action="/api/admin/landing"
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="entity" value="video" />
          <input type="hidden" name="intent" value="save" />
          {v ? <input type="hidden" name="id" value={v.video_id} /> : null}

          <Row label="제목">
            <Input
              name="title"
              required
              defaultValue={v?.title}
              className={IN}
            />
          </Row>
          <Row label="한 줄 소개" hint="선택">
            <Input
              name="description"
              defaultValue={v?.description ?? ""}
              className={IN}
            />
          </Row>

          <div className="grid gap-4 sm:grid-cols-2">
            <Row label="분류">
              <select
                name="category"
                defaultValue={v?.category ?? "study_method"}
                className={SEL}
              >
                {LECTURE_VIDEO_CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {LECTURE_VIDEO_CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="공급자">
              <select
                name="provider"
                value={provider}
                onChange={(e) =>
                  setProvider(e.currentTarget.value as LectureVideoProvider)
                }
                className={SEL}
              >
                <option value="youtube">유튜브</option>
                <option value="kollus">콜러스(맛보기 클립)</option>
              </select>
            </Row>
          </div>

          {provider === "youtube" ? (
            <Row
              label="유튜브 URL"
              hint="youtube.com/watch?v=… 또는 youtu.be/…"
            >
              <Input
                name="youtube_url"
                defaultValue={v?.youtube_url ?? ""}
                placeholder="https://www.youtube.com/watch?v=…"
                className={IN}
              />
            </Row>
          ) : (
            <div className="flex flex-col gap-2">
              <Row label="콜러스 콘텐츠" hint="콘텐츠 라이브러리에서 선택">
                <select
                  name="content_id"
                  defaultValue={v?.content_id ?? ""}
                  className={SEL}
                >
                  <option value="">(콘텐츠 선택)</option>
                  {contents.map((c) => (
                    <option key={c.contentId} value={c.contentId}>
                      {c.title}
                      {c.groupName ? ` · ${c.groupName}` : ""}
                      {c.durationSeconds
                        ? ` · ${Math.round(c.durationSeconds / 60)}분`
                        : ""}
                    </option>
                  ))}
                </select>
              </Row>
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                ⚠️ 맛보기는 <b>공개 재생</b>됩니다. 반드시 별도로 잘라 올린{" "}
                <b>짧은 미리보기 클립</b>을 선택하세요 — 전체 유료강의 영상을
                지정하면 강의가 통째로 무료로 노출됩니다.
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Row label="썸네일 URL" hint="선택(비우면 유튜브 자동)">
              <Input
                name="thumbnail_url"
                defaultValue={v?.thumbnail_url ?? ""}
                className={IN}
              />
            </Row>
            <Row label="길이 표시" hint='선택, "3분 12초"'>
              <Input
                name="duration_label"
                defaultValue={v?.duration_label ?? ""}
                className={IN}
              />
            </Row>
            <Row label="연결 강의" hint="맛보기 → '신청하기' CTA(선택)">
              <select
                name="linked_plan_id"
                defaultValue={v?.linked_plan_id ?? ""}
                className={SEL}
              >
                <option value="">(연결 안 함)</option>
                {plans.map((p) => (
                  <option key={p.plan_id} value={p.plan_id}>
                    {p.name}
                    {p.is_active ? "" : " (비활성)"}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="표시 순서" hint="작을수록 위(분류 내)">
              <Input
                type="number"
                name="display_order"
                defaultValue={v?.display_order ?? 0}
                className={IN}
              />
            </Row>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="published"
              defaultChecked={v?.published ?? true}
            />{" "}
            공개(강의 홈 노출)
          </label>

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button asChild variant="ghost">
              <Link to="/admin/lecture-videos">취소</Link>
            </Button>
            <Button type="submit">{v ? "저장" : "등록"}</Button>
          </div>
        </Form>
      </div>
    </AdminShell>
  );
}
