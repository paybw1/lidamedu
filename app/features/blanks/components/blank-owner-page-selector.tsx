import { useSearchParams } from "react-router";

// 페이지 단위 (그룹 viewer 등) owner selector — URL ?blank-owner=<uuid>
export function BlankOwnerPageSelector({
  owners,
  current,
}: {
  owners: { ownerId: string; ownerName: string | null }[];
  current: string | null;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  return (
    <select
      value={current ?? ""}
      onChange={(e) => {
        const next = new URLSearchParams(searchParams);
        if (e.target.value) next.set("blank-owner", e.target.value);
        else next.delete("blank-owner");
        setSearchParams(next, { preventScrollReset: true });
      }}
      className="border-input bg-background h-7 rounded-md border px-2 text-xs"
      aria-label="빈칸 자료 강사 선택"
    >
      <option value="">강사 자동 선택</option>
      {owners.map((o) => (
        <option key={o.ownerId} value={o.ownerId}>
          {o.ownerName ?? "(이름없음)"}
        </option>
      ))}
    </select>
  );
}
