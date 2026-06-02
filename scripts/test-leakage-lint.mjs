// 일회성 검증 — leakage lint 동작 확인. 실행 후 삭제 가능.
import { lintFactsForLeakage } from "../app/features/cases/lib/leakage-lint.ts";

const cases = [
  {
    name: "clean facts (누출 없어야)",
    input:
      "A 회사는 2020년 5월 1일 특허출원을 했다. B는 그 후 8월 동일한 발명을 학회에서 공개했다. A는 2021년 1월 등록을 받았다.",
  },
  {
    name: "쟁점 키워드 누출",
    input: "A 회사는 출원했다. 이 사건의 쟁점은 신규성 위반 여부이다.",
  },
  {
    name: "법원 판단 누출",
    input: "A는 출원을 했고, 법원은 이를 신규성 위반으로 판단했다.",
  },
  {
    name: "결론 누출",
    input: "A는 출원하고 등록받았다. 따라서 신규성 위반이 인정된다.",
  },
  {
    name: "판시사항 누출",
    input: "A 회사가 출원한 발명에 대한 판시사항: 신규성 부정.",
  },
];
for (const c of cases) {
  const r = lintFactsForLeakage(c.input);
  console.log(
    `[${c.name}] leaks=${r.hits.length} patterns=${r.hits.map((h) => h.pattern).join(",") || "(none)"}`,
  );
}
