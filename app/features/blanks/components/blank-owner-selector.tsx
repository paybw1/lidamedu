import { useSearchParams } from "react-router";

import type { BlankSet } from "~/features/blanks/queries.server";

// 같은 article 에 여러 owner 의 빈칸 set 이 있을 때, 학습자가 선택하는 dropdown.
// URL ?blank=<setId> 로 동기화 → loader 가 그 set 을 골라 렌더.
export function BlankOwnerSelector({
  options,
  currentSetId,
}: {
  options: BlankSet[];
  currentSetId: string;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  return (
    <select
      value={currentSetId}
      onChange={(e) => {
        const next = new URLSearchParams(searchParams);
        next.set("blank", e.target.value);
        setSearchParams(next, { preventScrollReset: true });
      }}
      className="border-input bg-background h-7 rounded-md border px-2 text-xs"
      aria-label="빈칸 자료 강사 선택"
    >
      {options.map((s) => (
        <option key={s.setId} value={s.setId}>
          {s.ownerName ?? "(이름없음)"} · {s.displayName ?? s.version}
        </option>
      ))}
    </select>
  );
}
