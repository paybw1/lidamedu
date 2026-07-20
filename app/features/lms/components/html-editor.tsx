// feat-11-006 Phase 3 — 소스 우선 하이브리드 HTML 에디터.
//   ★설계: 저장값은 항상 원본 HTML 문자열(단일 소스). 비주얼(contentEditable)과 소스(textarea)는
//   같은 문자열을 편집하는 두 창일 뿐이라, 디자이너가 붙여넣은 임의 HTML/CSS 가 정규화로 유실되지
//   않는다(tiptap 류 스키마 에디터와의 결정적 차이 — 모바일 CSS·커스텀 레이아웃 보존).
//   폼에는 hidden input(name)으로 HTML 을 실어 기존 액션 경로를 그대로 사용한다.
import { useEffect, useId, useRef, useState } from "react";

import {
  BoldIcon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  Maximize2Icon,
  Minimize2Icon,
  TableIcon,
  YoutubeIcon,
} from "lucide-react";

type Mode = "visual" | "source" | "preview";

export interface HtmlEditorProps {
  /** 폼 필드명 — 이 이름의 hidden input 으로 HTML 이 제출된다. */
  name: string;
  defaultValue?: string;
  /** 이미지 업로드 엔드포인트(POST multipart file → {url}). */
  uploadUrl: string;
  minHeight?: number;
}

