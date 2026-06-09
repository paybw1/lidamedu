// 특허법 강의노트 7개 PPTX → 슬라이드별 1장 PDF → 조문 업로드.
//   (1) sldNum(페이지번호) 제거 → LibreOffice 변환(파일별 캐시) → 슬라이드별 분할
//   (2) 분류: 조문(업로드) / 참고노트(별도 폴더) / 기타(스킵)
//   (3) 조문 -> DB 매칭(범위면 첫 조문). 사건번호 1개면 제목에 부착.
//   (4) --apply: 특허법 조문 기존 lecture_note 전부 soft-delete 후 매칭분 업로드.
// 사용: node scripts/lecture-notes/import-all.mjs [--apply] [--reconvert]
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

import AdmZip from "adm-zip";
import { PDFDocument } from "pdf-lib";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

const ROOT = process.cwd();
dotenv.config({ path: resolve(ROOT, ".env") });
const APPLY = process.argv.includes("--apply");
const RECONVERT = process.argv.includes("--reconvert");
const SOFFICE = "C:/Program Files/LibreOffice/program/soffice.exe";
const LO_PROFILE = "file:///C:/project/lidamedu/tmp/lo_profile";
const SRC_DIR = resolve(ROOT, "source/특허법 강의노트");
const OUT = resolve(ROOT, "tmp/lecture-notes/out");
const CACHE = resolve(ROOT, "tmp/lecture-notes/cache");
const BUCKET = "lecture-notes";
const SOURCE_PDF_ID = (() => {
  const h = createHash("sha1").update("리담특허법 강의노트 PPT 2026").digest("hex");
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    "5" + h.slice(13, 16),
    ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20),
    h.slice(20, 32),
  ].join("-");
})();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("env 미설정");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const ART_RE = /제\s*\d+\s*조(?:\s*의\s*\d+)?/;
const ART_NUM_RE = /제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/;
const CASE_RE = /(\d{2,4}\s*[가-힣]{1,3}\s*\d{1,6})/g;
const sanitize = (s) =>
  s.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);

function spList(xml) {
  const out = [];
  const re = /<p:sp>([\s\S]*?)<\/p:sp>/g;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[1];
    const ph = b.match(/<p:ph\b([^>]*)>/);
    const phType = ph ? (ph[1].match(/type="([^"]+)"/)?.[1] ?? "body") : null;
    const tr = /<a:t[^>]*>([^<]*)<\/a:t>/g;
    let tm;
    let s = "";
    while ((tm = tr.exec(b)))
      s += tm[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    out.push({ phType, text: s.trim() });
  }
  return out;
}
function metaOf(xml) {
  const sps = spList(xml);
  const title = sps.find((s) => s.phType === "title" || s.phType === "ctrTitle");
  const body = sps.find((s) => s.phType === "body" && s !== title);
  const jomun = (title?.text ?? "").trim();
  const jemok = (body?.text ?? "").trim();
  const joined = sps.map((s) => s.text).join(" ");
  let kind = "기타";
  if (/참고\s*노트/.test(jomun)) kind = "참고노트";
  else if (ART_RE.test(jomun)) kind = "조문";
  let cas = "";
  if (/CASE|선고|판결|대법원/i.test(joined)) {
    const cm = joined.match(CASE_RE);
    if (cm) {
      const u = [...new Set(cm.map((x) => x.replace(/\s+/g, "")))];
      if (u.length === 1) cas = u[0];
    }
  }
  const am = jomun.match(ART_NUM_RE);
  const articleNumber = am ? (am[2] ? `${am[1]}의${am[2]}` : am[1]) : null;
  return { jomun, jemok, kind, cas, articleNumber };
}

