// Google Cloud Vision API — 한국어 손글씨 OCR.
// DOCUMENT_TEXT_DETECTION + languageHints=['ko','en'] 가 변리사 시험 답안지(한글+한자+영문 혼합)에 가장 적합.
// API 키 미설정 시 null 반환 → 호출 측에서 "검사 불가" 로 graceful degrade.
//
// 환경변수: GOOGLE_CLOUD_VISION_API_KEY (Vercel 환경변수 / .env)
//
// §2 비용 가드:
//   - cap 체크는 호출 측(route)이 담당 — 차단 시 본 함수는 호출되지 않고 route 가 skipped_cap 직접 기록.
//   - 본 함수는 성공/실패/키없음 outcome 을 gs_ai_usage 에 기록한다.

import { recordOcrUsage, type UsageMeta } from "~/features/gs/lib/usage-tracker.server";

export interface OcrResult {
  text: string; // 인식된 텍스트 전체 (5000자까지 저장 — 채점 AI 컨텍스트로 재사용 가능).
  charCount: number; // 인식된 총 문자 수 (공백 제외).
  koreanCharCount: number; // 한글 글자 수.
  confidence: number; // 평균 단어 신뢰도 (0~1).
  level: "good" | "warn" | "bad"; // 판독률 등급.
}

// 임계값.
//   good: 한글 ≥ 50 + confidence ≥ 0.75
//   warn: 한글 ≥ 15 + confidence ≥ 0.5
//   bad : 그 외
function gradeLevel(
  koreanCharCount: number,
  confidence: number,
): OcrResult["level"] {
  if (koreanCharCount >= 50 && confidence >= 0.75) return "good";
  if (koreanCharCount >= 15 && confidence >= 0.5) return "warn";
  return "bad";
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  // btoa 는 latin1 입력만 받으므로 byte → char 변환 (런타임 무관).
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + chunk, bytes.length)),
    );
  }
  return typeof btoa !== "undefined"
    ? btoa(binary)
    : Buffer.from(binary, "binary").toString("base64");
}

// 이미지 손글씨 OCR. PDF/지원하지 않는 mime 은 null.
// API 호출 실패(네트워크/쿼터 초과 등) 도 throw 하지 않고 null 반환 — 업로드 자체를 막지 않게.
export async function analyzeHandwriting(
  buffer: ArrayBuffer,
  mime: string,
  meta?: UsageMeta,
): Promise<OcrResult | null> {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!apiKey) {
    await recordOcrUsage({
      outcome: "skipped_no_key",
      meta,
      reason: "GOOGLE_CLOUD_VISION_API_KEY 미설정",
    });
    return null;
  }
  if (!mime.startsWith("image/")) return null; // 로깅 X — 정상 케이스 (PDF 업로드).

  let res: Response;
  try {
    res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content: arrayBufferToBase64(buffer) },
              features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
              imageContext: { languageHints: ["ko", "en"] },
            },
          ],
        }),
      },
    );
  } catch (e) {
    await recordOcrUsage({
      outcome: "failed",
      meta,
      reason:
        e instanceof Error ? `fetch: ${e.message}`.slice(0, 300) : "fetch error",
    });
    return null;
  }
  if (!res.ok) {
    await recordOcrUsage({
      outcome: "failed",
      meta,
      reason: `HTTP ${res.status}`,
    });
    return null;
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    await recordOcrUsage({ outcome: "failed", meta, reason: "json parse" });
    return null;
  }
  const annotation =
    (
      json as {
        responses?: Array<{
          fullTextAnnotation?: {
            text?: string;
            pages?: Array<{
              blocks?: Array<{
                paragraphs?: Array<{
                  words?: Array<{ confidence?: number }>;
                }>;
              }>;
            }>;
          };
        }>;
      }
    )?.responses?.[0]?.fullTextAnnotation ?? null;

  if (!annotation) {
    // 빈 이미지 — 인식된 텍스트 없음. 호출은 일어났으므로 success 기록.
    await recordOcrUsage({ outcome: "success", meta });
    return {
      text: "",
      charCount: 0,
      koreanCharCount: 0,
      confidence: 0,
      level: "bad",
    };
  }

  let confSum = 0;
  let confCount = 0;
  for (const page of annotation.pages ?? []) {
    for (const block of page.blocks ?? []) {
      for (const para of block.paragraphs ?? []) {
        for (const word of para.words ?? []) {
          if (typeof word.confidence === "number") {
            confSum += word.confidence;
            confCount += 1;
          }
        }
      }
    }
  }
  const confidence = confCount > 0 ? confSum / confCount : 0;
  const text = String(annotation.text ?? "").trim();
  // 한글 음절 + 자모 범위.
  const koreanMatches = text.match(/[가-힣ㄱ-ㆎ]/g);
  const koreanCharCount = koreanMatches ? koreanMatches.length : 0;
  const charCount = text.replace(/\s+/g, "").length;

  await recordOcrUsage({ outcome: "success", meta });
  return {
    text: text.slice(0, 5000),
    charCount,
    koreanCharCount,
    confidence: Math.round(confidence * 1000) / 1000,
    level: gradeLevel(koreanCharCount, confidence),
  };
}
