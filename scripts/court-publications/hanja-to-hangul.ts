// 법원간행물 통합 목록의 한자를 한글로 — 저자명·논문 제목.
//
// ★한자→한글은 1:1 이 아니다. 不(부/불) · 樂(락/악/요) · 金(김/금) 처럼 갈리는 글자가 있고,
//   한자어는 두음법칙을 탄다(類似=유사, 立證=입증, 利害=이해). 그래서
//   ① 글자 음가표 ② 낱말 단위 예외 ③ 두음법칙 을 순서대로 적용하고,
//   ④ 만든 결과를 **검증**한다 — 저자명은 총목록(한글 명부)과 같은 파일에 이미 한글로
//      들어 있는 이름들에 대조하고, 확인 안 되는 이름은 목록으로 남긴다.
//
// ★쓰기는 sharedStrings.xml 의 텍스트 노드만 갈아 끼운다. 시트가 3개라
//   writeSheet(공유문자열을 비운다)를 쓰면 나머지 두 시트가 통째로 깨진다.
//
//   npx tsx scripts/court-publications/hanja-to-hangul.ts          # dry-run
//   npx tsx scripts/court-publications/hanja-to-hangul.ts --apply
import { copyFileSync, existsSync } from "node:fs";

import AdmZip from "adm-zip";

import { parseHaeseolIndex } from "./parse-haeseol-index";
import { readSheet, sheetNames } from "./xlsx-io";

const FILE = "source/법원간행물/법원간행물(통합_list).xlsx";
const BACKUP = "source/법원간행물/법원간행물(통합_list).한자원본.xlsx";
const APPLY = process.argv.includes("--apply");

// ★리터럴로 쓰면 편집·인코딩을 거치며 범위 끝점이 바뀐다(豈 U+F900 이 U+8C48 로 들어가
//   한글 전체를 잡은 적 있음). 코드포인트로 못 박는다.
const HAN = new RegExp("[\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF]", "u");
const HAN_G = new RegExp("[\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF]+", "gu");

