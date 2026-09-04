// 운영자 메뉴 노출(minRole·duty) ↔ 화면 loader 가드 대조. **읽기 전용**.
//
// ★어긋나면 "메뉴는 보이는데 눌러도 403" 이 된다. 실제로 강사 계정에서
//   접속이력 관리·강사 담당·권한 두 화면이 그랬다(2026-09-04 신고).
//   서버가 권위이므로 **메뉴를 서버 가드에 맞춘다**(반대가 아니다).
//
//   node scripts/audit/audit-admin-nav-guards.mjs
import fs from "node:fs";

const SHELL = "app/features/admin/components/admin-shell.tsx";
const ROUTES = "app/routes.ts";

const shell = fs.readFileSync(SHELL, "utf8");
const routes = fs.readFileSync(ROUTES, "utf8");

// 1) 메뉴 항목 — { label, to, minRole?, duty? }
const navs = [];
const re = /\{\s*label:\s*"([^"]+)",\s*to:\s*"([^"]+)"([^}]*)\}/g;
let m;
while ((m = re.exec(shell))) {
  const rest = m[3];
  navs.push({
    label: m[1],
    to: m[2],
    minRole: rest.match(/minRole:\s*"([^"]+)"/)?.[1] ?? null,
    duty: rest.match(/duty:\s*"([^"]+)"/)?.[1] ?? null,
  });
}

// 2) 경로 → 화면 파일
// ★routes.ts 는 `prefix("/admin/problems", [ route("/ox", …) ])` 를 쓴다. prefix 를
//   무시하면 그 아래 21개 화면이 통째로 "라우트 없음"이 되어 감사에서 빠진다.
const fileOf = new Map();
{
  const stack = []; // {prefix, depth}
  let depth = 0;
  const tok =
    /prefix\(\s*"([^"]+)"\s*,\s*\[|route\(\s*"([^"]+)"\s*,\s*"([^"]+)"|index\(\s*"([^"]+)"|\[|\]/g;
  let t;
  while ((t = tok.exec(routes))) {
    if (t[0] === "[") {
      depth += 1;
    } else if (t[0] === "]") {
      depth -= 1;
      while (stack.length && stack[stack.length - 1].depth > depth) stack.pop();
    } else if (t[1] !== undefined) {
      depth += 1; // prefix 의 여는 대괄호
      stack.push({ prefix: t[1], depth });
    } else if (t[4] !== undefined) {
      // index() = prefix 의 대표 화면. route("/") 로 쓰지 않으므로 따로 받는다.
      fileOf.set(stack.map((x) => x.prefix).join("") || "/", "app/" + t[4]);
    } else {
      const base = stack.map((x) => x.prefix).join("");
      const tail = t[2] === "/" ? "" : t[2];
      const full = (base + tail) || "/";
      fileOf.set(full, "app/" + t[3]);
    }
  }
}

const RANK = { student: 0, instructor: 1, manager: 2, admin: 3 };

/** loader/action 가드에서 요구 역할을 읽는다. 못 읽으면 null. */
function guardOf(file) {
  if (!fs.existsSync(file)) return { required: null, note: "화면 파일 없음" };
  const src = fs.readFileSync(file, "utf8");
  const found = [];
  // 공용 헬퍼(admin-guard.server) — 이게 표준이다.
  if (/requireAdmin\s*\(/.test(src)) found.push("admin");
  if (/requireManager\s*\(/.test(src)) found.push("manager");
  for (const g of src.matchAll(/requireStaff\s*\(\s*request\s*,\s*"(admin|manager|instructor)"/g))
    found.push(g[1]);
  if (/requireStaff\s*\(\s*request\s*\)/.test(src)) found.push("instructor");
  // 손수 쓴 가드 — role !== "x" / !roleAtLeast(role, "x")
  for (const g of src.matchAll(/role\s*!==\s*"(admin|manager|instructor)"/g)) found.push(g[1]);
  for (const g of src.matchAll(/!\s*roleAtLeast\([^,]+,\s*"(admin|manager|instructor)"\)/g))
    found.push(g[1]);
  // ★가장 흔한 형태 — `if (!role) throw 403` 은 "스태프 이상"이라는 뜻이다.
  //   이걸 못 읽으면 정상 화면 80여 개가 전부 "가드 못 찾음"으로 나와 감사가 무용지물이 된다.
  if (/if\s*\(\s*!role\s*\)\s*\{?\s*throw/.test(src)) found.push("instructor");
  // ★403 이 아니라 redirect 로 되돌리는 가드도 있다(권한 부족 → /admin 으로 튕김).
  //   이걸 못 읽으면 "메뉴는 보이는데 눌러도 되돌아온다"가 감사에서 빠진다.
  if (/isManager\s*\(\s*role\s*\)\s*\)\s*throw redirect/.test(src)) found.push("manager");
  if (/isAdmin\s*\(\s*role\s*\)\s*\)\s*throw redirect/.test(src)) found.push("admin");
  const duty = /requireDuty|hasDutyAccess/.test(src);
  if (!found.length) return { required: null, duty, note: null };
  // 여러 개면 가장 낮은 것이 진입 문턱이다.
  const required = found.sort((a, b) => RANK[a] - RANK[b])[0];
  return { required, duty, note: null };
}

const rows = [];
for (const n of navs) {
  const path = n.to.split("?")[0];
  // /admin 밖(학생 화면을 운영 메뉴에서 가리키는 경우)은 스태프 가드가 없는 게 정상이다.
  if (!path.startsWith("/admin")) continue;
  const file = fileOf.get(path);
  if (!file) {
    rows.push({ ...n, verdict: "라우트 없음", detail: path });
    continue;
  }
  const g = guardOf(file);
  if (g.note) {
    rows.push({ ...n, verdict: g.note, detail: file });
    continue;
  }
  const shown = n.minRole ?? (n.duty ? "duty" : "instructor"); // 지정 없으면 스태프 전원
  if (!g.required) {
    if (!n.duty && !g.duty) rows.push({ ...n, verdict: "★가드 없음", detail: file });
    continue;
  }
  if (n.duty) continue; // duty 화면은 별도 규칙 — 여기서 판정하지 않는다
  const shownRank = n.minRole ? RANK[n.minRole] : RANK.instructor;
  if (shownRank < RANK[g.required]) {
    rows.push({
      ...n,
      verdict: "메뉴가 더 넓다",
      detail: `메뉴 ${shown} · 서버 ${g.required} → minRole: "${g.required}" 필요`,
    });
  }
}

console.log(`메뉴 ${navs.length}개 대조`);
const bad = rows.filter((r) => r.verdict === "메뉴가 더 넓다");
const other = rows.filter((r) => r.verdict !== "메뉴가 더 넓다");
console.log(`\n★어긋남 ${bad.length}건 — 메뉴는 보이는데 서버가 막는다:`);
bad.forEach((r) => console.log(`   ${r.label}  ${r.to}\n      ${r.detail}`));
if (other.length) {
  console.log(`\n확인 필요 ${other.length}건:`);
  other.forEach((r) => console.log(`   [${r.verdict}] ${r.label} ${r.to} — ${r.detail}`));
}
process.exit(bad.length ? 1 : 0);
