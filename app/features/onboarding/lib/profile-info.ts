// feat-8-030 — 필수정보(회원명·휴대전화·주소) 입력 게이트 공용 순수 헬퍼.

// "010-1234-5678", "01012345678", "+82 10-1234-5678" 등을 +8210XXXXXXXX 로 정규화.
// 빈 문자열 → null. 형식 위반 → "invalid".  (users/api/edit-profile.tsx 와 동일 규칙)
export function normalizePhoneToE164(raw: string): string | null | "invalid" {
  if (!raw) return null;
  const stripped = raw.replace(/[\s\-()._]/g, "");
  if (stripped.length === 0) return null;
  if (/^\+8210\d{7,8}$/.test(stripped)) return stripped;
  if (/^8210\d{7,8}$/.test(stripped)) return `+${stripped}`;
  if (/^010\d{7,8}$/.test(stripped)) return `+82${stripped.slice(1)}`;
  return "invalid";
}

// +8210XXXXXXXX → 010-XXXX-XXXX 표시용(폼 프리필). 형식 아니면 원본 그대로.
export function formatPhoneForDisplay(e164: string | null): string {
  if (!e164) return "";
  const m = /^\+8210(\d{3,4})(\d{4})$/.exec(e164);
  if (!m) return e164;
  return `010-${m[1]}-${m[2]}`;
}
