// tm-precedents.json → 상표 판례 적재 (주제 노드 생성 + cases insert + 도형 이미지 업로드)
//
//   node scripts/precedents/seed-trademark-book.mjs                # dry-run (매칭·생성 계획 출력)
//   node scripts/precedents/seed-trademark-book.mjs --apply        # 실제 적재
//   node scripts/precedents/seed-trademark-book.mjs --apply --topic=1   # 특정 주제만 (파일럿)
//
// 규칙 (사용자 지시):
//   "주제N 제목(부모체계도라벨(法 refs))" → 체계도의 부모 노드 아래 case_only 자식 노드(주제 제목) 생성,
//   그 노드에 판례들을 primary_node_id 로 배치. source_seq = 교재 전체 순번(주제 순 → 주제 내 순).
//
// 정책 (특허 seed-to-db.mjs 와 동일):
//   - case_number 가 이미 상표 cases 에 있으면 skip (손보정 보존)
//   - 교재 내 중복 수록(다른 주제 재등장)은 최초 1회만 insert — 나머지는 로그
//   - 주제 노드는 같은 부모 아래 같은 라벨이 있으면 재사용 (재실행 멱등)
//   - 이미지: BinData → webp 변환 → case-images/{case_id}/ 업로드, images jsonb(position=summary)
//
// 학생 노출: trademark 는 STUDENT_DISABLED_SUBJECTS — staff 검수 전까지 학생 비노출.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import AdmZip from "adm-zip";
import sharp from "sharp";
import bmp from "bmp-js";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const APPLY = process.argv.includes("--apply");
const TOPIC_ARG = process.argv.map((a) => /^--topic=(\d+)$/.exec(a)).find(Boolean);
const ONLY_TOPIC = TOPIC_ARG ? +TOPIC_ARG[1] : null;

const data = JSON.parse(readFileSync(resolve(ROOT, "source/_converted/tm-precedents.json"), "utf8"));
const zip = new AdmZip(resolve(ROOT, "source/상표업로드/판례.hwpx"));

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const COURT_MAP = {
  대법원: "supreme",
  특허법원: "patent_court",
  서울고등법원: "high_court",
  서울지방법원: "district_court",
  서울중앙지방법원: "district_court",
};
const IMAGE_BUCKET = "case-images";
const COMMENT_SOURCE = "리담상표법 판례 [제16판]";

// ── BinData 매핑 (binId → zip entry) ──
const binByStem = new Map();
for (const e of zip.getEntries()) {
  const m = /^BinData\/([^.]+)\.(\w+)$/.exec(e.entryName);
  if (m) binByStem.set(m[1].toLowerCase(), { entry: e, ext: m[2].toLowerCase() });
}

async function toWebp(binId) {
  const hit = binByStem.get(binId.toLowerCase());
  if (!hit) return { error: "binData 없음" };
  const buf = hit.entry.getData();
  try {
    let img;
    if (hit.ext === "bmp") {
      const decoded = bmp.decode(buf);
      // bmp-js 는 ABGR 순 — sharp raw 는 RGBA 기대. 채널 스왑.
      const px = decoded.data;
      for (let i = 0; i < px.length; i += 4) {
        const a = px[i], b = px[i + 1], g = px[i + 2], r = px[i + 3];
        px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
      }
      img = sharp(px, { raw: { width: decoded.width, height: decoded.height, channels: 4 } });
    } else if (["wmf", "emf", "ole"].includes(hit.ext)) {
      return { error: `미지원 형식 ${hit.ext}` }; // 벡터/OLE — 변환 불가
    } else {
      // jpg/png/gif/tif + 확장자 오기(.tmp 등) — sharp 가 매직바이트로 판별, 손상 JPEG 관용
      img = sharp(buf, { failOn: "none" });
    }
    const out = await img.webp({ quality: 88 }).toBuffer({ resolveWithObject: true });
    return { buffer: out.data, width: out.info.width, height: out.info.height };
  } catch (e) {
    return { error: e.message };
  }
}

// ── 체계도 노드 매칭 ──
const { data: nodes, error: nErr } = await sb
  .from("systematic_nodes")
  .select("node_id, parent_id, path, display_label, ord")
  .eq("law_code", "trademark");
if (nErr) throw nErr;
const normLabel = (s) =>
  s.replace(/\s+/g, "").replace(/[·∙ㆍ・･]/g, "·").replace(/[()\[\]]/g, "");
