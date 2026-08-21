// 판례 목록 노출 판정 · 백필 (원장 지시 2026-08-21).
//
// 배경: 민법 판례가 1,341건이 되면서 학습과목 목록이 길고 무거워졌다
//       (특허 383 · 상표 356 · 디자인 63). 1,341건은 전부 기출에서 역으로 뽑은 것이라
//       "인용 0회" 가 없고, 절반 이상(886건)이 딱 1문항에서만 인용된다.
//       그래서 연도로는 걸러지지 않는다(2000년 이후만 해도 718건).
//
// 판정 규칙 — 축을 "반복 출제" 로 두고, 연도는 예외로 내린다.
//       노출 = 전원합의체  OR  기출 2문항 이상 인용  OR  RECENT_FROM 이후 선고
//       (최근 판례는 아직 인용이 쌓일 시간이 없었다 — 그 보정이 세 번째 조건이다)
//
// list_visible=false 는 접근 차단이 아니다. 상세 화면과 해설 팝업은 그대로 열리고,
// 목록·트리 카운트에서만 빠진다.
//
// ★재실행 필요 — 판례를 추가 적재하면 인용 1회이던 판례가 2회가 될 수 있다.
//   적재 스크립트를 돌린 뒤에는 이 스크립트도 다시 돌린다.
// ★list_visible_pinned=true 인 판례는 건드리지 않는다(원장 수동 고정).
//
//   node scripts/precedents/apply-case-list-visibility.mjs --law civil          # dry-run
//   node scripts/precedents/apply-case-list-visibility.mjs --law civil --apply
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const LAW = argv.includes("--law") ? argv[argv.indexOf("--law") + 1] : null;
const OUT = path.resolve(process.cwd(), "tmp/case-list-visibility.json");

/** 인용이 쌓일 시간이 없었던 최근 판례를 구제하는 하한. */
const RECENT_FROM = "2020-01-01";
/** 이 횟수 이상 기출에 인용되면 반복 출제로 본다. */
const MIN_CITES = 2;

if (!LAW) {
  console.error("사용: --law <civil|patent|trademark|design> [--apply]");
  process.exit(1);
}

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

async function pageAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

async function main() {
  const cases = await pageAll(() =>
    sb
      .from("cases")
      .select(
        "case_id, case_number, case_title, decided_at, is_en_banc, list_visible, list_visible_pinned",
      )
      .contains("subject_laws", [LAW])
      .is("deleted_at", null)
      .order("case_id"),
  );
  if (cases.length === 0) {
    console.log(`${LAW} 판례 0건 — 할 일 없음.`);
    return;
  }

  // 문항 인용 횟수 — 같은 문제에 여러 relation_type 으로 걸려 있어도 1회로 센다.
  const ids = cases.map((c) => c.case_id);
  const links = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await sb
      .from("problem_case_links")
      .select("case_id, problem_id")
      .in("case_id", ids.slice(i, i + 150));
    if (error) throw new Error(error.message);
    links.push(...(data ?? []));
  }
  const cited = new Map();
  for (const l of links) {
    const s = cited.get(l.case_id) ?? new Set();
    s.add(l.problem_id);
    cited.set(l.case_id, s);
  }

  const decide = (c) => {
    const n = cited.get(c.case_id)?.size ?? 0;
    if (c.is_en_banc) return { visible: true, why: "전합" };
    if (n >= MIN_CITES) return { visible: true, why: `인용 ${n}회` };
    if ((c.decided_at ?? "") >= RECENT_FROM)
      return { visible: true, why: `${c.decided_at?.slice(0, 4)}년 선고` };
    return { visible: false, why: `인용 ${n}회 · ${c.decided_at?.slice(0, 4)}년` };
  };

  const changes = [];
  let visible = 0;
  let pinned = 0;
  for (const c of cases) {
    const d = decide(c);
    if (c.list_visible_pinned) {
      pinned += 1;
      if (c.list_visible) visible += 1;
      continue;
    }
    if (d.visible) visible += 1;
    if (c.list_visible !== d.visible) {
      changes.push({
        caseId: c.case_id,
        caseNumber: c.case_number,
        caseTitle: c.case_title,
        from: c.list_visible,
        to: d.visible,
        why: d.why,
      });
    }
  }

  const on = changes.filter((c) => c.to);
  const off = changes.filter((c) => !c.to);
  console.log(
    `${LAW} 판례 ${cases.length}건 — 노출 ${visible} · 숨김 ${cases.length - visible} (수동 고정 ${pinned})`,
  );
  console.log(`변경 ${changes.length}건 — 켜짐 ${on.length} · 꺼짐 ${off.length}`);
  for (const c of off.slice(0, 5)) {
    console.log(`  숨김 ${c.caseNumber} ${(c.caseTitle ?? "").slice(0, 24)} (${c.why})`);
  }
  fs.writeFileSync(OUT, JSON.stringify({ law: LAW, visible, changes }, null, 2), "utf8");
  console.log(`리포트 ${OUT}`);

  if (!APPLY) {
    console.log("\n--apply 를 붙이면 반영합니다.");
    return;
  }
  if (changes.length === 0) return;

  // 목록 노출 조정은 개정이 아니다 — 추록 발행 대상에서 제외한다.
  const { data: win, error: winErr } = await sb.rpc("fn_open_suppress_window", {
    p_minutes: 30,
    p_reason: "판례 목록 노출 플래그 백필",
    p_scope: ["precedent"],
  });
  if (winErr) throw new Error(winErr.message);
  let done = 0;
  try {
    // 값이 두 가지뿐이라 두 번의 일괄 update 로 끝낸다.
    for (const target of [true, false]) {
      const batch = changes.filter((c) => c.to === target).map((c) => c.caseId);
      for (let i = 0; i < batch.length; i += 150) {
        const { error } = await sb
          .from("cases")
          .update({ list_visible: target })
          .in("case_id", batch.slice(i, i + 150));
        if (error) throw new Error(error.message);
        done += Math.min(150, batch.length - i);
      }
    }
  } finally {
    await sb.rpc("fn_close_suppress_window", { p_window_id: win });
  }
  console.log(`\n반영 ${done}건 완료.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
