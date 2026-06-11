// 단원(section) 자동 분류기: 각 문항 크롭을 OCR → 발문 키워드로 science_sections 분류.
// 과목(physics/chem/bio/earth)은 문항번호 블록(1-10/11-20/21-30/31-40)으로 결정,
// 그 안에서 단원을 키워드 최다매칭으로 배정. 출력 .ocr/sections-<tag>.json (검수용).
// JAGWA_TAG=<tag> node classify-sections.mjs   (크롭 .crops/<tag>/qNN.png 필요)
import fs from "node:fs";
import path from "node:path";
import { CROP_DIR, TAG } from "./data.mjs";

const { createWorker } = await import("tesseract.js");

// section code -> keyword list (발문에 자주 등장하는 토큰)
const KW = {
  // physics
  "phy.mech": ["운동", "속력", "속도", "가속도", "힘", "질량", "마찰", "회전", "각속도", "관성모멘트", "회전관성", "에너지", "일률", "운동량", "충돌", "원운동", "중력", "포물선", "진자", "탄성", "토크", "각운동량", "용수철"],
  "phy.thermo": ["비열", "열량", "열용량", "온도", "열역학", "엔트로피", "기체분자", "내부에너지", "단열", "팽창", "이상기체"],
  "phy.em": ["전류", "전압", "전하", "전기장", "자기장", "자기력", "저항", "축전기", "전기용량", "유도", "자속", "전위", "도선", "회로", "기전력", "전자기유도", "쿨롱", "옴", "유전율"],
  "phy.wave": ["파동", "빛", "진동수", "파장", "굴절", "간섭", "회절", "편광", "렌즈", "거울", "가시광", "도플러", "공명", "음파", "위상"],
  "phy.modern": ["광자", "광전", "광전효과", "전자", "양자", "드브로이", "물질파", "원자", "핵", "에너지준위", "퍼텐셜", "상대성", "반감기", "방사성", "흑체", "플랑크", "불확정성"],
  // chemistry
  "chem.atom": ["전자배치", "오비탈", "분자궤도", "혼성", "결합", "결정", "이성질체", "극성", "쌍극자", "공명", "루이스", "배위", "착이온", "단위세포", "결합차수", "전기음성도", "양자수"],
  "chem.gas": ["기체", "압력", "부피", "몰수", "용액", "농도", "증기압", "어는점", "끓는점", "분자량", "용해도", "삼투압", "몰랄", "몰분율", "분압", "확산", "속력분포"],
  "chem.reaction": ["평형", "평형상수", "반응속도", "반응차수", "촉매", "화학량론", "수득", "르샤틀리에", "활성화에너지"],
  "chem.acidbase": ["산", "염기", "ph", "중화", "산화", "환원", "산화수", "전지", "이온화상수", "완충", "해리", "전기분해", "표준환원전위"],
  "chem.thermo": ["엔탈피", "엔트로피", "깁스", "자유에너지", "열화학", "반응열", "생성열", "헤스", "자발"],
  "chem.organic": ["탄소", "유기", "고분자", "벤젠", "방향족", "작용기", "iupac", "중합", "알코올", "에스터", "케톤", "알데하이드", "탄화수소", "아민", "단백질합성"],
  // biology
  "bio.cell": ["세포", "소기관", "세포막", "효소", "atp", "미토콘드리아", "리보솜", "소포체", "골지", "리소좀", "세포호흡", "광합성", "세포분열", "세포사멸", "막수송", "삼투"],
  "bio.genetics": ["유전", "멘델", "염색체", "대립유전자", "복제", "전사", "번역", "돌연변이", "유전공학", "dna", "rna", "유전자", "표현형", "유전형", "교배", "연관", "프라이메이즈", "중합효소", "cdna", "재조합", "발현"],
  "bio.evolution": ["진화", "자연선택", "분류", "계통", "종분화", "유연관계", "화석기록", "유전적부동", "적응"],
  "bio.physiology": ["신경", "호르몬", "면역", "항체", "순환", "호흡", "소화", "근육", "항상성", "혈액", "적혈구", "림프구", "호중구", "뉴런", "신장", "내분비", "감각"],
  "bio.ecology": ["생태계", "개체군", "군집", "먹이", "영양단계", "에너지흐름", "물질순환", "천이", "생물다양성", "상호작용", "포식", "환경"],
  // earth
  "earth.geology": ["암석", "광물", "변성", "화성암", "퇴적", "지진", "지진파", "판구조", "지질시대", "화석", "단층", "습곡", "마그마", "조산", "해령", "해구", "발산경계", "수렴경계", "중생대", "고생대", "신생대"],
  "earth.atmosphere": ["대기", "기온", "기압", "바람", "전선", "구름", "강수", "복사", "오존", "성층권", "대류권", "열권", "단열감률", "이슬점", "기단", "푄", "역전층"],
  "earth.ocean": ["해류", "조석", "파도", "해수", "염분", "수온", "밀도류", "용승", "지형류", "해양판", "쿠로시오"],
  "earth.astro": ["태양", "행성", "별", "항성", "은하", "우주", "소행성", "위성", "궤도", "공전", "자전", "목성", "금성", "화성", "혜성", "성운", "적색거성", "흑점", "외계행성", "대기구성"],
  "earth.envchange": ["기후변화", "온난화", "엘니뇨", "빙하기", "환경변화", "탄소순환"],
};
const SUBJECT_SECTIONS = {
  physics: ["phy.mech", "phy.thermo", "phy.em", "phy.wave", "phy.modern"],
  chemistry: ["chem.atom", "chem.gas", "chem.reaction", "chem.acidbase", "chem.thermo", "chem.organic"],
  biology: ["bio.cell", "bio.genetics", "bio.evolution", "bio.physiology", "bio.ecology"],
  earth_science: ["earth.geology", "earth.atmosphere", "earth.ocean", "earth.astro", "earth.envchange"],
};
const subjectOf = (n) => (n <= 10 ? "physics" : n <= 20 ? "chemistry" : n <= 30 ? "biology" : "earth_science");

