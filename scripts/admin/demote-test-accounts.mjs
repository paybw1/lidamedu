// feat-11-011 P0 — 테스트 계정 권한 정리.
//
// E2E 는 auth.users 를 지우지 못해([[e2e-deleteuser-noop]]) 실행할 때마다 계정이 쌓이고,
// 그중 일부는 원장(admin)·관리자(manager) 권한을 그대로 달고 남는다. 운영 DB 에
// 원장 권한 계정이 열여섯 개인 지금 상태는 감사·보안 관점에서 그대로 둘 수 없다.
//
// ★삭제하지 않는다 — 강등만 한다. 학습 데이터·주문에 FK 로 묶여 있어 지우면 그쪽이 깨진다.
// ★실계정은 손대지 않는다. 대상은 이름이 명시적 테스트 패턴인 것만.
//
//   node scripts/admin/demote-test-accounts.mjs           # dry-run
//   node scripts/admin/demote-test-accounts.mjs --apply
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** 테스트 계정으로 판정하는 이름 패턴. 실계정과 겹치지 않게 좁게 잡는다. */
const TEST_NAME = /^(e2e[-_]|테스트학생\d+$|test[-_])/i;

const { data: staff, error } = await sb
  .from("profiles")
  .select("profile_id, name, member_no, role, created_at")
  .in("role", ["admin", "manager", "instructor"])
  .order("role")
  .order("member_no");
if (error) throw new Error(error.message);

const targets = (staff ?? []).filter((p) => TEST_NAME.test((p.name ?? "").trim()));
const keep = (staff ?? []).filter((p) => !TEST_NAME.test((p.name ?? "").trim()));

console.log(`스태프 권한 계정 ${staff.length}명 — 강등 대상 ${targets.length} · 유지 ${keep.length}\n`);
console.log("── 강등 대상 (→ student) ──");
for (const p of targets) {
  console.log(`  ${p.role.padEnd(10)} #${String(p.member_no).padEnd(4)} ${p.name}`);
}
console.log("\n── 유지 (실계정) ──");
for (const p of keep) {
  console.log(`  ${p.role.padEnd(10)} #${String(p.member_no).padEnd(4)} ${p.name}`);
}

if (!targets.length) {
  console.log("\n강등할 계정이 없습니다.");
  process.exit(0);
}
if (!APPLY) {
  console.log(`\ndry-run — ${targets.length}명. 적용하려면 --apply`);
  process.exit(0);
}

const backupDir = path.resolve(process.cwd(), "tmp", "admin");
fs.mkdirSync(backupDir, { recursive: true });
const backup = path.join(backupDir, `backup-roles-${new Date().toISOString().slice(0, 10)}.json`);
fs.writeFileSync(backup, JSON.stringify(targets, null, 2), "utf8");
console.log(`\n백업: ${backup}`);

let done = 0;
for (const p of targets) {
  const { error: e } = await sb
    .from("profiles")
    .update({ role: "student" })
    .eq("profile_id", p.profile_id);
  if (e) {
    console.log(`  실패 ${p.name}: ${e.message}`);
    continue;
  }
  // 배정된 duty 도 함께 회수 — 역할만 낮추면 배정 행이 남아 다시 올렸을 때 되살아난다.
  await sb.from("staff_duty_assignments").delete().eq("profile_id", p.profile_id);
  done += 1;
}
console.log(`\n강등 완료 — ${done}/${targets.length}명`);
