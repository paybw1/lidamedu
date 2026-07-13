// 랜딩 강사진 가로 레일 — 공용 Rail(한 명씩 넘김) 위에 강사 카드(.ic)를 얹은 것.
//   *.server 값 import 금지(빌드 함정).
import { Link } from "react-router";

import { Rail } from "./rail";

export type RailInstructor = {
  instructorId: string;
  slug: string;
  name: string;
  subjectLabel: string;
  photoPath: string | null;
  monogram: string | null;
};

export function InstructorRail({ items }: { items: RailInstructor[] }) {
  return (
    <Rail cardWidth={186} count={items.length} ariaPrev="이전 강사" ariaNext="다음 강사">
      {items.map((it) => (
        <Link
          className="ic"
          to={`/about/instructors/${it.slug}`}
          key={it.instructorId}
        >
          <span className="por">
            {it.photoPath ? (
              <img src={it.photoPath} alt={it.name} loading="lazy" />
            ) : (
              <b>{it.monogram ?? it.name.slice(0, 1)}</b>
            )}
          </span>
          <span className="icb">
            <span className="nm">{it.name}</span>
            <span className="role">{it.subjectLabel}</span>
          </span>
        </Link>
      ))}
    </Rail>
  );
}
