// §1 단위 검증 — normalizeCaseNumber / extractAllCaseNumbers / verifyTripleMatch.
// 사용: npx tsx scripts/precedents/verify-case-number.ts

import {
  caseNumbersEqual,
  extractAllCaseNumbers,
  normalizeCaseNumber,
  verifyTripleMatch,
} from "../../app/features/cases/lib/case-number";

interface Check { name: string; ok: boolean; got?: unknown; want?: unknown }
const results: Check[] = [];
function eq(name: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  results.push({ name, ok, got, want });
  process.stdout.write(
    `  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}\n`,
  );
}

process.stdout.write(`\n=== normalizeCaseNumber ===\n`);
eq("순수 토큰", normalizeCaseNumber("2012후726"), "2012후726");
eq("공백 섞임", normalizeCaseNumber("2012 후 726"), "2012후726");
eq("점 섞임", normalizeCaseNumber("2012.후.726"), "2012후726");
eq("헤더 동봉", normalizeCaseNumber("대법원 2013.2.28. 선고 2012후726 판결"), "2012후726");
eq("양쪽 공백", normalizeCaseNumber("  2012후726  "), "2012후726");
eq("4자리 사건부호", normalizeCaseNumber("2023다231738"), "2023다231738");
eq("2자리 연도", normalizeCaseNumber("85후31"), "85후31");
eq("긴 사건부호 3자", normalizeCaseNumber("2018후가10848"), "2018후가10848");
eq("null", normalizeCaseNumber(null), null);
eq("빈 문자열", normalizeCaseNumber(""), null);
eq("의미없는 텍스트", normalizeCaseNumber("정보없음"), null);
eq("연도만", normalizeCaseNumber("2012"), null);

process.stdout.write(`\n=== extractAllCaseNumbers ===\n`);
eq(
  "병합 사건",
  extractAllCaseNumbers("대법원 2013.2.28. 선고 2012후726, 2013후800 판결"),
  ["2012후726", "2013후800"],
);
eq(
  "중복 제거",
  extractAllCaseNumbers("2012후726 (즉 2012후726)"),
  ["2012후726"],
);
eq("매치 없음", extractAllCaseNumbers("정보없음"), []);

process.stdout.write(`\n=== caseNumbersEqual ===\n`);
eq("동일 토큰", caseNumbersEqual("2012후726", "2012후726"), true);
eq("공백 무시", caseNumbersEqual("2012 후 726", "2012.후.726"), true);
eq("헤더 무시", caseNumbersEqual("대법원 선고 2012후726", "2012후726"), true);
eq("다른 사건", caseNumbersEqual("2012후726", "2012후727"), false);
eq("prefix attack 방어", caseNumbersEqual("2012후726", "2012후7268"), false);
eq("한쪽 null → false", caseNumbersEqual(null, "2012후726"), false);
eq("양쪽 null → false", caseNumbersEqual(null, null), false);

process.stdout.write(`\n=== verifyTripleMatch (§2 dry-run 안전망) ===\n`);
const passed = verifyTripleMatch({
  inputRaw: "2012후726",
  listSeenRaw: "2012후726",
  serviceSeenRaw: "2012후726",
  dbSeenRaw: "2012후726",
});
eq("모두 일치 → reason null", passed.reason, null);

const listMismatch = verifyTripleMatch({
  inputRaw: "2012후726",
  listSeenRaw: "2023다231738", // ★ 엉뚱한 판례가 첫 결과로 잡힌 경우
  serviceSeenRaw: "2023다231738",
  dbSeenRaw: "2012후726",
});
eq("엉뚱한 매칭 → reason 검출", listMismatch.reason !== null, true);

const dbMismatch = verifyTripleMatch({
  inputRaw: "2012후726",
  listSeenRaw: "2012후726",
  serviceSeenRaw: "2012후726",
  dbSeenRaw: "2012후727", // DB 에 오타 들어가 있다면
});
eq("DB 측 mismatch → reason 검출", dbMismatch.reason !== null, true);

const noCases = verifyTripleMatch({
  inputRaw: "2012후726",
  listSeenRaw: "2012후726",
  serviceSeenRaw: "2012후726",
  dbSeenRaw: null, // cases 에 미존재 (신규 후보)
});
eq("cases 미존재 → reason 검출 (신규 후보)", noCases.reason !== null, true);

const passed2 = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok).length;
process.stdout.write(`\n=== 종합 ===\n  ${passed2} 통과 / ${failed} 실패 (총 ${results.length})\n`);
if (failed > 0) process.exit(1);
