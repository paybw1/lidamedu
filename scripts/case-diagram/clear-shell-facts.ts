// 껍데기 판결문에서 만들어진 **사실관계 지우기**.
//
// 본문이 이미지인 스캔 PDF 는 추출하면 "판결서 인터넷열람 …" 안내문만 남는다(실질 0자).
// 그걸 소스로 돌린 생성은 사실관계 대신 **사과문**을 써 넣었다 —
//   "판결문 본문이 제공되지 않아 … 특정할 수 없습니다"
// 심지어 승인본 하나는 "원고: 특허권자 / 피고: 원고가 침해자로 지목한 실시자" 처럼
// 판결문에 없는 당사자를 지어냈다(CLAUDE.md Non-negotiable 11 위반).
//
// ★정리된 것처럼 보이면서 내용이 없는 게 가장 나쁘다. 비워서 "사실관계 없음"으로
//   되돌리면 화면의 빈 상태 안내와 staff 목록이 그대로 이것들을 드러낸다.
// ★사실관계 칸만 건드린다 — 쟁점~결론은 대법원 판결문에서 나왔으므로 멀쩡하다.
//
// 사용:
//   npx tsx scripts/case-diagram/clear-shell-facts.ts            # 예행
//   npx tsx scripts/case-diagram/clear-shell-facts.ts --apply    # 반영(백업 후)

import "dotenv/config";

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import {
  SUBSTANTIVE_MIN,
  isBoilerplateOnly,
  substantiveLength,
} from "../../app/features/cases/lib/lower-court-text";

const APPLY = process.argv.includes("--apply");
const BACKUP_DIR = path.join("tmp", "case-diagram");

const db = createClient(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
);

async function main(): Promise<void> {
  const { data: lowers, error: lErr } = await db
    .from("case_lower_courts")
    .select("case_id, lower_case_number, source_ref, body_text")
    .not("body_text", "is", null);
  if (lErr) throw lErr;

  const shells = (lowers ?? []).filter(
    (r) => r.case_id && isBoilerplateOnly(r.body_text ?? ""),
  );
  console.log(
    `안내문뿐인 하급심 ${shells.length}건 (실질 ${SUBSTANTIVE_MIN}자 미만)`,
  );
  for (const r of shells) {
    console.log(
      `    ${(r.lower_case_number ?? "-").padEnd(16)} 전체 ${String((r.body_text ?? "").length).padStart(6)}자 · 실질 ${substantiveLength(r.body_text ?? "")}자`,
    );
  }

  const caseIds = [...new Set(shells.map((r) => r.case_id as string))];
  const { data: diagrams, error: dErr } = await db
    .from("case_diagrams")
    .select(
      "diagram_id, case_id, facts_md, facts_source_kind, facts_source_ref, facts_source_meta, timeline, review_status",
    )
    .in("case_id", caseIds)
    .is("deleted_at", null);
  if (dErr) throw dErr;

  // 이미 비어 있는 것은 건드리지 않는다.
  const targets = (diagrams ?? []).filter(
    (d) => (d.facts_md ?? "").trim().length > 0,
  );
  console.log(`\n지울 대상 도식 ${targets.length}건`);
  for (const d of targets) {
    const tl = Array.isArray(d.timeline) ? d.timeline.length : 0;
    console.log(
      `    ${d.review_status.padEnd(9)} ${String(d.facts_source_ref ?? "-").padEnd(24)} ${(d.facts_md ?? "").length}자 · 경과 ${tl}`,
    );
  }
  if (targets.length === 0) return;

  if (!APPLY) {
    console.log("\n--apply 를 붙이면 백업 후 사실관계를 비웁니다.");
    return;
  }

  mkdirSync(BACKUP_DIR, { recursive: true });
  const backup = path.join(BACKUP_DIR, `shell-facts-${targets.length}.json`);
  writeFileSync(backup, JSON.stringify(targets, null, 1), "utf8");
  console.log(`\n백업 ${backup}`);

  for (const d of targets) {
    const { error } = await db
      .from("case_diagrams")
      .update({
        facts_md: "",
        // ★출처 표기(facts_source_ref)는 남긴다 — 어느 판결문을 구해야 하는지가
        //   이 칸에만 적혀 있다. kind='none' 이라 학생 화면에는 뜨지 않는다.
        facts_source_kind: "none",
        timeline: [],
      })
      .eq("diagram_id", d.diagram_id);
    if (error) throw error;
  }
  console.log(`사실관계 비움 ${targets.length}건 — 화면에는 "사실관계 없음"으로 표시됩니다.`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
