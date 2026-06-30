// figonly 상단 잘림 수정 — recrop(발문+전체figure+선지일부)에서 "발문 아래 ~ 선지 위"
// figure 띠만 재크롭해 past-exam-figure 로 재업로드. 잘린 윗부분 복원.
//   미리보기:  node scripts/jagwa/refigure-from-recrop.mjs <key> <qNN>
//   적용:      node scripts/jagwa/refigure-from-recrop.mjs <key> <qNN> --apply
// 예: node scripts/jagwa/refigure-from-recrop.mjs 2025_physics q01
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { writeFileSync } from "node:fs";
import "dotenv/config";

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const BUCKET = "problem-images";
const key = process.argv[2]; // 2025_physics
const q = process.argv[3]; // q01
const APPLY = process.argv.includes("--apply");
const OUT = `${process.env.CLAUDE_JOB_DIR}/tmp`;

const recropPath = `past-exam-recrop/${key}/${q}.png`;
const figPath = `past-exam-figure/${key}/${q}.png`;

// 선지 상단 비율 — body_md 가 이 figonly URL 을 쓰는 문제의 problem_text_drafts 에서.
const figUrlLike = `%past-exam-figure/${key}/${q}.png%`;
const { data: ptd } = await supa
  .from("problems")
  .select("problem_id, problem_text_drafts(choice_top_frac)")
  .like("body_md", figUrlLike)
  .limit(1)
  .maybeSingle();
const choiceTopFrac =
  ptd?.problem_text_drafts?.[0]?.choice_top_frac ??
  ptd?.problem_text_drafts?.choice_top_frac ??
  null;

const dl = await supa.storage.from(BUCKET).download(recropPath);
if (dl.error) {
  console.error("recrop 없음:", recropPath, dl.error.message);
  process.exit(1);
}
const buf = Buffer.from(await dl.data.arrayBuffer());
const meta = await sharp(buf).metadata();
const W = meta.width,
  H = meta.height;
const { data: gray } = await sharp(buf)
  .grayscale()
  .raw()
  .toBuffer({ resolveWithObject: true });

const DARK = 130;
const rowDark = new Array(H).fill(0);
for (let y = 0; y < H; y++) {
  let c = 0;
  for (let x = 0; x < W; x++) if (gray[y * W + x] < DARK) c++;
  rowDark[y] = c;
}
const BLANK = Math.max(2, Math.round(W * 0.006)); // 빈 행 = dark < 0.6%W
const GAP = Math.max(10, Math.round(H * 0.03)); // 큰 빈틈 = 3%H 연속(줄간격보다 큼)

// 1) 발문/figure 경계 = 첫 텍스트 블록 뒤의 첫 큰 빈틈 하단(발문 줄간격은 GAP 미만이라 안 걸림).
let figureTop = 0;
{
  let sawText = false,
    run = 0;
  for (let i = 0; i < H; i++) {
    const blank = rowDark[i] < BLANK;
    if (!blank) sawText = true;
    if (sawText && blank) {
      run++;
      if (run >= GAP) {
        figureTop = i + 1;
        break;
      }
    } else run = 0;
  }
}
// 2) figure/선지 경계 = 저장된 choice_top_frac 우선(신뢰), 없으면 아래에서 큰 빈틈.
let figureBot = H;
if (choiceTopFrac != null) {
  figureBot = Math.round(choiceTopFrac * H);
} else {
  let sawInk = false,
    run = 0;
  for (let i = H - 1; i > figureTop; i--) {
    const blank = rowDark[i] < BLANK;
    if (!blank) sawInk = true;
    if (sawInk && blank) {
      run++;
      if (run >= GAP) {
        figureBot = i + run;
        break;
      }
    } else run = 0;
  }
}
console.log(`choice_top_frac=${choiceTopFrac}`);
// 수동 top 오버라이드(--top=0.19) — 발문 줄간격 오검출 회피용.
const topArg = process.argv.find((a) => a.startsWith("--top="));
if (topArg) figureTop = Math.round(parseFloat(topArg.split("=")[1]) * H);
// 안전 여백.
const padTop = Math.round(H * 0.01);
const top = Math.max(0, figureTop - padTop);
// 하단은 choice_top_frac 경계 그대로(선지행 안 들어오게 +pad 안 함).
const bottom = Math.min(H, figureBot);
const cropH = bottom - top;
console.log(`recrop ${W}x${H}  figureTop=${figureTop} figureBot=${figureBot}`);
console.log(`crop: top=${top} h=${cropH} (${((top / H) * 100).toFixed(1)}% ~ ${((bottom / H) * 100).toFixed(1)}%)`);

const cropped = await sharp(buf)
  .extract({ left: 0, top, width: W, height: cropH })
  .png()
  .toBuffer();

const preview = `${OUT}/refig_${key}_${q}_preview.png`;
writeFileSync(preview, cropped);
console.log(`미리보기: ${preview}`);

if (APPLY) {
  // 백업: 현재 figonly 를 _bak 으로.
  const cur = await supa.storage.from(BUCKET).download(figPath);
  if (!cur.error) {
    const bak = Buffer.from(await cur.data.arrayBuffer());
    await supa.storage
      .from(BUCKET)
      .upload(`past-exam-figure/_bak_topfix/${key}/${q}.png`, bak, {
        upsert: true,
        contentType: "image/png",
      });
    console.log("백업 완료");
  }
  const up = await supa.storage
    .from(BUCKET)
    .upload(figPath, cropped, { upsert: true, contentType: "image/png" });
  if (up.error) {
    console.error("업로드 실패:", up.error.message);
    process.exit(1);
  }
  console.log(`적용 완료 → ${figPath}`);
}
process.exit(0);
