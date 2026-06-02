// 일회성 검증 — 결론 매칭 + 강약 권장.
import {
  compareConclusion,
  compareEmphasis,
  recommendedEmphasis,
  scoreConclusionAttempt,
} from "../app/features/issue-extraction/lib/conclusion-scoring.ts";

console.log("─── compareConclusion ───");
const concCases = [
  ["인정", "인정", "match"],
  ["인 정", "인정", "match"],
  ["성립", "성립한다", "match"],
  ["부정", "인정", "wrong"],
  ["불성립", "부정", "match"], // 같은 polarity 그룹은 아니나 polarity '-' 일치 → partial. 그룹 'deny' 동일 시 match.
  ["일부인정", "인정", "partial"],
  ["", "인정", "wrong"],
  ["인정", "", "skip"],
];
for (const [stu, model, expected] of concCases) {
  const r = compareConclusion(stu, model);
  const ok = r === expected ? "✓" : "✗";
  console.log(`${ok} compareConclusion("${stu}", "${model}") = ${r} (expected ${expected})`);
}

console.log("\n─── recommendedEmphasis ───");
const recCases = [
  [{ weight: 80, importance: "side" }, "strong"],
  [{ weight: 50, importance: "side" }, "medium"],
  [{ weight: 20, importance: "core" }, "weak"],
  [{ weight: null, importance: "core" }, "strong"],
  [{ weight: null, importance: "side" }, "weak"],
];
for (const [iss, expected] of recCases) {
  const r = recommendedEmphasis(iss);
  console.log(`${r === expected ? "✓" : "✗"} recommendedEmphasis(${JSON.stringify(iss)}) = ${r} (expected ${expected})`);
}

console.log("\n─── compareEmphasis ───");
const cmpCases = [
  ["strong", "strong", "aligned"],
  ["weak", "strong", "under"],
  ["strong", "weak", "over"],
  ["medium", "strong", "under"],
];
for (const [stu, rec, expected] of cmpCases) {
  const r = compareEmphasis(stu, rec);
  console.log(`${r === expected ? "✓" : "✗"} compareEmphasis("${stu}", "${rec}") = ${r}`);
}

console.log("\n─── scoreConclusionAttempt (통합) ───");
const masterIssues = [
  { issueId: "a", label: "신규성", descriptionMd: null, importance: "core", refHint: null, weight: null, modelConclusionDirection: "인정", modelConclusionMd: null },
  { issueId: "b", label: "진보성", descriptionMd: null, importance: "side", refHint: null, weight: null, modelConclusionDirection: "부정", modelConclusionMd: null },
];
const result = scoreConclusionAttempt(
  masterIssues,
  { a: { direction: "인정" }, b: { direction: "부정" } },
  { a: "weak", b: "strong" }, // core인데 weak (under), side인데 strong (over)
);
console.log(`matchCount=${result.matchCount} (expect 2)`);
console.log(`coreUnderCount=${result.coreUnderCount} (expect 1)`);
console.log(`sideOverCount=${result.sideOverCount} (expect 1)`);