/** 글자 음가 — 이 파일에 실제로 나오는 382자. 두음법칙 전(前) 본음으로 적는다. */
const CHAR: Record<string, string> = {
  一: "일", 上: "상", 不: "불", 世: "세", 丘: "구", 中: "중", 主: "주", 事: "사",
  云: "운", 京: "경", 人: "인", 他: "타", 代: "대", 件: "건", 任: "임", 似: "사",
  位: "위", 作: "작", 使: "사", 例: "례", 侵: "침", 係: "계", 促: "촉", 俊: "준",
  保: "보", 信: "신", 價: "가", 償: "상", 元: "원", 先: "선", 光: "광", 全: "전",
  公: "공", 再: "재", 出: "출", 分: "분", 判: "판", 別: "별", 利: "리", 制: "제",
  則: "칙", 前: "전", 割: "할", 劃: "획", 力: "력", 加: "가", 助: "조", 勘: "감",
  務: "무", 勳: "훈", 包: "포", 匠: "장", 區: "구", 千: "천", 協: "협", 南: "남",
  博: "박", 却: "각", 原: "원", 參: "참", 反: "반", 取: "취", 可: "가", 合: "합",
  同: "동", 名: "명", 否: "부", 含: "함", 吳: "오", 告: "고", 周: "주", 品: "품",
  商: "상", 問: "문", 善: "선", 喜: "희", 器: "기", 國: "국", 圍: "위", 圖: "도",
  團: "단", 土: "토", 圭: "규", 地: "지", 均: "균", 基: "기", 士: "사", 大: "대",
  夫: "부", 失: "실", 奇: "기", 奎: "규", 姓: "성", 姜: "강", 娥: "아", 媛: "원",
  孫: "손", 學: "학", 宇: "우", 完: "완", 宗: "종", 官: "관", 定: "정", 害: "해",
  容: "용", 寄: "기", 密: "밀", 察: "찰", 實: "실", 審: "심", 小: "소", 尹: "윤",
  岷: "민", 布: "포", 希: "희", 師: "사", 度: "도", 廳: "청", 引: "인", 弘: "홍",
  張: "장", 形: "형", 役: "역", 徐: "서", 從: "종", 微: "미", 心: "심", 性: "성",
  恩: "은", 患: "환", 情: "정", 惠: "혜", 意: "의", 態: "태", 憲: "헌", 應: "응",
  成: "성", 手: "수", 承: "승", 抗: "항", 抵: "저", 拒: "거", 指: "지", 揆: "규",
  損: "손", 擊: "격", 擬: "의", 改: "개", 攻: "공", 故: "고", 效: "효", 敏: "민",
  敬: "경", 整: "정", 文: "문", 斗: "두", 新: "신", 斷: "단", 方: "방", 旨: "지",
  旭: "욱", 旻: "민", 昊: "호", 昌: "창", 明: "명", 昶: "창", 時: "시", 晟: "성",
  晳: "석", 智: "지", 暎: "영", 更: "경", 書: "서", 曺: "조", 會: "회", 有: "유",
  朴: "박", 李: "리", 東: "동", 柱: "주", 柳: "류", 査: "사", 校: "교", 根: "근",
  格: "격", 案: "안", 棄: "기", 植: "식", 業: "업", 極: "극", 榮: "영", 樂: "락",
  標: "표", 權: "권", 次: "차", 欺: "기", 欽: "흠", 止: "지", 正: "정", 步: "보",
  段: "단", 比: "비", 永: "영", 求: "구", 汶: "문", 決: "결", 沈: "심", 河: "하",
  治: "치", 法: "법", 注: "주", 泰: "태", 泳: "영", 洙: "수", 洛: "락", 浚: "준",
  浩: "호", 消: "소", 淏: "호", 混: "혼", 準: "준", 滅: "멸", 漢: "한", 澈: "철",
  澤: "택", 炯: "형", 炳: "병", 烈: "렬", 無: "무", 煥: "환", 熙: "희", 燁: "엽",
  營: "영", 燮: "섭", 爭: "쟁", 物: "물", 特: "특", 玄: "현", 玘: "기", 珩: "형",
  現: "현", 理: "리", 生: "생", 産: "산", 用: "용", 田: "전", 由: "유", 申: "신",
  當: "당", 登: "등", 發: "발", 的: "적", 益: "익", 相: "상", 瞞: "만", 知: "지",
  硏: "연", 確: "확", 示: "시", 禁: "금", 福: "복", 禦: "어", 秀: "수", 秘: "비",
  種: "종", 積: "적", 究: "구", 立: "립", 章: "장", 競: "경", 符: "부", 等: "등",
  策: "책", 箕: "기", 算: "산", 節: "절", 範: "범", 籍: "적", 細: "세", 絶: "절",
  經: "경", 編: "편", 繼: "계", 美: "미", 翰: "한", 翼: "익", 考: "고", 者: "자",
  聖: "성", 聯: "련", 職: "직", 自: "자", 與: "여", 興: "흥", 舊: "구", 芮: "예",
  英: "영", 著: "저", 蘭: "란", 處: "처", 號: "호", 術: "술", 表: "표", 補: "보",
  裝: "장", 製: "제", 複: "복", 要: "요", 規: "규", 解: "해", 觸: "촉", 言: "언",
  訂: "정", 託: "탁", 記: "기", 訟: "송", 許: "허", 訴: "소", 評: "평", 認: "인",
  誤: "오", 請: "청", 論: "론", 諸: "제", 證: "증", 識: "식", 議: "의", 護: "호",
  變: "변", 讚: "찬", 貞: "정", 財: "재", 販: "판", 貫: "관", 責: "책", 賠: "배",
  趙: "조", 較: "교", 輯: "집", 辛: "신", 述: "술", 追: "추", 途: "도", 連: "련",
  進: "진", 過: "과", 適: "적", 部: "부", 郭: "곽", 鄭: "정", 醫: "의", 釋: "석",
  重: "중", 金: "김", 錄: "록", 錫: "석", 鍵: "건", 鍾: "종", 鎬: "호", 鎭: "진",
  鐵: "철", 關: "관", 防: "방", 限: "한", 院: "원", 雄: "웅", 雨: "우", 需: "수",
  面: "면", 韓: "한", 項: "항", 頒: "반", 題: "제", 額: "액", 願: "원", 類: "류",
  顯: "현", 體: "체", 黃: "황", 點: "점", 龍: "룡", 龜: "구",
};