const worker = await createWorker("kor", 1, { logger: () => {} });
const out = {};
for (let n = 1; n <= 40; n++) {
  const file = path.join(CROP_DIR, `q${String(n).padStart(2, "0")}.png`);
  if (!fs.existsSync(file)) { out[n] = { section: null, note: "no crop" }; continue; }
  const r = await worker.recognize(file);
  const text = (r.data.text || "").toLowerCase().replace(/\s+/g, "");
  const subj = subjectOf(n);
  const scored = SUBJECT_SECTIONS[subj].map((code) => {
    let hits = 0; const matched = [];
    for (const kw of KW[code]) if (text.includes(kw.toLowerCase())) { hits++; matched.push(kw); }
    return { code, hits, matched };
  }).sort((a, b) => b.hits - a.hits);
  out[n] = { section: scored[0].hits > 0 ? scored[0].code : null, hits: scored[0].hits, top: scored.slice(0, 2).map((s) => `${s.code}:${s.hits}`), matched: scored[0].matched };
}
await worker.terminate();
fs.mkdirSync(path.join(import.meta.dirname, ".ocr"), { recursive: true });
fs.writeFileSync(path.join(import.meta.dirname, ".ocr", `sections-${TAG}.json`), JSON.stringify(out, null, 2));
const nullCount = Object.values(out).filter((v) => !v.section).length;
const lowConf = Object.entries(out).filter(([, v]) => v.section && v.hits === 1).map(([n]) => n);
console.log(`[${TAG}] classified ${40 - nullCount}/40  unclassified=[${Object.entries(out).filter(([, v]) => !v.section).map(([n]) => n).join(",")}]  lowconf(1hit)=[${lowConf.join(",")}]`);
