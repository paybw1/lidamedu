// 해설 마크다운 → HTML 공용 변환기(뷰어·교재 PDF 공용).
//
// ★CommonMark 의 flanking 규칙은 라틴 문자 기준이라 한국어에서 굵게가 자주 깨진다.
//   닫는 `**` 앞이 문장부호이고 뒤가 한글이면 닫는 표시로 인정되지 않기 때문이다.
//   예) `**「…어려움이 없다」**고` · `**본체부(D)**로` · `**필수구성요소**다`
//   → marked 에 넘기기 전에 우리가 직접 <strong> 으로 바꾼다. 이 문서군에서 `**` 는
//     굵게 외의 용도로 쓰이지 않으므로 안전하다.
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: false, mangle: false, headerIds: false });

// 여는 `**` 뒤는 공백이 아니고, 닫는 `**` 앞도 공백이 아니며, 본문은 빈 줄(문단 경계)을
// 넘지 않는다. 원문이 한 문장을 여러 줄로 접어 쓰므로 줄바꿈은 허용해야 한다.
const BOLD = /\*\*(?!\s)((?:[^*\n]|\n(?![ \t]*\n))+?)(?<!\s)\*\*/g;

// ★GFM 은 물결표 하나만으로도 취소선을 만든다(~text~). 이 문서군은 물결표를 오직
//   범위 표기(교재 347~380쪽, 法 34·35 등)에만 쓰므로, 홑물결표는 전부 문자 참조로
//   바꿔 취소선 해석을 막는다. 겹물결표(~~)는 그대로 두어 원래 뜻을 남긴다.
const fixTilde = (md) => md.replace(/(?<!~)~(?!~)/g, "&#126;");

const prep = (md) => fixTilde(md).replace(BOLD, "<strong>$1</strong>");

export const toHtml = (md) => marked.parse(prep(md));
export const toInlineHtml = (md) => marked.parseInline(prep(md));
