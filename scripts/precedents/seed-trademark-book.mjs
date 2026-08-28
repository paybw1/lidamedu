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
import { createClient } from "@supabase/supabase-js";
import { IMAGE_BUCKET, openBook, storagePathFor } from "./lib-tm-images.mjs";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const APPLY = process.argv.includes("--apply");
const TOPIC_ARG = process.argv.map((a) => /^--topic=(\d+)$/.exec(a)).find(Boolean);
const ONLY_TOPIC = TOPIC_ARG ? +TOPIC_ARG[1] : null;

const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const data = JSON.parse(
  readFileSync(resolve(ROOT, argOf("--json", "source/_converted/tm-precedents.json")), "utf8"),
);
const book = openBook(
  resolve(
    ROOT,
    argOf("--hwpx", "source/상표법/상표법 판례(제16판)/[완0825+내지] 리담상표법 판례 (제16판).hwpx"),
  ),
);
const { hashOf, toWebp } = book;

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
const COMMENT_SOURCE = "리담상표법 판례 [제16판]";

// ── 체계도 노드 매칭 ──
const { data: nodes, error: nErr } = await sb
  .from("systematic_nodes")
  .select("node_id, parent_id, path, display_label, ord, case_only")
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
// ★제16판(0825) 신설 주제 둘은 교재에 부모 체계도 라벨이 없다. 규칙 4(임의 배치 금지)에 따라
//   여기서 명시한다 — 둘 다 이미 있는 노드로 들어간다(원장 승인 2026-08-28).
const TOPIC_PARENT_OVERRIDE = new Map([
  ["특유표장", "13 기타"],
  ["상표 외의 권리", "10 상표 외의 권리"],
]);

// 기존 주제 노드 색인 — 제목(번호 뗀 것)으로 찾는다.
const titleKey = (s) => String(s ?? "").replace(/^주제\s*\d+\s*/, "").replace(/\s+/g, "");
const topicNodeByTitle = new Map();
for (const n of nodes) {
  if (!n.case_only) continue;
  if (!/^주제\s*\d+\s/.test(n.display_label)) continue; // "13 기타" 같은 상위 컨테이너 제외
  const k = titleKey(n.display_label);
  if (!topicNodeByTitle.has(k)) topicNodeByTitle.set(k, n);
}

function matchParent(label) {
  const hits = byLabel.get(normLabel(label)) ?? [];
  if (hits.length === 0) return null;
  // 동일 라벨 다중(L2/L3) → 가장 깊은 노드 (조문 리프)
  return [...hits].sort((a, b) => String(b.path).length - String(a.path).length)[0];
}

// ── md 조립 ──
// 파서 위치 마커(⟦IMG:binId⟧/⟦TBL⟧)는 검색용 미러(md)에서 제거 — 렌더는 book_sections 가 담당.
// ★밑줄 마커도 벗긴다 — 미러(목록 제목·검색 tsv·요지)는 글자만 담는다.
//   렌더용 밑줄은 book_sections 안에만 있다(규칙 1).
const stripMarkers = (s) =>
  s.replace(/⟦IMG:[^⟧]*⟧/g, "").replace(/⟦TBL⟧/g, "").replace(/<\/?u>/g, "");
const stripNum = (s) => stripMarkers(s).replace(/^\[\d+\]\s*/, "").replace(/^\(\d+\)\s*/, "").trim();
const mdEscapeCell = (s) => stripMarkers(s).replace(/\|/g, "\\|").replace(/\n/g, "<br>");
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
    if (sec[key]?.length) body.push(stripMarkers(sec[key].join("\n\n")));
    body.push(...tbl(key));
    if (body.length) parts.push(`### ${label}\n\n${body.join("\n\n")}`);
  }
  return parts.length ? stripMarkers(parts.join("\n\n")) : null;
}
function buildCommentMd(c) {
  const parts = [];
  if (c.sections.comment?.length) parts.push(stripMarkers(c.sections.comment.join("\n\n")));
  if (c.sections.index?.length) parts.push(`**[Index]** ${stripMarkers(c.sections.index.join(" / "))}`);
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
  const parent = matchParent(topic.parentLabel ?? TOPIC_PARENT_OVERRIDE.get(topic.title));
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
  // ★판본이 바뀌면 주제 번호가 밀린다(구 주제40 권리범위확인심판 → 신 주제39).
  //   번호까지 붙여 라벨로 비교하면 매번 새 노드가 생기고 판례는 옛 노드에 남는다.
  //   그래서 **제목이 같으면 같은 주제**로 보고 라벨만 새 번호로 고친다.
  // ★부모까지 같은지는 보지 않는다 — 최초 적재 뒤 체계도에서 손으로 더 깊이 옮겨 둔 주제가
  //   여럿이라(주제21 은 교재 라벨상 b2.b2.b1 인데 실제로는 b2.b2.b1.b5 에 있다),
  //   부모를 조건에 넣으면 그 손보정을 무시하고 노드를 새로 만든다.
  let topicNode = topicNodeByTitle.get(titleKey(topic.title)) ?? null;
  if (topicNode && topicNode.display_label !== topicLabel) {
    console.log(`  ↻ 주제 노드 라벨 갱신: "${topicNode.display_label}" → "${topicLabel}"`);
    if (APPLY) {
      const { error } = await sb
        .from("systematic_nodes")
        .update({ display_label: topicLabel, case_display_label: topicLabel })
        .eq("node_id", topicNode.node_id);
      if (error) throw new Error(`주제${topic.no} 라벨 갱신: ${error.message}`);
      topicNode.display_label = topicLabel;
    }
  }
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
      .select("node_id, parent_id, path, display_label, ord, case_only")
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
      const storagePath = storagePathFor(insertedRow.case_id, hashOf(c.images[i]));
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