const byLabel = new Map();
for (const n of nodes) {
  const stripped = n.display_label.replace(/^\[?\d{2}\]?\s*/, "");
  for (const key of new Set([normLabel(n.display_label), normLabel(stripped)])) {
    if (!byLabel.has(key)) byLabel.set(key, []);
    byLabel.get(key).push(n);
  }
}
function matchParent(label) {
  const hits = byLabel.get(normLabel(label)) ?? [];
  if (hits.length === 0) return null;
  // 동일 라벨 다중(L2/L3) → 가장 깊은 노드 (조문 리프)
  return [...hits].sort((a, b) => String(b.path).length - String(a.path).length)[0];
}

// ── md 조립 ──
const stripNum = (s) => s.replace(/^\[\d+\]\s*/, "").replace(/^\(\d+\)\s*/, "").trim();
const mdEscapeCell = (s) => s.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
function tableMd(rows) {
  const width = Math.max(...rows.map((r) => r.length));
  const norm = rows.map((r) => [...r, ...Array(width - r.length).fill("")]);
  const lines = [
    `| ${norm[0].map(mdEscapeCell).join(" | ")} |`,
    `| ${Array(width).fill("---").join(" | ")} |`,
    ...norm.slice(1).map((r) => `| ${r.map(mdEscapeCell).join(" | ")} |`),
  ];
  return lines.join("\n");
}
function buildReasoningMd(c) {
  const parts = [];
  const sec = c.sections;
  const tbl = (key) =>
    c.infoTables.filter((t) => t.section === key).map((t) => tableMd(t.rows));
  // 도표(헤더 직후) — 사건 개요 표
  for (const t of tbl("preamble")) parts.push(t);
  if (sec.preamble?.length) parts.push(sec.preamble.join("\n\n"));
  const SECTIONS = [
    ["facts", "사실관계"],
    ["lower", c.court === "대법원" ? "원심의 판단" : "원심(하급심)의 판단"],
    ["doctrine", "관련 법리"],
    ["holding", c.court === "대법원" ? "대법원의 판단" : "법원의 판단"],
  ];
  for (const [key, label] of SECTIONS) {
    const body = [];
    if (sec[key]?.length) body.push(sec[key].join("\n\n"));
    body.push(...tbl(key));
    if (body.length) parts.push(`### ${label}\n\n${body.join("\n\n")}`);
  }
  return parts.length ? parts.join("\n\n") : null;
}
function buildCommentMd(c) {
  const parts = [];
  if (c.sections.comment?.length) parts.push(c.sections.comment.join("\n\n"));
  if (c.sections.index?.length) parts.push(`**[Index]** ${c.sections.index.join(" / ")}`);
  return parts.length ? parts.join("\n\n") : null;
}

// ── 기존 상표 판례 ──
const { data: existingRows, error: exErr } = await sb
  .from("cases")
  .select("case_number")
  .contains("subject_laws", ["trademark"]);
if (exErr) throw exErr;
const existing = new Set((existingRows ?? []).map((r) => r.case_number));
console.log(`기존 상표 cases: ${existing.size}건 / 대상 주제 ${ONLY_TOPIC ?? "전체"}`);

// ── 실행 ──
let seq = 0;
let inserted = 0, skippedDb = 0, dupInBook = 0, imgOk = 0, imgFail = 0, nodeCreated = 0, nodeReused = 0;
const seen = new Set();
const failures = [];

