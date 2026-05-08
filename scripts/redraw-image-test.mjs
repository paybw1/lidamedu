// 단건 테스트 — 종합해설 그림 SVG 로 재그리기 → PNG 렌더 → Storage 업로드 → DB URL 치환.
// 대상 문제: d934d68d (image23, 국내우선권주장 timeline + 분할출원 표).
//
// 사용법:
//   node scripts/redraw-image-test.mjs              # dry-run (PNG 만 로컬 저장)
//   node scripts/redraw-image-test.mjs --apply      # Storage 업로드 + DB 업데이트

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import "dotenv/config";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("env 미설정");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});
const BUCKET = "problem-explanations";

const APPLY = process.argv.includes("--apply");
const TARGET_PROBLEM_ID = "d934d68d-66c1-40bc-82ff-c32ce510a8d4";
const OLD_OBJECT = "b9eea61ca62cf219bcf40e99bb3b988b.png";

// SVG: 1800x780, 색상 코딩 + 명확한 timeline + bracket + 표.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1800 780" font-family="'Malgun Gothic','Pretendard',system-ui,sans-serif">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="9" markerHeight="9" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="#0f172a"/>
    </marker>
  </defs>

  <!-- Application boxes -->
  <g>
    <!-- A -->
    <rect x="100" y="20" width="380" height="110" rx="14" fill="#dbeafe" stroke="#2563eb" stroke-width="2.5"/>
    <text x="290" y="62" font-size="24" font-weight="700" fill="#1e40af" text-anchor="middle">특허출원 A</text>
    <text x="290" y="100" font-size="20" fill="#1e3a8a" text-anchor="middle">발명 X</text>

    <!-- B -->
    <rect x="650" y="20" width="600" height="110" rx="14" fill="#dcfce7" stroke="#16a34a" stroke-width="2.5"/>
    <text x="950" y="62" font-size="24" font-weight="700" fill="#14532d" text-anchor="middle">특허출원 B  ·  국내우선권주장</text>
    <text x="950" y="100" font-size="20" fill="#14532d" text-anchor="middle">발명 X, Y</text>

    <!-- C -->
    <rect x="1320" y="20" width="380" height="110" rx="14" fill="#ffedd5" stroke="#ea580c" stroke-width="2.5"/>
    <text x="1510" y="62" font-size="24" font-weight="700" fill="#9a3412" text-anchor="middle">특허출원 C</text>
    <text x="1510" y="100" font-size="18" fill="#7c2d12" text-anchor="middle">B 의 일부 발명을 분할 / 별도 출원</text>
  </g>

  <!-- Connector lines from boxes to timeline -->
  <g stroke="#475569" stroke-width="2" fill="none" stroke-dasharray="0">
    <path d="M290,130 L290,225"/>
    <path d="M950,130 L950,225"/>
    <path d="M1510,130 L1510,225"/>
  </g>

  <!-- Timeline axis -->
  <g>
    <line x1="80" y1="240" x2="1720" y2="240" stroke="#0f172a" stroke-width="3" marker-end="url(#arrow)"/>
    <circle cx="290" cy="240" r="9" fill="#2563eb" stroke="#1e40af" stroke-width="2"/>
    <circle cx="950" cy="240" r="9" fill="#16a34a" stroke="#15803d" stroke-width="2"/>
    <circle cx="1510" cy="240" r="9" fill="#ea580c" stroke="#9a3412" stroke-width="2"/>
  </g>

  <!-- Time period brackets -->
  <g stroke="#64748b" stroke-width="2" fill="none">
    <!-- 3개월 (A→B) -->
    <path d="M290,275 v18 H950 v-18"/>
    <!-- 12개월 (A→C) -->
    <path d="M290,355 v18 H1510 v-18"/>
  </g>
  <text x="620" y="320" font-size="22" fill="#334155" text-anchor="middle" font-weight="700">3개월</text>
  <text x="900" y="400" font-size="22" fill="#334155" text-anchor="middle" font-weight="700">12개월</text>

  <!-- Table -->
  <g transform="translate(80, 460)">
    <!-- Header row -->
    <rect x="0" y="0" width="1640" height="60" fill="#0f172a"/>
    <text x="190" y="40" font-size="22" font-weight="700" fill="#ffffff" text-anchor="middle">구분</text>
    <text x="590" y="40" font-size="22" font-weight="700" fill="#ffffff" text-anchor="middle">국내우선권주장</text>
    <text x="1010" y="40" font-size="22" font-weight="700" fill="#ffffff" text-anchor="middle">출원공개</text>
    <text x="1430" y="40" font-size="22" font-weight="700" fill="#ffffff" text-anchor="middle">심사청구</text>
    <line x1="380" y1="0" x2="380" y2="60" stroke="#334155" stroke-width="1"/>
    <line x1="800" y1="0" x2="800" y2="60" stroke="#334155" stroke-width="1"/>
    <line x1="1220" y1="0" x2="1220" y2="60" stroke="#334155" stroke-width="1"/>

    <!-- Row 1: 분할출원인 경우 -->
    <rect x="0" y="60" width="1640" height="70" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>
    <line x1="380" y1="60" x2="380" y2="130" stroke="#cbd5e1" stroke-width="1.5"/>
    <line x1="800" y1="60" x2="800" y2="130" stroke="#cbd5e1" stroke-width="1.5"/>
    <line x1="1220" y1="60" x2="1220" y2="130" stroke="#cbd5e1" stroke-width="1.5"/>
    <text x="190" y="103" font-size="20" fill="#0f172a" text-anchor="middle" font-weight="600">C 가 분할출원인 경우</text>
    <text x="590" y="103" font-size="20" fill="#15803d" text-anchor="middle" font-weight="700">자동주장간주</text>
    <text x="1010" y="103" font-size="20" fill="#0f172a" text-anchor="middle">A 출원일로부터 1년 6개월</text>
    <text x="1430" y="103" font-size="20" fill="#0f172a" text-anchor="middle">B 출원일로부터 3년</text>

    <!-- Row 2: 분할출원 아닌 경우 -->
    <rect x="0" y="130" width="1640" height="70" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5"/>
    <line x1="380" y1="130" x2="380" y2="200" stroke="#cbd5e1" stroke-width="1.5"/>
    <line x1="800" y1="130" x2="800" y2="200" stroke="#cbd5e1" stroke-width="1.5"/>
    <line x1="1220" y1="130" x2="1220" y2="200" stroke="#cbd5e1" stroke-width="1.5"/>
    <text x="190" y="173" font-size="20" fill="#0f172a" text-anchor="middle" font-weight="600">C 가 분할출원이 아닌 경우</text>
    <text x="590" y="173" font-size="20" fill="#b91c1c" text-anchor="middle" font-weight="700">불가</text>
    <text x="1010" y="173" font-size="20" fill="#0f172a" text-anchor="middle">C 출원일로부터 1년 6개월</text>
    <text x="1430" y="173" font-size="20" fill="#0f172a" text-anchor="middle">C 출원일로부터 3년</text>
  </g>
