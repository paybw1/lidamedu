// HWP 5.0(.hwp) → 텍스트. 한컴 COM 없이 파일만으로 뽑는다.
//
// scripts/hwp-to-text.ps1 은 Hancom COM 을 쓰는데, 자동화 보안 모듈이 등록돼 있지
// 않으면 Open() 에서 보안 대화상자에 걸려 멎는다(2026-08-21 실측). 목차·본문 텍스트만
// 필요하면 .hwp 를 직접 읽는 편이 확실하다.
//
// .hwp = OLE 복합문서(CFB). BodyText/Section0..N 스트림이 raw deflate 로 눌려 있고,
// 그 안은 레코드 스트림이다. 문단 텍스트는 HWPTAG_PARA_TEXT(67) 레코드에 UTF-16LE 로 들어있다.
//
//   node scripts/hwp-to-text.mjs <입력.hwp> [출력.txt]
//   node scripts/hwp-to-text.mjs <디렉터리> <출력디렉터리>
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const CFB_SIG = "d0cf11e0a1b11ae1";
const FREESECT = 0xffffffff;
const ENDOFCHAIN = 0xfffffffe;

/** CFB 컨테이너 → { 이름: Buffer } 스트림 맵. */
function readCfb(buf) {
  if (buf.subarray(0, 8).toString("hex") !== CFB_SIG) {
    throw new Error("CFB 시그니처 아님 — HWP 5.0 파일이 맞는지 확인");
  }
  const secSize = 1 << buf.readUInt16LE(0x1e);
  const miniSize = 1 << buf.readUInt16LE(0x20);
  const dirStart = buf.readUInt32LE(0x30);
  const miniCutoff = buf.readUInt32LE(0x38);
  const miniFatStart = buf.readUInt32LE(0x3c);
  const difatStart = buf.readUInt32LE(0x44);
  const difatCount = buf.readUInt32LE(0x48);

  const sectorOffset = (sid) => (sid + 1) * secSize;
  const readSector = (sid) => buf.subarray(sectorOffset(sid), sectorOffset(sid) + secSize);

  // DIFAT — 헤더에 109개, 넘치면 DIFAT 섹터 체인.
  const fatSectors = [];
  for (let i = 0; i < 109; i++) {
    const sid = buf.readUInt32LE(0x4c + i * 4);
    if (sid === FREESECT || sid === ENDOFCHAIN) break;
    fatSectors.push(sid);
  }
  let next = difatStart;
  for (let n = 0; n < difatCount && next !== ENDOFCHAIN && next !== FREESECT; n++) {
    const sec = readSector(next);
    const per = secSize / 4 - 1;
    for (let i = 0; i < per; i++) {
      const sid = sec.readUInt32LE(i * 4);
      if (sid === FREESECT || sid === ENDOFCHAIN) break;
      fatSectors.push(sid);
    }
    next = sec.readUInt32LE(secSize - 4);
  }

  // FAT — 섹터 체인 테이블.
  const fat = [];
  for (const sid of fatSectors) {
    const sec = readSector(sid);
    for (let i = 0; i < secSize / 4; i++) fat.push(sec.readUInt32LE(i * 4));
  }
  const chain = (start, table) => {
    const out = [];
    let sid = start;
    const seen = new Set();
    while (sid !== ENDOFCHAIN && sid !== FREESECT && sid < table.length) {
      if (seen.has(sid)) break; // 순환 방어
      seen.add(sid);
      out.push(sid);
      sid = table[sid];
    }
    return out;
  };
  const readChain = (start, table, size) => {
    const parts = chain(start, table).map(readSector);
    const all = Buffer.concat(parts);
    return size == null ? all : all.subarray(0, size);
  };

  // 디렉터리 엔트리.
  const dirBuf = readChain(dirStart, fat);
  const entries = [];
  for (let off = 0; off + 128 <= dirBuf.length; off += 128) {
    const nameLen = dirBuf.readUInt16LE(off + 64);
    if (nameLen < 2) continue;
    const name = dirBuf.subarray(off, off + nameLen - 2).toString("utf16le");
    entries.push({
      name,
      type: dirBuf.readUInt8(off + 66), // 1=storage 2=stream 5=root
      start: dirBuf.readUInt32LE(off + 116),
      size: dirBuf.readUInt32LE(off + 120),
    });
  }

  // 미니 스트림(4096 미만) — root 엔트리가 담고 있고 miniFAT 로 체인이 걸린다.
  const root = entries.find((e) => e.type === 5);
  const miniFatBuf = miniFatStart === ENDOFCHAIN ? Buffer.alloc(0) : readChain(miniFatStart, fat);
  const miniFat = [];
  for (let i = 0; i + 4 <= miniFatBuf.length; i += 4) miniFat.push(miniFatBuf.readUInt32LE(i));
  const miniStream = root && root.size > 0 ? readChain(root.start, fat, root.size) : Buffer.alloc(0);
  const readMini = (start, size) => {
    const parts = [];
    let sid = start;
    const seen = new Set();
    while (sid !== ENDOFCHAIN && sid !== FREESECT && sid < miniFat.length) {
      if (seen.has(sid)) break;
      seen.add(sid);
      parts.push(miniStream.subarray(sid * miniSize, (sid + 1) * miniSize));
      sid = miniFat[sid];
    }
    return Buffer.concat(parts).subarray(0, size);
  };

  const streams = new Map();
  for (const e of entries) {
    if (e.type !== 2 || e.size === 0) continue;
    streams.set(e.name, e.size < miniCutoff ? readMini(e.start, e.size) : readChain(e.start, fat, e.size));
  }
  return streams;
}

