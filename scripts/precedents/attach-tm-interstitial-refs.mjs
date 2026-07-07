// 상표 판례집 hwpx 의 독립 "기본 법리"/"판례 모음" 블록(파서 미수집) → 다음 판례의 참고 섹션으로.
// 원장 지시(2026-07-07): 예) 74 제33조①3호 기본 법리 → 75 ROYAL BEE(2022후10128) 참고.
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

function extract(start, end) {
  let seg = xml.slice(start, end);
  const tbls = [];
  let prev;
  do {
    prev = seg;
    seg = seg.replace(/<hp:tbl\b(?:(?!<hp:tbl)[\s\S])*?<\/hp:tbl>/, (m) => {
      tbls.push(m);
      return "<hp:t>⟦TBL" + (tbls.length - 1) + "⟧</hp:t>";
    });
  } while (seg !== prev);
  const paras = seg
    .split("</hp:p>")
    .map((chunk) =>
      [...chunk.matchAll(/<hp:t(?:\s[^>]*)?>([\s\S]*?)<\/hp:t>/g)]
        .map((m) => decode(m[1]))
        .join("")
        .trim(),
    )
    .filter((t) => t && t !== "\\" && !/묶음 개체입니다/.test(t));
  const tables = tbls.map((t) =>
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
  return { paras: paras.map(normalizePara), tables };
}

const P = (t) => ({ type: "p", text: t });
const jobs = [
  { caseNumber: "2004후2093", title: "전체관찰 기본 법리", ...extract(1025365, 1044739), split: false },
  { caseNumber: "2010후3578", title: "상품의 동일ㆍ유사와 관련된 주요 판례 모음", ...extract(2945188, 2997562), split: true },
  { caseNumber: "2022후10128", title: "제33조 제1항 제3호 기본 법리", ...extract(3166159, 3175486), split: false },
  { caseNumber: "94후555", title: "상표법 제33조 제1항 제7호 기본 법리", ...extract(4215170, 4226935), split: false },
];

for (const job of jobs) {
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
