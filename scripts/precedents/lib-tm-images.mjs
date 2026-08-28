// 상표 판례집 이미지 — 판본 무관 식별.
//
// ★판본이 바뀌면 hwpx 의 binId(image123)가 통째로 밀린다. 제16판(0825) 은 702개 중
//   503개가 "같은 binId, 다른 그림"이었다. 그래서 저장 경로를 binId 가 아니라
//   **원본 바이트의 해시**로 짓는다 — 같은 그림이면 판본이 달라도 같은 경로가 된다.
//   (구 규약 tm16-{binId}.webp 는 읽기 호환용으로만 남긴다.)
import { createHash } from "node:crypto";
import AdmZip from "adm-zip";
import sharp from "sharp";
import bmp from "bmp-js";

export const IMAGE_BUCKET = "case-images";

/** 해시 이름 경로. 12자면 702장 규모에서 충돌 확률이 사실상 0. */
export const storagePathFor = (caseId, hash) => `${caseId}/tmc-${hash}.webp`;
/** 경로에서 해시 되읽기 — 이미 올라간 그림을 다시 안 올리려고. */
export const hashFromPath = (p) => /tmc-([0-9a-f]{12})\.webp$/.exec(p ?? "")?.[1] ?? null;

/**
 * OLE 개체 안에 박힌 BMP 를 꺼낸다.
 * ★교재의 도형 일부는 한글 OLE 개체로 들어 있다. 컨테이너 바이트는 판본마다 달라지지만
 *   (실측: 제16판 0825 의 ole363 컨테이너는 구판과 다른데 **속 BMP 는 완전히 같다**)
 *   그림 자체는 그대로다. 그래서 해시도 변환도 컨테이너가 아니라 속 BMP 를 기준으로 한다.
 */
export function extractOleBmp(buf) {
  for (let i = 0; i + 14 < buf.length; i++) {
    if (buf[i] !== 0x42 || buf[i + 1] !== 0x4d) continue; // "BM"
    const size = buf.readUInt32LE(i + 2);
    const dataOffset = buf.readUInt32LE(i + 10);
    if (size > 1000 && size <= buf.length - i && dataOffset >= 54 && dataOffset < size) {
      // ★해시는 헤더가 밝힌 길이만큼(판본이 달라도 같은 값), 디코드는 뒤끝까지 넘긴다 —
      //   일부 BMP 는 선언 길이가 실제 픽셀 데이터보다 1바이트 짧아 잘라 주면 디코더가 넘친다.
      return { hashBytes: buf.subarray(i, i + size), decodeBytes: buf.subarray(i) };
    }
  }
  return null;
}

export function openBook(hwpxPath) {
  const zip = new AdmZip(hwpxPath);
  const byStem = new Map();
  for (const e of zip.getEntries()) {
    const m = /^BinData\/([^.]+)\.(\w+)$/.exec(e.entryName);
    if (m) byStem.set(m[1].toLowerCase(), { entry: e, ext: m[2].toLowerCase() });
  }

  const hashCache = new Map();
  function hashOf(binId) {
    const key = String(binId).toLowerCase();
    if (hashCache.has(key)) return hashCache.get(key);
    const hit = byStem.get(key);
    let bytes = hit ? hit.entry.getData() : null;
    if (bytes && hit.ext === "ole") bytes = extractOleBmp(bytes)?.hashBytes ?? bytes;
    const h = bytes ? createHash("sha1").update(bytes).digest("hex").slice(0, 12) : null;
    hashCache.set(key, h);
    return h;
  }

  async function toWebp(binId) {
    const hit = byStem.get(String(binId).toLowerCase());
    if (!hit) return { error: "binData 없음" };
    let buf = hit.entry.getData();
    let ext = hit.ext;
    if (ext === "ole") {
      const inner = extractOleBmp(buf);
      if (!inner) return { error: "ole 안 BMP 없음" };
      buf = inner.decodeBytes;
      ext = "bmp";
    }
    try {
      let img;
      const magic = buf.slice(0, 3).toString("hex");
      if (magic.startsWith("ffd8")) img = sharp(buf, { failOn: "none" });
      else if (ext === "bmp") {
        // ★bmp-js 는 24비트 BMP 의 알파를 0 으로 준다 — 그대로 webp 로 바꾸면 전면 투명(백지)이 된다.
        //   알파가 전부 0 이면 255 로 세운다(2026-07 백지 584장 사건).
        const d = bmp.decode(buf);
        const px = d.data;
        let hasAlpha = false;
        for (let i = 0; i < px.length; i += 4) if (px[i] !== 0) { hasAlpha = true; break; }
        for (let i = 0; i < px.length; i += 4) {
          const a = px[i], b = px[i + 1], g = px[i + 2], r = px[i + 3];
          px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = hasAlpha ? a : 255;
        }
        img = sharp(px, { raw: { width: d.width, height: d.height, channels: 4 } });
      } else if (["wmf", "emf"].includes(ext)) return { error: `미지원 ${ext}` };
      else img = sharp(buf, { failOn: "none" });
      const out = await img.webp({ quality: 88 }).toBuffer({ resolveWithObject: true });
      return { buffer: out.data, width: out.info.width, height: out.info.height };
    } catch (e) {
      return { error: e.message };
    }
  }

  return { zip, byStem, hashOf, toWebp };
}

/**
 * 판례 하나가 참조하는 binId 전부 — 이미지 배열·표 셀·본문 문장 속 마커까지.
 * 본문 마커(⟦IMG:…⟧)를 빠뜨리면 문장 안 표장이 사라진다.
 */
export function binIdsOf(c) {
  const out = [];
  const add = (b) => {
    const k = String(b).toLowerCase();
    if (!out.includes(k)) out.push(k);
  };
  for (const b of c.images ?? []) add(b);
  const scanText = (s) => {
    for (const m of String(s ?? "").matchAll(/⟦IMG:([^⟧]*)⟧/g)) add(m[1]);
  };
  for (const arr of Object.values(c.sections ?? {})) {
    if (!Array.isArray(arr)) continue;
    for (const s of arr) (typeof s === "string" ? scanText(s) : null);
  }
  const walkTable = (t) => {
    for (const row of t.cellRows ?? []) {
      for (const cell of row) {
        for (const b of cell.imgs ?? []) add(b);
        scanText(cell.text);
        for (const nt of cell.tables ?? []) walkTable(nt);
      }
    }
  };
  for (const t of c.infoTables ?? []) walkTable(t);
  for (const ex of c.sections?.__refExtra ?? []) for (const s of ex.paras ?? []) scanText(s);
  return out;
}
