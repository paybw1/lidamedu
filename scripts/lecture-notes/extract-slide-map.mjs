import { readdirSync } from "node:fs";
import AdmZip from "adm-zip";

const DIR = "source/특허법 강의노트";
const files = readdirSync(DIR).filter(f => f.endsWith(".pptx") && !f.startsWith("~$")).sort();

const ART_RE = /제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/g;
const CASE_RE = /(\d{2,4}[가-힣]{1,3}\d{1,6}(?:\s*,\s*\d{2,4}[가-힣]{1,3}\d{1,6})*)/g;

function spBlocks(xml){
  const out=[]; const re=/<p:sp>([\s\S]*?)<\/p:sp>/g; let m;
  while((m=re.exec(xml))){
    const b=m[1];
    const ph=b.match(/<p:ph\b([^>]*)>/);
    const phType = ph ? (ph[1].match(/type="([^"]+)"/)?.[1] ?? "body") : null; // ph w/o type often body
    const texts=[]; const tr=/<a:t[^>]*>([^<]*)<\/a:t>/g; let tm;
    while((tm=tr.exec(b))) texts.push(tm[1].replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#10;/g," "));
    out.push({ phType, hasPh: !!ph, text: texts.join("").trim() });
  }
  return out;
}
function allText(xml){
  const texts=[]; const tr=/<a:t[^>]*>([^<]*)<\/a:t>/g; let tm;
  while((tm=tr.exec(xml))) texts.push(tm[1].replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">"));
  return texts.join(" ");
}
function sanitize(s){ return s.replace(/[\/:*?"<>|]/g," ").replace(/\s+/g," ").trim(); }

let grand=0, art=0, ref=0, other=0, withCase=0;
for(const f of files){
  const zip=new AdmZip(`${DIR}/${f}`);
  const slides=zip.getEntries().filter(e=>/ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
    .sort((a,b)=>parseInt(a.entryName.match(/slide(\d+)/)[1])-parseInt(b.entryName.match(/slide(\d+)/)[1]));
  console.log(`\n######## ${f}  (slides=${slides.length}) ########`);
  console.log(`idx  page  종류    조문        제목 / 사건번호 → 파일명`);
  for(let i=0;i<slides.length;i++){
    const xml=slides[i].getData().toString("utf-8");
    const sps=spBlocks(xml);
    const titleSp = sps.find(s=>s.phType==="title"||s.phType==="ctrTitle");
    const bodySp  = sps.find(s=>s.phType==="body" && s!==titleSp);
    const numSp   = sps.find(s=>s.phType==="sldNum");
    const jomun = (titleSp?.text ?? "").trim();
    const jemok = (bodySp?.text ?? "").trim();
    const page  = (numSp?.text ?? "").trim();
    const full = allText(xml);
    // 분류
    let kind="기타";
    if(/참고\s*노트/.test(jomun)) kind="참고노트";
    else if(ART_RE.test(jomun)) kind="조문";
    ART_RE.lastIndex=0;
    // 사건번호 — CASE STUDY 또는 대법원 인용 있을 때
    let cas="";
    if(/CASE\s*STUDY/i.test(full) || /선고/.test(full)){
      const cm = full.match(CASE_RE);
      if(cm) cas = cm.join(",");
    }
    if(kind==="조문") art++; else if(kind==="참고노트") ref++; else other++;
    if(cas) withCase++;
    grand++;
    let fname="";
    if(kind==="조문"){
      fname = sanitize(jomun) + (jemok?`_${sanitize(jemok)}`:"") + (cas?`_${sanitize(cas)}`:"") + ".pdf";
    } else if(kind==="참고노트"){
      fname = `[참고노트] ${sanitize(jemok||page||String(i+1))}.pdf`;
    } else {
      fname = `[기타] ${sanitize(jomun||jemok||"")||"슬라이드"+(i+1)}.pdf`;
    }
    const mark = kind==="조문"?"  ":kind==="참고노트"?"📘":"⚠️";
    console.log(`${String(i+1).padStart(3)} ${String(page).padStart(4)}  ${mark}${kind.padEnd(5)} ${jomun.slice(0,8).padEnd(8)} ${fname}`);
  }
}
console.log(`\n===== 합계 =====`);
console.log(`총 슬라이드 ${grand} | 조문 ${art} | 참고노트 ${ref} | 기타 ${other} | 사건번호 포함 ${withCase}`);
