// 업로드된 판결 전문 PDF → `cases.official_text_md` 로 쓸 텍스트.
//
// ★추출기와 **판정 게이트를 한 곳에 묶어 둔다**. 예전엔 업로드 경로마다 게이트가 제각각이라
//   한쪽이 뺀 PDF 를 다른 쪽이 통과시켰다(판례 편집 화면 업로드는 아예 추출을 안 했다).
//   화면 업로드(admin/api/case.tsx)와 백필 스크립트가 모두 이 함수를 쓴다.

import {
  isBoilerplateOnly,
  SCRAMBLE_MAX,
  scrambleRatio,
} from "./lower-court-text";
import { extractPdfText } from "./pdf-extract.server";

/**
 * 이 아래면 표지만 읽힌 것으로 본다.
 * 실측: 대법원 판결문 중 가장 짧은 것이 1,600자(2024다228104, 3쪽).
 */
export const OFFICIAL_TEXT_MIN_CHARS = 800;

export interface OfficialTextExtraction {
  /** 게이트를 통과한 본문. 통과 못 하면 빈 문자열. */
  text: string;
  pageCount: number;
  /** 통과 못 한 이유(사람이 읽는 안내). 통과했으면 null. */
  warning: string | null;
}

export async function extractOfficialTextFromPdf(
  input: Uint8Array | Blob,
): Promise<OfficialTextExtraction> {
  const bytes =
    input instanceof Uint8Array
      ? input
      : new Uint8Array(await input.arrayBuffer());

  let text = "";
  let pageCount = 0;
  try {
    const r = await extractPdfText(bytes);
    text = r.text.trim();
    pageCount = r.pageCount;
  } catch (e) {
    return {
      text: "",
      pageCount: 0,
      warning: `텍스트 추출 오류: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (text.length < OFFICIAL_TEXT_MIN_CHARS) {
    return {
      text: "",
      pageCount,
      warning: `추출된 글자가 ${text.length}자뿐입니다 — 본문이 이미지인 스캔 PDF 로 보입니다(OCR 본문 필요). PDF 는 저장됐습니다.`,
    };
  }
  const ratio = scrambleRatio(text);
  if (ratio > SCRAMBLE_MAX) {
    return {
      text: "",
      pageCount,
      warning: `추출된 텍스트가 조각나 있습니다(비율 ${ratio.toFixed(2)}) — 원문 그대로 쓰면 날짜·번호가 어긋납니다. PDF 는 저장됐습니다.`,
    };
  }
  if (isBoilerplateOnly(text)) {
    return {
      text: "",
      pageCount,
      warning: "안내문만 있고 본문이 없습니다. PDF 는 저장됐습니다.",
    };
  }
  return { text, pageCount, warning: null };
}
