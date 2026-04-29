// 모든 법 빈칸 자료 시드 — `seed-patent-blanks.mjs` 일반화 버전 (alias).
// 실행:
//   node scripts/seed-blanks.mjs --law=patent
//   node scripts/seed-blanks.mjs --law=trademark --file=source/_converted/리담상표법 조문 빈칸(Ver1).utf8.txt
//   node scripts/seed-blanks.mjs --law=design --version=v2
//
// 코드는 seed-patent-blanks.mjs 와 동일하므로 실행 위임.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const result = spawnSync(
  process.execPath,
  [resolve(__dirname, "seed-patent-blanks.mjs"), ...process.argv.slice(2)],
  { stdio: "inherit", cwd: ROOT },
);
process.exit(result.status ?? 1);
