// 랜딩 FAQ — 분류를 가로 탭(pill)으로 배치, 선택한 분류의 문답만 아코디언으로 노출.
//   *.server 값 import 금지 — 필요한 형태만 로컬 타입으로 선언.
import { useState } from "react";

type FaqItem = { faqId: string; question: string; answer: string };
type FaqGroup = { category: string; items: FaqItem[] };

export function FaqTabs({ groups }: { groups: FaqGroup[] }) {
  const [active, setActive] = useState(0);
  const g = groups[active] ?? groups[0];
  if (!g) return null;
  return (
    <div className="faqx">
      <div className="faxtabs" role="tablist" aria-label="FAQ 분류">
        {groups.map((grp, i) => (
          <button
            key={grp.category}
            type="button"
            role="tab"
            aria-selected={i === active}
            className={`faxtab${i === active ? " on" : ""}`}
            onClick={() => setActive(i)}
          >
            {grp.category}
            <span className="c tnum">{grp.items.length}</span>
          </button>
        ))}
      </div>
      <div className="faxlist">
        {g.items.map((f) => (
          <details className="qa" key={f.faqId}>
            <summary>
              <span className="q">Q</span>
              <span className="qt">{f.question}</span>
              <span className="ar">▾</span>
            </summary>
            <div className="a">{f.answer}</div>
          </details>
        ))}
      </div>
    </div>
  );
}
