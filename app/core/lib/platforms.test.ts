// 강의 플랫폼 오픈 게이트(feat-11-012 P0) 판정 테스트.
//
// ★이 두 함수는 "누가 무엇을 볼 수 있는가"를 정하는 보안 경계다. 특히
//   isPublicLecturePath 가 한 글자 더 먹으면 로그인 뒤에 있어야 할 화면이 공개된다
//   ("/lecture" 정확일치 = 내 강의실, "/lecture/cart" = 장바구니).
// ★같은 목록을 사이트맵·robots 도 읽으므로, 여기서 공개로 판정되는 것은 곧 색인 대상이다.

import { describe, expect, it } from "vitest";

import {
  LECTURE_GATE_STAGE,
  isPublicLecturePath,
  lectureEntryAllowed,
} from "./platforms";

describe("isPublicLecturePath", () => {
  it("공개 화면은 로그인 없이 열린다", () => {
    for (const p of [
      "/lecture/home",
      "/lecture/catalog",
      "/lecture/books",
      "/lecture/schedule",
      "/lecture/news",
      "/lecture/exam-info",
      "/lecture/facilities",
      "/about",
      "/location",
    ]) {
      expect(isPublicLecturePath(p), p).toBe(true);
    }
  });

  it("공개 화면의 자식 경로도 함께 열린다", () => {
    for (const p of [
      "/lecture/catalog/patent_basic_2026",
      "/lecture/books/abc-123",
      "/lecture/news/42",
      "/lecture/schedule/7",
      "/about/instructors",
      "/about/instructors/lim-byungwoong",
      "/about/instructors/recruit",
    ]) {
      expect(isPublicLecturePath(p), p).toBe(true);
    }
  });

  it("★로그인 뒤에 있어야 할 화면은 공개가 아니다", () => {
    for (const p of [
      "/lecture", // 내 강의실 — 접두 매칭이 삼키면 안 된다
      "/lecture/cart",
      "/lecture/orders",
      "/lecture/certificates",
      "/lecture/payments",
      "/lecture/coupons",
      "/lecture/points",
      "/lecture/wishlist",
      "/lecture/settlements",
      "/lecture/support",
      "/lecture/support/new",
      "/lecture/announcements",
      "/lecture/room/abc",
      "/lecture/watch/abc",
    ]) {
      expect(isPublicLecturePath(p), p).toBe(false);
    }
  });

  it("낱말 앞부분만 같은 경로를 공개로 오판하지 않는다", () => {
    expect(isPublicLecturePath("/lecture/homework")).toBe(false);
    expect(isPublicLecturePath("/lecture/booksale")).toBe(false);
    expect(isPublicLecturePath("/aboutus")).toBe(false);
  });
});

describe("lectureEntryAllowed", () => {
  const cases = (stage: "closed" | "public" | "open") => ({
    staffPublic: lectureEntryAllowed({
      stage,
      isStaff: true,
      isPublicPath: true,
    }),
    staffPrivate: lectureEntryAllowed({
      stage,
      isStaff: true,
      isPublicPath: false,
    }),
    guestPublic: lectureEntryAllowed({
      stage,
      isStaff: false,
      isPublicPath: true,
    }),
    guestPrivate: lectureEntryAllowed({
      stage,
      isStaff: false,
      isPublicPath: false,
    }),
  });

  it("closed — 강사·원장만 통과(현행 동작)", () => {
    expect(cases("closed")).toEqual({
      staffPublic: true,
      staffPrivate: true,
      guestPublic: false,
      guestPrivate: false,
    });
  });

  it("public — 공개 화면은 누구나, 그 밖은 여전히 staff 만", () => {
    expect(cases("public")).toEqual({
      staffPublic: true,
      staffPrivate: true,
      guestPublic: true,
      guestPrivate: false,
    });
  });

  it("open — 전원 통과(로그인 필요 여부는 각 화면이 판단)", () => {
    expect(cases("open")).toEqual({
      staffPublic: true,
      staffPrivate: true,
      guestPublic: true,
      guestPrivate: true,
    });
  });

  it("★현재 단계는 closed — 오픈은 원장 결정(D3) 뒤에 바꾼다", () => {
    // 이 단언이 깨졌다면 게이트가 열린 것이다. 의도한 개방이면 이 테스트를 함께 고친다.
    expect(LECTURE_GATE_STAGE).toBe("closed");
  });
});