/**
 * 낱말 예외 — 글자 음가표만으로는 못 맞추는 것들.
 * ★不 은 뒤 글자 첫소리가 ㄷ·ㅈ 이면 "부", 아니면 "불"(不正=부정 / 不法=불법).
 *   아래는 이 파일에 실제로 나오는 조합만 적는다.
 */
const WORD: Array<[string, string]> = [
  ["不正競爭防止法", "부정경쟁방지법"],
  ["不正競爭", "부정경쟁"],
  ["不當", "부당"],
  ["不服", "불복"],
  ["不法", "불법"],
  // ★識 은 식/지 두 음이다 — 標識 는 "표지"(식별표지·상품표지), 識別 은 "식별".
  ["標識", "표지"],
  // ★성(姓)은 여기서 바꾸지 않는다 — 낱말 치환을 먼저 하면 한자 덩어리가 잘려
  //   이름 안 자리(성/이름 첫 글자)가 어긋난다(金英蘭 이 "김영난" 이 됐다). CHAR 로 처리.
];

/** 두음법칙 — 한자어 첫머리에서 ㄹ·ㄴ 이 바뀐다(類似=유사, 立證=입증, 利害=이해). */
const HEAD: Record<string, string> = {
  라: "나", 락: "낙", 란: "난", 람: "남", 랑: "낭", 래: "내", 랭: "냉",
  로: "노", 록: "녹", 론: "논", 롱: "농", 뢰: "뇌", 료: "요", 루: "누", 류: "유",
  륙: "육", 륜: "윤", 률: "율", 륭: "융", 르: "느", 름: "늠", 릉: "능", 리: "이",
  린: "인", 림: "임", 립: "입", 량: "양", 려: "여", 력: "역", 련: "연", 렬: "열",
  렴: "염", 령: "영", 례: "예", 로도: "노도", 룡: "용", 륭: "융",
  녀: "여", 년: "연", 념: "염", 뇨: "요", 뉴: "유", 니: "이",
};

/**
 * 사람 이름인가 — 순수 한자 2~4자. 이름은 **성 + 이름**이라 두음법칙이 두 번 걸린다
 * (張樂元 = 장낙원 · 朴龍奎 = 박용규). 제목에서는 그러면 안 되므로 구분한다.
 */
const isPersonalName = (s: string) =>
  new RegExp("^[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]{2,4}$", "u").test(s);

/** 모음이나 ㄴ 받침 뒤의 렬·률 → 열·율 (한글 맞춤법 제11항 붙임). 全元烈 = 전원열. */
function fixRyeol(prev: string, syl: string): string {
  if (syl !== "렬" && syl !== "률") return syl;
  if (!prev) return syl;
  const code = prev.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return syl;
  const jong = code % 28; // 0=받침 없음(모음으로 끝), 4=ㄴ
  if (jong === 0 || jong === 4) return syl === "렬" ? "열" : "율";
  return syl;
}

/** 한자 덩어리 하나를 한글로. name 이면 이름 규칙(성/이름 각각 두음)을 쓴다. */
function convertRun(run: string, name: boolean): string {
  let out = "";
  for (let i = 0; i < run.length; i++) {
    const ch = run[i];
    let syl = CHAR[ch];
    if (!syl) return ""; // 모르는 글자가 있으면 이 덩어리는 손대지 않는다
    if (ch === "不") {
      const nextSyl = CHAR[run[i + 1] ?? ""] ?? "";
      syl = /^[다-딯자-짛]/.test(nextSyl) ? "부" : "불";
    }
    // 두음법칙 — 낱말 첫머리. 이름은 성 다음(=이름 첫 글자)에도 건다.
    if (i === 0 || (name && i === 1)) syl = HEAD[syl] ?? syl;
    else syl = fixRyeol(out.slice(-1), syl);
    out += syl;
  }
  return out;
}

export function hanjaToHangul(text: string): string {
  const name = isPersonalName(text.trim());
  let s = text;
  for (const [k, v] of WORD) s = s.split(k).join(v);
  const converted = s.replace(HAN_G, (run) => {
    const conv = convertRun(run, name);
    return conv || run;
  });
  // ★"제명(題名)" 처럼 앞말을 한자로 병기한 괄호는 바꾸고 나면 "제명(제명)" 이 된다.
  //   읽기가 앞말과 같으면 괄호째 뺀다(실측 8곳, 읽기가 다른 경우는 0곳이었다).
  return converted.replace(/([가-힣]+)\s*[(（]\1[)）]/g, "$1");
}

