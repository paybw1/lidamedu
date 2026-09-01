// 국가법령정보센터 판례 실재 조회 — 감사 공용.
//
// ★`search=1` 필수. 검색화면(precSc.do)은 JS 렌더라 0건으로 나온다(CLAUDE.md).
// ★한 실행 안에서 같은 번호를 여러 논점이 인용하므로 메모리 캐시를 둔다.
// 반환: true=실재 · false=없음 · null=조회 실패(네트워크 등 — 없음으로 단정하지 않는다)

const cache = new Map();

export async function existsAtLawGoKr(caseNumber) {
  const key = String(caseNumber ?? "").replace(/\s/g, "");
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);
  const url =
    "https://www.law.go.kr/DRF/lawSearch.do?OC=test&target=prec&type=JSON&search=1&query=" +
    encodeURIComponent(key);
  let result = null;
  try {
    const res = await fetch(url);
    if (res.ok) {
      const j = await res.json();
      const raw = j?.PrecSearch?.prec;
      const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
      // ★검색은 유사어도 물어 오므로 **사건번호 정확일치**만 실재로 본다.
      result = list.some(
        (p) => String(p?.["사건번호"] ?? "").replace(/\s/g, "") === key,
      );
    }
  } catch {
    result = null;
  }
  cache.set(key, result);
  return result;
}

/**
 * casenote.kr 검색 — 법령정보센터의 **보완**. 둘 다 없을 때만 "실재하지 않음" 으로 본다.
 *
 * ★법령정보센터 API 는 오래된 판결·특허법원 판결을 상당수 담고 있지 않다.
 *   그것만 보고 판정했다가 실재하는 95후1326·98허4883 을 "지어냄" 으로 몰 뻔했다(2026-09-01).
 *   한 소스로 부존재를 단정하지 말 것.
 * 반환: true=있음 · false=없음 · null=조회 실패
 */
const cnCache = new Map();

export async function existsAtCasenote(caseNumber) {
  const key = String(caseNumber ?? "").replace(/\s/g, "");
  if (!key) return null;
  if (cnCache.has(key)) return cnCache.get(key);
  let result = null;
  try {
    const res = await fetch(
      "https://casenote.kr/search/?q=" + encodeURIComponent(key),
      { headers: { "user-agent": "Mozilla/5.0 (lidam-audit)" } },
    );
    if (res.ok) {
      const html = await res.text();
      // 결과가 있으면 사건번호가 링크·제목에 그대로 박힌다. 없으면 빈 껍데기(8KB 안팎).
      result =
        html.includes(">" + key + "<") ||
        html.includes("/" + encodeURIComponent(key));
    }
  } catch {
    result = null;
  }
  cnCache.set(key, result);
  return result;
}

/**
 * 실재 판정 — DB 밖 번호를 **두 소스**로 확인한다.
 * 반환: true=실재 · false=두 소스 모두 없음 · null=조회 실패(단정 금지)
 */
export async function verifyCaseNumber(caseNumber, { retries = 2 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    // ★casenote 를 먼저 본다 — **국가법령정보센터는 누락이 많다**(원장 지시 2026-09-01).
    //   구 판결·특허법원·하급심이 대거 빠져 있어 그것만 보면 실재하는 판례를 지어냄으로 몬다.
    const b = await existsAtCasenote(caseNumber);
    if (b === true) return true;
    const a = await existsAtLawGoKr(caseNumber);
    if (a === true) return true;
    if (a === false && b === false) return false;
    // ★조회 실패는 "없음"이 아니다 — 잠시 쉬고 다시 묻는다(연속 요청에 상대가 끊는다).
    //   캐시가 실패를 기억하지 않도록 여기서 재시도한다.
    cache.delete(String(caseNumber).replace(/s/g, ""));
    cnCache.delete(String(caseNumber).replace(/s/g, ""));
    if (attempt < retries) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  return null;
}
