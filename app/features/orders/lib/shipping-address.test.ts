// 배송지 규칙 테스트 (feat-11-012 P5-d).
//
// ★못박는 것은 「무엇을 배송지로 인정하는가」다. 이 판정이 느슨하면 **우편번호 없는
//   주문**이 결제를 통과해 운영에서 송장을 못 뽑고, 빡빡하면 멀쩡한 주소가 막힌다.
//   jsonb 로 들어오는 값은 무엇이든 될 수 있으므로 읽는 쪽 좁히기도 함께 못박는다.

import { describe, expect, it } from "vitest";

import {
  EMPTY_SHIPPING_ADDRESS,
  formatShippingAddress,
  shippingAddressSchema,
  toDomesticPhone,
  toShippingAddress,
} from "./shipping-address";

const ok = {
  name: "홍길동",
  phone: "010-1234-5678",
  postcode: "06236",
  address1: "서울 강남구 테헤란로 1",
  address2: "3층",
  memo: "",
};

describe("shippingAddressSchema", () => {
  it("온전한 배송지는 통과한다", () => {
    const r = shippingAddressSchema.safeParse(ok);
    expect(r.success).toBe(true);
  });

  it("상세주소·요청사항은 비어도 된다 — 단독주택·요청 없음이 정상이다", () => {
    const r = shippingAddressSchema.safeParse({ ...ok, address2: "", memo: "" });
    expect(r.success).toBe(true);
  });

  it("★우편번호 5자리가 아니면 막는다 — 송장에 그대로 들어가는 값이다", () => {
    for (const bad of ["", "1234", "123456", "abcde", "0623"]) {
      expect(shippingAddressSchema.safeParse({ ...ok, postcode: bad }).success).toBe(
        false,
      );
    }
  });

  it("연락처는 하이픈을 지우고 9~11자리로 센다", () => {
    expect(shippingAddressSchema.safeParse({ ...ok, phone: "01012345678" }).success).toBe(
      true,
    );
    expect(shippingAddressSchema.safeParse({ ...ok, phone: "02-123-4567" }).success).toBe(
      true,
    );
    expect(shippingAddressSchema.safeParse({ ...ok, phone: "0101234" }).success).toBe(
      false,
    );
  });

  it("받는 사람·주소가 비면 막는다", () => {
    expect(shippingAddressSchema.safeParse({ ...ok, name: "  " }).success).toBe(false);
    expect(shippingAddressSchema.safeParse({ ...ok, address1: "" }).success).toBe(false);
  });

  it("앞뒤 공백은 다듬어 저장한다", () => {
    const r = shippingAddressSchema.parse({ ...ok, name: "  홍길동 " });
    expect(r.name).toBe("홍길동");
  });

  it("빈 배송지는 통과하지 못한다 — 시트 초기값이 그대로 나가면 안 된다", () => {
    expect(shippingAddressSchema.safeParse(EMPTY_SHIPPING_ADDRESS).success).toBe(false);
  });
});

describe("toShippingAddress — jsonb 좁히기", () => {
  it("온전한 값은 그대로 돌려준다", () => {
    expect(toShippingAddress(ok)).toEqual(ok);
  });

  it("★이름·주소가 없으면 null — 빈 껍데기를 화면에 그리지 않는다", () => {
    expect(toShippingAddress({ postcode: "06236" })).toBeNull();
    expect(toShippingAddress({ name: "홍길동" })).toBeNull();
  });

  it("null·배열·문자열은 null", () => {
    expect(toShippingAddress(null)).toBeNull();
    expect(toShippingAddress([ok])).toBeNull();
    expect(toShippingAddress("서울")).toBeNull();
    expect(toShippingAddress(undefined)).toBeNull();
  });

  it("빠진 선택 칸은 빈 문자열로 채운다 — 화면이 undefined 를 그리지 않게", () => {
    const r = toShippingAddress({ name: "홍길동", address1: "서울 어딘가" });
    expect(r).toEqual({
      name: "홍길동",
      phone: "",
      postcode: "",
      address1: "서울 어딘가",
      address2: "",
      memo: "",
    });
  });

  it("문자열이 아닌 칸은 빈 문자열로 떨어뜨린다", () => {
    const r = toShippingAddress({ ...ok, phone: 1012345678, address2: null });
    expect(r?.phone).toBe("");
    expect(r?.address2).toBe("");
  });
});

describe("formatShippingAddress", () => {
  it("한 줄로 묶는다", () => {
    expect(formatShippingAddress(ok)).toBe(
      "홍길동 · 010-1234-5678 · (06236) 서울 강남구 테헤란로 1 3층",
    );
  });

  it("빈 칸은 빠뜨리고 이어 붙인다 — 괄호만 남거나 공백이 겹치지 않는다", () => {
    expect(
      formatShippingAddress({ ...ok, postcode: "", address2: "" }),
    ).toBe("홍길동 · 010-1234-5678 · 서울 강남구 테헤란로 1");
  });
});

describe("toDomesticPhone — profiles.phone_e164 되돌리기", () => {
  it("★+82 표기를 국내 표기로 돌린다 — 운영의 181건이 전부 이 모양이다", () => {
    expect(toDomesticPhone("+821012345678")).toBe("01012345678");
    expect(toDomesticPhone("+82 10 1234 5678")).toBe("01012345678");
    expect(toDomesticPhone("+82-10-1234-5678")).toBe("01012345678");
  });

  it("★돌린 값이 배송지 검사를 통과해야 한다 — 이게 이 함수의 존재 이유다", () => {
    const phone = toDomesticPhone("+821012345678");
    const r = shippingAddressSchema.safeParse({ ...ok, phone });
    expect(r.success).toBe(true);
  });

  it("국가번호 뒤 0 이 이미 있어도 0 을 겹치지 않는다", () => {
    expect(toDomesticPhone("+82 010-1234-5678")).toBe("01012345678");
  });

  it("이미 국내 표기면 그대로 둔다", () => {
    expect(toDomesticPhone("010-1234-5678")).toBe("010-1234-5678");
  });

  it("빈 값·null 은 빈 문자열", () => {
    expect(toDomesticPhone(null)).toBe("");
    expect(toDomesticPhone(undefined)).toBe("");
    expect(toDomesticPhone("  ")).toBe("");
  });
});
