// feat-2-032 — ③ 사안의 포섭·결론을 **② 에서 세운 목차대로** 쓴다.
//
// 원장 지적(2026-09-04): 쟁점이 여러 개인 문항에서 ③이 빈 칸 하나였다. 학생은 세 논점을
// 한 칸에 몰아 썼고 ②의 목차와 ③이 서로 무관해졌다 — 실제 답안은 목차를 따라 써 내려간다.
//
// ★목차가 비어 있으면 이 화면을 쓰지 않는다(호출부에서 판단). ②를 안 쓴 학생에게
//   빈 목록만 보여 주면 ③을 아예 못 쓴다.
// ★목차를 고쳐 짝을 잃은 글은 지우지 않고 아래에 남긴다 — 학습 데이터 무삭제.

import { useMemo } from "react";

import { Textarea } from "~/core/components/ui/textarea";
import {
  type AnalysisChunk,
  joinAnalysis,
  mapAnalysisToItems,
} from "~/features/subjects/lib/essay-stage-link";

export function AnalysisByOutline({
  items,
  value,
  onChange,
}: {
  /** ② 에서 세운 목차 항목. */
  items: string[];
  /** 저장된 `analysis_md`. */
  value: string;
  onChange: (next: string) => void;
}) {
  const { byItem, orphans } = useMemo(
    () => mapAnalysisToItems(items, value),
    [items, value],
  );

  const setItem = (title: string, body: string) => {
    const next = joinAnalysis(items.map((t) => ({ title: t, body: t === title ? body : (byItem[t] ?? "") })));
    // ★짝 잃은 글은 뒤에 그대로 붙여 보존한다. 여기서 빠뜨리면 목차를 한 번 고친
    //   학생의 글이 다음 타이핑에 조용히 사라진다.
    const tail = orphans
      .map((o) => (o.title ? `### ${o.title}\n\n${o.body}` : o.body))
      .filter((s) => s.trim())
      .join("\n\n");
    onChange([next, tail].filter((s) => s.trim()).join("\n\n"));
  };

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs">
        ②에서 세운 목차 그대로입니다. 항목마다 조문·판례를 사안에 적용해 결론까지 씁니다.
        목차를 고치면 이 목록도 따라 바뀝니다.
      </p>

      {items.map((t) => (
        <div key={t} className="space-y-1">
          <p className="text-sm font-semibold">{t}</p>
          <Textarea
            rows={4}
            value={byItem[t] ?? ""}
            onChange={(e) => setItem(t, e.target.value)}
            placeholder="사안에서 … 이므로 … 에 해당한다. 따라서 …"
            className="text-sm leading-relaxed"
          />
        </div>
      ))}

      {orphans.length ? <OrphanNote orphans={orphans} /> : null}
    </div>
  );
}

/** 목차에서 사라진 항목에 쓴 글 — 지우지 않고 보여만 준다. */
function OrphanNote({ orphans }: { orphans: AnalysisChunk[] }) {
  return (
    <div className="border-border bg-muted/40 rounded-lg border p-3">
      <p className="text-muted-foreground mb-1.5 text-xs font-semibold">
        지금 목차에 없는 항목에 쓴 글 ({orphans.length})
      </p>
      <p className="text-muted-foreground mb-2 text-[11px]">
        목차를 고치기 전에 쓴 글입니다. 지우지 않고 그대로 보관합니다 — 목차에 항목을
        다시 넣으면 그 자리로 돌아갑니다.
      </p>
      <ul className="space-y-2">
        {orphans.map((o, i) => (
          <li key={i} className="text-sm">
            {o.title ? <p className="font-medium">{o.title}</p> : null}
            <p className="text-muted-foreground whitespace-pre-wrap">{o.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
