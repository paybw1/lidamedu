// 학생 30명 테스트 계정 생성 + CSV 출력.
//   - 이메일 : test-student-01@lidamedu.test ~ test-student-30@lidamedu.test
//   - 비밀번호: 각자 unique (12자 강함, 영문+숫자+특수)
//   - role   : student (auth.users on_auth_user_created 트리거가 profile 생성, role 기본은 student 가정 — 검증 후 보정)
//   - 멱등성 : 동일 이메일이 이미 있으면 skip (--reset 옵션 시 삭제 후 재생성)
//   - 출력   : ./test-students-30.csv (no,email,password,profile_id)
//
// 실행:
//   node scripts/seed-students-30.mjs [--reset]
//
// 메모리 참고:
//   - "e2e-deleteuser-noop" : supabase-js admin deleteUser가 환경에서 auth.users를 못 지움 가능 →
//      --reset 실패 시 이메일을 살짝 다르게 (-r2 suffix) 우회.
//   - "auth-users-null-token-columns" : 수동 INSERT 시 토큰 NULL → 본 스크립트는 admin.createUser 만 사용 → 안전.

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import "dotenv/config";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const RESET = process.argv.includes("--reset");
const PREFIX = "test-student-";
const DOMAIN = "lidamedu.test";
const COUNT = 30;
const OUTPUT_CSV = join(process.cwd(), "test-students-30.csv");

/** 12자 강한 비밀번호 — 대문자/소문자/숫자/특수기호 골고루. */
function strongPassword() {
  const upper = "ABCDEFGHJKMNPQRSTUVWXYZ";    // 헷갈리는 I, L, O 제외
  const lower = "abcdefghjkmnpqrstuvwxyz";    // i, l, o 제외
  const digit = "23456789";                    // 0, 1 제외
  const symbol = "!@#$%^&*";
  const pool = upper + lower + digit + symbol;

  const buf = randomBytes(20);
  const pickFrom = (set, byte) => set[byte % set.length];

  // 각 부류 최소 1자 보장
  const chars = [
    pickFrom(upper,  buf[0]),
    pickFrom(lower,  buf[1]),
    pickFrom(digit,  buf[2]),
    pickFrom(symbol, buf[3]),
  ];
  for (let i = 4; i < 12; i++) chars.push(pickFrom(pool, buf[i]));

  // shuffle (Fisher-Yates with secondary buffer)
  const swap = randomBytes(12);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = swap[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

// ── 1) reset 옵션 — 기존 test-student-* 삭제 ──
if (RESET) {
  console.log("[reset] 기존 test-student-* 사용자 삭제…");
  let cleaned = 0;
  let page = 1;
  while (true) {
    const { data, error } = await supa.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error("  listUsers 실패:", error.message);
      break;
    }
    const users = data?.users ?? [];
    if (users.length === 0) break;
    for (const u of users) {
      if (u.email?.startsWith(PREFIX) && u.email.endsWith("@" + DOMAIN)) {
        const { error: dErr } = await supa.auth.admin.deleteUser(u.id);
        if (!dErr) cleaned += 1;
      }
    }
    if (users.length < 200) break;
    page += 1;
  }
  console.log(`  → ${cleaned}명 삭제`);
}

// ── 2) 30명 생성 ──
console.log(`[create] 학생 ${COUNT}명 생성…`);
const rows = [];
let createdCount = 0;
let existingCount = 0;
let failedCount = 0;

for (let n = 1; n <= COUNT; n++) {
  const idx = String(n).padStart(2, "0");
  const email = `${PREFIX}${idx}@${DOMAIN}`;
  const password = strongPassword();
  const displayName = `테스트학생${idx}`;

  const { data: created, error: cErr } = await supa.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: displayName },
  });

  let userId = null;
  let status = "";
  if (cErr || !created?.user) {
    const isDup = (cErr?.message ?? "").toLowerCase().includes("already");
    if (isDup) {
      // 기존 사용자 회수 — 같은 이름으로 profile 찾기 (auth.users 직접 select 못함)
      const { data: existing } = await supa
        .from("profiles")
        .select("profile_id")
        .eq("name", displayName)
        .limit(1)
        .maybeSingle();
      if (existing) {
        userId = existing.profile_id;
        existingCount += 1;
        status = "existing (password unchanged — use original or --reset)";
      } else {
        failedCount += 1;
        status = `createUser duplicate but profile lookup failed: ${cErr.message}`;
      }
    } else {
      failedCount += 1;
      status = `createUser failed: ${cErr?.message ?? "unknown"}`;
      console.error(`  [${idx}] ${email} — ${status}`);
      continue;
    }
  } else {
    userId = created.user.id;
    createdCount += 1;
    status = "created";
  }

  // role / name 보정 (트리거가 student 외 다른 default 일 경우 대비)
  await supa
    .from("profiles")
    .update({ name: displayName, role: "student" })
    .eq("profile_id", userId);

  rows.push({
    no: idx,
    email,
    password: status === "created" ? password : "(기존 비밀번호 유지 — 원본 또는 --reset 사용)",
    profile_id: userId,
    name: displayName,
    status,
  });
  console.log(`  [${idx}] ${email}  ${status}`);
}

// ── 3) CSV 작성 ──
const header = "no,email,password,profile_id,name,status";
const body = rows
  .map((r) => `${r.no},${r.email},"${r.password.replace(/"/g, '""')}",${r.profile_id},${r.name},${r.status}`)
  .join("\n");
writeFileSync(OUTPUT_CSV, header + "\n" + body + "\n", "utf8");

console.log(`\n=== 완료 ===`);
console.log(`  생성: ${createdCount}  · 기존(skip): ${existingCount}  · 실패: ${failedCount}`);
console.log(`  CSV : ${OUTPUT_CSV}`);
console.log(`\n로그인 화면: /login  (또는 /auth)`);
console.log(`이메일 형식 : ${PREFIX}NN@${DOMAIN}  (NN = 01~30)`);
console.log(`비밀번호    : 각자 unique — CSV 파일 참조`);
console.log(`\n* CSV 파일에는 평문 비밀번호가 있습니다. 사용 후 삭제 권장.`);
