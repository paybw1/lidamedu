// 미처리 오류신고 완료 처리 — 상태 + 처리 답변 + 신고자 알림.
//
// ★상태만 바꾸면 신고자는 처리 사실을 모른다. 앱의 notifyReporterBugResolved 와
//   같은 모양으로 user_notifications(kind=bug_report_resolved) 를 함께 만든다.
// ★resolution_note 는 신고자 인박스에 그대로 표시된다 — 내부 메모가 아니라
//   수험생·운영자가 읽는 문장으로, 500자 이내.
// ★배포가 READY 인지 확인한 뒤에 돌린다 — 옛 코드가 도는 중에 "고쳤습니다" 가
//   나가는 것이 가장 나쁘다.
//
//   node scripts/bug-reports/resolve-open.mjs          # dry-run
//   node scripts/bug-reports/resolve-open.mjs --apply
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes("--apply");
const MAX_NOTE = 500;
const MAX_BODY = 200;

/** report_id → 신고자에게 보낼 처리 답변. 처리할 때마다 이 표만 갈아 끼운다. */
const NOTES = {
  // 학습 기록에 시작 시간을 넣을 창이 없다 (테스트학생07, 2026-09-03)
  "52b84f30-2f6f-4b0d-a3c0-448ee3646720": `고쳤습니다. 오늘 반영했습니다.

말씀하신 대로 계획 항목을 기록하는 자리에는 시작 시각 칸이 없었습니다. 각 항목 오른쪽에
시계 버튼을 넣었고, 눌러서 시각을 적으면 「완료」로 기록하든 「부분」으로 기록하든 함께
저장되어 시간표 그래프에 칸이 채워집니다. 비워 두셔도 됩니다.

그리고 더 큰 문제가 하나 숨어 있었습니다. 「계획에 없던 학습」에는 시각 칸이 원래
있었는데, 검증 규칙에 오타가 있어 시각을 적으면 기록 자체가 저장되지 않고 있었습니다.
지금까지 시각이 저장된 기록이 한 건도 없던 이유입니다. 이 부분도 함께 고쳤습니다.

타이머로 기록하시면 시각은 자동으로 들어갑니다. 알려주셔서 감사합니다.`,

  // '이번 달 계획' 편집기에 시작일·종료일 표시 (리담관리자, 2026-09-03)
  "8b192567-fd61-4670-90c8-eb1c2e743876": `반영했습니다. 오늘 올렸습니다.

계획 편집기의 항목 목록이 제목만 보여 주고 있어서, 각 항목의 기간을 보려면 「수정」을
하나씩 열어 봐야 했습니다. 이제 제목 아래에 활동 · 요일범위 · 하루 분량 · 기간이
「민법 기본서 1회독 / 개념 · 매일 하루 210분 · 09-01~09-30」 형태로 함께 나옵니다.
아래 검토 패널과 같은 형식입니다.

시작일·종료일을 넣는 입력칸 자체는 「수정」 폼 안에 이미 있었고, 이번 달 범위를 벗어난
날짜는 고를 수 없게 되어 있습니다.

혹시 원하셨던 것이 목록 표시가 아니라 다른 부분이었다면 다시 알려주세요. 감사합니다.`,
};

const ids = Object.keys(NOTES);
const { data: reports, error } = await supa
  .from("bug_reports")
  .select("report_id, reporter_id, url, message, status")
  .in("report_id", ids);
if (error) throw new Error(error.message);

const missing = ids.filter((id) => !reports.some((r) => r.report_id === id));
if (missing.length) throw new Error(`신고를 찾을 수 없음: ${missing.join(", ")}`);

/** 앱의 notifyReporterBugResolved 와 같은 본문·링크 규칙. */
function buildNotification(r, note) {
  const excerpt = r.message.length > MAX_BODY ? r.message.slice(0, MAX_BODY) + "…" : r.message;
  let href = "/me/inbox";
  try {
    const u = new URL(r.url);
    href = u.pathname + u.search;
  } catch {
    if (r.url.startsWith("/")) href = r.url;
  }
  return {
    recipient_id: r.reporter_id,
    kind: "bug_report_resolved",
    entity_type: "bug_report",
    entity_id: r.report_id,
    title: "신고하신 오류가 처리되었습니다",
    body: `${note}\n\n(신고 내용: ${excerpt})`,
    href,
    payload: { url: r.url, note },
  };
}

const now = new Date().toISOString();
const rows = [];
for (const r of reports) {
  const note = NOTES[r.report_id].trim();
  if (note.length > MAX_NOTE) {
    throw new Error(`답변이 ${MAX_NOTE}자를 넘음 (${note.length}자): ${r.report_id}`);
  }
  console.log(
    `[${r.status} → done] ${r.report_id}  답변 ${note.length}자 · ${r.message.slice(0, 40)}…`,
  );
  rows.push({ r, note, notif: buildNotification(r, note) });
}

if (!APPLY) {
  console.log(`\ndry-run — ${rows.length}건. 적용하려면 --apply`);
  process.exit(0);
}

for (const { r, note } of rows) {
  const { error: e } = await supa
    .from("bug_reports")
    .update({ status: "done", resolution_note: note, resolved_at: now })
    .eq("report_id", r.report_id);
  if (e) throw new Error(`bug_reports 갱신 실패 ${r.report_id}: ${e.message}`);
}
const { error: ne } = await supa.from("user_notifications").insert(rows.map((x) => x.notif));
if (ne) throw new Error(`알림 생성 실패: ${ne.message}`);

console.log(`\n적용 완료 — 신고 ${rows.length}건 done, 알림 ${rows.length}건 생성`);
