// errata Phase 3 — 공용 발행 모달. 조문·판례·문제 편집 화면 3곳이 공유한다.
// diff 는 원장 스냅샷에서 프리필하되(권위=서버), 정오표 문구는 편집 가능 —
// 편집본은 errata_payload 에 담기고 원장 스냅샷은 변경 실체로 그대로 보존된다.
import { useEffect, useMemo, useState } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";

import { Button } from "~/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/core/components/ui/dialog";
import { Input } from "~/core/components/ui/input";
import { Textarea } from "~/core/components/ui/textarea";
import { diffLines } from "~/core/lib/diff-lines";
import { cn } from "~/core/lib/utils";
import {
  ERRATA_KINDS,
  ERRATA_SEVERITIES,
  EXAM_SCOPE_LABEL,
  type ErrataKind,
  type ErrataSeverity,
} from "~/features/errata/labels";
import type { PublishModalData } from "~/features/errata/api/publish";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  revisionIds: string[];
  defaultKind?: ErrataKind;
  // 발행 완료 또는 취소 후 호출 — 호출한 화면이 복귀(redirect·닫기)를 결정한다.
  onDone: (published: boolean) => void;
}

export function ErrataPublishModal({
  open,
  onOpenChange,
  revisionIds,
  defaultKind = "typo",
  onDone,
}: Props) {
  const loadFetcher = useFetcher<PublishModalData>();
  const publishFetcher = useFetcher<{ ok?: boolean; error?: string; publishedIds?: string[] }>();
  const dryRunFetcher = useFetcher<{ ok?: boolean; error?: string; attempts?: number; affectedUsers?: number }>();

  const [kind, setKind] = useState<ErrataKind>(defaultKind);
  const [severity, setSeverity] = useState<ErrataSeverity>("normal");
  const [title, setTitle] = useState("");
  const [beforeText, setBeforeText] = useState("");
  const [afterText, setAfterText] = useState("");
  const [reason, setReason] = useState("");
  const [regrade, setRegrade] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  // 모달 열림 → 원장 데이터 로드
  useEffect(() => {
    if (open && revisionIds.length > 0) {
      setPrefilled(false);
      setKind(defaultKind);
      setSeverity("normal");
      setRegrade(false);
      loadFetcher.load(`/api/errata/publish?ids=${revisionIds.join(",")}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, revisionIds.join(",")]);

  const d = loadFetcher.data;
  const loading = loadFetcher.state !== "idle" || (!d && open);

  // diff 프리필 — 원장 스냅샷의 변경 필드별 before/after 를 문구 초안으로.
  useEffect(() => {
    if (!d?.ok || !d.revisions || prefilled) return;
    const before: string[] = [];
    const after: string[] = [];
    for (const rev of d.revisions) {
      for (const fd of rev.fieldDiffs) {
        const diff = diffLines(fd.beforeText.split("\n"), fd.afterText.split("\n"));
        const removed = diff.filter((l) => l.kind === "removed").map((l) => l.text);
        const added = diff.filter((l) => l.kind === "added").map((l) => l.text);
        if (removed.length) before.push(...removed);
        if (added.length) after.push(...added);
      }
    }
    setBeforeText(before.join("\n"));
    setAfterText(after.join("\n"));
    setTitle(d.contentLabel ?? "");
    if (d.regradeSuggested) setRegrade(true);
    setPrefilled(true);
  }, [d, prefilled]);

  // 발행 결과 처리
  useEffect(() => {
    if (publishFetcher.state !== "idle" || !publishFetcher.data) return;
    if (publishFetcher.data.ok) {
      toast.success(`추록·정오표 발행 완료 (${publishFetcher.data.publishedIds?.length ?? 0}건)`);
      onOpenChange(false);
      onDone(true);
    } else if (publishFetcher.data.error) {
      toast.error(`발행 실패: ${publishFetcher.data.error}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishFetcher.state, publishFetcher.data]);

  const submitting = publishFetcher.state !== "idle";
  const problemContentId = useMemo(
    () => d?.revisions?.find((r) => r.contentType === "mcq" || r.contentType === "essay")?.contentId ?? null,
    [d],
  );

  const publish = () => {
    if (!title.trim()) {
      toast.error("정오표 제목을 입력하세요");
      return;
    }
    publishFetcher.submit(
      {
        intent: "publish",
        revisionIds,
        kind,
        severity,
        title: title.trim(),
        beforeText,
        afterText,
        reason,
        regrade,
      },
      { method: "post", action: "/api/errata/publish", encType: "application/json" },
    );
  };

  const cancel = () => {
    onOpenChange(false);
    onDone(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : cancel())}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>추록·정오표 발행</DialogTitle>
          <DialogDescription>
            저장은 이미 완료되었습니다. 발행하면 수험생 고지 대상(published)이 되고, 취소하면
            내부 수정(none)으로 남습니다.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-muted-foreground py-8 text-center text-sm">원장 기록을 불러오는 중…</p>
        ) : !d?.ok ? (
          <p className="text-destructive py-8 text-center text-sm">{d?.error ?? "로드 실패"}</p>
        ) : (
          <div className="space-y-4 text-sm">
            <p className="font-medium">{d.contentLabel}</p>

            {/* 유형 · 중요도 */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground w-12 text-xs">유형</span>
              {ERRATA_KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => setKind(k.value)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs",
                    kind === k.value
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "text-muted-foreground hover:border-foreground/40",
                  )}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground w-12 text-xs">중요도</span>
              {ERRATA_SEVERITIES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSeverity(s.value)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs",
                    severity === s.value
                      ? s.value === "critical"
                        ? "border-rose-500 bg-rose-50 text-rose-700 font-semibold dark:bg-rose-950/40 dark:text-rose-300"
                        : "border-primary bg-primary/10 text-primary font-semibold"
                      : "text-muted-foreground hover:border-foreground/40",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* 대상 위치 (자동) + 시험 적용 판정 — 판본별 나란히 (§4.3) */}
            <div className="bg-muted/40 space-y-1 rounded-md border p-2.5 text-xs">
              <p className="text-muted-foreground font-semibold tracking-wide uppercase">대상 위치 (자동)</p>
              {d.locations && d.locations.length > 0 ? (
                d.locations.map((loc, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-x-2">
                    <span>
                      {loc.publicationTitle} {loc.editionLabel}
                      {loc.pageNo != null ? ` p.${loc.pageNo}` : ""}
                      {loc.sortKey != null && loc.pageNo == null ? ` · 수록순 ${loc.sortKey}` : ""}
                    </span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5",
                        loc.scope === "applicable" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
                        loc.scope === "future" && "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
                        loc.scope === "unknown" && "bg-muted text-muted-foreground",
                      )}
                    >
                      {EXAM_SCOPE_LABEL[loc.scope]}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-amber-700 dark:text-amber-400">
                  ⚠ 매핑 없음 — 위치 표기 없이 발행됩니다 (매핑이 생기면 자동으로 붙습니다)
                </p>
              )}
            </div>

            {/* 변경 전/후 — 프리필 후 편집 가능 (§4.1) */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-muted-foreground mb-1 text-xs font-semibold">변경 전 (편집 가능)</p>
                <Textarea
                  value={beforeText}
                  onChange={(e) => setBeforeText(e.target.value)}
                  rows={6}
                  className="font-mono text-xs"
                />
              </div>
              <div>
                <p className="text-muted-foreground mb-1 text-xs font-semibold">변경 후 (편집 가능)</p>
                <Textarea
                  value={afterText}
                  onChange={(e) => setAfterText(e.target.value)}
                  rows={6}
                  className="font-mono text-xs"
                />
              </div>
            </div>
            <p className="text-muted-foreground text-[11px]">
              문구를 다듬어도 원장의 변경 스냅샷은 원본 그대로 보존됩니다. 묶인 원장 기록{" "}
              {d.revisions?.length ?? 0}건이 함께 발행됩니다.
            </p>

            {/* 제목 · 근거 */}
            <div className="space-y-2">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="정오표 제목" />
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="근거 (법률 제·개정 번호, 판례 번호 등 — 선택)"
              />
            </div>

            {/* 재채점 (§4.5 — 플래그만, 실행은 Phase 6) */}
            {(d.regradeSuggested || regrade) && problemContentId ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs dark:border-amber-800 dark:bg-amber-950/30">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={regrade} onChange={(e) => setRegrade(e.target.checked)} />
                  과거 응시기록 재채점 필요 (플래그만 — 실행은 건별 판단)
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-[11px]"
                  disabled={dryRunFetcher.state !== "idle"}
                  onClick={() =>
                    dryRunFetcher.submit(
                      { intent: "dry_run_regrade", problemId: problemContentId },
                      { method: "post", action: "/api/errata/publish", encType: "application/json" },
                    )
                  }
                >
                  영향 확인 (dry-run)
                </Button>
                {dryRunFetcher.data?.ok ? (
                  <span className="text-amber-800 dark:text-amber-300">
                    영향: {dryRunFetcher.data.affectedUsers}명 · {dryRunFetcher.data.attempts}건
                  </span>
                ) : null}
              </div>
            ) : null}

            {d.canPublish === false ? (
              <p className="text-destructive text-xs">발행은 원장·관리자 전용입니다 — 현재 계정으로는 발행할 수 없습니다.</p>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={cancel} disabled={submitting}>
                취소 (저장은 유지)
              </Button>
              <Button type="button" onClick={publish} disabled={submitting || d.canPublish === false}>
                {submitting ? "발행 중…" : "발행"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
