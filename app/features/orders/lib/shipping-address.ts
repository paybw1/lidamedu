// 배송지 한 벌 — 모양·검증·표시를 한 곳에서 소유한다 (feat-11-012 P5-d).
//
// ★왜 SSOT 인가: 배송지는 **세 곳을 지난다** — 결제 시트(입력) → 주문(orders.shipping_address)
//   → 이행(shipments.address) → 운영 배송 화면(수정). 모양이 한 군데라도 어긋나면
//   「주소를 넣었는데 배송 화면이 비어 있다」가 된다. 그래서 타입·zod·표시를 함께 둔다.
// ★.server 가 아니다 — 시트(브라우저)와 액션(서버)이 **같은 규칙**을 써야 하기 때문이다.
//   다만 최종 권위는 서버다(Layer 2 §5): 시트의 검사는 친절함이고, 액션의 parse 가 관문이다.
//
// ★`profiles` 에는 **우편번호·상세주소가 없다**(name·phone_e164·address 뿐). 그래서
//   기본값은 「받는 사람·연락처·주소」까지만 채워지고 나머지는 묻는다. 「확인만 하면 되는
//   화면」으로 지으면 우편번호가 영영 비어 운영에서 송장을 못 뽑는다.

import { z } from "zod";

/**
 * 주문 시점 배송지 스냅샷. orders.shipping_address · shipments.address 가 같은 모양.
 *
 * ★interface 가 아니라 **type 별칭**인 데는 이유가 있다 — supabase 생성 타입의 jsonb 칸은
 *   `Json` 이고, TS 는 interface 에 암묵적 인덱스 시그니처를 주지 않아 그대로는 못 넣는다.
 *   type 별칭이면 들어간다. interface 로 바꾸면 insert 가 컴파일되지 않는다.
 */
export type ShippingAddress = {
  /** 받는 사람. */
  name: string;
  /** 연락처(숫자·하이픈). */
  phone: string;
  /** 우편번호(5자리). */
  postcode: string;
  /** 기본주소. */
  address1: string;
  /** 상세주소(동·호수). 비어 있을 수 있다. */
  address2: string;
  /** 배송 요청사항. 비어 있을 수 있다. */
  memo: string;
};

// 전화번호: 숫자 9~11자리를 요구한다(하이픈·공백은 지우고 센다).
//   ★국제번호(+82)를 받지 않는 이유 — 택배 송장에 그대로 들어가는 값이라 국내 형식이어야 한다.
const digitsOf = (s: string) => s.replace(/[^0-9]/g, "");

export const shippingAddressSchema = z.object({
  name: z.string().trim().min(1, "받는 사람을 입력해 주세요.").max(40),
  phone: z
    .string()
    .trim()
    .max(20)
    .refine((v) => {
      const d = digitsOf(v);
      return d.length >= 9 && d.length <= 11;
    }, "연락처를 확인해 주세요."),
  postcode: z
    .string()
    .trim()
    .refine((v) => /^[0-9]{5}$/.test(v), "우편번호 5자리를 입력해 주세요."),
  address1: z.string().trim().min(2, "주소를 입력해 주세요.").max(200),
  address2: z.string().trim().max(120).default(""),
  memo: z.string().trim().max(200).default(""),
});

/** 빈 배송지 — 시트의 초기값. */
export const EMPTY_SHIPPING_ADDRESS: ShippingAddress = {
  name: "",
  phone: "",
  postcode: "",
  address1: "",
  address2: "",
  memo: "",
};

/**
 * DB(jsonb) 에서 읽은 값을 배송지로 좁힌다. 모양이 아니면 null.
 * ★jsonb 는 무엇이든 들어갈 수 있으므로 **읽는 쪽에서 반드시 좁힌다** — 화면이 곧바로
 *   `addr.name` 을 읽으면 옛 주문·손으로 넣은 행에서 터진다.
 */
export function toShippingAddress(raw: unknown): ShippingAddress | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : "");
  const name = str("name");
  const address1 = str("address1");
  // 받는 사람과 기본주소가 없으면 배송지로 치지 않는다(빈 껍데기 표시 방지).
  if (!name || !address1) return null;
  return {
    name,
    phone: str("phone"),
    postcode: str("postcode"),
    address1,
    address2: str("address2"),
    memo: str("memo"),
  };
}

/**
 * `profiles.phone_e164` 를 **국내 표기**로 되돌린다 (`+821012345678` → `01012345678`).
 *
 * ★이게 없으면 기본 배송지가 **자기 자신의 검사에 걸린다.** 운영 확인(2026-09-14):
 *   저장된 181건이 전부 `+82` 로 시작하는 13자다 → 숫자만 세면 12자리 → 위 9~11 규칙에
 *   걸려, 전화번호를 이미 등록한 학생이 **건드리지도 않은 칸에서 빨간 오류**를 본다.
 * ★택배 송장에 들어가는 값이라 국내 표기가 맞다 — 규칙을 느슨하게 푸는 게 아니라
 *   들어오는 값을 맞춰 넣는다.
 */
export function toDomesticPhone(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  // +82 10 … → 0 10 … (국가번호 뒤의 0 은 생략돼 있으므로 되살린다)
  const m = v.match(/^\+?82[-\s]?0?([0-9-\s]+)$/);
  if (m) return "0" + m[1].replace(/[\s-]/g, "");
  return v;
}

/** 한 줄 표시 — 운영 배송 화면·주문 내역용. */
export function formatShippingAddress(a: ShippingAddress): string {
  const line = [a.postcode ? `(${a.postcode})` : "", a.address1, a.address2]
    .filter(Boolean)
    .join(" ");
  return `${a.name} · ${a.phone} · ${line}`;
}
