// 커뮤니티 글 작성/수정 — `/community/:board/new` · `/community/:board/:postId/edit`. feat-6-002.
// 이미지 붙여넣기(Ctrl+V)·파일 추가 지원 — 글 저장 후 첨부(community-attachments)로 업로드.
//   합격증/점수 캡처 등 개인정보라 인라인 public 이 아닌 private 첨부(서명 URL)로 보존.
import {
  BoldIcon,
  EyeIcon,
  ImagePlusIcon,
  Loader2Icon,
  SendIcon,
  TableIcon,
  TypeIcon,
  UnderlineIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, data, redirect, useNavigate } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { CommunityShell } from "~/features/community/components/community-shell";
import { MarkdownView } from "~/features/problems/components/markdown-view";

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
  const [preview, setPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

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

          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-muted-foreground block font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
                내용
              </span>
              <button
                type="button"
                onClick={() => setPreview((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  preview
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <EyeIcon className="size-3" /> 미리보기
              </button>
            </div>
            <FormatToolbar
              textareaRef={bodyRef}
              value={body}
              onChange={setBody}
              isStaff={isStaff}
            />
            {preview ? (
              <div className="border-border bg-muted/20 min-h-[220px] rounded-md rounded-t-none border border-t-0 px-3 py-2.5">
                {body.trim() ? (
                  <MarkdownView text={body} trusted={isStaff} />
                ) : (
                  <p className="text-muted-foreground text-sm">
                    내용을 입력하면 여기에 미리보기가 표시됩니다.
                  </p>
                )}
              </div>
            ) : (
              <Textarea
                ref={bodyRef}
                name="bodyMd"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onPaste={onPaste}
                placeholder="내용을 입력해 주세요. 위 도구모음으로 굵게·밑줄·색·크기·표를 넣을 수 있고, 이미지는 붙여넣기(Ctrl+V)하거나 아래 ‘이미지 추가’로 첨부할 수 있습니다."
                rows={14}
                maxLength={60000}
                className="rounded-t-none text-sm leading-relaxed"
                required
              />
            )}
          </div>

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

// 서식 도구모음 — 선택 영역을 감싸거나 커서 위치에 스니펫 삽입. 굵게·표는 마크다운(GFM)이라
// 누구나 렌더되고, 밑줄·색·크기는 원시 HTML 이라 강사·운영자 글(trusted)에서만 실제 색/크기로
// 표시된다(학생 글은 텍스트로 남아 XSS 안전). 그래서 색·크기 버튼은 isStaff 일 때만 노출.
const TEXT_COLORS: { label: string; hex: string }[] = [
  { label: "빨강", hex: "#c0392b" },
  { label: "파랑", hex: "#2d5ba8" },
  { label: "초록", hex: "#1e824c" },
  { label: "주황", hex: "#c97a1a" },
];
const TABLE_SNIPPET = `\n\n| 구분 | 내용 | 비고 |\n| --- | --- | --- |\n| 항목1 | 내용1 |  |\n| 항목2 | 내용2 |  |\n\n`;

function FormatToolbar({
  textareaRef,
  value,
  onChange,
  isStaff,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (v: string) => void;
  isStaff: boolean;
}) {
  // 선택 영역을 before/after 로 감싼다. 선택이 없으면 placeholder 를 넣고 그 부분을 선택.
  function wrap(before: string, after: string, placeholder = "텍스트") {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = value.slice(start, end) || placeholder;
    const next = value.slice(0, start) + before + sel + after + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + before.length, start + before.length + sel.length);
    });
  }
  // 커서 위치에 스니펫 삽입.
  function insert(snippet: string) {
    const ta = textareaRef.current;
    if (!ta) {
      onChange(value + snippet);
      return;
    }
    const start = ta.selectionStart;
    const next = value.slice(0, start) + snippet + value.slice(start);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  }

  const btn =
    "inline-flex h-7 items-center gap-1 rounded-md border border-transparent px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground";

  return (
    <div className="border-border bg-muted/40 flex flex-wrap items-center gap-0.5 rounded-md rounded-b-none border border-b-0 px-1.5 py-1">
      <button type="button" className={btn} onClick={() => wrap("**", "**")} title="굵게">
        <BoldIcon className="size-3.5" /> 굵게
      </button>
      {isStaff ? (
        <button
          type="button"
          className={btn}
          onClick={() => wrap("<u>", "</u>")}
          title="밑줄"
        >
          <UnderlineIcon className="size-3.5" /> 밑줄
        </button>
      ) : null}
      {isStaff ? (
        <div className="mx-0.5 flex items-center gap-0.5">
          {TEXT_COLORS.map((c) => (
            <button
              key={c.hex}
              type="button"
              title={`색: ${c.label}`}
              aria-label={`색 ${c.label}`}
              onClick={() =>
                wrap(`<span style="color:${c.hex}">`, "</span>")
              }
              className="size-5 rounded-full border border-black/10"
              style={{ backgroundColor: c.hex }}
            />
          ))}
        </div>
      ) : null}
      {isStaff ? (
        <>
          <button
            type="button"
            className={btn}
            onClick={() => wrap('<span style="font-size:1.3em">', "</span>")}
            title="크게"
          >
            <TypeIcon className="size-3.5" /> 크게
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => wrap('<span style="font-size:0.85em">', "</span>")}
            title="작게"
          >
            <TypeIcon className="size-3" /> 작게
          </button>
        </>
      ) : null}
      <button
        type="button"
        className={btn}
        onClick={() => insert(TABLE_SNIPPET)}
        title="표 삽입"
      >
        <TableIcon className="size-3.5" /> 표
      </button>
    </div>
  );
}
