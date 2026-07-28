// open.law.go.kr 연혁법령 스냅샷 수집 (feat-2-034 개정법 검증 강화).
// 특허법·상표법·디자인보호법의 역대 버전(2005~) 조문 전문을 내려받아 캐시.
// 출력: tmp/law-history/{law}/{시행일자}-{MST}.json = {meta, articles:[{no,title,text}]}
//       tmp/law-history/{law}/index.json = 버전 목록(시행일자 오름차순)
//
//   node scripts/jagwa/fetch-law-history.mjs

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import "dotenv/config";

const OC = process.env.LAW_API_KEY;
const BASE = "https://www.law.go.kr/DRF";
const MIN_EFFECTIVE = "20050101"; // 2010년 시험 당시 시행법 확보 여유분
const LAWS = [
  { code: "patent", name: "특허법" },
  { code: "trademark", name: "상표법" },
  { code: "design", name: "디자인보호법" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(path, params) {
  const url = `${BASE}/${path}?${new URLSearchParams({ OC, type: "JSON", ...params })}`;
  const res = await fetch(url);
  const text = await res.text();
  return JSON.parse(text);
}

// 조문단위 → 평문. 조문내용 + 항/호/목 내용을 문서 순서로 수집.
function flattenUnit(unit) {
  const parts = [];
  const push = (v) => {
    if (typeof v === "string" && v.trim()) parts.push(v.trim());
    else if (Array.isArray(v)) v.forEach(push);
  };
  push(unit["조문내용"]);
  const walkClause = (c) => {
    if (!c) return;
    for (const item of Array.isArray(c) ? c : [c]) {
      push(item["항내용"]);
      const ho = item["호"];
      if (ho)
        for (const h of Array.isArray(ho) ? ho : [ho]) {
          push(h["호내용"]);
          const mok = h["목"];
          if (mok)
            for (const m of Array.isArray(mok) ? mok : [mok]) push(m["목내용"]);
        }
    }
  };
  walkClause(unit["항"]);
  return parts
    .join("\n")
    .replace(/<[^>]+>/g, "") // <P> 등 태그 제거
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

for (const law of LAWS) {
  // ① 연혁 목록 (페이지네이션)
  const versions = [];
  for (let page = 1; ; page++) {
    const j = await getJson("lawSearch.do", {
      target: "eflaw",
      query: law.name,
      display: "100",
      page: String(page),
    });
    const s = j.LawSearch;
    const rows = (Array.isArray(s?.law) ? s.law : [s?.law]).filter(Boolean);
    versions.push(
      ...rows.filter(
        (l) => l.법령명한글 === law.name && l.법령구분명 === "법률",
      ),
    );
    if (rows.length < 100 || page >= Math.ceil(Number(s.totalCnt) / 100)) break;
  }
  // MST 중복 제거(같은 버전이 시행일 다르게 중복 나열되기도) + 시행일 정렬
  const byMst = new Map();
  for (const v of versions) {
    const key = v.법령일련번호;
    if (!byMst.has(key) || byMst.get(key).시행일자 > v.시행일자) byMst.set(key, v);
  }
  let list = [...byMst.values()].sort((a, b) =>
    String(a.시행일자).localeCompare(String(b.시행일자)),
  );
  // 2005 이전은 마지막 1건만 유지
  const before = list.filter((v) => String(v.시행일자) < MIN_EFFECTIVE);
  list = [...before.slice(-1), ...list.filter((v) => String(v.시행일자) >= MIN_EFFECTIVE)];

  const dir = join("tmp/law-history", law.code);
  mkdirSync(dir, { recursive: true });
  const index = [];
  for (const v of list) {
    const file = join(dir, `${v.시행일자}-${v.법령일련번호}.json`);
    index.push({
      효력시작: String(v.시행일자),
      공포일자: String(v.공포일자),
      공포번호: String(v.공포번호),
      제개정: v.제개정구분명,
      MST: String(v.법령일련번호),
      file,
    });
    if (existsSync(file)) continue;
    try {
      const body = await getJson("lawService.do", { target: "law", MST: v.법령일련번호 });
      const root = body[Object.keys(body)[0]];
      const units = root?.["조문"]?.["조문단위"];
      const arr = Array.isArray(units) ? units : units ? [units] : [];
      const articles = arr
        .filter((u) => u["조문여부"] === "조문")
        .map((u) => {
          const no =
            String(u["조문번호"]) +
            (u["조문가지번호"] && String(u["조문가지번호"]) !== "0"
              ? `의${u["조문가지번호"]}`
              : "");
          return { no, title: u["조문제목"] ?? "", text: flattenUnit(u) };
        });
      writeFileSync(
        file,
        JSON.stringify(
          {
            meta: {
              law: law.code,
              효력시작: String(v.시행일자),
              공포일자: String(v.공포일자),
              공포번호: String(v.공포번호),
              제개정: v.제개정구분명,
              MST: String(v.법령일련번호),
            },
            articles,
          },
          null,
          0,
        ),
        "utf8",
      );
      console.log(`✓ ${law.code} ${v.시행일자} (${v.제개정}) 조문 ${articles.length}`);
    } catch (e) {
      console.warn(`✗ ${law.code} ${v.시행일자} MST=${v.법령일련번호}: ${e.message}`);
    }
    await sleep(300);
  }
  writeFileSync(join(dir, "index.json"), JSON.stringify(index, null, 2), "utf8");
  console.log(`${law.code}: 버전 ${index.length}건 (index.json)`);
}