for (const topic of data.topics) {
  const active = !ONLY_TOPIC || topic.no === ONLY_TOPIC;
  const parent = matchParent(topic.parentLabel);
  if (!parent) {
    console.log(`✗ 주제${topic.no} 부모 미매칭: ${topic.parentLabel}`);
    continue;
  }
  if (!active) {
    seq += topic.cases.length;
    continue;
  }

  // 주제 노드 (재사용 우선) — 라벨 = "주제N 제목" (2026-07-07 원장 지시)
  const topicLabel = `주제${topic.no} ${topic.title}`;
  let topicNode = nodes.find(
    (n) =>
      n.parent_id === parent.node_id &&
      (n.display_label === topicLabel || n.display_label === topic.title),
  );
  if (!topicNode && APPLY) {
    const { data: sibs } = await sb
      .from("systematic_nodes")
      .select("ord")
      .eq("parent_id", parent.node_id)
      .order("ord", { ascending: false })
      .limit(1);
    const ord = (sibs?.[0]?.ord ?? 0) + 1;
    const { data: created, error } = await sb
      .from("systematic_nodes")
      .insert({
        law_code: "trademark",
        parent_id: parent.node_id,
        path: `${parent.path}.b${ord}`,
        ord,
        display_label: topicLabel,
        case_display_label: topicLabel,
        case_only: true,
      })
      .select("node_id, parent_id, path, display_label, ord")
      .single();
    if (error) throw new Error(`주제${topic.no} 노드 생성: ${error.message}`);
    topicNode = created;
    nodes.push(created);
    nodeCreated++;
  } else if (topicNode) {
    nodeReused++;
  }
  console.log(
    `주제${topic.no} "${topic.title}" → ${parent.display_label}(${parent.path}) ${topicNode ? `[node ${topicNode.path}]` : "[dry-run: 생성 예정]"} 판례 ${topic.cases.length}건`,
  );

  for (const c of topic.cases) {
    seq++;
    if (existing.has(c.caseNumber)) {
      skippedDb++;
      continue;
    }
    if (seen.has(c.caseNumber)) {
      dupInBook++;
      console.log(`  ~ 중복 수록 skip: ${c.caseNumber} (주제${topic.no})`);
      continue;
    }
    seen.add(c.caseNumber);
    const court = COURT_MAP[c.court];
    if (!court) {
      failures.push({ caseNumber: c.caseNumber, reason: `법원 미매핑 ${c.court}` });
      continue;
    }
    if (!APPLY) continue;

    const issues = (c.sections.issues ?? []).map(stripNum).filter(Boolean);
    const summaryItems = issues.map((t) => ({ title: t.slice(0, 500), body: "" }));
    const commentMd = buildCommentMd(c);
    const caseType = c.caseName ?? null;
    const row = {
      subject_laws: ["trademark"],
      court,
      decided_at: c.decidedAt,
      case_number: c.caseNumber,
      case_title: summaryItems[0]?.title ?? caseType ?? c.caseNumber,
      case_type: caseType,
      nickname: c.nickname,
      is_en_banc: c.isEnBanc === true,
      importance: 1,
      summary_title: summaryItems[0]?.title ?? null,
      summary_body_md: null,
      summary_items: summaryItems,
      reasoning_md: buildReasoningMd(c),
      comment_body_md: commentMd,
      comment_source: commentMd ? COMMENT_SOURCE : null,
      primary_node_id: topicNode.node_id,
      source_seq: seq,
    };
    const { data: insertedRow, error } = await sb
      .from("cases")
      .insert(row)
      .select("case_id")
      .single();
    if (error) {
      failures.push({ caseNumber: c.caseNumber, reason: error.message });
      continue;
    }
    inserted++;

    // 이미지 업로드
    const imagesJson = [];
    for (let i = 0; i < c.images.length; i++) {
      const conv = await toWebp(c.images[i]);
      if (conv.error) {
        imgFail++;
        failures.push({ caseNumber: c.caseNumber, reason: `이미지 ${c.images[i]}: ${conv.error}` });
        continue;
      }
      const storagePath = `${insertedRow.case_id}/tm16-${c.images[i]}.webp`;
      const { error: upErr } = await sb.storage
        .from(IMAGE_BUCKET)
        .upload(storagePath, conv.buffer, { contentType: "image/webp", upsert: true });
      if (upErr) {
        imgFail++;
        failures.push({ caseNumber: c.caseNumber, reason: `이미지 업로드 ${c.images[i]}: ${upErr.message}` });
        continue;
      }
      const { data: pub } = sb.storage.from(IMAGE_BUCKET).getPublicUrl(storagePath);
      imagesJson.push({
        id: randomUUID(),
        url: pub.publicUrl,
        storagePath,
        mimeType: "image/webp",
        width: conv.width,
        height: conv.height,
        alt: "",
        position: "summary",
        sortOrder: i,
      });
      imgOk++;
    }
    if (imagesJson.length > 0) {
      const { error: imgErr } = await sb
        .from("cases")
        .update({ images: imagesJson })
        .eq("case_id", insertedRow.case_id);
      if (imgErr) failures.push({ caseNumber: c.caseNumber, reason: `images 갱신: ${imgErr.message}` });
    }
  }
}

console.log(`\n=== ${APPLY ? "적재" : "dry-run"} 완료 ===`);
console.log(
  `insert ${inserted} / DB중복 skip ${skippedDb} / 교재중복 skip ${dupInBook} / 노드 신규 ${nodeCreated}·재사용 ${nodeReused} / 이미지 ${imgOk}·실패 ${imgFail}`,
);
if (failures.length) {
  console.log(`실패 ${failures.length}건:`);
  for (const f of failures.slice(0, 20)) console.log(`  - ${f.caseNumber}: ${f.reason}`);
}
