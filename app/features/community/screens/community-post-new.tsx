// 커뮤니티 글 작성/수정 — `/community/:board/new` · `/community/:board/:postId/edit`. feat-6-002.
// 이미지 붙여넣기(Ctrl+V)·파일 추가 지원 — 글 저장 후 첨부(community-attachments)로 업로드.
//   합격증/점수 캡처 등 개인정보라 인라인 public 이 아닌 private 첨부(서명 URL)로 보존.
import { ImagePlusIcon, Loader2Icon, SendIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, data, redirect, useNavigate } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Textarea } from "~/core/components/ui/textarea";
import makeServerClient from "~/core/lib/supa-client.server";
import { CommunityShell } from "~/features/community/components/community-shell";

import { BOARD_LABEL, communityBoardSchema } from "../labels";
import { getPost } from "../queries.server";

import type { Route } from "./+types/community-post-new";

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
  {
    title: `${loaderData?.mode === "edit" ? "글 수정" : "새 글 작성"} | 리담변리사학원`,
  },
];

// 첨부 업로드 제약 — /api/community/attachment 와 동일.
const MAX_IMAGES = 20;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

interface PendingImage {
  id: string;
  file: File;
  url: string;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const boardParse = communityBoardSchema.safeParse(params.board);
  if (!boardParse.success) {
    throw data("게시판을 찾을 수 없습니다", { status: 404 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw redirect("/login");
  }
  const board = boardParse.data;

  const { data: meProf } = await client
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .maybeSingle();
  const isStaff = meProf?.role != null && meProf.role !== "student";

  if (params.postId) {
    const post = await getPost(client, params.postId);
    if (!post || post.board !== board) {
      throw data("글을 찾을 수 없습니다", { status: 404 });
    }
    // 작성자 본인 또는 운영자(staff)만 수정. 운영자는 합격수기 등 타 작성자 글도 편집.
    if (post.author?.id !== user.id && !isStaff) {
      throw data("수정 권한이 없습니다", { status: 403 });
    }
    return { mode: "edit" as const, board, post, isStaff };
  }
  return { mode: "create" as const, board, post: null, isStaff };
}

export default function CommunityPostNew({ loaderData }: Route.ComponentProps) {
  const { mode, board, post, isStaff } = loaderData;
  const isEdit = mode === "edit";
  const navigate = useNavigate();
  const [title, setTitle] = useState(post?.title ?? "");
  const [body, setBody] = useState(post?.bodyMd ?? "");
  const [published, setPublished] = useState(post?.published ?? true);
  const [images, setImages] = useState<PendingImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [warn, setWarn] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // unmount 시 미리보기 objectURL 정리(메모리 누수 방지).
  const imagesRef = useRef(images);
  imagesRef.current = images;
  useEffect(
    () => () => imagesRef.current.forEach((p) => URL.revokeObjectURL(p.url)),
    [],
  );

  const cancelHref =
    isEdit && post
      ? `/community/${board}/${post.postId}`
      : `/community/${board}`;

  function addFiles(files: File[]) {
    const valid: File[] = [];
    let rejected = false;
    for (const f of files) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > MAX_IMAGE_BYTES) {
        rejected = true;
        continue;
      }
      valid.push(f);
    }
    setImages((prev) => {
      const room = Math.max(0, MAX_IMAGES - prev.length);
      if (valid.length > room) rejected = true;
      const toAdd = valid.slice(0, room).map((f) => ({
        id: crypto.randomUUID(),
        file: f,
        url: URL.createObjectURL(f),
      }));
      return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
    });
    setWarn(
      rejected
        ? `이미지는 최대 ${MAX_IMAGES}장, 장당 10MB까지 첨부할 수 있습니다.`
        : null,
    );
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const it of Array.from(items)) {
      if (it.kind === "file" && it.type.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault(); // 이미지 붙여넣기는 본문 텍스트 삽입을 막는다.
      addFiles(files);
    }
  }

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(Array.from(e.target.files));
    e.target.value = ""; // 같은 파일 재선택 허용.
  }

  function removeImage(id: string) {
    setImages((prev) => {
      const found = prev.find((p) => p.id === id);
      if (found) URL.revokeObjectURL(found.url);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim() || busy) return;
    setBusy(true);
    setFailed(false);

    try {
      // 1) 글 저장 — postId 를 받기 위해 returnJson.
      const fd = new FormData();
      fd.set("intent", isEdit ? "update" : "create");
      if (isEdit && post) fd.set("postId", post.postId);
      else fd.set("board", board);
      fd.set("title", title);
      fd.set("bodyMd", body);
      if (isStaff) fd.set("published", published ? "true" : "false");
      fd.set("returnJson", "1");
      const res = await fetch("/api/community/post", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as { ok?: boolean; postId?: string };
      if (!json.ok || !json.postId) {
        setFailed(true);
        setBusy(false);
        return;
      }
      const targetPostId = json.postId;

      // 2) 첨부 이미지 업로드(순차). 부분 실패는 허용 — 글은 이미 저장됨.
      for (const img of images) {
        const afd = new FormData();
        afd.set("intent", "upload");
        afd.set("postId", targetPostId);
        afd.set("file", img.file);
        try {
          await fetch("/api/community/attachment", {
            method: "POST",
            body: afd,
          });
        } catch {
          // 무시 — 상세 화면에서 재첨부 가능.
        }
      }

      // 3) 상세로 이동.
      navigate(`/community/${board}/${targetPostId}`);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <CommunityShell
      category={board}
      title={isEdit ? "글 수정" : "새 글 작성"}
      desc={BOARD_LABEL[board]}
      backLink={{ to: cancelHref, label: BOARD_LABEL[board] }}
      width="feed"
    >
      <div className="border-border bg-card rounded-2xl border p-5 shadow-sm md:p-6">
        <form onSubmit={handleSubmit}>
          <label className="block">
            <span className="text-muted-foreground mb-1.5 block font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
              제목
            </span>
            <Input
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="제목을 입력해 주세요"
              maxLength={200}
              required
            />
          </label>

          <label className="mt-4 block">
            <span className="text-muted-foreground mb-1.5 block font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
              내용
            </span>
            <Textarea
              name="bodyMd"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onPaste={onPaste}
              placeholder="내용을 입력해 주세요. 이미지는 붙여넣기(Ctrl+V)하거나 아래 ‘이미지 추가’로 첨부할 수 있습니다."
              rows={12}
              maxLength={20000}
              className="text-sm leading-relaxed"
              required
            />
          </label>

          {/* 이미지 첨부 — 붙여넣기 또는 파일 선택. 저장 시 첨부로 업로드. */}
          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy || images.length >= MAX_IMAGES}
              >
                <ImagePlusIcon className="size-3.5" /> 이미지 추가
              </Button>
              <span className="text-muted-foreground text-[11px]">
                본문에 붙여넣기(Ctrl+V)도 됩니다 · 최대 {MAX_IMAGES}장
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                hidden
                onChange={onPickFiles}
              />
            </div>

            {warn ? (
              <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
                {warn}
              </p>
            ) : null}

            {images.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {images.map((img) => (
                  <li
                    key={img.id}
                    className="border-border bg-muted/30 relative overflow-hidden rounded-xl border"
                  >
                    <img
                      src={img.url}
                      alt={img.file.name}
                      className="block h-24 w-24 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(img.id)}
                      disabled={busy}
                      aria-label="이미지 제거"
                      className="absolute top-1 right-1 inline-flex size-5 items-center justify-center rounded-full bg-black/60 text-white"
                    >
                      <XIcon className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {failed ? (
            <p className="mt-3 text-[13px] font-medium text-rose-600 dark:text-rose-400">
              저장에 실패했습니다. 입력 내용을 확인해 주세요.
            </p>
          ) : null}

          {/* 운영자 전용 — 학생 노출 여부(미체크 시 초안: 학생에게 숨김, 운영자만 열람). */}
          {isStaff ? (
            <label className="mt-4 flex items-center gap-2 text-[13px] font-medium">
              <input
                type="checkbox"
                checked={published}
                onChange={(e) => setPublished(e.target.checked)}
              />
              학생에게 노출 (해제 시 초안 — 완성 전까지 학생에게 숨김)
            </label>
          ) : null}

          <div className="mt-5 flex justify-end gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              type="button"
              className="rounded-full"
            >
              <Link to={cancelHref} viewTransition>
                취소
              </Link>
            </Button>
            <Button
              type="submit"
              size="sm"
              className="rounded-full"
              disabled={busy || !title.trim() || !body.trim()}
            >
              {busy ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <SendIcon className="size-3.5" />
              )}
              {isEdit ? "수정 완료" : "등록"}
            </Button>
          </div>
        </form>
      </div>
    </CommunityShell>
  );
}
