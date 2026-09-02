// feat-11-009 — 메인화면 모듈형 CMS 실주행 점검 (2026-09-02).
//
// 화면 클릭을 뺀 **서버 경로 전부**를 실제 코드로 돌린다:
//   공개 읽기(RLS) → 종류 커버리지 → 노출기간/기기 → 추가·수정·복사·순서·삭제.
//
// ★운영 데이터를 건드리지 않는다
//   - 순서 재배치는 **테스트 모듈끼리만** 한다. 실모듈 13건을 넘기면 중간에 실패했을 때
//     운영 메인화면 순서가 뒤섞인다.
//   - 만든 모듈은 try/finally 로 반드시 지운다.
//
//   node --import tsx scripts/landing/test-main-modules.mjs
import "dotenv/config";

import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import adminClient from "~/core/lib/supa-admin-client.server";
import {
  MAIN_MODULE_KINDS,
  isMainModuleKind,
} from "~/features/landing/lib/main-modules";
import {
  createMainPageModule,
  deleteMainPageModule,
  duplicateMainPageModule,
  listMainPageModules,
  listPlansForModules,
  reorderMainPageModules,
  updateMainPageModule,
} from "~/features/landing/queries.server";

let pass = 0;
let fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) {
    pass += 1;
    console.log(`  OK   ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
};

const TAG = "[자동점검] 지우세요";
const made = [];
const listAll = () => listMainPageModules(adminClient, { includeHidden: true });

async function mk(kind, label, patch) {
  const before = new Set((await listAll()).map((m) => m.moduleId));
  const r = await createMainPageModule(adminClient, { kind, label });
  if (!r.ok) throw new Error(`모듈 생성 실패: ${r.error}`);
  const row = (await listAll()).find((m) => !before.has(m.moduleId));
  if (!row) throw new Error("생성한 모듈을 되찾지 못했습니다");
  made.push(row.moduleId);
  if (patch) {
    const u = await updateMainPageModule(adminClient, row.moduleId, patch);
    if (!u.ok) throw new Error(`모듈 수정 실패: ${u.error}`);
  }
  return row.moduleId;
}

try {
  // ── ① 공개 읽기 — 비로그인 방문자가 모듈을 읽을 수 있는가 ────────────────
  //   ★여기가 조용히 깨지는 자리다. 화면은 listMainPageModules 가 비면 예전 고정
  //     순서(FALLBACK_ORDER)로 렌더한다 — RLS 가 막아도 에러 없이 "예전 화면"이
  //     나오고, 운영자가 순서를 바꿔도 반영이 안 된다. adminClient 는 RLS 를
  //     우회하므로 이 점검에 쓸 수 없다.
  console.log("\n■ 공개 읽기(RLS) — 비로그인 방문자");
  const anon = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const seenByAnon = await listMainPageModules(anon).catch((e) => {
    console.log(`       (읽기 오류: ${e.message})`);
    return [];
  });
  const seenByAdmin = await listMainPageModules(adminClient);
  check(
    "비로그인도 모듈 목록을 읽는다",
    seenByAnon.length > 0,
    `${seenByAnon.length}건`,
  );
  check(
    "비로그인과 관리자가 같은 목록",
    seenByAnon.length === seenByAdmin.length,
    `anon ${seenByAnon.length} / admin ${seenByAdmin.length}`,
  );

  // ── ② 종류 커버리지 — 렌더러 없는 kind 가 DB 에 있으면 빈 칸이 된다 ──────
  console.log("\n■ 종류 커버리지");
  const bad = seenByAdmin.filter((m) => !isMainModuleKind(m.kind));
  check(
    "DB 의 모든 kind 가 SSOT 에 있다",
    bad.length === 0,
    bad.map((b) => b.kind).join(", ") || `${MAIN_MODULE_KINDS.length}종 정의`,
  );
  const src = readFileSync("app/features/landing/screens/landing.tsx", "utf8");
  const missing = MAIN_MODULE_KINDS.map((k) => k.kind).filter(
    (k) => !src.includes(`case "${k}":`),
  );
  check(
    "SSOT 의 모든 kind 에 렌더러가 있다",
    missing.length === 0,
    missing.join(", ") || `${MAIN_MODULE_KINDS.length}종 전부`,
  );

  // ── ③ 노출기간·숨김·기기 ────────────────────────────────────────────────
  console.log("\n■ 노출기간 · 숨김 · 기기");
  const DAY = 86_400_000;
  const iso = (ms) => new Date(Date.now() + ms).toISOString();
  const future = await mk("bar_banner", `${TAG} 미래시작`, {
    startsAt: iso(7 * DAY),
  });
  const past = await mk("bar_banner", `${TAG} 과거종료`, {
    endsAt: iso(-7 * DAY),
  });
  // ★두 .or() 를 동시에 태우는 경우 — 창이 지금을 감싸면 보여야 한다.
  const nowWin = await mk("bar_banner", `${TAG} 진행중`, {
    startsAt: iso(-DAY),
    endsAt: iso(DAY),
  });
  const hidden = await mk("bar_banner", `${TAG} 숨김`, { isVisible: false });
  const pcOnly = await mk("bar_banner", `${TAG} PC만`, { device: "pc" });

  const pub = await listMainPageModules(adminClient);
  const all = await listAll();
  const inPub = (id) => pub.some((m) => m.moduleId === id);
  const inAll = (id) => all.some((m) => m.moduleId === id);
  check("시작 전 모듈은 화면에서 빠진다", !inPub(future));
  check("종료된 모듈은 화면에서 빠진다", !inPub(past));
  check("노출기간 안이면 보인다 (starts+ends 동시)", inPub(nowWin));
  check("숨김 모듈은 화면에서 빠진다", !inPub(hidden));
  check(
    "관리 목록(includeHidden)에는 전부 남는다",
    [future, past, nowWin, hidden].every(inAll),
  );
  check(
    "기기 제한은 걸러내지 않는다 (CSS 로 분기)",
    inPub(pcOnly) && pub.find((m) => m.moduleId === pcOnly)?.device === "pc",
  );

  // ── ④ 수정 · 복사 · 순서 ────────────────────────────────────────────────
  console.log("\n■ 수정 · 복사 · 순서");
  const cfg = { text: "점검용 문구", href: "/lecture/home" };
  await updateMainPageModule(adminClient, pcOnly, {
    config: cfg,
    label: `${TAG} 수정됨`,
  });
  const edited = (await listAll()).find((m) => m.moduleId === pcOnly);
  check(
    "수정 — config·label 저장",
    edited?.config?.text === cfg.text && edited?.label?.includes("수정됨"),
  );

  const beforeDup = new Set((await listAll()).map((m) => m.moduleId));
  await duplicateMainPageModule(adminClient, pcOnly);
  const dup = (await listAll()).find((m) => !beforeDup.has(m.moduleId));
  if (dup) made.push(dup.moduleId);
  check(
    "복사 — 설정 유지 + 숨김으로 생성",
    Boolean(dup) && dup.config?.text === cfg.text && dup.isVisible === false,
    dup ? `label="${dup.label}" 노출=${dup.isVisible}` : "복사본 없음",
  );

  // ★순서 점검은 테스트 모듈끼리만. 운영 13건을 함께 넘기지 않는다.
  const mine = [nowWin, pcOnly, future];
  await reorderMainPageModules(adminClient, mine);
  const ordered = await listAll();
  const seqOf = (id) => ordered.find((m) => m.moduleId === id)?.sortOrder;
  check(
    "순서 — 넘긴 차례대로 sort_order 부여",
    seqOf(nowWin) === 0 && seqOf(pcOnly) === 1 && seqOf(future) === 2,
    `${seqOf(nowWin)}, ${seqOf(pcOnly)}, ${seqOf(future)}`,
  );

  // ── ⑤ 강의진열이 참조하는 상품 ──────────────────────────────────────────
  console.log("\n■ 강의진열 상품 조회");
  // ★판매중지(is_active=false) 상품은 걸러진다 — 메인화면에 내려간 상품이 남으면 안 된다.
  //   그래서 활성 1건 + 비활성 1건을 함께 넘겨 활성만 돌아오는지 본다.
  const pick = async (active) =>
    (
      await adminClient
        .from("subscription_plans")
        .select("plan_id, name")
        .eq("is_active", active)
        .limit(1)
        .maybeSingle()
    ).data;
  const live = await pick(true);
  const dead = await pick(false);
  const planIds = [live, dead].filter(Boolean).map((p) => p.plan_id);
  const plans = await listPlansForModules(adminClient, planIds);
  check(
    "판매중 상품만 조회 — 판매중지 제외",
    plans.length === 1 && plans[0].planId === live.plan_id,
    `요청 ${planIds.length}건 → ${plans.length}건 (제외: ${dead?.name ?? "없음"})`,
  );
  check(
    "빈 목록은 쿼리 없이 []",
    (await listPlansForModules(adminClient, [])).length === 0,
  );

  // ── ⑥ 삭제 ──────────────────────────────────────────────────────────────
  console.log("\n■ 삭제");
  await deleteMainPageModule(adminClient, hidden);
  check(
    "삭제한 모듈은 목록에서 빠진다",
    !(await listAll()).some((m) => m.moduleId === hidden),
  );
} finally {
  // ── 정리 — 실패해도 반드시 지운다(테스트 모듈이 실화면에 남으면 안 된다) ──
  console.log("\n■ 정리");
  if (made.length) {
    const { error } = await adminClient
      .from("main_page_modules")
      .delete()
      .in("module_id", made);
    console.log(
      error
        ? `  ★정리 실패 — 손으로 지우세요: ${made.join(", ")} (${error.message})`
        : `  테스트 모듈 ${made.length}건 삭제`,
    );
  }
  const left = await listAll();
  const strays = left.filter((m) => m.label?.includes(TAG));
  console.log(
    strays.length
      ? `  ★잔여 ${strays.length}건: ${strays.map((s) => s.moduleId).join(", ")}`
      : `  운영 모듈 ${left.length}건 — 잔여 없음`,
  );
}

console.log(`\n결과: 통과 ${pass} · 실패 ${fail}`);
process.exit(fail > 0 ? 1 : 0);
