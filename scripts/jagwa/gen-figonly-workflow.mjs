import { readFileSync, writeFileSync } from "fs";
const wl = JSON.parse(readFileSync("C:/project/lidamedu/scripts/jagwa/.figonly/_worklist.json","utf8"));
const batches = wl.batches.map(b => b.map(it => ({
  label: `${it.year}_${it.subject}_${it.number}`, src: it.recrop, out: it.out,
})));
const SCHEMA = {
  type:"object", additionalProperties:false,
  properties:{ results:{ type:"array", items:{ type:"object", additionalProperties:false,
    properties:{ label:{type:"string"}, ok:{type:"boolean"}, note:{type:"string"} },
    required:["label","ok","note"] } } },
  required:["results"],
};
const PROMPT_HEAD = [
  "너는 한국 변리사 1차 자연과학 기출의 '도표 문제' 이미지를 크롭한다.",
  "입력 PNG는 [발문 텍스트 + 그림] 으로 구성되며 선지(①~⑤)는 이미 제거돼 있다.",
  "발문 텍스트는 이미 별도로 텍스트로 저장돼 있으니, 너의 임무는 이미지를 '그림(도식/그래프/회로/가계도/모식도/표그림)만' 남도록 잘라내는 것이다.",
  "",
  "[제거] 한국어 문장 = 발문 설명문, 서브질문('…옳은 것은?','…고른 것은?'), <보기> 박스(ㄱ/ㄴ/ㄷ 항목).",
  "[유지] 그림 자체 + 그림의 일부인 텍스트(축 이름 '높이/변위/색지수', 범례, 데이터 값, 패널명 (가)(나), 단위).",
  "",
  "각 문항을 다음 절차로 처리한다(리포지토리 루트에서 실행):",
  "1) Read 도구로 입력 이미지(src)를 보고 레이아웃을 파악한다(발문이 위에만 있는지, 발문->그림->서브질문으로 감싸는지, <보기>가 아래 있는지).",
  "2) 크롭 실행: node scripts/jagwa/figcrop-band.mjs <src> <topFrac> <botFrac> <out>",
  "   - topFrac/botFrac 은 0~1 (이미지 높이 비율). 그림은 보통 중간~하단에 있다.",
  "   - 발문이 위에만 있으면 topFrac 만 올린다(botFrac=1.0). 감싸는 경우 topFrac/botFrac 둘 다 잡아 가운데 그림 밴드만 남긴다.",
  "3) Read 로 out 을 보고 검증한다: 그림만 남고 문장/<보기>가 없어야 하며, 그림이 잘리지 않아야 한다.",
  "4) 문장/<보기>가 남았거나 그림이 잘렸으면 topFrac/botFrac 을 조정해 다시 실행한다. 깨끗해질 때까지 반복.",
  "5) 만족스러우면 그 out 파일이 최종본이다(헬퍼가 저장함).",
  "6) 그림을 깨끗이 분리할 수 없으면(텍스트가 그림 관통/복수 그림과 텍스트 분리불가) ok=false 로 표시한다(가능하면 그림 위주로라도 저장).",
  "",
  "대상 (src -> out):",
];
const PROMPT_TAIL = [
  "",
  "주의: 한 문항당 최대 4회 크롭. 경계는 약간 여유(그림 살짝 더 포함)가 잘림보다 낫다.",
  "각 문항 결과를 results 배열로 반환: {label, ok(그림만 깨끗이 분리 성공), note(조정요약 또는 실패사유)}.",
];
const NL = "\n";
const lines = [];
lines.push("export const meta = {");
lines.push("  name: 'science-figure-only',");
lines.push("  description: '자과 도표 255문항: 재크롭에서 그림만 분리 추출(자가검증 비전 크롭)',");
lines.push("  phases: [{ title: 'FigureCrop', detail: '배치별 그림-only 크롭(자가검증)' }],");
lines.push("}");
lines.push("const NL = String.fromCharCode(10);");
lines.push("const BATCHES = " + JSON.stringify(batches) + ";");
lines.push("const SCHEMA = " + JSON.stringify(SCHEMA) + ";");
lines.push("const HEAD = " + JSON.stringify(PROMPT_HEAD.join(NL)) + ";");
lines.push("const TAIL = " + JSON.stringify(PROMPT_TAIL.join(NL)) + ";");
lines.push("function buildPrompt(items){");
lines.push("  const list = items.map(function(it){ return '- ' + it.label + ': src=' + it.src + '  out=' + it.out; }).join(NL);");
lines.push("  return HEAD + NL + list + NL + TAIL;");
lines.push("}");
lines.push("phase('FigureCrop')");
lines.push("log('그림-only 크롭 시작: ' + BATCHES.length + '배치 / ' + BATCHES.reduce(function(a,b){return a+b.length;},0) + '문항')");
lines.push("const out = await parallel(BATCHES.map(function(b,bi){ return function(){ return agent(buildPrompt(b), {label:'fig:b'+bi, phase:'FigureCrop', schema:SCHEMA}); }; }))");
lines.push("const ok = out.filter(Boolean)");
lines.push("const flat = []");
lines.push("for (const r of ok) { if (r && r.results) for (const x of r.results) flat.push(x) }");
lines.push("return { batches: BATCHES.length, agentsReturned: ok.length, items: flat.length, failed: flat.filter(function(x){return !x.ok;}).length }");
const script = lines.join(NL) + NL;
writeFileSync("C:/project/lidamedu/scripts/jagwa/.figonly-workflow.mjs", script);
console.log("workflow written:", script.length, "bytes,", batches.length, "batches");
