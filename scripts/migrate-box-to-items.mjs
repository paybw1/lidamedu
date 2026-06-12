// 박스형(mc_box) 문제의 body_md 안 보기(ㄱ.ㄴ.ㄷ.)를 problem_box_items 로 이관.
//   → 기존 박스 렌더 UI(테두리 박스 + 정답공개 시 항목별 O/X derive)가 그대로 적용됨. body_md=발문만.
// 멱등: box_items 가 이미 있는 문제는 스킵. 기본 dry-run, --apply 로 반영.
//   (민법 등 seed 가 body_md 에 보기를 넣는 과목용 후처리 단계. 재시드 후 재실행 안전.)
// 파싱: 마커 경계(ㄱ/ㄴ/ㄷ + 마침표|쉼표)로 분할(줄 위치 무관) + 마커별 dedup(첫 항목 유지).
import { config } from "dotenv";
config({ path: "C:/project/lidamedu/.env" });
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes("--apply");

const FIRST = /[ㄱㄴㄷㄹㅁㅂㅅㅇ㈎㈏㈐㈑㈒㈓㉠㉡㉢㉣㉤]\s*[.,.．]\s/;
const SPLIT = /(?=[ㄱㄴㄷㄹㅁㅂㅅㅇ㈎㈏㈐㈑㈒㈓㉠㉡㉢㉣㉤]\s*[.,.．])/;
const ITEM = /^([ㄱㄴㄷㄹㅁㅂㅅㅇ㈎㈏㈐㈑㈒㈓㉠㉡㉢㉣㉤])\s*[.,.．]\s*([\s\S]+)$/;
function parse(bodyMd){
  const fm = String(bodyMd||"").search(FIRST);
  if (fm < 0) return null;
  const question = bodyMd.slice(0, fm).trim();
  const seen = new Set(); const items = [];
  for (const part of bodyMd.slice(fm).split(SPLIT)) {
    const m = part.match(ITEM); if (!m) continue;
    const marker=m[1], body=m[2].replace(/\s+/g," ").trim();
    if (seen.has(marker) || !body) continue;
    seen.add(marker); items.push({ marker, body });
  }
  return { question, items };
}

let all=[];for(let f=0;;f+=1000){const{data}=await sb.from("problems").select("problem_id,year,problem_number,body_md").eq("format","mc_box").is("deleted_at",null).range(f,f+999);all=all.concat(data);if(data.length<1000)break;}
const ids=all.map(p=>p.problem_id);const has={};
for(let i=0;i<ids.length;i+=200){const{data}=await sb.from("problem_box_items").select("problem_id").in("problem_id",ids.slice(i,i+200));for(const b of data)has[b.problem_id]=1;}
const targets=all.filter(p=>!has[p.problem_id]);
console.log("box_items 없는 mc_box:",targets.length);

let ok=0; const skip=[];
for(const p of targets){
  const r=parse(p.body_md);
  if(!r||r.items.length<2){skip.push(`${p.year}#${p.problem_number}`);continue;}
  ok++;
  if(APPLY){
    const rows=r.items.map((it,k)=>({problem_id:p.problem_id,position_index:k+1,marker:it.marker,body_md:it.body}));
    const {error:ie}=await sb.from("problem_box_items").insert(rows);
    if(ie){console.log(`${p.year}#${p.problem_number} err ${ie.message}`);continue;}
    await sb.from("problems").update({body_md:r.question,updated_at:new Date().toISOString()}).eq("problem_id",p.problem_id);
  }
}
console.log(`${APPLY?"[APPLIED]":"[DRY-RUN]"} 이관대상 ${ok} / 보기없음(스킵) ${skip.length}`);
if(skip.length)console.log("스킵:",skip.join(" "));
