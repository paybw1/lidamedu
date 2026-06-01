// §5 자동 검증 — 강사 검증 게이트 + 정답 구조 1차 검증.
//
// 1) 구조 검증 단위 케이스 (validateProblemStructure):
//    정상 mc_short / mc_short 정답 0개 / mc_short 정답 2개 / 정상 mc_box / mc_box 정답 마커 불일치.
// 2) 게이트 시뮬 (DB 직접 조작):
//    - 임시 draft 문제 INSERT (origin=ai_draft, review_status=draft)
//    - listProblemsBySubject 호출 → 임시 문제 결과 없음
//    - search-content 쿼리 (eq review_status=approved) → 임시 문제 결과 없음
//    - addPackProblems 호출 → skippedUnapproved=1, 추가 0
//    - 단건 addPackProblem 호출 → unapproved error
//    - approve update → 모두 노출됨 / 추가 성공
//    - cleanup: 임시 문제 + 매핑 + pack 삭제 (만든 경우)
//
// 사용: npx tsx scripts/verify-review-gate.ts
//   결과 console.log. 실패 시 exit 1.

import "dotenv/config";

import adminClient from "../app/core/lib/supa-admin-client.server";
import { validateProblemStructure } from "../app/features/admin/lib/ai-problem-gen.server";
import {
  addPackProblem,
  addPackProblems,
} from "../app/features/mcq-packs/queries.server";
import { listProblemsBySubject } from "../app/features/problems/queries.server";

interface TestCase {
  name: string;
  expectedFail: boolean;
  // 인풋은 internal type. zod 통과한 후의 shape 와 동일.
  // any 회피 위해 cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: any;
}

const STRUCTURE_CASES: TestCase[] = [
  {
    name: "mc_short 정상 (5선지 + 정답 1)",
    expectedFail: false,
    input: {
      format: "mc_short",
      body_md: "특허출원서 기재사항으로 옳지 않은 것은?",
      explanation_md: "법 제42조",
      choices: [
        { choice_index: 1, body_md: "특허출원인 성명", is_correct: false, explanation_md: "" },
        { choice_index: 2, body_md: "발명자 주소", is_correct: false, explanation_md: "" },
        { choice_index: 3, body_md: "발명의 명칭", is_correct: false, explanation_md: "" },
        { choice_index: 4, body_md: "출원 시간", is_correct: true, explanation_md: "" },
        { choice_index: 5, body_md: "대리인 성명", is_correct: false, explanation_md: "" },
      ],
      box_items: [],
    },
  },
  {
    name: "mc_short 정답 0개 (오류)",
    expectedFail: true,
    input: {
      format: "mc_short",
      body_md: "...",
      explanation_md: "",
      choices: [
        { choice_index: 1, body_md: "A", is_correct: false, explanation_md: "" },
        { choice_index: 2, body_md: "B", is_correct: false, explanation_md: "" },
        { choice_index: 3, body_md: "C", is_correct: false, explanation_md: "" },
        { choice_index: 4, body_md: "D", is_correct: false, explanation_md: "" },
        { choice_index: 5, body_md: "E", is_correct: false, explanation_md: "" },
      ],
      box_items: [],
    },
  },
  {
    name: "mc_short 정답 2개 (오류)",
    expectedFail: true,
    input: {
      format: "mc_short",
      body_md: "...",
      explanation_md: "",
      choices: [
        { choice_index: 1, body_md: "A", is_correct: true, explanation_md: "" },
        { choice_index: 2, body_md: "B", is_correct: true, explanation_md: "" },
        { choice_index: 3, body_md: "C", is_correct: false, explanation_md: "" },
        { choice_index: 4, body_md: "D", is_correct: false, explanation_md: "" },
        { choice_index: 5, body_md: "E", is_correct: false, explanation_md: "" },
      ],
      box_items: [],
    },
  },
  {
    name: "mc_short 선지 중복 (오류)",
    expectedFail: true,
    input: {
      format: "mc_short",
      body_md: "...",
      explanation_md: "",
      choices: [
        { choice_index: 1, body_md: "동일", is_correct: false, explanation_md: "" },
        { choice_index: 2, body_md: "동일", is_correct: false, explanation_md: "" },
        { choice_index: 3, body_md: "C", is_correct: true, explanation_md: "" },
        { choice_index: 4, body_md: "D", is_correct: false, explanation_md: "" },
        { choice_index: 5, body_md: "E", is_correct: false, explanation_md: "" },
      ],
      box_items: [],
    },
  },
  {
    name: "mc_box 정상 (보기 4, 정답 = 참 보기 set)",
    expectedFail: false,
    input: {
      format: "mc_box",
      body_md: "다음 중 옳은 것을 모두 고르면?",
      explanation_md: "",
      choices: [
        { choice_index: 1, body_md: "① ㄱ, ㄴ", is_correct: false, explanation_md: "" },
        { choice_index: 2, body_md: "② ㄱ, ㄷ", is_correct: true, explanation_md: "" },
        { choice_index: 3, body_md: "③ ㄴ, ㄷ", is_correct: false, explanation_md: "" },
        { choice_index: 4, body_md: "④ ㄴ, ㄹ", is_correct: false, explanation_md: "" },
        { choice_index: 5, body_md: "⑤ ㄷ, ㄹ", is_correct: false, explanation_md: "" },
      ],
      box_items: [
        { position_index: 1, marker: "ㄱ", body_md: "옳음", ox_truth: "true", explanation_md: "" },
        { position_index: 2, marker: "ㄴ", body_md: "틀림", ox_truth: "false", explanation_md: "" },
        { position_index: 3, marker: "ㄷ", body_md: "옳음", ox_truth: "true", explanation_md: "" },
        { position_index: 4, marker: "ㄹ", body_md: "틀림", ox_truth: "false", explanation_md: "" },
      ],
    },
  },
  {
    name: "mc_box 정답 마커 불일치 (참=ㄱ,ㄷ 인데 정답 ① ㄱ,ㄴ — ★ 핵심)",
    expectedFail: true,
    input: {
      format: "mc_box",
      body_md: "다음 중 옳은 것을 모두 고르면?",
      explanation_md: "",
      choices: [
        { choice_index: 1, body_md: "① ㄱ, ㄴ", is_correct: true, explanation_md: "" },
        { choice_index: 2, body_md: "② ㄱ, ㄷ", is_correct: false, explanation_md: "" },
        { choice_index: 3, body_md: "③ ㄴ, ㄷ", is_correct: false, explanation_md: "" },
        { choice_index: 4, body_md: "④ ㄴ, ㄹ", is_correct: false, explanation_md: "" },
        { choice_index: 5, body_md: "⑤ ㄷ, ㄹ", is_correct: false, explanation_md: "" },
      ],
      box_items: [
        { position_index: 1, marker: "ㄱ", body_md: "옳음", ox_truth: "true", explanation_md: "" },
        { position_index: 2, marker: "ㄴ", body_md: "틀림", ox_truth: "false", explanation_md: "" },
        { position_index: 3, marker: "ㄷ", body_md: "옳음", ox_truth: "true", explanation_md: "" },
        { position_index: 4, marker: "ㄹ", body_md: "틀림", ox_truth: "false", explanation_md: "" },
      ],
    },
  },
];