</svg>`;

// SVG → PNG (고해상도, density 2x).
const png = await sharp(Buffer.from(svg), { density: 200 })
  .png({ compressionLevel: 9 })
  .toBuffer();

const previewDir = "source/_converted/redrawn";
if (!existsSync(previewDir)) mkdirSync(previewDir, { recursive: true });
writeFileSync(`${previewDir}/image23-redrawn.svg`, svg);
writeFileSync(`${previewDir}/image23-redrawn.png`, png);

const meta = await sharp(png).metadata();
console.log(`PNG ${meta.width}x${meta.height}, ${png.length} bytes`);
console.log(`local preview: ${previewDir}/image23-redrawn.png`);

if (!APPLY) {
  console.log("dry-run — 이미지만 로컬 저장. --apply 로 Storage + DB 업데이트.");
  process.exit(0);
}

// Storage 업로드.
const newHash = createHash("sha256").update(png).digest("hex").slice(0, 32);
const newObject = `${newHash}.png`;
const newUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${newObject}`;
const oldUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${OLD_OBJECT}`;

const { error: upErr } = await supa.storage.from(BUCKET).upload(newObject, png, {
  contentType: "image/png",
  upsert: false,
});
if (upErr && !/already exists|duplicate/i.test(upErr.message)) {
  console.error(`upload 실패: ${upErr.message}`);
  process.exit(1);
}
console.log(`uploaded: ${newObject}`);

// DB 업데이트.
const { data: prob, error: qErr } = await supa
  .from("problems")
  .select("explanation_md")
  .eq("problem_id", TARGET_PROBLEM_ID)
  .single();
if (qErr || !prob) {
  console.error(`problem 조회 실패: ${qErr?.message}`);
  process.exit(1);
}
const before = prob.explanation_md ?? "";
const after = before.replaceAll(oldUrl, newUrl);
if (before === after) {
  console.warn("DB explanation_md 안에 oldUrl 없음 — 이미 다른 URL 로 교체됐을 수 있음.");
} else {
  const { error: uErr } = await supa
    .from("problems")
    .update({ explanation_md: after })
    .eq("problem_id", TARGET_PROBLEM_ID);
  if (uErr) {
    console.error(`update 실패: ${uErr.message}`);
    process.exit(1);
  }
  console.log(`DB 업데이트 완료: ${TARGET_PROBLEM_ID}`);
}
console.log(`new URL: ${newUrl}`);
