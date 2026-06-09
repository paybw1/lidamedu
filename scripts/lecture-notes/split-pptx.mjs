// PPTX 강의노트 → 슬라이드별 1장 PDF 분할.
//   ① sldNum(페이지번호) shape 제거 → 편집 pptx
//   ② LibreOffice headless 로 PDF 변환
//   ③ 슬라이드별 1페이지 PDF 분할 + 명명({조문}_{제목}[_사건번호1개])
//   분류: 조문 / 참고노트 / 기타 폴더. manifest.csv 출력.
// 사용: node scripts/lecture-notes/split-pptx.mjs --file "1. 총칙 및 보칙_특허법 강의노트.pptx"
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import AdmZip from "adm-zip";
import { PDFDocument } from "pdf-lib";

const ROOT = process.cwd();
const SOFFICE = "C:/Program Files/LibreOffice/program/soffice.exe";
const LO_PROFILE = "file:///C:/project/lidamedu/tmp/lo_profile";
const args = process.argv.slice(2);
const fileArg = (() => { const i = args.indexOf("--file"); return i>=0?args[i+1]:"1. 총칙 및 보칙_특허법 강의노트.pptx"; })();
const SRC = resolve(ROOT, "source/특허법 강의노트", fileArg);
const OUT = resolve(ROOT, "tmp/lecture-notes/out");
const TMP = resolve(ROOT, "tmp/lecture-notes/work");

const ART_RE = /제\s*\d+\s*조(?:\s*의\s*\d+)?/;
const CASE_RE = /(\d{2,4}\s*[가-힣]{1,3}\s*\d{1,6})/g;

function sanitize(s){ return s.replace(/[\/:*?"<>|]/g," ").replace(/\s+/g," ").trim().slice(0,120); }
function spList(xml){
  const out=[]; const re=/<p:sp>([\s\S]*?)<\/p:sp>/g; let m;
  while((m=re.exec(xml))){
    const b=m[1];
    const ph=b.match(/<p:ph\b([^>]*)>/);
    const phType = ph ? (ph[1].match(/type="([^"]+)"/)?.[1] ?? "body") : null;
    const tr=/<a:t[^>]*>([^<]*)<\/a:t>/g; let tm; let s="";
    while((tm=tr.exec(b))) s+=tm[1].replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">");
    out.push({ phType, text:s.trim() });
  }
  return out;
}
function meta(xml){
  const sps=spList(xml);
  const title=sps.find(s=>s.phType==="title"||s.phType==="ctrTitle");
  const body=sps.find(s=>s.phType==="body" && s!==title);
  const jomun=(title?.text??"").trim();
  const jemok=(body?.text??"").trim();
  const joined=sps.map(s=>s.text).join(" ");
  let kind="기타";
  if(/참고\s*노트/.test(jomun)) kind="참고노트";
  else if(ART_RE.test(jomun)) kind="조문";
  let cas=""; let caseCount=0;
  if(/CASE|선고|판결|대법원/i.test(joined)){
    const cm=joined.match(CASE_RE);
    if(cm){ const uniq=[...new Set(cm.map(x=>x.replace(/\s+/g,"")))]; caseCount=uniq.length; if(uniq.length===1) cas=uniq[0]; }
  }
  return { jomun, jemok, kind, cas, caseCount };
}

const zip=new AdmZip(SRC);
const slideEntries=zip.getEntries().filter(e=>/ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
  .sort((a,b)=>parseInt(a.entryName.match(/slide(\d+)/)[1])-parseInt(b.entryName.match(/slide(\d+)/)[1]));
console.log(`[info] ${fileArg} slides=${slideEntries.length}`);

// 메타 수집 + sldNum 제거
const metas=[];
for(const e of slideEntries){
  const xml=e.getData().toString("utf-8");
  metas.push(meta(xml));
  const cleaned=xml.replace(/<p:sp>[\s\S]*?<\/p:sp>/g, blk=>/type="sldNum"/.test(blk)?"":blk);
  zip.updateFile(e.entryName, Buffer.from(cleaned,"utf-8"));
}
if(existsSync(TMP)) rmSync(TMP,{recursive:true,force:true});
mkdirSync(TMP,{recursive:true});
const editedPptx=resolve(TMP,"edited.pptx");
zip.writeZip(editedPptx);
console.log(`[info] 편집 pptx(페이지번호 제거): ${editedPptx}`);

// LibreOffice 변환
console.log(`[info] LibreOffice 변환 중...`);
execFileSync(SOFFICE, ["--headless","--norestore",`-env:UserInstallation=${LO_PROFILE}`,"--convert-to","pdf","--outdir",TMP,editedPptx],
  { stdio:"inherit", timeout:300000, env:{...process.env} });
const pdfPath=resolve(TMP,"edited.pdf");
if(!existsSync(pdfPath)){ console.error("[error] 변환 PDF 없음"); process.exit(1); }

const bytes=readFileSync(pdfPath);
const src=await PDFDocument.load(bytes,{ignoreEncryption:true});
console.log(`[info] PDF 페이지=${src.getPageCount()} (슬라이드=${slideEntries.length})`);

if(existsSync(OUT)) rmSync(OUT,{recursive:true,force:true});
for(const d of ["조문","참고노트","기타"]) mkdirSync(resolve(OUT,d),{recursive:true});
const used=new Set();
function uniqueName(dir,base){
  let n=base, i=2;
  while(used.has(dir+"/"+n)){ n=base.replace(/\.pdf$/,"")+` (${i})`+".pdf"; i++; }
  used.add(dir+"/"+n); return n;
}
const manifest=[["slide","kind","조문","제목","사건번호(개수)","파일명"].join(",")];
let cnt={조문:0,참고노트:0,기타:0};
for(let i=0;i<metas.length;i++){
  const m=metas[i]; const dir=m.kind;
  let base;
  if(m.kind==="조문") base=sanitize(m.jomun)+(m.jemok?`_${sanitize(m.jemok)}`:"")+(m.cas?`_${m.cas}`:"")+".pdf";
  else if(m.kind==="참고노트") base=`[참고노트] ${sanitize(m.jemok||("슬라이드"+(i+1)))}.pdf`;
  else base=`[기타] 슬라이드${i+1}.pdf`;
  const name=uniqueName(dir,base);
  const out=await PDFDocument.create();
  const [pg]=await out.copyPages(src,[i]);
  out.addPage(pg);
  writeFileSync(resolve(OUT,dir,name), await out.save());
  cnt[dir]++;
  manifest.push([i+1,m.kind,`"${m.jomun}"`,`"${m.jemok}"`,`${m.cas||""}(${m.caseCount})`,`"${name}"`].join(","));
}
writeFileSync(resolve(OUT,"manifest.csv"), manifest.join("\n"),"utf-8");
console.log(`[done] 조문=${cnt.조문} 참고노트=${cnt.참고노트} 기타=${cnt.기타} → ${OUT}`);
