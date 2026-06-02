// 매칭 실패 케이스 디버깅 — query 별 응답에서 사건번호 정확 매칭 여부 확인.
import { config } from "dotenv";
config();
const OC = process.env.LAW_API_KEY;
const queries = ["2025후10169", "2024후10436", "2025마6304", "2023후11340"];
for (const q of queries) {
  const u = new URL("https://www.law.go.kr/DRF/lawSearch.do");
  u.searchParams.set("OC", OC);
  u.searchParams.set("target", "prec");
  u.searchParams.set("type", "XML");
  u.searchParams.set("query", q);
  u.searchParams.set("display", "20");
  const r = await fetch(u.toString());
  const t = await r.text();
  const cnt = (t.match(/<totalCnt>([^<]+)/) || [])[1];
  const ids = [...t.matchAll(/<사건번호>([^<]+)<\/사건번호>/g)].map((m) => m[1]);
  const exact = ids.includes(q);
  console.log(`${q.padEnd(12)} totalCnt=${cnt ?? "?"}  exact=${exact ? "✓" : "✗"}  사건번호[0..3]: ${ids.slice(0, 3).join(", ")}`);
  await new Promise((r) => setTimeout(r, 500));
}
