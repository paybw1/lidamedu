// 시험 공고 등록/편집 — /admin/exam-notices/new · /:id/edit. staff 전용.
//   메타 저장은 일반 Form, 첨부 업로드/삭제는 multipart fetcher.Form(파일은 저장 후 추가).
import { Form, Link, redirect, useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";

import { getExamNotice } from "../queries.server";

import type { Route } from "./+types/admin-exam-notice-edit";

export function meta() {
  return [{ title: "시험 공고 편집 | 운영관리" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/dashboard");
  const notice = params.noticeId
    ? await getExamNotice(client, params.noticeId)
    : null;
  return { role, notice };
}

const IN = "h-9 text-sm";
const TA =
  "border-input bg-background w-full rounded-md border px-3 py-2 text-sm leading-relaxed";

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}

export default function AdminExamNoticeEdit({
  loaderData,
}: Route.ComponentProps) {
  const { role, notice: n } = loaderData;
  const upload = useFetcher();
  const removeF = useFetcher();
  const dtLocal = n?.published_at ? n.published_at.slice(0, 16) : "";
  const uploadErr =
    upload.data &&
    typeof upload.data === "object" &&
    "error" in upload.data
      ? String((upload.data as { error: unknown }).error)
      : null;

  return (
    <AdminShell
      cluster="landing"
      role={role}
      title={n ? "시험 공고 편집" : "시험 공고 등록"}
      desc="공개를 켜야 시험정보 페이지에 노출됩니다."
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-6 p-5 md:p-8">
        <Link
          to="/admin/exam-notices"
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          ← 공고 목록
        </Link>

        {/* 메타 */}
        <Form
          method="post"
          action="/api/admin/exam-notice"
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="intent" value="save" />
          {n ? <input type="hidden" name="id" value={n.notice_id} /> : null}

          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px]">제목</Label>
            <Input
              name="title"
              required
              maxLength={200}
              defaultValue={n?.title ?? ""}
              className={IN}
              placeholder="예: 2026년도 제63회 변리사 국가자격시험 시행계획 공고"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px]">등록일</Label>
            <Input
              type="datetime-local"
              name="published_at"
              defaultValue={dtLocal}
              className={IN}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px]">
              내용
              <span className="text-muted-foreground ml-2 text-[11px] font-normal">
                선택 · 마크다운 지원
              </span>
            </Label>
            <textarea
              name="body_md"
              rows={5}
              defaultValue={n?.body_md ?? ""}
              className={TA}
              placeholder="공고 요약이나 안내 문구(선택)"
            />
          </div>

          <div className="flex items-center gap-5">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="is_pinned"
                defaultChecked={n?.is_pinned ?? false}
              />{" "}
              상단 고정
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="published"
                defaultChecked={n?.published ?? true}
              />{" "}
              공개
            </label>
          </div>

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button asChild variant="ghost">
              <Link to="/admin/exam-notices">취소</Link>
            </Button>
            <Button type="submit">{n ? "저장" : "등록 후 첨부"}</Button>
          </div>
        </Form>

        {/* 첨부 — 저장된 공고에만 */}
        {n ? (
          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <h2 className="text-sm font-semibold">첨부 공고문</h2>
            {n.files.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                첨부된 파일이 없습니다.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {n.files.map((f) => (
                  <li
                    key={f.path}
                    className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
                  >
                    <a
                      href={f.url}
                      className="flex-1 truncate font-medium hover:underline"
                    >
                      {f.name}
                    </a>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {fmtSize(f.size)}
                    </span>
                    <removeF.Form method="post" action="/api/admin/exam-notice">
                      <input type="hidden" name="intent" value="removeFile" />
                      <input type="hidden" name="id" value={n.notice_id} />
                      <input type="hidden" name="path" value={f.path} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                      >
                        삭제
                      </Button>
                    </removeF.Form>
                  </li>
                ))}
              </ul>
            )}

            <upload.Form
              method="post"
              action="/api/admin/exam-notice"
              encType="multipart/form-data"
              className="flex items-center gap-2 border-t pt-3"
            >
              <input type="hidden" name="intent" value="upload" />
              <input type="hidden" name="id" value={n.notice_id} />
              <input
                type="file"
                name="file"
                required
                className="text-sm"
                accept=".pdf,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.png,.jpg,.jpeg,.gif"
              />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={upload.state !== "idle"}
              >
                {upload.state !== "idle" ? "업로드 중…" : "파일 첨부"}
              </Button>
            </upload.Form>
            {uploadErr ? (
              <p className="text-destructive text-xs">{uploadErr}</p>
            ) : null}
            <p className="text-muted-foreground text-xs">
              PDF·HWP·문서·이미지, 최대 20MB.
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
            공고를 먼저 등록하면 공고문 파일을 첨부할 수 있습니다.
          </p>
        )}
      </div>
    </AdminShell>
  );
}
