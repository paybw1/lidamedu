// 도표 255문항 그림-only 크롭 작업목록. 입력=.recrop/{key}_q{NN}.png, 출력=.figonly/{key}_q{NN}.png
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { existsSync, mkdirSync, writeFileSync } from "fs";
config({ path: "C:/project/lidamedu/.env" });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

let drafts=[];
for(let from=0;;from+=1000){
  const {data}=await sb.from("problem_text_drafts")
    .select("problem_id,stem_md,has_figure,status").eq("has_figure",true).range(from,from+999);
  drafts=drafts.concat(data); if(data.length<1000)break;
}
const pids=drafts.map(d=>d.problem_id);
const meta={};
for(let i=0;i<pids.length;i+=300){
  const {data}=await sb.from("problems").select("problem_id,year,science_subject,problem_number").in("problem_id",pids.slice(i,i+300));
  for(const p of data) meta[p.problem_id]=p;
}
mkdirSync("C:/project/lidamedu/scripts/jagwa/.figonly",{recursive:true});
const RC="scripts/jagwa/.recrop/", FO="scripts/jagwa/.figonly/";
let missing=0;
const items=drafts.map(d=>{
  const m=meta[d.problem_id]||{};
  const key=`${m.year}_${m.science_subject}`;
  const nn=String(m.problem_number).padStart(2,"0");
  const recrop=`${RC}${key}_q${nn}.png`;
  const out=`${FO}${key}_q${nn}.png`;
  const exists=existsSync("C:/project/lidamedu/"+recrop);
  if(!exists) missing++;
  return { problem_id:d.problem_id, year:m.year, subject:m.science_subject, number:m.problem_number,
           key, nn, recrop, out, exists };
}).filter(x=>x.exists)
  .sort((a,b)=> (a.subject<b.subject?-1:a.subject>b.subject?1:0) || a.year-b.year || a.number-b.number);

// chunk into batches of 10
const SIZE=10, batches=[];
for(let i=0;i<items.length;i+=SIZE) batches.push(items.slice(i,i+SIZE));
writeFileSync("C:/project/lidamedu/scripts/jagwa/.figonly/_worklist.json", JSON.stringify({items,batches},null,0));
console.log("figure problems:", drafts.length, "| local recrop missing:", missing, "| worklist items:", items.length);
console.log("batches:", batches.length, "(size",SIZE+")");
const bySubj={}; for(const it of items) bySubj[it.subject]=(bySubj[it.subject]||0)+1;
console.log("by subject:", JSON.stringify(bySubj));