/** 확장 제어문자 — 본문에서 8 WCHAR 를 차지한다(표·그림·각주 등). */
const EXTENDED = new Set([1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23]);
/** 문단/줄 나눔. */
const BREAKS = new Set([10, 13]);

/** HWPTAG_PARA_TEXT 페이로드 → 문자열. 제어문자를 건너뛴다. */
function decodeParaText(payload) {
  let out = "";
  let i = 0;
  while (i + 1 < payload.length) {
    const code = payload.readUInt16LE(i);
    if (EXTENDED.has(code)) {
      i += 16; // 8 WCHAR
      continue;
    }
    if (BREAKS.has(code)) {
      out += "\n";
      i += 2;
      continue;
    }
    if (code < 32) {
      i += 2; // 인라인 제어(밑줄·글자겹침 등)
      continue;
    }
    out += String.fromCharCode(code);
    i += 2;
  }
  return out;
}

const HWPTAG_PARA_TEXT = 67;

/** 레코드 스트림 순회 → 문단 텍스트 배열. */
function extractSection(buf) {
  const paras = [];
  let pos = 0;
  while (pos + 4 <= buf.length) {
    const header = buf.readUInt32LE(pos);
    pos += 4;
    const tagId = header & 0x3ff;
    let size = (header >> 20) & 0xfff;
    if (size === 0xfff) {
      if (pos + 4 > buf.length) break;
      size = buf.readUInt32LE(pos);
      pos += 4;
    }
    if (pos + size > buf.length) break;
    if (tagId === HWPTAG_PARA_TEXT) {
      paras.push(decodeParaText(buf.subarray(pos, pos + size)));
    }
    pos += size;
  }
  return paras;
}

export function hwpToText(filePath) {
  const streams = readCfb(fs.readFileSync(filePath));
  const header = streams.get("FileHeader");
  if (!header) throw new Error("FileHeader 스트림 없음 — HWP 5.0 이 아님");
  const compressed = (header.readUInt32LE(36) & 1) === 1;

  const sections = [...streams.keys()]
    .filter((k) => /^Section\d+$/.test(k))
    .sort((a, b) => Number(a.slice(7)) - Number(b.slice(7)));
  if (sections.length === 0) throw new Error("BodyText Section 스트림 없음");

  const paras = [];
  for (const name of sections) {
    let raw = streams.get(name);
    if (compressed) raw = zlib.inflateRawSync(raw);
    paras.push(...extractSection(raw));
  }
  return paras.join("\n");
}

function main() {
  const [input, output] = process.argv.slice(2);
  if (!input) {
    console.error("사용: node scripts/hwp-to-text.mjs <입력.hwp|디렉터리> [출력.txt|출력디렉터리]");
    process.exit(1);
  }
  const stat = fs.statSync(input);
  const files = stat.isDirectory()
    ? fs.readdirSync(input).filter((f) => f.toLowerCase().endsWith(".hwp")).map((f) => path.join(input, f))
    : [input];
  const outDir = stat.isDirectory() ? (output ?? path.join(input, "_converted")) : null;
  if (outDir) fs.mkdirSync(outDir, { recursive: true });

  for (const f of files) {
    const text = hwpToText(f);
    const dest = outDir
      ? path.join(outDir, `${path.basename(f, path.extname(f))}.txt`)
      : (output ?? `${f.replace(/\.hwp$/i, "")}.txt`);
    fs.writeFileSync(dest, text, "utf8");
    console.log(`✓ ${path.basename(f)} → ${dest} (${text.length.toLocaleString()}자)`);
  }
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) main();
