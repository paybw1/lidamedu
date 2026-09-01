// feat-14-N1-c — 감사 스크립트 결과를 `content_audit_findings` 에 적재한다.
//
// 감사 스크립트가 19개나 있는데 전부 터미널 전용이라, 도식 감사가 잡아낸
// "법리 축 0개" 같은 판정이 검수 화면 어디에도 안 떴다. 결과를 DB 로 보내
// 검수 큐가 **사람이 볼 것을 위로 올리게** 한다.
//
// ★source 단위 통째 교체 — 감사를 다시 돌리면 그 스크립트의 결과가 전량 갱신되고,
//   이번에 안 나온 항목은 사라진다(고쳐졌는데 경고가 남아 있으면 안 된다).
// ★콘텐츠 원본은 절대 건드리지 않는다. 이 테이블은 판정 결과만 담는 부착물이다.
//
//   import { publishAuditFindings } from "../lib/audit-findings.mjs";
//   await publishAuditFindings(sb, {
//     source: "audit-diagrams",
//     findings: [{ entityType: "case_diagram", entityId, ruleKey, severity, message }],
//   });

const SEVERITIES = new Set(["fail", "warn", "info"]);
const ENTITY_TYPES = new Set([
  "case_diagram",
  "problem",
  "case_training_item",
  "case_training_issue",
]);

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} sb service_role 클라이언트
 * @param {{ source: string, findings: Array<{entityType:string,entityId:string,ruleKey:string,severity:string,message:string}> }} args
 * @returns {Promise<{ inserted: number, cleared: number }>}
 */
export async function publishAuditFindings(sb, { source, findings }) {
  if (!source) throw new Error("publishAuditFindings: source 가 필요합니다");

  const rows = [];
  for (const f of findings ?? []) {
    if (!ENTITY_TYPES.has(f.entityType)) {
      throw new Error(`알 수 없는 entityType: ${f.entityType}`);
    }
    if (!SEVERITIES.has(f.severity)) {
      throw new Error(`알 수 없는 severity: ${f.severity}`);
    }
    if (!f.entityId || !f.ruleKey || !f.message) continue;
    rows.push({
      entity_type: f.entityType,
      entity_id: f.entityId,
      source,
      rule_key: f.ruleKey,
      severity: f.severity,
      message: String(f.message).slice(0, 500),
    });
  }

  // 같은 (entity, rule) 이 두 번 들어오면 upsert 가 충돌한다 — 마지막 것만 남긴다.
  const byKey = new Map();
  for (const r of rows) {
    byKey.set(`${r.entity_type}|${r.entity_id}|${r.rule_key}`, r);
  }
  const unique = [...byKey.values()];

  // ① 이 source 의 기존 결과를 지우고 ② 새 결과를 넣는다.
  //   순서를 뒤집으면(넣고 지우기) 방금 넣은 것을 지운다.
  const { error: delErr } = await sb
    .from("content_audit_findings")
    .delete()
    .eq("source", source);
  if (delErr) throw new Error(`기존 결과 삭제 실패: ${delErr.message}`);

  const CHUNK = 500;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const { error } = await sb
      .from("content_audit_findings")
      .insert(unique.slice(i, i + CHUNK));
    if (error) throw new Error(`적재 실패: ${error.message}`);
  }
  return { inserted: unique.length, cleared: 0 };
}
