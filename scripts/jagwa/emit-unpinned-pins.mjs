// 미핀(body매칭 O, primary_node_id NULL) → 워크북 섹션 노드로 핀. cand=1만 자동, cand>1은 박스/선지 매칭.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import "dotenv/config";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const norm=(s)=>(s??"").replace(/\s+/g,"").trim();
const key=(s)=>norm(s).slice(0,36);
const sig=(arr)=>arr.map(b=>norm(b).slice(0,24)).sort().join("|");
const flat=(s)=>(s??"").replace(/\s+/g," ").trim();
const { data: nodes } = await sb.from("systematic_nodes").select("node_id, display_label").eq("law_code","patent");
const labelOf=Object.fromEntries(nodes.map(n=>[n.node_id,n.display_label]));
const byLabel={};for(const n of nodes)(byLabel[n.display_label]??=[]).push(n.node_id);
const dbP=[];
for(let f=0;;f+=1000){const{data}=await sb.from("problems").select("problem_id,problem_number,primary_node_id,body_md,laws!inner(law_code)").eq("laws.law_code","patent").is("deleted_at",null).range(f,f+999);if(!data?.length)break;dbP.push(...data);if(data.length<1000)break;}
const byKey={};for(const p of dbP)(byKey[key(p.body_md)]??=[]).push(p);
const load=(f)=>JSON.parse(readFileSync(`source/_converted/${f}`,"utf8")).problems??[];
const exp=load("expected-merged.json"), gi=load("problems-merged.json");
const sections={};
for(const p of gi){if(!p.section)continue;(sections[p.section]??={기출:[],예상:[]}).기출.push(p);}
for(const p of exp){if(!p.section)continue;(sections[p.section]??={기출:[],예상:[]}).예상.push(p);}

const auto=[], ambiguous=[];
for(const [section,g] of Object.entries(sections)){
  const ids=byLabel[section]; if(!ids||ids.length!==1)continue;
  const target=ids[0];
  for(const [grp,list] of [["기출",g.기출],["예상",g.예상]]) for(const wb of list){
    const cands=byKey[key(wb.stem||"")]??[];
    if(cands.length===0) continue;                       // 무매칭(별도)
    if(cands.some(c=>c.primary_node_id===target)) continue; // 이미 정확
    const unp=cands.filter(c=>!c.primary_node_id);
    if(unp.length===0) continue;                          // 오배치(미핀 아님, ①에서 처리)
    if(cands.length===1 && unp.length===1){
      auto.push({section,grp,num:wb.problemNumber,problem_id:unp[0].problem_id,target,stem:flat(wb.stem).slice(0,38)});
    }else{
      ambiguous.push({section,grp,num:wb.problemNumber,target,cands,wb});
    }
  }
}
console.log(`=== 미핀 자동핀(cand=1) ${auto.length}건 ===`);
for(const a of auto) console.log(`  [${a.section}] ${a.grp}#${a.num} ${a.problem_id.slice(0,8)} :: ${a.stem}`);
console.log(`\n=== cand>1 미핀(박스/선지 매칭 시도) ${ambiguous.length}건 ===`);
// 박스/선지 시그로 unpinned cand 중 진짜 식별
const resolved=[];
for(const m of ambiguous){
  const wbBox=(m.wb.boxItems||[]).map(b=>b.body), wbCh=(m.wb.choices||[]).map(c=>c.body);
  const ids=m.cands.map(c=>c.problem_id);
  const {data:bx}=await sb.from("problem_box_items").select("problem_id,body_md,position_index").in("problem_id",ids).order("position_index");
  const {data:ch}=await sb.from("problem_choices").select("problem_id,body_md,choice_index").in("problem_id",ids).order("choice_index");
  const boxBy={},chBy={};for(const b of (bx||[]))(boxBy[b.problem_id]??=[]).push(b.body_md);for(const c of (ch||[]))(chBy[c.problem_id]??=[]).push(c.body_md);
  const wbSig = wbBox.length? sig(wbBox) : (wbCh.length? sig(wbCh):null);
  let hit=null;
  for(const c of m.cands){
    if(c.primary_node_id) continue; // 미핀만 후보
    const s = wbBox.length? sig(boxBy[c.problem_id]||[]) : sig(chBy[c.problem_id]||[]);
    if(wbSig && s===wbSig) hit=c;
  }
  console.log(`  [${m.section}] ${m.grp}#${m.num} cand=${m.cands.length} 미핀${m.cands.filter(c=>!c.primary_node_id).length} → ${hit?`★${hit.problem_id.slice(0,8)}`:"매칭실패"}`);
  if(hit) resolved.push({section:m.section,grp:m.grp,num:m.num,problem_id:hit.problem_id,target:m.target,stem:flat(m.wb.stem).slice(0,38)});
}
const all=[...auto,...resolved];
const lines=["-- 미핀(body매칭 O, primary_node_id NULL) → 워크북 섹션 노드 핀. cand=1 자동 + cand>1 박스/선지 매칭분.","-- 롤백: 각 problem_id primary_node_id = NULL."];
for(const a of all) lines.push(`update problems set primary_node_id = '${a.target}', updated_at = now() where problem_id = '${a.problem_id}'; -- [${a.section}] ${a.grp}#${a.num}: NULL → "${a.section}"`);
writeFileSync("scripts/sql/_pin_unpinned_generated.sql", lines.join("\n")+"\n");
console.log(`\n✅ 총 ${all.length}건(자동 ${auto.length} + 매칭 ${resolved.length}) → scripts/sql/_pin_unpinned_generated.sql`);
