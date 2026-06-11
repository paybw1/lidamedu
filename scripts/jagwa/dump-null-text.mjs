// OCR the 45 null-section crops and dump stem text for manual section classification.
import path from "node:path";
const { createWorker } = await import("tesseract.js");
const TAG = { 2011: "2011_48_B", 2012: "2012_49_A", 2013: "2013_50_A", 2014: "2014_51_A", 2015: "2015_52_A", 2016: "2016_53_A", 2017: "2017_54_A", 2018: "2018_55_A", 2019: "2019_56_B", 2020: "2020_57_A", 2021: "2021_58_B", 2022: "2022_59_A", 2023: "2023_60_A", 2024: "2024_61_A", 2025: "2025_62_A", 2026: "2026_63_A" };
const NULLS = [
  [2011, [17, 23, 27, 31, 36, 40]], [2012, [8, 23, 28, 29, 39]], [2013, [12, 18, 22, 30, 31]],
  [2014, [18]], [2015, [14]], [2016, [18]], [2017, [20, 33, 34]], [2018, [11, 30]],
  [2019, [13, 19, 27, 28, 30]], [2020, [28]], [2021, [25]], [2022, [1, 2, 3, 4, 16, 21, 27, 38]],
  [2023, [4, 30, 32]], [2024, [35]], [2025, [18]], [2026, [30]],
].flatMap(([y, ns]) => ns.map((n) => ({ y, n, tag: TAG[y] })));

const worker = await createWorker("kor", 1, { logger: () => {} });
for (const { y, n, tag } of NULLS) {
  const file = path.join("C:/project/lidamedu/scripts/jagwa/.crops", tag, `q${String(n).padStart(2, "0")}.png`);
  const r = await worker.recognize(file);
  const t = (r.data.text || "").replace(/\s+/g, " ").trim().slice(0, 140);
  console.log(`${y} q${n}: ${t || "(빈 텍스트 — 그림 위주)"}`);
}
await worker.terminate();
