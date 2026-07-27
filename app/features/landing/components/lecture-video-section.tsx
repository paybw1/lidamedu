// feat-12-002 — 강의 홈 "공부방법 & 맛보기" 섹션. 카테고리별 카드 그리드 + 클릭 시
//   라이트박스(Dialog) iframe 재생. youtube embed / kollus 서명 URL 공용.
import { PlayIcon } from "lucide-react";
import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "~/core/components/ui/dialog";
import type { LectureVideoPublic } from "../lib/lecture-videos.server";
import {
  LECTURE_VIDEO_CATEGORY_LABEL,
  LECTURE_VIDEO_CATEGORY_ORDER,
  type LectureVideoCategory,
} from "../labels";

import { Reveal } from "./reveal";

function VideoCard({
  v,
  onPlay,
}: {
  v: LectureVideoPublic;
  onPlay: (v: LectureVideoPublic) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPlay(v)}
      className="group text-left"
      aria-label={`${v.title} 재생`}
    >
      <span className="relative block aspect-video overflow-hidden rounded-xl border border-[var(--line)] bg-black/70">
        {v.thumbnailUrl ? (
          // eslint 이미지 최적화 불필요(외부 유튜브 썸네일)
          <img
            src={v.thumbnailUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center px-3 text-center text-sm text-white/70">
            {v.title}
          </span>
        )}
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors group-hover:bg-[var(--gilt,#b48a2f)]">
            <PlayIcon className="size-5 translate-x-[1px]" fill="currentColor" />
          </span>
        </span>
        {v.durationLabel ? (
          <span className="tnum absolute right-2 bottom-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">
            {v.durationLabel}
          </span>
        ) : null}
      </span>
      <span className="mt-2 block text-[15px] font-semibold text-[var(--ink)] group-hover:text-[var(--gilt,#b48a2f)]">
        {v.title}
      </span>
      {v.description ? (
        <span className="mt-0.5 block text-[13px] text-[var(--soft)]">
          {v.description}
        </span>
      ) : null}
    </button>
  );
}

export function LectureVideoSection({
  videos,
}: {
  videos: LectureVideoPublic[];
}) {
  const [active, setActive] = useState<LectureVideoPublic | null>(null);
  if (videos.length === 0) return null;

  const groups = LECTURE_VIDEO_CATEGORY_ORDER.map((cat) => ({
    cat,
    items: videos.filter((v) => v.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <section className="band tint" id="videos">
      <div className="wrap">
        <Reveal className="shead">
          <div>
            <p className="eyebrow">영상으로 미리 보기</p>
            <h2>공부방법 &amp; 맛보기 강의</h2>
            <p>변리사 공부법과 강의 미리보기를 짧은 영상으로.</p>
          </div>
        </Reveal>
        {groups.map((g) => (
          <div key={g.cat} style={{ marginTop: 18 }}>
            {groups.length > 1 ? (
              <p className="vidsub">
                {LECTURE_VIDEO_CATEGORY_LABEL[g.cat as LectureVideoCategory]}
              </p>
            ) : null}
            <Reveal className="vidgrid">
              {g.items.map((v) => (
                <VideoCard key={v.videoId} v={v} onPlay={setActive} />
              ))}
            </Reveal>
          </div>
        ))}
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-3xl overflow-hidden p-0">
          <DialogTitle className="sr-only">{active?.title ?? "영상"}</DialogTitle>
          {active?.embedUrl ? (
            <div className="aspect-video w-full bg-black">
              <iframe
                key={active.videoId}
                src={active.embedUrl}
                title={active.title}
                className="h-full w-full"
                allow="autoplay; fullscreen; encrypted-media"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="flex aspect-video w-full items-center justify-center bg-black text-sm text-white/70">
              재생 준비 중입니다.
            </div>
          )}
          <div className="p-4">
            <p className="text-base font-semibold">{active?.title}</p>
            {active?.description ? (
              <p className="text-muted-foreground mt-1 text-sm">
                {active.description}
              </p>
            ) : null}
            {active?.linkedPlan ? (
              <a
                href={`/lecture/catalog/${active.linkedPlan.code}`}
                className="mt-3 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                {active.linkedPlan.name} 신청하기 →
              </a>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
