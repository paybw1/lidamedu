// 완료 처리됐지만 처리 답변이 비어 있는 오류신고의 기록 보완.
//
// ★알림을 만들지 않는다 — 6~7월에 이미 닫힌 신고라 지금 통지가 가면 신고자에게는
//   맥락 없는 알림이 된다. resolution_note 는 staff 화면(admin-bug-reports)에서만
//   보이므로 이 백필은 순수한 내부 기록이다.
//
// ★없는 처리 내역을 지어내지 않는다. 커밋 메시지에 신고 ID 를 남기는 관행이
//   2026-08-31 이후에 생겨서, 이 51건은 **무엇을 했는지 남은 기록이 하나도 없다**
//   (git log --grep 으로 51건 전수 조회 → 0건). 그래서 아는 사실만 적는다.
//     · 접수일 / 완료로 기록된 날
//     · 처리 내용이 남지 않았다는 사실과 보완 시점
//     · 신고 문구에서 읽히는 성격(추정임을 밝힘)
//
//   node scripts/bug-reports/backfill-notes.mjs          # dry-run
//   node scripts/bug-reports/backfill-notes.mjs --apply
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes("--apply");
const TODAY = "2026-09-02";

/** 신고 문구에서 읽히는 성격 — 확정이 아니라 분류 힌트로만 쓴다. */
function classify(msg) {
  const m = msg.replace(/\s+/g, " ").trim();
  if (/^[a-z]{1,8}\d*$/i.test(m)) return "테스트 입력";
  if (/좋겠습니다|좋을 것 같습니다|부탁드립니다|추가 부탁|있으면 좋|해 주면|필요\?/.test(m))
    return "개선 요청";
  if (/오타|사건유형|소제목|정답 오류|한자|이상하게|어색/.test(m)) return "콘텐츠 오류";
  return "동작 오류";
}

function buildNote(r) {
  const kind = classify(r.message);
  // resolved_at 이 없는 건이 51건 중 21건 — 완료 처리 시점조차 남지 않았다는 뜻이라
  // 없는 날짜를 지어내지 않고 그대로 밝힌다.
  const closed = r.resolved_at
    ? `완료로 기록된 날 ${r.resolved_at.slice(0, 10)}`
    : "완료 처리 시점 기록 없음";
  const lines = [
    `[기록 보완 ${TODAY}]`,
    `접수 ${r.created_at.slice(0, 10)} · ${closed} · 성격(추정) ${kind}`,
    "",
    "당시 처리 내용이 남아 있지 않아 사후에 기록만 채웁니다. 이 신고를 무엇으로 어떻게",
    "처리했는지는 확인되지 않으므로, 고쳤다고 단정하지 않습니다.",
  ];
  if (kind === "테스트 입력") {
    lines.push("", "신고 문구로 보아 기능 점검용 테스트 접수로 판단됩니다.");
  } else {
    lines.push("", "같은 증상이 지금도 보이면 다시 신고해 주시면 새로 확인하겠습니다.");
  }
  return lines.join("\n");
}

const { data, error } = await supa
  .from("bug_reports")
  .select("report_id, created_at, resolved_at, message, resolution_note, status")
  .eq("status", "done")
  .order("created_at");
if (error) throw new Error(error.message);

const targets = data.filter((r) => !r.resolution_note || !r.resolution_note.trim());
console.log(`대상 ${targets.length}건 (완료 상태 + 답변 없음)\n`);

const counts = {};
for (const r of targets) {
  const k = classify(r.message);
  counts[k] = (counts[k] ?? 0) + 1;
}
console.log("성격(추정) 분포:", counts, "\n");
for (const r of targets.slice(0, 3)) {
  console.log(`── ${r.report_id.slice(0, 8)} ${r.message.replace(/\s+/g, " ").slice(0, 50)}`);
  console.log(
    buildNote(r)
      .split("\n")
      .map((l) => "   " + l)
      .join("\n"),
  );
}

if (!APPLY) {
  console.log(`\ndry-run — ${targets.length}건. 적용하려면 --apply (알림은 만들지 않음)`);
  process.exit(0);
}

let n = 0;
for (const r of targets) {
  // ★status·resolved_at 은 건드리지 않는다 — 이미 완료된 기록의 시점을 바꾸면 안 된다.
  const { error: e } = await supa
    .from("bug_reports")
    .update({ resolution_note: buildNote(r) })
    .eq("report_id", r.report_id);
  if (e) throw new Error(`갱신 실패 ${r.report_id}: ${e.message}`);
  n++;
}
console.log(`\n적용 완료 — ${n}건 기록 보완 (알림 생성 0건)`);