// ── 실행 ─────────────────────────────────────────────────────────────
// ★모듈로 불러 쓰는 곳(미리보기 등)이 있으므로, 직접 실행일 때만 돌린다.
async function main(): Promise<void> {
  // ── 실행 ────────────────────────────────────────────────────────────────
  const zip = new AdmZip(FILE);
  const ssXml = zip.readAsText("xl/sharedStrings.xml");

  // 검증 명부 — 총목록(한글 저자) + 이 파일에 이미 한글로 있는 저자.
  const { entries } = await parseHaeseolIndex();
  const roster = new Set(entries.map((e) => e.author));
  for (const s of sheetNames(zip)) {
    const rows = readSheet(zip, s.entry);
    const ai = (rows[0] ?? []).findIndex((h) => h === "저자");
    if (ai < 0) continue;
    for (let r = 1; r < rows.length; r++) {
      const v = (rows[r][ai] ?? "").trim();
      if (v && !HAN.test(v)) roster.add(v);
    }
  }

  // 한자 저자 목록(검증 대상)
  const hanAuthors = new Set<string>();
  for (const s of sheetNames(zip)) {
    const rows = readSheet(zip, s.entry);
    const ai = (rows[0] ?? []).findIndex((h) => h === "저자");
    if (ai < 0) continue;
    for (let r = 1; r < rows.length; r++) {
      const v = (rows[r][ai] ?? "").trim();
      if (v && HAN.test(v)) hanAuthors.add(v);
    }
  }

  const ok: string[] = [];
  const unverified: string[] = [];
  for (const name of hanAuthors) {
    const ko = hanjaToHangul(name);
    if (HAN.test(ko)) unverified.push(`${name} → (음가표에 없는 글자)`);
    else if (roster.has(ko)) ok.push(`${name} → ${ko}`);
    else unverified.push(`${name} → ${ko}`);
  }
  console.log(`저자 ${hanAuthors.size}명 — 명부 확인 ${ok.length} · 미확인 ${unverified.length}`);
  if (unverified.length) {
    console.log("\n[미확인] 명부(총목록 + 파일 내 한글 표기)에 없는 이름 — 사람이 확인:");
    for (const u of unverified) console.log("   ", u);
  }

  // 전체 문자열 변환 미리보기
  const items = [...ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)];
  let changed = 0;
  let leftover = 0;
  const samples: string[] = [];
  for (const m of items) {
    const text = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("");
    if (!HAN.test(text)) continue;
    const conv = hanjaToHangul(text);
    if (conv !== text) changed++;
    if (HAN.test(conv)) {
      leftover++;
      if (samples.length < 10) samples.push(`${text.slice(0, 50)} → ${conv.slice(0, 50)}`);
    }
  }
  console.log(`\n문자열 ${items.length} 중 한자 포함분 변환 ${changed} · 변환 후 한자 잔존 ${leftover}`);
  for (const s of samples) console.log("   !", s);

  if (!APPLY) {
    console.log("\n[dry-run] --apply 로 반영합니다.");
    process.exit(0);
  }
  // ★"미확인"은 명부에 없다는 뜻이지 틀렸다는 뜻이 아니다 — 사법논집·구판 해설 저자는
  //   지식재산권 총목록(검증 명부)에 애초에 없다. 목록으로 남겨 사람이 보게 하고 진행한다.
  //   음가표에 없는 글자가 있으면 그 덩어리는 한자로 남으므로 "한자 잔존" 으로 드러난다.

  if (!existsSync(BACKUP)) copyFileSync(FILE, BACKUP);
  // ★텍스트 노드 안쪽만 바꾼다 — 태그·구조는 그대로 둔다.
  const next = ssXml.replace(
    /(<t[^>]*>)([\s\S]*?)(<\/t>)/g,
    (_, open: string, body: string, close: string) => `${open}${hanjaToHangul(body)}${close}`,
  );
  zip.updateFile("xl/sharedStrings.xml", Buffer.from(next, "utf8"));
  zip.writeZip(FILE);
  console.log(`\n반영 완료 — 백업 ${BACKUP}`);

}

if (process.argv[1]?.includes("hanja-to-hangul")) await main();