function runStructureCases(): { passed: number; failed: number } {
  process.stdout.write(`\n=== ① 구조 검증 단위 케이스 ===\n`);
  let passed = 0;
  let failed = 0;
  for (const c of STRUCTURE_CASES) {
    const warning = validateProblemStructure(c.input);
    const actualFail = warning !== null;
    const ok = actualFail === c.expectedFail;
    const mark = ok ? "✓" : "✗";
    const expected = c.expectedFail ? "FAIL" : "PASS";
    const actual = actualFail ? `FAIL("${warning}")` : "PASS";
    process.stdout.write(`  ${mark} ${c.name}\n    expected=${expected}, actual=${actual}\n`);
    if (ok) passed += 1;
    else failed += 1;
  }
  process.stdout.write(`  → ${passed}/${STRUCTURE_CASES.length} 통과\n`);
  return { passed, failed };
}

async function runGateSimulation(): Promise<{ passed: number; failed: number }> {
  process.stdout.write(`\n=== ② 게이트 시뮬 (DB 직접) ===\n`);
  let passed = 0;
  let failed = 0;

  // 0) patent 의 lawId + 첫 article + 첫 mcq_pack 가져옴.
  const { data: law } = await adminClient
    .from("laws")
    .select("law_id")
    .eq("law_code", "patent")
    .maybeSingle();
  if (!law) {
    process.stdout.write(`  ✗ patent law 없음 — 검증 불가\n`);
    return { passed: 0, failed: 1 };
  }
  const { data: art } = await adminClient
    .from("articles")
    .select("article_id")
    .eq("law_id", law.law_id)
    .eq("level", "article")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  const { data: pack } = await adminClient
    .from("mcq_packs")
    .select("pack_id, kind")
    .limit(1)
    .maybeSingle();
  if (!pack) {
    process.stdout.write(`  ✗ mcq_pack 없음 — 검증 불가\n`);
    return { passed: 0, failed: 1 };
  }

  // 1) 임시 draft 문제 INSERT.
  const tag = `verify-${Date.now()}`;
  const { data: prob, error: insErr } = await adminClient
    .from("problems")
    .insert({
      law_id: law.law_id,
      exam_round: "first",
      subject_type: "law",
      origin: "ai_draft",
      format: "mc_short",
      body_md: `[${tag}] 임시 검증용 draft 문제 본문`,
      primary_article_id: art?.article_id ?? null,
      review_status: "draft",
      generated_by: "verify-script",
      generated_at: new Date().toISOString(),
    })
    .select("problem_id")
    .single();
  if (insErr || !prob) {
    process.stdout.write(`  ✗ 임시 문제 insert 실패: ${insErr?.message}\n`);
    return { passed: 0, failed: 1 };
  }
  const tempProblemId = prob.problem_id;
  process.stdout.write(`  · 임시 draft 문제 생성: ${tempProblemId.slice(0, 8)}…\n`);

  let cleanup: Array<() => Promise<void>> = [];
  cleanup.push(async () => {
    await adminClient.from("mcq_pack_problems").delete().eq("problem_id", tempProblemId);
    await adminClient.from("problems").delete().eq("problem_id", tempProblemId);
  });

  try {
    // 2) listProblemsBySubject 호출 (game 적용) → 결과 없어야.
    const list = await listProblemsBySubject(adminClient, "patent", {
      search: tag,
    });
    if (list.length === 0) {
      process.stdout.write(`  ✓ listProblemsBySubject(default) — draft 제외 (n=0)\n`);
      passed += 1;
    } else {
      process.stdout.write(`  ✗ listProblemsBySubject — draft 누설 (n=${list.length})\n`);
      failed += 1;
    }

    // 2.b) includeUnapproved=true → 결과 1
    const listAll = await listProblemsBySubject(
      adminClient,
      "patent",
      { search: tag },
      { includeUnapproved: true },
    );
    if (listAll.length >= 1) {
      process.stdout.write(`  ✓ listProblemsBySubject(includeUnapproved) — staff 우회 가능 (n=${listAll.length})\n`);
      passed += 1;
    } else {
      process.stdout.write(`  ✗ includeUnapproved 우회 실패\n`);
      failed += 1;
    }

    // 3) search-content kind=problem 의 핵심 쿼리 직접 시뮬.
    const { data: pickerHits } = await adminClient
      .from("problems")
      .select("problem_id")
      .ilike("body_md", `%${tag}%`)
      .eq("review_status", "approved")
      .is("deleted_at", null);
    if ((pickerHits ?? []).length === 0) {
      process.stdout.write(`  ✓ search-content picker — draft 제외 (n=0)\n`);
      passed += 1;
    } else {
      process.stdout.write(`  ✗ picker 누설 (n=${(pickerHits ?? []).length})\n`);
      failed += 1;
    }

    // 4) addPackProblems → skippedUnapproved=1.
    const r1 = await addPackProblems(adminClient, pack.pack_id, [tempProblemId]);
    if (r1.ok && r1.added === 0 && r1.skippedUnapproved === 1) {
      process.stdout.write(`  ✓ addPackProblems(bulk) — added=0, skippedUnapproved=1\n`);
      passed += 1;
    } else {
      process.stdout.write(`  ✗ addPackProblems 결과 비정상: ${JSON.stringify(r1)}\n`);
      failed += 1;
    }

    // 4.b) 단건 addPackProblem → unapproved error.
    const r2 = await addPackProblem(adminClient, pack.pack_id, tempProblemId);
    if (!r2.ok && r2.unapproved === true) {
      process.stdout.write(`  ✓ addPackProblem(single) — unapproved error\n`);
      passed += 1;
    } else {
      process.stdout.write(`  ✗ addPackProblem 결과 비정상: ${JSON.stringify(r2)}\n`);
      failed += 1;
    }

    // 5) approve update.
    await adminClient
      .from("problems")
      .update({
        review_status: "approved",
        approved_at: new Date().toISOString(),
      })
      .eq("problem_id", tempProblemId);
    process.stdout.write(`  · approved 로 업데이트\n`);

    // 6) listProblemsBySubject → 결과 1.
    const listAfter = await listProblemsBySubject(adminClient, "patent", {
      search: tag,
    });
    if (listAfter.length >= 1) {
      process.stdout.write(`  ✓ approve 후 listProblemsBySubject — 노출 (n=${listAfter.length})\n`);
      passed += 1;
    } else {
      process.stdout.write(`  ✗ approve 후 노출 안 됨\n`);
      failed += 1;
    }

    // 7) addPackProblem 단건 — 성공.
    const r3 = await addPackProblem(adminClient, pack.pack_id, tempProblemId);
    if (r3.ok) {
      process.stdout.write(`  ✓ approve 후 addPackProblem — 성공\n`);
      passed += 1;
    } else {
      process.stdout.write(`  ✗ approve 후 추가 실패: ${"error" in r3 ? r3.error : "?"}\n`);
      failed += 1;
    }
  } finally {
    for (const fn of cleanup) await fn();
    process.stdout.write(`  · cleanup 완료\n`);
  }

  process.stdout.write(`  → ${passed} 통과 / ${failed} 실패\n`);
  return { passed, failed };
}

async function main(): Promise<void> {
  const s = runStructureCases();
  const g = await runGateSimulation();
  const totalPassed = s.passed + g.passed;
  const totalFailed = s.failed + g.failed;
  process.stdout.write(`\n=== 종합 ===\n`);
  process.stdout.write(`  구조 검증: ${s.passed}/${STRUCTURE_CASES.length}\n`);
  process.stdout.write(`  게이트:    ${g.passed} 통과 / ${g.failed} 실패\n`);
  process.stdout.write(`  전체:      ${totalPassed} 통과 / ${totalFailed} 실패\n`);
  if (totalFailed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  process.stderr.write(`FATAL: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});
