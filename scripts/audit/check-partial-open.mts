// 부분 공개 게이트 판정 검증 — 등급별로 무엇이 열리고 닫히는지 표로 찍는다.
//   npx tsx scripts/audit/check-partial-open.mts
// ★접근 통제라 배포 전마다 돌린다. 기대값이 바뀌면 그것부터 합의한다.

import {
  isSubjectLocked,
  openAxesFor,
  subjectLockedHint,
} from "../../app/core/lib/nav-groups";

type Subjects = "all" | string[];

const CASES: {
  who: string;
  isStaff: boolean;
  subjects: Subjects;
  slug: string;
  wantLocked: boolean;
  wantAxes: readonly string[] | null;
}[] = [
  // 상표 — 이번에 여는 과목
  { who: "종합반", isStaff: false, subjects: "all", slug: "trademark", wantLocked: false, wantAxes: ["articles"] },
  { who: "구독자(상표 구매)", isStaff: false, subjects: ["trademark", "science"], slug: "trademark", wantLocked: false, wantAxes: ["articles"] },
  { who: "구독자(번들)", isStaff: false, subjects: ["patent", "trademark", "design", "science"], slug: "trademark", wantLocked: false, wantAxes: ["articles"] },
  { who: "구독자(특허만)", isStaff: false, subjects: ["patent", "science"], slug: "trademark", wantLocked: true, wantAxes: [] },
  { who: "체험", isStaff: false, subjects: ["patent", "science"], slug: "trademark", wantLocked: true, wantAxes: [] },
  { who: "staff", isStaff: true, subjects: "all", slug: "trademark", wantLocked: false, wantAxes: null },
  // 디자인 — 같은 규칙
  { who: "구독자(디자인 구매)", isStaff: false, subjects: ["design", "science"], slug: "design", wantLocked: false, wantAxes: ["articles"] },
  { who: "구독자(특허만)", isStaff: false, subjects: ["patent", "science"], slug: "design", wantLocked: true, wantAxes: [] },
  // 민법 — 기존 종합반 전체 개방이 그대로여야 한다(회귀 방지)
  { who: "종합반", isStaff: false, subjects: "all", slug: "civil", wantLocked: false, wantAxes: null },
  { who: "구독자(특허만)", isStaff: false, subjects: ["patent", "science"], slug: "civil", wantLocked: true, wantAxes: null },
  // 민사소송법 — 아무에게도 안 열린다
  { who: "종합반", isStaff: false, subjects: "all", slug: "civil-procedure", wantLocked: true, wantAxes: null },
  // 특허 — 준비 중이 아니므로 구매 여부만 본다
  { who: "체험", isStaff: false, subjects: ["patent", "science"], slug: "patent", wantLocked: false, wantAxes: null },
  { who: "구독자(상표만)", isStaff: false, subjects: ["trademark", "science"], slug: "patent", wantLocked: true, wantAxes: null },
];

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

let bad = 0;
console.log(
  "누구".padEnd(20) + "과목".padEnd(18) + "잠김".padEnd(8) + "열린축".padEnd(16) + "힌트",
);
for (const c of CASES) {
  const locked = isSubjectLocked(c.slug, c.isStaff, c.subjects);
  const axes = openAxesFor(c.slug, c.isStaff, c.subjects);
  const ok = locked === c.wantLocked && eq(axes, c.wantAxes);
  if (!ok) bad += 1;
  console.log(
    c.who.padEnd(20) +
      c.slug.padEnd(18) +
      String(locked).padEnd(8) +
      JSON.stringify(axes).padEnd(16) +
      (locked ? subjectLockedHint(c.slug, c.isStaff) : "-") +
      (ok ? "" : `   ✗ 기대 locked=${c.wantLocked} axes=${JSON.stringify(c.wantAxes)}`),
  );
}
console.log(bad === 0 ? "\n전 케이스 일치" : `\n어긋남 ${bad}건`);
if (bad > 0) process.exit(1);
