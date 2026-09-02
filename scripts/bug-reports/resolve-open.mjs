// 미처리 오류신고 일괄 완료 처리 — 상태 + 처리 답변 + 신고자 알림.
//
// ★상태만 바꾸면 신고자는 처리 사실을 모른다. 앱의 notifyReporterBugResolved 와
//   같은 모양으로 user_notifications(kind=bug_report_resolved) 를 함께 만든다.
// ★resolution_note 는 신고자 인박스에 그대로 표시된다 — 내부 메모가 아니라
//   수험생이 읽는 문장으로, 500자 이내.
//
//   node scripts/bug-reports/resolve-open.mjs          # dry-run
//   node scripts/bug-reports/resolve-open.mjs --apply
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes("--apply");
const MAX_NOTE = 500;
const MAX_BODY = 200;

/** report_id → 신고자에게 보낼 처리 답변. */
const NOTES = {
  // 조문 암기 타이핑이 크롬에서만 느리다 (심정현, 2026-08-26)
  "bef7ca48-de86-4cc6-8199-a65b791c0747": `암기 입력창에서 맞춤법 검사·자동완성·자동 대문자를 끄도록 바꿔 두었습니다(8월 26일 밤 반영). 크롬이 글자마다 이 검사들을 돌리면서 입력이 밀리는 경우가 있어서입니다.

다만 저희 쪽 크롬에서는 느려지는 상태를 재현하지 못했습니다. 지금도 여전히 느리시면 한 번만 더 알려주세요. ① 크롬 시크릿 창에서도 같은지 ② 어느 조문의 몇 번째 항인지 ③ 확장 프로그램을 모두 끄면 달라지는지, 이 세 가지만 적어 주시면 원인을 좁힐 수 있습니다.

브라우저에 따라 갈리는 문제라는 걸 알려주신 덕분에 알았습니다. 감사합니다.`,

  // 빈칸에서 엔터를 누르면 칸이 복제됨 (심정현, 2026-08-30)
  "09a8ae2f-f28e-4379-b878-3afb09952563": `고쳤습니다. 8월 30일과 31일에 걸쳐 반영했습니다.

빈칸 안에서 엔터를 누르면 브라우저가 그 줄을 둘로 쪼개면서 빈칸 자체를 복제하고 있었습니다. 그래서 [채권] 한 칸이 [채권][채권] 두 칸으로 보였던 것입니다. 정답을 봤다가 지운 뒤처럼 칸이 비어 있을 때 특히 잘 나타났습니다.

이제 빈칸 안에서는 엔터가 눌려도 줄이 쪼개지지 않습니다. 줄바꿈이 들어간 글을 붙여넣을 때도 같은 이유로 칸이 늘어나던 것을 함께 막았습니다. 화면 표시만의 문제여서 저장된 답안에는 영향이 없었습니다.

재현 방법까지 적어 주셔서 원인을 빨리 찾을 수 있었습니다. 감사합니다.`,

  // 오프라인 시험지 「선택 추가」 개수 제한 (리담관리자, 2026-08-31)
  "b996af5e-09df-439d-b78c-29177eba108e": `풀었습니다. 8월 31일 반영했습니다.

한 번에 담을 수 있는 문항이 100개로 묶여 있었고, 넘으면 「문항 참조 형식 오류」라는 엉뚱한 메시지가 떠서 왜 안 되는지 알 수 없는 상태였습니다. 후보 전량 보기가 생긴 뒤로는 단원 하나를 통째로 담는 일이 정상적인 사용이라 제한을 둘 이유가 없었습니다.

상한을 2,000개로 올렸고, 그래도 넘으면 몇 개를 고르셨는지 숫자를 밝혀 안내합니다. 후보 목록 아래에 「전체 선택 / 전체 해제」도 넣었으니 수백 개를 하나씩 누르지 않으셔도 됩니다.

알려주셔서 감사합니다.`,

  // 흐름학습 3번째 단계에서 과목 홈으로 튕김 (jinaddd2, 2026-09-02)
  "b0c74de6-9b5c-4d06-8532-363cff5ec451": `고쳤습니다. 오늘 반영했습니다.

흐름 학습 목록에 2차 주관식 문제가 섞여 들어가고 있었습니다. 주관식은 아직 학생에게 열려 있지 않아 그 차례가 되면 과목 첫 화면으로 되돌아가는데, 화면에는 「내 학습 현황」만 보여 흐름이 끊긴 것처럼 보였습니다. 특허법 제42조는 21단계 중 3번째가 여기에 해당했습니다.

이제 흐름 목록에는 1차 객관식만 담기고, 같은 판례가 두 번 들어가던 것도 정리했습니다(제42조는 2·3번째가 같은 판례였습니다).

★이미 열어 두신 흐름 주소는 예전 목록 그대로입니다. 제42조 화면에서 흐름 학습을 다시 시작해 주세요.

알려주셔서 감사합니다.`,
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
