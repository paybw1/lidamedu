// 오류신고 종결 — 상태 전환 + **신고자 알림**까지.
//
// ★SQL 로 status 만 바꾸면 신고자에게 알림이 가지 않는다. 신고자는 자기가 올린 것이
//   처리됐는지 영영 모른다. 그래서 화면(admin-bug-reports)이 쓰는 것과 **같은 함수**를
//   호출한다 — 경로가 둘이 되면 한쪽만 고쳐진다.
// ★완료 "전환"일 때만 알림을 보낸다(이미 done 이면 재알림 없음) — 화면과 같은 규칙.
//
//   npx tsx scripts/bug-reports/resolve-report.ts <report_id> "처리 쪽지"
//   npx tsx scripts/bug-reports/resolve-report.ts <report_id> "처리 쪽지" --apply
import "dotenv/config";

import { getBugReport, updateBugReportStatus } from "../../app/features/bug-reports/queries.server";
import { notifyReporterBugResolved } from "../../app/features/bug-reports/notify.server";

const [reportId, note] = process.argv.slice(2).filter((a) => a !== "--apply");
const APPLY = process.argv.includes("--apply");
if (!reportId || !note) {
  console.error('사용: npx tsx scripts/bug-reports/resolve-report.ts <report_id> "쪽지" [--apply]');
  process.exit(1);
}

const prev = await getBugReport(reportId);
if (!prev) throw new Error(`신고 없음: ${reportId}`);
console.log(`상태 ${prev.status} · 신고자 ${prev.reporterId ?? "(없음)"}`);
console.log(`URL  ${prev.url}`);
console.log(`내용 ${prev.message.slice(0, 160)}`);
console.log(`\n보낼 쪽지:\n${note}`);

if (prev.status === "done") {
  console.log("\n이미 완료 상태 — 재알림 없이 종료.");
  process.exit(0);
}
if (!APPLY) {
  console.log("\ndry-run — 적용하려면 --apply");
  process.exit(0);
}

await updateBugReportStatus(reportId, "done", { note });
if (prev.reporterId) {
  await notifyReporterBugResolved({
    reportId,
    reporterId: prev.reporterId,
    url: prev.url,
    message: prev.message,
    note,
  });
  console.log("\n완료 처리 + 신고자 알림 발송");
} else {
  console.log("\n완료 처리 (신고자 없음 — 알림 생략)");
}
