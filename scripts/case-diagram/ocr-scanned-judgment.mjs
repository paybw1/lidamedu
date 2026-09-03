// 스캔(이미지) 판결문 PDF → 텍스트. 법령정보센터에 텍스트 판본이 없어 법원 PDF 만
// 가진 판례가 있고, 그 PDF 가 이미지 스캔본이면 추출 텍스트가 0자다. 도식 생성기는
// 원문을 읽어야 하므로 이런 건은 통째로 건너뛰어 왔다 — 이 스크립트가 그 문턱을 넘는다.
//
// ★OCR 결과는 법령정보센터 원문이 아니다. 저장할 때 반드시 유래를 남긴다(--apply 가 머리말 삽입).
// ★사건번호·날짜·숫자는 OCR 오독이 가장 잘 생기는 자리다 — 저장 전 식별 필드를 대조한다.
//
//   node scripts/case-diagram/ocr-scanned-judgment.mjs --pdf tmp/ocr/x.pdf --out tmp/ocr/x.md
//   node scripts/case-diagram/ocr-scanned-judgment.mjs --pdf ... --out ... --from 1 --to 3
import "dotenv/config";
import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
// ★렌더러는 mupdf 다 — pdfjs 는 법원 스캔본이 쓰는 JBIG2 를 wasm 없이 못 풀어
//   빈 페이지를 그린다(경고만 내고 실패하지 않아 조용히 백지를 OCR 하게 된다).
import * as mupdf from "mupdf";

const argv = process.argv.slice(2);
const argOf = (k) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : undefined;
};
const PDF = argOf("--pdf");
const OUT = argOf("--out");
const SCALE = Number(argOf("--scale") ?? 2.2);
if (!PDF || !OUT) {
  console.error("사용: --pdf <파일> --out <파일.md> [--from N --to M] [--scale 2.2]");
  process.exit(1);
}

const MODEL = "claude-opus-4-7";
const COST = { inputPerM: 5.0, outputPerM: 25.0 };
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 판독한 것만 적게 한다. 판결문은 한 글자가 결론을 바꾸므로 매끄럽게 다듬는 것보다
// 안 보이는 걸 안 보인다고 하는 쪽이 낫다.
const SYSTEM = `당신은 대한민국 법원 판결문 스캔 이미지를 텍스트로 옮기는 작업을 합니다.

규칙:
- 페이지에 **실제로 보이는 글자만** 옮깁니다. 문맥으로 추측해 채우지 않습니다.
- 흐리거나 잘려 판독할 수 없는 부분은 그 자리에 [판독불가] 라고 적습니다.
- 사건번호·날짜·금액·특허번호·조문번호 등 **숫자는 특히 주의**해서 옮깁니다.
  확신이 서지 않는 숫자는 [판독불가] 로 두고 임의로 채우지 않습니다.
- 원문의 문단 구분과 항목 번호(1., 가., (1), ①)를 그대로 유지합니다.
- 표는 마크다운 표로 옮깁니다. 도면·서명·직인은 [도면] [서명] [직인] 으로 표시합니다.
- 쪽번호·머리말은 옮기지 않습니다.
- 설명·요약·해설을 덧붙이지 않습니다. 옮긴 텍스트만 출력합니다.`;

const doc = mupdf.Document.openDocument(fs.readFileSync(PDF), "application/pdf");
const pageCount = doc.countPages();
const FROM = Number(argOf("--from") ?? 1);
const TO = Math.min(Number(argOf("--to") ?? pageCount), pageCount);

let spentIn = 0;
let spentOut = 0;
const pages = [];

for (let i = FROM; i <= TO; i++) {
  const pix = doc
    .loadPage(i - 1)
    .toPixmap(mupdf.Matrix.scale(SCALE, SCALE), mupdf.ColorSpace.DeviceRGB, false, true);
  const b64 = Buffer.from(pix.asPNG()).toString("base64");

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: b64 } },
          {
            type: "text",
            text: `판결문 ${i}쪽입니다. 보이는 글자를 그대로 옮겨 주세요.`,
          },
        ],
      },
    ],
  });
  spentIn += res.usage?.input_tokens ?? 0;
  spentOut += res.usage?.output_tokens ?? 0;
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  pages.push(text);
  const unreadable = (text.match(/\[판독불가\]/g) ?? []).length;
  console.log(
    `  ${String(i).padStart(2)}쪽  ${String(text.length).padStart(5)}자` +
      (unreadable ? `  판독불가 ${unreadable}곳` : ""),
  );
}

const body = pages.join("\n\n");
fs.writeFileSync(OUT, body, "utf8");
const cost = (spentIn / 1e6) * COST.inputPerM + (spentOut / 1e6) * COST.outputPerM;
console.log(
  `\n${OUT} — ${TO - FROM + 1}쪽 · ${body.length.toLocaleString()}자 · $${cost.toFixed(2)}`,
);
