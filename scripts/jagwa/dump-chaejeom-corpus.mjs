import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const ROOT = "source/2차 채점평(2010~2017)";
const SUBJECT=[[/특허/,"특허법"],[/상표/,"상표법"],[/민소|민사소송/,"민사소송법"]];
const out=[];
for (const folder of readdirSync(ROOT)) {
  let entries; try { entries=readdirSync(join(ROOT,folder)); } catch { continue; }
  const rm=folder.match(/^(\d+)회/); if(!rm) continue;
  for (const f of entries) {
    if(!/\.(hwpx|hwtx)$/i.test(f)) continue;
    const subj=SUBJECT.find(s=>s[0].test(f)); const fm=f.match(/법\s*([AB])/);
    if(!subj||!fm) continue;
    const dir=mkdtempSync(join(tmpdir(),"cj-")); const jp=join(dir,"x.json");
    execFileSync("node",["scripts/hwpx-to-text.mjs",join(ROOT,folder,f),"-o",jp],{stdio:"ignore"});
    const j=JSON.parse(readFileSync(jp,"utf8"));
    const txt=(j.paragraphs||[]).map(p=>(p.text||"").replace(/\|\s*-{2,}\s*\|/g," ").replace(/\|/g," ").replace(/\s+/g," ").trim()).filter(t=>t&&!/^[\s|:\-]+$/.test(t)).join("\n");
    out.push(`\n\n===== ${rm[1]}회 ${subj[1]}${fm[1]} =====\n${txt}`);
  }
}
writeFileSync(process.argv[2], out.join("\n"), "utf8");
console.log("dumped", out.length, "files →", process.argv[2]);
