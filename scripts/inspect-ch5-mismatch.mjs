// chapter 5 의 ±1 mismatch sections 4개를 직접 비교 — 어느 problemNumber 가 빠지는지/추가되는지.
import { readFileSync } from "node:fs";

const probDoc = JSON.parse(readFileSync("source/_converted/problem.json", "utf8"));
const ansDoc = JSON.parse(readFileSync("source/_converted/answer.json", "utf8"));

const NAME_ONLY = /^[가-힣][가-힣\s,·]*$/;
const HINT_ONLY = /^[\d①-⑳의\s,\-Ⅰ-Ⅴ()발진법]+$/;
const ANSWER_HEADER_RE = /^(\d{2})\s*([①②③④⑤])\s*$/;
const PROBLEM_RE = /^(\d{2})\s*['’]\s*(\d{2})\s*(변형|모의|예상)?\s*(단원|종합)?(.*)$/;
const PROBLEM_SPLIT_RE = /^(\d)\s*['’]\s*(\d{2})\s*(변형|모의|예상)?\s*(단원|종합)?\s*(\d)\s*(.*)$/;

function compactLines(p) { const o=[]; for (let i=0;i<p.length;i++){const t=(p[i].text??'').trim(); if (t) o.push({idx:i,text:t});} return o; }
function isCh(t){ const m=t.match(/^제(\d+)장(?:\s+(.+))?$/); if (m) return parseInt(m[1],10); const m2=t.match(/제(\d+)장/); if (m2 && /[•·]/.test(t)) return parseInt(m2[1],10); return null; }
function chRange(lines, target){let s=-1,e=lines.length,bh=false;for(let i=0;i<lines.length;i++){const t=lines[i].text;if (/문\s*[•·]\s*제\s*[•·]\s*편/.test(t)||/정답\s*및\s*해설/.test(t)) bh=true;if (!bh) continue;const c=isCh(t);if (c===target && s===-1) s=i;else if (c!=null&&c!==target&&s!==-1){e=i;break;}}return [s,e];}

function tryTri(lines, i, markerRe){
  if (i+2>=lines.length) return null;
  const a=lines[i].text,b=lines[i+1].text,c=lines[i+2].text;
  if (!NAME_ONLY.test(b)) return null;
  if (!HINT_ONLY.test(c)) return null;
  const exp=b.replace(/\s+/g,"")+c.replace(/\s+/g,"");
  if (!a.replace(/\s+/g,"").startsWith(exp.slice(0,Math.min(exp.length,8)))) return null;
  for (let k=i+3;k<Math.min(i+8,lines.length);k++) if (markerRe.test(lines[k].text)) return {name:b,hint:c,nextIdx:i+3};
  return null;
}

function parseProb(lines, range){
  const [s,e]=range; const sections=[]; let cur=null; let i=s+1;
  while (i<e){
    const t=lines[i].text;
    if (isCh(t)!=null){i++;continue;}
    const tri=tryTri(lines,i,/^\d{2}\s*['’]\s*\d{2}|^\d\s*['’]\s*\d{2}/);
    if (tri){cur={name:tri.name,hint:tri.hint,problems:[]};sections.push(cur);i=tri.nextIdx;continue;}
    let m=t.match(PROBLEM_RE), num=null, year=null, stem=null;
    if (m){num=parseInt(m[1],10);const yy=parseInt(m[2],10);year=yy>=50?1900+yy:2000+yy;stem=(m[5]??"").trim();}
    else if ((m=t.match(PROBLEM_SPLIT_RE))){num=parseInt(m[1]+m[5],10);const yy=parseInt(m[2],10);year=yy>=50?1900+yy:2000+yy;stem=(m[6]??"").trim();}
    if (num!=null && stem && stem.length>5 && cur){cur.problems.push({n:num,year,stem,line:lines[i].idx});}
    i++;
  }
  return sections;
}
function parseAns(lines, range){
  const [s,e]=range; const sections=[]; let cur=null; let i=s+1;
  while (i<e){
    const t=lines[i].text;
    if (isCh(t)!=null){i++;continue;}
    const tri=tryTri(lines,i,/^\d{2}\s*[①②③④⑤]\s*$/);
    if (tri){cur={name:tri.name,hint:tri.hint,answers:[]};sections.push(cur);i=tri.nextIdx;continue;}
    const ah=t.match(ANSWER_HEADER_RE);
    if (ah && cur){cur.answers.push({n:parseInt(ah[1],10),correct:"①②③④⑤".indexOf(ah[2])+1,line:lines[i].idx});}
    i++;
  }
  return sections;
}

const probLines=compactLines(probDoc.paragraphs);
const ansLines=compactLines(ansDoc.paragraphs);
const probSecs=parseProb(probLines, chRange(probLines, 5));
const ansSecs=parseAns(ansLines, chRange(ansLines, 5));

const TARGETS=["이용저촉발명","침해의 종류","침해에 대한 조치","강제실시권"];
for (const target of TARGETS){
  const ps=probSecs.find(s=>s.name===target);
  const as=ansSecs.find(s=>s.name===target);
  console.log(`\n=== ${target} ===`);
  console.log(`  PROB: ${ps?.problems.length ?? 0}  ${ps?.problems.map(p=>p.n).join(",") ?? ""}`);
  console.log(`  ANS:  ${as?.answers.length ?? 0}  ${as?.answers.map(a=>a.n).join(",") ?? ""}`);
  // diff
  const probNs=new Set(ps?.problems.map(p=>p.n) ?? []);
  const ansNs=new Set(as?.answers.map(a=>a.n) ?? []);
  const onlyProb=[...probNs].filter(n=>!ansNs.has(n));
  const onlyAns=[...ansNs].filter(n=>!probNs.has(n));
  if (onlyProb.length) console.log(`  PROB만: ${onlyProb.join(",")}`);
  if (onlyAns.length) console.log(`  ANS만:  ${onlyAns.join(",")}`);
  // 의심되는 problemNumber 위치 체크.
  if (onlyProb.length) {
    for (const n of onlyProb){
      const p=ps.problems.find(x=>x.n===n);
      if (p) console.log(`    PROB#${n} (line ${p.line}): "${p.stem.slice(0,80)}"`);
    }
  }
  if (onlyAns.length){
    for (const n of onlyAns){
      const a=as.answers.find(x=>x.n===n);
      if (a) console.log(`    ANS#${n} (line ${a.line}) correct=${a.correct}`);
    }
  }
}
