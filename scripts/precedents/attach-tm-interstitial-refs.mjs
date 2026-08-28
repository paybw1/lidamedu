// 상표 판례집 hwpx 의 독립 "기본 법리"/"판례 모음" 글상자(파서 미수집) → 다음 판례의 참고 섹션으로.
// 원장 지시(2026-07-07): 예) 제33조①3호 기본 법리 → ROYAL BEE(2022후10128) 참고.
//
// ★블록 위치는 **제목 글자로 찾는다**. 예전엔 section0.xml 의 바이트 오프셋이 박혀 있었는데,
//   판본이 바뀌면(제16판 0825 는 본문이 section1.xml) 그 숫자가 통째로 엉뚱한 곳을 가리킨다.
//   끝은 다음 판례 헤더가 나오는 곳까지 — 판본이 또 바뀌어도 그대로 동작한다.
//
//   TMHWPX_SECTION=<본문 section xml 경로> node scripts/precedents/attach-tm-interstitial-refs.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: "C:/project/lidamedu/.env" });

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const xml = readFileSync(process.env.TMHWPX_SECTION, "utf8");

const decode = (s) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
const normalizePara = (t) => t.replace(/^(\[\d+\]|\(\d+\))(?=\S)/, "$1 ");

const COURTS =
  "대법원|특허법원|헌법재판소|서울고등법원|서울중앙지방법원|서울지방법원|서울행정법원|서울민사지방법원";
// 블록의 끝 = 다음 판례 헤더 또는 다음 주제 제목.
const IS_BOUNDARY = (t) =>
  new RegExp(`^(?:${COURTS})\\s+\\d{4}\\.`).test(t) || /^주제\s*\d+\s/.test(t);

/** 제목 문단부터 다음 판례 헤더 직전까지 — 문단 + 표. */
function extractByTitle(title) {
  const at = xml.indexOf(title);
  if (at < 0) return { paras: [], tables: [], missing: true };
  const start = xml.lastIndexOf("<hp:p ", at);
  // 넉넉히 잘라 오고 경계에서 끊는다(가장 긴 블록이 5만자 남짓).
  let seg = xml.slice(start, Math.min(xml.length, at + 120000));
  const tbls = [];
  let prev;
  do {
    prev = seg;
    seg = seg.replace(/<hp:tbl\b(?:(?!<hp:tbl)[\s\S])*?<\/hp:tbl>/, (m) => {
      tbls.push(m);
      return "<hp:t>⟦TBL" + (tbls.length - 1) + "⟧</hp:t>";
    });
  } while (seg !== prev);

  const chunks = seg.split("</hp:p>");
  const paras = [];
  let stoppedAtChunk = chunks.length;
  for (let i = 0; i < chunks.length; i++) {
    const t = [...chunks[i].matchAll(/<hp:t(?:\s[^>]*)?>([\s\S]*?)<\/hp:t>/g)]
      .map((m) => decode(m[1]))
      .join("")
      .trim();
    if (!t || t === "\\" || /묶음 개체입니다/.test(t)) continue;
    if (IS_BOUNDARY(t)) {
      stoppedAtChunk = i;
      break;
    }
    paras.push(t);
  }
  // 경계 뒤에 있던 표는 이 블록 것이 아니다 — 경계 전 조각에서 나온 마커만 남긴다.
  const usedTableIdx = new Set(
    paras.flatMap((t) => [...t.matchAll(/⟦TBL(\d+)⟧/g)].map((m) => Number(m[1]))),
  );
  const tables = tbls
    .map((t, i) => ({ i, t }))
    .filter(({ i }) => usedTableIdx.has(i))
    .map(({ t }) =>
      t
        .split("<hp:tr>")
        .slice(1)
        .map((tr) =>
          tr
            .split(/<hp:tc\b/)
            .slice(1)
            .map((tc) => {
              const span = tc.match(/<hp:cellSpan colSpan="(\d+)" rowSpan="(\d+)"/);
              const cellParas = tc
                .split("</hp:p>")
                .map((ch) =>
                  [...ch.matchAll(/<hp:t(?:\s[^>]*)?>([\s\S]*?)<\/hp:t>/g)]
                    .map((m) => decode(m[1]))
                    .join("")
                    .trim(),
                )
                .filter(Boolean);
              const cell = { text: cellParas.join("\n"), images: [] };
              if (span && +span[1] > 1) cell.colSpan = +span[1];
              if (span && +span[2] > 1) cell.rowSpan = +span[2];
              return cell;
            }),
        ),
    );
  void stoppedAtChunk;
  return { paras: paras.map(normalizePara), tables, missing: false };
}

const P = (t) => ({ type: "p", text: t });
const jobs = [
  { caseNumber: "2004후2093", title: "전체관찰 기본 법리", split: false },
  { caseNumber: "2010후3578", title: "상품의 동일ㆍ유사와 관련된 주요 판례 모음", split: true },
  { caseNumber: "2022후10128", title: "제33조 제1항 제3호 기본 법리", split: false },
  { caseNumber: "94후555", title: "상표법 제33조 제1항 제7호 기본 법리", split: false },
].map((j) => ({ ...j, ...extractByTitle(j.title) }));

for (const job of jobs) {
  if (job.missing) {
    console.log("!! 교재에서 블록 못 찾음:", job.title, "— 제목이 바뀌었는지 확인");
    continue;
  }
  const { data: rows, error } = await sb
    .from("cases")
    .select("case_id,case_number,case_title,book_sections")
    .eq("subject_laws", "{trademark}")
    .eq("case_number", job.caseNumber)
    .is("deleted_at", null);
  if (error) throw error;
  if (rows.length !== 1) {
    console.log("!! 대상 판례", job.caseNumber, "행 수", rows.length, "— skip");
    continue;
  }
  const r = rows[0];
  const secs = r.book_sections.sections;
  if (secs.some((s) => s.title === job.title)) {
    console.log("skip(기존재):", job.caseNumber, job.title);
    continue;
  }
  const usedKeys = new Set(secs.map((s) => s.key));
  const nextKey = () => {
    let k = "reference",
      n = 1;
    while (usedKeys.has(k)) {
      n++;
      k = "reference-" + n;
    }
    usedKeys.add(k);
    return k;
  };
  const add = [];
  const paraBlocks = job.paras.filter((t) => !/^⟦TBL\d+⟧$/.test(t)).map(P);
  if (job.split && job.tables.length > 0) {
    add.push({ key: nextKey(), label: "참고 1", blocks: paraBlocks, source: null, title: job.title });
    add.push({
      key: nextKey(),
      label: "참고 2",
      blocks: job.tables.map((rows2) => ({ type: "table", rows: rows2 })),
      source: null,
      title: "주요 판례 모음(표)",
    });
  } else {
    const blocks = [...paraBlocks, ...job.tables.map((rows2) => ({ type: "table", rows: rows2 }))];
    add.push({ key: nextKey(), label: "참고", blocks, source: null, title: job.title });
  }
  const out = { ...r.book_sections, sections: [...secs, ...add] };
  const { error: e2 } = await sb.from("cases").update({ book_sections: out }).eq("case_id", r.case_id);
  if (e2) throw e2;
  console.log(
    "OK",
    job.caseNumber,
    "(" + r.case_title.slice(0, 25) + ")  +" + add.map((s) => s.label + '"' + (s.title || "") + '" blocks=' + s.blocks.length).join(" / "),
  );
}