function convertFile(srcPath, slug) {
  const cachedPdf = resolve(CACHE, `${slug}.pdf`);
  if (existsSync(cachedPdf) && !RECONVERT) return cachedPdf;
  mkdirSync(CACHE, { recursive: true });
  const zip = new AdmZip(srcPath);
  for (const e of zip.getEntries()) {
    if (!/ppt\/slides\/slide\d+\.xml$/.test(e.entryName)) continue;
    const xml = e.getData().toString("utf-8");
    zip.updateFile(
      e.entryName,
      Buffer.from(
        xml.replace(/<p:sp>[\s\S]*?<\/p:sp>/g, (blk) =>
          /type="sldNum"/.test(blk) ? "" : blk,
        ),
        "utf-8",
      ),
    );
  }
  const editedPptx = resolve(CACHE, `${slug}.pptx`);
  zip.writeZip(editedPptx);
  execFileSync(
    SOFFICE,
    [
      "--headless",
      "--norestore",
      `-env:UserInstallation=${LO_PROFILE}`,
      "--convert-to",
      "pdf",
      "--outdir",
      CACHE,
      editedPptx,
    ],
    { stdio: ["ignore", "ignore", "inherit"], timeout: 300000 },
  );
  if (!existsSync(cachedPdf)) throw new Error(`변환 실패: ${slug}`);
  return cachedPdf;
}

