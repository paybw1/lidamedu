/**
 * Patent Table Schema
 *
 * This schema defines the structure for patent application records.
 * It follows the Supaplate project conventions including use of Drizzle ORM
 * and server-side helpers for identity and timestamps.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { authUid, authUsers, authenticatedRole } from "drizzle-orm/supabase";

import { makeIdentityColumn, timestamps } from "~/core/db/helpers.server";

// enum 정의: '예', '아니오'
export const yesNoEnum = pgEnum("yes_no", ["예", "아니오"]);

export const patents = pgTable(
  "patents",
  {
    // PK: Primary key for patent record (UUID)
    id: uuid().defaultRandom().primaryKey(),

    // 🔹 필수 항목 (required fields)
    our_ref: text(), // 내부 관리번호
    status: text().notNull(), // 현재 상태
    application_type: text().notNull(), // 출원종류 (신규/분할/PCT 등)

    // 🔹 사용자 연결 필드 (외래키)
    user_id: uuid().references(() => authUsers.id, {
      onDelete: "cascade",
    }),

    // 🔸 선택 항목 (optional fields)
    // applicant_name: text(), // 출원인
    applicant: jsonb().default(sql`'[]'::jsonb`), // 복수 출원인 [{name_kr, name_en, code, address_kr, address_en}]
    assignee: jsonb().default(sql`'[]'::jsonb`), // 복수 권리자 [{name_kr, name_en, code, address_kr, address_en}]
    inventor: jsonb().default(sql`'[]'::jsonb`), // 복수 발명자 [{name_kr, name_en, code, address_kr, address_en}]

    filing_date: timestamp(), // 출원일
    application_number: text(), // 출원번호
    title_kr: text(), // 국문명칭
    applicant_reference: text(), // 출원인 관리번호
    registration_date: timestamp(), // 등록일
    registration_number: text(), // 등록번호
    examination_requested_at: timestamp(), // 심사청구일
    examination_request_due: timestamp(), // 심사청구마감일
    annuity_due_date: timestamp(), // 연차마감일
    attorney_name: text(), // 담당 변리사
    abandonment_date: timestamp(), // 포기/취하일
    abandonment_reason: text(), // 포기/취하 내용
    pct_application_number: text(), // 국제출원번호
    pct_application_date: timestamp(), // 국제출원일
    priority_date: timestamp(), // 우선일
    request_date: timestamp(), // 신청일
    filing_deadline: timestamp(), // 출원 마감일
    title_en: text(), // 영문명칭
    claims_due_date: timestamp(), // 청구범위 마감일
    claims_submitted_at: timestamp(), // 청구범위 제출일
    publication_date: timestamp(), // 공개일
    publication_number: text(), // 공개번호
    decision_to_register_date: timestamp(), // 등록결정일
    registration_deadline: timestamp(), // 등록마감일
    late_registration_penalty_due: timestamp(), // 등록과태마감일
    protection_term: text(), // 권리존속기간
    is_annuity_managed: boolean(), // 연차관리 여부
    // inventor: text(), // 발명자
    // assignee: text(), // 권리자
    earliest_priority_date: timestamp(), // 최초 우선권 주장일
    expedited_examination_requested: boolean(), // 우선심사 청구 여부
    expedited_examination_date: timestamp(), // 우선심사청구일
    examination_requested: yesNoEnum("examination_requested"), // 심사청구 여부
    priority_claimed: yesNoEnum("priority_claimed"), // 우선권 주장 여부
    priority_rights: jsonb().default(sql`'[]'::jsonb`), // 우선권 정보 [배열]]

    electronic_certificate_selected: boolean().default(true), //전자등록증 선택 여부
    country_code: text(), //국가 코드
    prior_disclosure_exception_claimed: boolean().default(false), //사전공개 예외 주장 여부
    prior_disclosure_documents: jsonb().default(sql`'[]'::jsonb`), //사전공개 문서
    final_claim_count: integer(),

    // 🔸 메타데이터 (optional json field)
    metadata: jsonb().default(sql`'{}'::jsonb`), // 객체

    // 🔹 생성일 및 수정일
    ...timestamps,
  },
  (table) => [
    // RLS Policy: Only allow authenticated users to access their own patents
    pgPolicy("select-patent-policy", {
      for: "select",
      to: authenticatedRole,
      as: "permissive",
      using: sql`${authUid} = ${table.user_id}`,
    }),
  ],
);

export const entities = pgTable("entities", {
  id: uuid("id").defaultRandom().primaryKey(),

  user_id: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),

  // ✨ 개인 or 법인 구분
  entity_type: text().$type<"individual" | "company">(),

  name_kr: text(),
  name_en: text(),
  client_code: text(),
  address_kr: text(),
  address_en: text(),

  // 🔹 국가 (거주 또는 설립 국가)
  country: text(), // 예: "KR", "US", "JP" 등 ISO 3166-1 alpha-2 코드 권장

  // 🔹 변리사 위임 정보
  has_poa: boolean().default(false), // 위임 여부
  signature_image_url: text(), // 서명 이미지 URL
  signer_position: text(), // 직책 (자유 입력 가능)
  signer_name: text(), // 서명자 성함
  representative_name: text(), // 법인 대표자 이름

  ...timestamps,
});

export const inventors = pgTable("inventors", {
  id: uuid("id").defaultRandom().primaryKey(),

  user_id: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),

  name_kr: text(),
  name_en: text(),
  nationality: text(),
  id_number: text(),
  zipcode: text(),
  address_kr: text(),
  address_en: text(),
  residence_country: text(),

  ...timestamps,
});

export const processes_patents = pgTable("processes_patents", {
  // 고유 식별자
  id: uuid().defaultRandom().primaryKey(),

  // 사용자 식별자 (auth.users의 id 참조)
  user_id: uuid()
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),

  // 사건 ID (특허 사건의 id)
  case_id: uuid()
    .notNull()
    .references(() => patents.id, { onDelete: "cascade" }),

  our_ref: text(), // 내부 관리번호

  // 단계 이름
  step_name: text().notNull(),

  // ✅ 긴급 사건 여부
  is_urgent: boolean().default(false),

  // ✅ 고객 요청 사항 (고객이 입력한 요청 메시지)
  client_request: text(),

  // ✅ 담당자 메모 (내부 처리 내용 및 판단 근거)
  staff_note: text(),

  // 상태: pending, in_progress, completed, delayed, cancelled, awaiting_payment, paid
  status: text().default("awaiting_payment"),

  // ✅ 관련 파일들 (여러 개 가능하므로 JSON 배열 형태로 저장)
  attached_files: jsonb(), // 예: [{ name, url, type }]

  // ✅ 결제 여부
  is_paid: boolean().default(false),

  // ✅ 결제일시
  paid_at: timestamp(),

  // ✅ 결제 수단 (선택): "card", "bank", "paypal", "free", "internal" 등
  payment_method: text(),

  // ✅ 결제 금액 (선택): 0원도 포함
  payment_amount: integer(),

  // ✅ 결제 고유 ID (예: PG사 결제번호 또는 내부 관리용)
  payment_ref: text(),

  ...timestamps,
});

export const payments_patents = pgTable("payments_patents", {
  // 고유 식별자
  id: uuid().defaultRandom().primaryKey(),

  // 사용자 ID (auth.users 테이블 참조)
  user_id: uuid()
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),

  // 특허 사건 ID (patents 테이블 참조)
  patent_id: uuid()
    .notNull()
    .references(() => patents.id, { onDelete: "cascade" }),

  // 연결된 프로세스 ID (processes_patents 테이블 참조)
  process_id: uuid()
    .notNull()
    .references(() => processes_patents.id, { onDelete: "cascade" }),

  // 결제 금액 (단위: 원)
  amount: integer().notNull(),

  // 결제 수단 (예: card, bank, paypal, free, internal 등)
  payment_method: text(),

  // 결제 일시
  paid_at: timestamp(),

  // 결제 고유 식별자 (예: PG사 거래 번호 또는 내부용 ID)
  payment_ref: text(),

  // 생성일시 및 수정일시
  ...timestamps,
});

export const processes_patent_alarms = pgTable("processes_patent_alarms", {
  // 🔑 bigint 기반 기본키, 자동 증가
  id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),

  // 🧾 사건 참조 (UUID 기반)
  process_patent_id: uuid()
    .notNull()
    .references(() => processes_patents.id, {
      onDelete: "cascade",
    }),

  // ⏰ 알람 종류 (enum-like 문자열, 예: "3_months", "2_weeks")
  type: text().notNull(),

  // 📅 알람 발송 예정일 (due_date 기준 계산)
  scheduled_at: date().notNull(),

  // ✅ 실제 발송 여부
  is_sent: boolean().default(false),

  // 🕒 발송된 시점 (null이면 아직 미발송)
  sent_at: timestamp(),

  // 📌 생성 및 수정 타임스탬프
  ...timestamps,
});
