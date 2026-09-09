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
/** 기준 폭 — 자료에 박힌 최소 폭이 이보다 넓으면 그쪽을 쓴다. 교재 한 쪽에 해당한다. */
const DEFAULT_PAGE_W = 1180;

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

const prefix = (sel, scope) =>
  sel.split(",").map((s) => `${scope} ${s.trim()}`).join(",\n");

function transform(rules, scope) {
  const out = [];
  for (const r of rules) {
    const sel = r.sel.replace(/\s+/g, " ").trim();

    // 운영체제 다크 설정을 그대로 따르면 앱이 라이트인데 표만 검게 나온다 — 버린다.
    if (/^@media\s*\(prefers-color-scheme:\s*dark\)$/.test(sel)) continue;
    if (sel.startsWith("@")) {
      const inner = transform(parseRules(r.body), scope);
      if (inner.trim()) out.push(`${sel} {\n${inner}\n}`);
      continue;
    }

    if (sel === ":root") {
      const decls = tokenBlock(r.body, { aliases: true });
      out.push(`${scope} {\n${joinDecls(decls)}\n}`);
      continue;
    }
    if (sel === ':root[data-theme="dark"]') {
      const decls = tokenBlock(r.body, { aliases: false });
      // 앱은 `<html class="dark">` 로 다크를 켠다(app.css). data-theme 은 안 쓴다.
      out.push(`.dark ${scope} {\n${joinDecls(decls)}\n}`);
      continue;
    }
    if (sel === ':root[data-theme="light"]') continue; // 기본 묶음과 같다
    if (sel === ".wrap") continue; // 바깥 폭·여백은 패널이 정한다

    if (sel === "body") {
      const decls = declsOf(r.body).filter((d) => !BODY_DROP.has(d.prop));
      out.push(`${scope} {\n${joinDecls(decls)}\n}`);
      continue;
    }
    out.push(`${prefix(sel, scope)} {\n${r.body.trim()}\n}`);
  }
  return out.join("\n");
}

/**
 * @param html 한 장짜리 산출물
 * @param page 교재 쪽번호. ★한 단원에 두 쪽이 붙으면(01 총칙 = 2p+3p) 같은
 *   `.digest-doc` 아래에서 두 쪽의 규칙이 섞인다 — 쪽마다 `.dpN` 을 덧붙여 가른다.
 */
export function convert(html, page) {
  const scope = page ? `.digest-doc.dp${page}` : ".digest-doc";
  const title = (html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "")
    .split("—")[0]
    .trim();

  const styleRaw = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
  const css = transform(parseRules(styleRaw), scope);

  const open = html.indexOf('<div class="wrap">');
  if (open < 0) throw new Error("`.wrap` 을 찾지 못했습니다");
  const inner = html.slice(open + '<div class="wrap">'.length);
  const close = inner.lastIndexOf("</div>");
  // 머리글(제목·설명)은 패널이 이미 갖고 있다 — 두 번 나오지 않게 뺀다.
  // ★꼬리의 「고친 곳」·「다른 곳」 기록도 뺀다 — 그건 **검토용 작업 기록**이지 자료가
  //   아니다. 학습 화면에는 자료만 올라가야 한다(원장 지적 2026-09-09).
  //   마지막 `</section>` 뒤를 통째로 자르면 안 된다 — 2p·10p 는 그 뒤에 감싸개를
  //   닫는 `</div>` 가 있어 태그가 어긋난다. 꼬리 문단만 집어낸다.
  const bodyHtml = inner
    .slice(0, close)
    .replace(/<header>[\s\S]*?<\/header>/, "")
    //   ★목록(`고친 곳`·`다른 곳`)은 문단 **밖 형제**로 붙어 있어 따로 집어야 한다.
    .replace(/<p class="foot">[\s\S]*?<\/p>/g, "")
    .replace(/<ul class="(?:changes|diffs)">[\s\S]*?<\/ul>/g, "")
    .trim();

  // ★자료는 **교재 한 쪽처럼 통째로** 화면에 들어와야 한다(원장 지적 2026-09-09).
  //   글자만 줄여서는 안 된다 — 4p 는 11px 로도 세로 1,094px 이라 한 화면(≈760px)을
  //   넘고, 5·6p 는 8px 로 줄여도 넘는다(`estimate-height.mjs`).
  //   그래서 **기준 폭을 가진 한 장**으로 감싼다. 판짜기는 언제나 이 폭에서 계산되고,
  //   화면에서는 그 장을 통째로 줄여 맞춘다(digest-panel 의 FitPage).
  const widths = [...bodyHtml.matchAll(/min-width:(\d+)px/g)].map((m) => Number(m[1]));
  const pageW = Math.max(DEFAULT_PAGE_W, ...widths);
  const paged = `<div class="digest-page" style="width:${pageW}px">\n${bodyHtml}\n</div>`;

  return { title, bodyHtml: paged, css };
}

// ★argv[1] 은 `node -e` 로 부를 때 없다 — 없으면 라이브러리로 쓰인 것이다.
if (
  process.argv[1] &&
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`
) {
  const file = process.argv[2];
  if (!file) {
    console.log("사용: node scripts/digest/convert.mjs <파일.html>");
    process.exit(1);
  }
  const r = convert(readFileSync(file, "utf8"), Number(file.match(/digest-([0-9]+)p/)?.[1] ?? 0));
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