// 유튜브 URL/ID → 임베드 iframe.
function youtubeEmbed(input: string): string | null {
  const m =
    /(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/.exec(input) ||
    /^([\w-]{11})$/.exec(input.trim());
  if (!m) return null;
  return `<div style="position:relative;padding-top:56.25%;margin:1rem 0"><iframe src="https://www.youtube.com/embed/${m[1]}" style="position:absolute;inset:0;width:100%;height:100%;border:0" allowfullscreen loading="lazy"></iframe></div>`;
}

const SAMPLE_TABLE =
  '<table style="border-collapse:collapse;width:100%;margin:1rem 0"><thead><tr><th style="border:1px solid #ddd;padding:8px;background:#f6f6f6">구분</th><th style="border:1px solid #ddd;padding:8px;background:#f6f6f6">내용</th></tr></thead><tbody><tr><td style="border:1px solid #ddd;padding:8px">　</td><td style="border:1px solid #ddd;padding:8px">　</td></tr></tbody></table>';

export function HtmlEditor({
  name,
  defaultValue = "",
  uploadUrl,
  minHeight = 320,
}: HtmlEditorProps) {
  const [mode, setMode] = useState<Mode>("visual");
  const [html, setHtml] = useState(defaultValue);
  const [fullscreen, setFullscreen] = useState(false);
  const [mobilePreview, setMobilePreview] = useState(false);
  const [uploading, setUploading] = useState(false);
  const editableRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const colorId = useId();

  // 비주얼 모드 진입 시 contentEditable 에 현재 HTML 주입(모드 전환마다 동기화).
  useEffect(() => {
    if (mode === "visual" && editableRef.current) {
      if (editableRef.current.innerHTML !== html)
        editableRef.current.innerHTML = html;
    }
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const syncFromVisual = () => {
    if (editableRef.current) setHtml(editableRef.current.innerHTML);
  };

  // execCommand — contentEditable 단순 서식(staff 도구라 deprecated 여도 실용).
  const exec = (command: string, value?: string) => {
    editableRef.current?.focus();
    document.execCommand(command, false, value);
    syncFromVisual();
  };

  // 커서 위치에 HTML 삽입 — 비주얼은 execCommand, 소스는 textarea selection.
  const insertHtml = (snippet: string) => {
    if (mode === "source" && sourceRef.current) {
      const ta = sourceRef.current;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = html.slice(0, start) + snippet + html.slice(end);
      setHtml(next);
      requestAnimationFrame(() => {
        ta.focus();
        ta.selectionStart = ta.selectionEnd = start + snippet.length;
      });
    } else {
      editableRef.current?.focus();
      document.execCommand("insertHTML", false, snippet);
      syncFromVisual();
    }
  };

  const onPickImage = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(uploadUrl, { method: "POST", body: fd });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error || "업로드 실패");
      insertHtml(
        `<img src="${json.url}" alt="" style="max-width:100%;height:auto;display:block;margin:0.5rem auto" />`,
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "이미지 업로드 실패");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const insertLink = () => {
    const url = window.prompt("링크 URL을 입력하세요", "https://");
    if (!url) return;
    if (mode === "visual") exec("createLink", url);
    else insertHtml(`<a href="${url}" target="_blank" rel="noreferrer">링크</a>`);
  };
  const insertYoutube = () => {
    const input = window.prompt("유튜브 URL 또는 영상 ID");
    if (!input) return;
    const embed = youtubeEmbed(input);
    if (!embed) return alert("유효한 유튜브 URL/ID가 아닙니다.");
    insertHtml(embed);
  };

  const visualEnabled = mode === "visual";
  const btn =
    "border-input hover:bg-muted inline-flex h-8 items-center gap-1 rounded-md border px-2 text-[12px] disabled:opacity-40";

  return (
    <div
      className={
        fullscreen
          ? "bg-background fixed inset-0 z-50 flex flex-col p-4"
          : "border-input bg-background rounded-md border"
      }
    >
      {/* hidden input — 실제 제출값(항상 원본 HTML). */}
      <input type="hidden" name={name} value={html} />

      {/* 모드 탭 + 전체화면 */}
      <div className="border-border flex items-center gap-1 border-b px-2 py-1.5">
        {(
          [
            ["visual", "비주얼"],
            ["source", "소스"],
            ["preview", "미리보기"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              if (mode === "visual") syncFromVisual();
              setMode(k);
            }}
            className={
              "rounded px-2.5 py-1 text-[12px] font-semibold " +
              (mode === k
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {label}
          </button>
        ))}
        {mode === "preview" ? (
          <button
            type="button"
            onClick={() => setMobilePreview((v) => !v)}
            className="text-muted-foreground hover:text-foreground ml-1 rounded px-2 py-1 text-[12px] font-semibold"
          >
            {mobilePreview ? "데스크톱 폭" : "모바일 폭"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setFullscreen((v) => !v)}
          className="text-muted-foreground hover:text-foreground ml-auto p-1"
          title={fullscreen ? "전체화면 해제" : "전체화면"}
        >
          {fullscreen ? (
            <Minimize2Icon className="size-4" />
          ) : (
            <Maximize2Icon className="size-4" />
          )}
        </button>
      </div>

      {/* 툴바 (미리보기 모드에선 숨김) */}
      {mode !== "preview" ? (
        <div className="border-border flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
          <button type="button" className={btn} onClick={() => exec("bold")} disabled={!visualEnabled} title="굵게">
            <BoldIcon className="size-3.5" />
          </button>
          <button type="button" className={btn} onClick={() => exec("italic")} disabled={!visualEnabled} title="기울임">
            <ItalicIcon className="size-3.5" />
          </button>
          <button type="button" className={btn} onClick={() => exec("formatBlock", "H2")} disabled={!visualEnabled}>
            제목
          </button>
          <button type="button" className={btn} onClick={() => exec("formatBlock", "H3")} disabled={!visualEnabled}>
            소제목
          </button>
          <button type="button" className={btn} onClick={() => exec("insertUnorderedList")} disabled={!visualEnabled} title="목록">
            <ListIcon className="size-3.5" />
          </button>
          <label className={btn + " cursor-pointer"} title="글자 색" htmlFor={colorId}>
            <span className="inline-block size-3.5 rounded-sm border" style={{ background: "linear-gradient(90deg,#e11,#16a,#1a1)" }} />
            <input
              id={colorId}
              type="color"
              className="sr-only"
              disabled={!visualEnabled}
              onChange={(e) => exec("foreColor", e.target.value)}
            />
          </label>
          <span className="bg-border mx-1 h-5 w-px" />
          <button type="button" className={btn} onClick={insertLink} title="링크">
            <LinkIcon className="size-3.5" />
          </button>
          <button type="button" className={btn} onClick={() => fileRef.current?.click()} disabled={uploading} title="이미지">
            <ImageIcon className="size-3.5" /> {uploading ? "업로드중…" : "이미지"}
          </button>
          <button type="button" className={btn} onClick={() => insertHtml(SAMPLE_TABLE)} title="표">
            <TableIcon className="size-3.5" /> 표
          </button>
          <button type="button" className={btn} onClick={insertYoutube} title="유튜브">
            <YoutubeIcon className="size-3.5" /> 유튜브
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPickImage(f);
            }}
          />
        </div>
      ) : null}

      {/* 편집/미리보기 영역 */}
      <div className={fullscreen ? "min-h-0 flex-1 overflow-auto" : ""}>
        {mode === "visual" ? (
          <div
            ref={editableRef}
            contentEditable
            suppressContentEditableWarning
            onInput={syncFromVisual}
            onBlur={syncFromVisual}
            className="lecture-detail-html prose-none w-full px-3 py-2 text-sm outline-none"
            style={{ minHeight: fullscreen ? undefined : minHeight }}
          />
        ) : mode === "source" ? (
          <textarea
            ref={sourceRef}
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            spellCheck={false}
            placeholder="<section>...</section>"
            className="w-full resize-y px-3 py-2 font-mono text-[12px] outline-none"
            style={{ minHeight: fullscreen ? "100%" : minHeight }}
          />
        ) : (
          <div className="bg-muted/30 flex justify-center overflow-auto p-4" style={{ minHeight }}>
            <div
              className="lecture-detail-html bg-background rounded shadow-sm"
              style={{ width: mobilePreview ? 390 : "100%", maxWidth: "100%", padding: 16 }}
              dangerouslySetInnerHTML={{ __html: html || "<p style='color:#999'>미리볼 내용이 없습니다.</p>" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