async function main() {
  console.log(`mode: ${APPLY ? "APPLY" : "DRY-RUN"} | source_pdf_id=${SOURCE_PDF_ID}`);
  const files = readdirSync(SRC_DIR)
    .filter((f) => f.endsWith(".pptx") && !f.startsWith("~$"))
    .sort();
  if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });

  const { data: law } = await supa
    .from("laws")
    .select("law_id")
    .eq("law_code", "patent")
    .single();
  if (!law) {
    console.error("patent law 없음");
    process.exit(1);
  }
  const artMap = new Map();
  {
    let fromR = 0;
    for (;;) {
      const { data } = await supa
        .from("articles")
        .select("article_id,article_number,display_label")
        .eq("law_id", law.law_id)
        .is("deleted_at", null)
        .range(fromR, fromR + 999);
      for (const a of data ?? []) if (a.article_number) artMap.set(a.article_number, a);
      if (!data || data.length < 1000) break;
      fromR += 1000;
    }
  }
  console.log(`patent articles: ${artMap.size}`);

  const items = [];
  let refCnt = 0;
  let etcCnt = 0;
  for (const f of files) {
    const slug = "ch" + (f.match(/^(\d+)/)?.[1] ?? "x");
    const zip = new AdmZip(`${SRC_DIR}/${f}`);
    const slides = zip
      .getEntries()
      .filter((e) => /ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
      .sort(
        (a, b) =>
          parseInt(a.entryName.match(/slide(\d+)/)[1]) -
          parseInt(b.entryName.match(/slide(\d+)/)[1]),
      );
    const metas = slides.map((e) => metaOf(e.getData().toString("utf-8")));
    process.stdout.write(`\n[${slug}] ${f} (${slides.length}장) 변환...`);
    const pdfPath = convertFile(`${SRC_DIR}/${f}`, slug);
    const src = await PDFDocument.load(readFileSync(pdfPath), {
      ignoreEncryption: true,
    });
    process.stdout.write(` PDF ${src.getPageCount()}p\n`);
    for (const d of ["조문", "참고노트", "기타"])
      mkdirSync(resolve(OUT, slug, d), { recursive: true });
    const used = new Set();
    for (let i = 0; i < metas.length; i++) {
      const m = metas[i];
      let base;
      if (m.kind === "조문")
        base =
          sanitize(m.jomun) +
          (m.jemok ? `_${sanitize(m.jemok)}` : "") +
          (m.cas ? `_${m.cas}` : "") +
          ".pdf";
      else if (m.kind === "참고노트")
        base = `[참고노트] ${sanitize(m.jemok || "슬라이드" + (i + 1))}.pdf`;
      else base = `[기타] 슬라이드${i + 1}.pdf`;
      let name = base;
      let k = 2;
      while (used.has(m.kind + "/" + name)) {
        name = base.replace(/\.pdf$/, "") + ` (${k})` + ".pdf";
        k++;
      }
      used.add(m.kind + "/" + name);
      const out = await PDFDocument.create();
      const [pg] = await out.copyPages(src, [i]);
      out.addPage(pg);
      const bytes = Buffer.from(await out.save());
      writeFileSync(resolve(OUT, slug, m.kind, name), bytes);
      if (m.kind === "조문") {
        const art = m.articleNumber ? artMap.get(m.articleNumber) : null;
        items.push({
          slug,
          slide: i + 1,
          jomun: m.jomun,
          jemok: m.jemok,
          cas: m.cas,
          articleNumber: m.articleNumber,
          art,
          name,
          bytes,
        });
      } else if (m.kind === "참고노트") refCnt++;
      else etcCnt++;
    }
  }

  const matched = items.filter((x) => x.art);
  const unmatched = items.filter((x) => !x.art);
  console.log(`\n===== 요약 =====`);
  console.log(
    `조문 PDF ${items.length} (매칭 ${matched.length} / 미매칭 ${unmatched.length}) | 참고노트 ${refCnt} | 기타 ${etcCnt}`,
  );
  if (unmatched.length) {
    console.log(`\n--- 미매칭 조문 (업로드 제외, 수동확인) ---`);
    for (const u of unmatched)
      console.log(
        `  [${u.slug} s${u.slide}] 조문="${u.jomun}" (num=${u.articleNumber}) → DB 없음 | ${u.name}`,
      );
  }
  console.log(`\n조문 PDF: ${OUT}\\<chN>\\조문\\ | 참고노트: ...\\참고노트\\`);

  if (!APPLY) {
    console.log(`\n(dry-run — DB/Storage 무변경. --apply 로 적용)`);
    return;
  }

  const artIds = [...new Set([...artMap.values()].map((a) => a.article_id))];
  let wiped = 0;
  for (let i = 0; i < artIds.length; i += 300) {
    const { data, error } = await supa
      .from("lecture_resources")
      .update({ deleted_at: new Date().toISOString() })
      .eq("target_type", "article")
      .eq("kind", "lecture_note")
      .is("deleted_at", null)
      .in("target_id", artIds.slice(i, i + 300))
      .select("resource_id");
    if (error) {
      console.error("삭제 실패:", error.message);
      process.exit(1);
    }
    wiped += data?.length ?? 0;
  }
  console.log(`\n[apply] 기존 특허법 조문 강의노트 soft-delete: ${wiped}건`);

  let ord = 0;
  let ok = 0;
  let fail = 0;
  for (const it of matched) {
    const key = `patent-lecture/${it.slug}-s${String(it.slide).padStart(3, "0")}.pdf`;
    const up = await supa.storage
      .from(BUCKET)
      .upload(key, it.bytes, { contentType: "application/pdf", upsert: true });
    if (up.error) {
      console.error(`  실패(storage) ${it.name}: ${up.error.message}`);
      fail++;
      continue;
    }
    const title =
      `${it.jomun} ${it.jemok}`.trim() + (it.cas ? ` (${it.cas})` : "");
    const ins = await supa.from("lecture_resources").insert({
      target_type: "article",
      target_id: it.art.article_id,
      kind: "lecture_note",
      title,
      pdf_url: key,
      source_pdf_id: SOURCE_PDF_ID,
      source_page_start: it.slide,
      source_page_end: it.slide,
      ord: ord++,
    });
    if (ins.error) {
      console.error(`  실패(insert) ${it.name}: ${ins.error.message}`);
      fail++;
      continue;
    }
    ok++;
  }
  console.log(
    `\n[done] 업로드 ${ok} / 실패 ${fail} / 미매칭 제외 ${unmatched.length}`,
  );
}
main().catch((e) => {
  console.error("[fatal]", e);
  process.exit(1);
});
