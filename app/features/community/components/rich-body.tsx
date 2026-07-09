// feat-6-005 콘텐츠 인용 marker 렌더 컴포넌트.
// post.bodyMd / comment.bodyMd 를 split 후 marker 자리에 미니 카드 inline.

import { BookOpenIcon, ListChecksIcon, ScaleIcon } from "lucide-react";
import { Link } from "react-router";

import { cn } from "~/core/lib/utils";
import {
  type ResolvedRefMap,
  splitBodyByRefs,
} from "~/features/community/content-refs";
import { MarkdownView } from "~/features/problems/components/markdown-view";

export function RichBody({
  body,
  refs,
  className,
}: {
  body: string;
  refs: ResolvedRefMap;
  className?: string;
}) {
  const segs = splitBodyByRefs(body);
  // 콘텐츠 인용 마커가 없는 글은 마크다운으로 렌더(표·목록·굵게 등). 합격 수기 등 표 포함 글의
  // 표가 깨지지 않도록. 사용자 작성 콘텐츠라 trusted=false(XSS 차단, GFM 표는 그대로 렌더).
  if (!segs.some((s) => s.type === "marker")) {
    return (
      <MarkdownView
        text={body}
        trusted={false}
        className={cn("text-sm leading-relaxed", className)}
      />
    );
  }
  return (
    <div className={cn("space-y-2 whitespace-pre-line", className)}>
      {segs.map((seg, i) => {
        if (seg.type === "text") {
          // 빈 텍스트는 skip — line break 만 있는 경우 whitespace-pre-line 이 처리.
          return <span key={i}>{seg.text}</span>;
        }
        const ref = seg.ref!;
        if (ref.kind === "law") {
          const meta = refs.law[ref.key];
          return meta ? (
            <RefCard
              key={i}
              icon={<BookOpenIcon className="size-3" />}
              label="조문"
              title={meta.displayLabel}
              hint={meta.lawCode}
              to={meta.url}
            />
          ) : (
            <UnresolvedMarker key={i} raw={ref.raw} />
          );
        }
        if (ref.kind === "case") {
          const meta = refs.case[ref.key];
          return meta ? (
            <RefCard
              key={i}
              icon={<ScaleIcon className="size-3" />}
              label="판례"
              title={meta.caseTitle ?? meta.caseNumber}
              hint={meta.caseNumber}
              to={meta.url}
            />
          ) : (
            <UnresolvedMarker key={i} raw={ref.raw} />
          );
        }
        // problem
        const meta = refs.problem[ref.key];
        return meta ? (
          <RefCard
            key={i}
            icon={<ListChecksIcon className="size-3" />}
            label="문제"
            title={
              meta.year && meta.problemNumber
                ? `${meta.year} · ${meta.problemNumber}번`
                : "기출문제"
            }
            hint={meta.bodySnippet}
            to={meta.url}
          />
        ) : (
          <UnresolvedMarker key={i} raw={ref.raw} />
        );
      })}
    </div>
  );
}

function RefCard({
  icon,
  label,
  title,
  hint,
  to,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  hint: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      viewTransition
      className="border-primary/30 bg-primary/[0.04] hover:border-primary hover:bg-primary/10 my-1 inline-flex max-w-full items-start gap-2 rounded-md border px-2.5 py-1.5 align-middle text-[12px] no-underline transition-colors"
    >
      <span className="bg-primary text-primary-foreground mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="text-muted-foreground font-mono text-[9px] font-bold tracking-[0.06em] uppercase">
          {label}
        </span>
        <span className="text-foreground block truncate font-semibold">
          {title}
        </span>
        {hint ? (
          <span className="text-muted-foreground block truncate text-[10px]">
            {hint}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

function UnresolvedMarker({ raw }: { raw: string }) {
  return (
    <code className="bg-muted text-muted-foreground rounded px-1 py-0.5 font-mono text-[11px]">
      {raw}
    </code>
  );
}
