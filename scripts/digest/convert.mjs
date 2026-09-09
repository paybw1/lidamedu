// 정리비교표 재작화 산출물(단독 HTML) → 앱 화면에 넣을 {title, bodyHtml, css}.
//
//   node scripts/digest/convert.mjs <파일.html>      # 미리보기(길이·선택자만)
//
// 산출물은 그 자체로 열리는 한 장짜리 페이지다. 그대로 화면에 넣으면
//   · `:root`·`body` 규칙이 앱 전체로 새고
//   · 자기 팔레트(고정 hex)를 들고 와 다크 모드에서 앱과 따로 논다
// 그래서 선택자를 전부 `.digest-doc` 아래로 접고, 앱과 겹치는 색 토큰은 앱 것을 쓴다.
import { readFileSync } from "node:fs";

/** 앱(app.css)이 이미 정의하는 토큰 — 정리비교표 쪽에서 덮어쓰지 않는다. */
const APP_OWNED = new Set(["--card", "--border", "--primary", "--link"]);
/** 이름만 다를 뿐 같은 뜻인 토큰 — 앱 토큰을 가리키게 한다(다크 전환이 저절로 따라온다). */
const ALIAS = {
  "--ink": "var(--foreground)",
  "--muted": "var(--muted-foreground)",
  "--page": "var(--background)",
  "--primary-fg": "var(--primary-foreground)",
};
/** 페이지 배경·바깥 여백은 패널이 갖는다. */
const BODY_DROP = new Set(["margin", "background"]);

/** `sel { ... }` 을 중괄호 짝을 세어 잘라 낸다. @media 는 안쪽을 다시 부른다. */
function parseRules(css) {
  const rules = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) break;
    const sel = css.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === "{") depth += 1;
      else if (css[j] === "}") depth -= 1;
      j += 1;
    }
    rules.push({ sel, body: css.slice(open + 1, j - 1) });
    i = j;
  }
  return rules;
}

const declsOf = (body) =>
  body.split(";").map((d) => d.trim()).filter(Boolean).map((d) => {
    const at = d.indexOf(":");
    return { prop: d.slice(0, at).trim(), value: d.slice(at + 1).trim(), raw: d };
  });

const joinDecls = (decls) => decls.map((d) => `  ${d.prop}: ${d.value};`).join("\n");

/** 색 토큰 묶음 — 앱이 가진 것은 빼고, 뜻이 같은 것은 앱 토큰을 가리키게 바꾼다. */
function tokenBlock(body, { aliases }) {
  const kept = [];
  for (const d of declsOf(body)) {
    if (APP_OWNED.has(d.prop)) continue;
    if (d.prop in ALIAS) {
      if (!aliases) continue; // 다크 묶음에서는 뺀다 — 앱 토큰이 알아서 바뀐다
      kept.push({ prop: d.prop, value: ALIAS[d.prop] });
      continue;
    }
    kept.push(d);
  }
  return kept;
}

const prefix = (sel) =>
  sel.split(",").map((s) => `.digest-doc ${s.trim()}`).join(",\n");

function transform(rules) {
  const out = [];
  for (const r of rules) {
    const sel = r.sel.replace(/\s+/g, " ").trim();

    // 운영체제 다크 설정을 그대로 따르면 앱이 라이트인데 표만 검게 나온다 — 버린다.
    if (/^@media\s*\(prefers-color-scheme:\s*dark\)$/.test(sel)) continue;
    if (sel.startsWith("@")) {
      const inner = transform(parseRules(r.body));
      if (inner.trim()) out.push(`${sel} {\n${inner}\n}`);
      continue;
    }

    if (sel === ":root") {
      const decls = tokenBlock(r.body, { aliases: true });
      out.push(`.digest-doc {\n${joinDecls(decls)}\n}`);
      continue;
    }
    if (sel === ':root[data-theme="dark"]') {
      const decls = tokenBlock(r.body, { aliases: false });
      // 앱은 `<html class="dark">` 로 다크를 켠다(app.css). data-theme 은 안 쓴다.
      out.push(`.dark .digest-doc {\n${joinDecls(decls)}\n}`);
      continue;
    }
    if (sel === ':root[data-theme="light"]') continue; // 기본 묶음과 같다
    if (sel === ".wrap") continue; // 바깥 폭·여백은 패널이 정한다

    if (sel === "body") {
      const decls = declsOf(r.body).filter((d) => !BODY_DROP.has(d.prop));
      out.push(`.digest-doc {\n${joinDecls(decls)}\n}`);
      continue;
    }
    out.push(`${prefix(sel)} {\n${r.body.trim()}\n}`);
  }
  return out.join("\n");
}

export function convert(html) {
  const title = (html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "")
    .split("—")[0]
    .trim();

  const styleRaw = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
  const css = transform(parseRules(styleRaw));

  const open = html.indexOf('<div class="wrap">');
  if (open < 0) throw new Error("`.wrap` 을 찾지 못했습니다");
  const inner = html.slice(open + '<div class="wrap">'.length);
  const close = inner.lastIndexOf("</div>");
  // 머리글(제목·설명)은 패널이 이미 갖고 있다 — 두 번 나오지 않게 뺀다.
  const bodyHtml = inner
    .slice(0, close)
    .replace(/<header>[\s\S]*?<\/header>/, "")
    .trim();

  return { title, bodyHtml, css };
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  const file = process.argv[2];
  if (!file) {
    console.log("사용: node scripts/digest/convert.mjs <파일.html>");
    process.exit(1);
  }
  const r = convert(readFileSync(file, "utf8"));
  console.log(`제목: ${r.title}`);
  console.log(`본문 ${r.bodyHtml.length}자 · CSS ${r.css.length}자`);
  // 선택자 줄만 본다 — `{` 로 끝나는 줄. 선언줄까지 세면 전부 샌 것처럼 보인다.
  const leaks = r.css
    .split("\n")
    .filter((l) => l.trimEnd().endsWith("{"))
    .map((l) => l.trim())
    .filter((l) => !l.startsWith(".digest-doc") && !l.startsWith(".dark .digest-doc") && !l.startsWith("@"));
  console.log(leaks.length ? `★새는 선택자 ${leaks.length}개:\n${leaks.join("\n")}` : "새는 선택자 없음");
}
