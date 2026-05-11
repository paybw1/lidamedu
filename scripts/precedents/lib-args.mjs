// CLI argv 파서 — 모든 seed 스크립트 공용.
// 사용: --law=patent|civil|trademark|design|civil-procedure|ALL

export const LAW_CODES = [
  "patent",
  "civil",
  "trademark",
  "design",
  "civil-procedure",
];

export function parseLawArg(argv) {
  for (const a of argv.slice(2)) {
    if (a.startsWith("--law=")) {
      const v = a.slice("--law=".length);
      if (v === "ALL") return LAW_CODES.slice();
      if (LAW_CODES.includes(v)) return [v];
      throw new Error(`알 수 없는 law: ${v}`);
    }
  }
  return ["patent"]; // default
}
