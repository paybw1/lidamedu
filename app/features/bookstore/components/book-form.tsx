// 도서 등록/수정 폼 (구 플랫폼 도서등록 사양). 신규·수정 공용. multipart(표지·PDF 업로드).
// 리치 편집기 대신 textarea(마크다운 저장) — 학생 화면은 마크다운 렌더.
import type { ReactNode } from "react";

import { ImageUploadHint } from "~/core/components/image-upload-hint";
import { HtmlEditor } from "~/features/lms/components/html-editor";

export interface BookFormData {
  bookId?: string;
  title: string;
  categoryId: string | null;
  coverPath: string | null;
  coverFilePath: string | null;
  bookType: string;
  downloadLimit: number;
  shortInfo: string | null;
  listPriceKrw: number | null;
  priceKrw: number;
  shippingFeeType: string;
  shippingFeeKrw: number;
  taxFree: boolean;
  groupDiscountOk: boolean;
  perPersonLimit: number | null;
  courseOnly: boolean;
  eventPhrase: string | null;
  labelText: string | null;
  labelColor: string | null;
  isbn: string | null;
  author: string | null;
  publisher: string | null;
  publishedOn: string | null;
  previewUrl: string | null;
  shortIntro: string | null;
  description: string | null;
  authorBio: string | null;
  toc: string | null;
  extra1: string | null;
  extra2: string | null;
  isRecommended: boolean;
  trackStock: boolean;
  saleStatus: string;
  listed: boolean;
}

const IN =
  "border-input bg-background h-9 w-full rounded-lg border px-3 text-sm";
const TA = "border-input bg-background w-full rounded-lg border px-3 py-2 text-sm";

function Row({ label, req, children }: { label: string; req?: boolean; children: ReactNode }) {
  return (
    <div className="border-border grid grid-cols-1 gap-1.5 border-b py-3 sm:grid-cols-[140px_1fr] sm:items-start sm:gap-3">
      <div className="text-muted-foreground pt-1.5 text-[12px] font-semibold">
        {label} {req ? <span className="text-rose-500">*</span> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function BookForm({
  book,
  categories,
}: {
  book: BookFormData | null;
  categories: Array<{ categoryId: string; name: string }>;
}) {
  const b = book;
  return (
    <>
      <Row label="도서 카테고리">
        <select name="categoryId" defaultValue={b?.categoryId ?? ""} className={IN}>
          <option value="">(선택 안 함)</option>
          {categories.map((c) => (
            <option key={c.categoryId} value={c.categoryId}>{c.name}</option>
          ))}
        </select>
      </Row>
      <Row label="도서명" req>
        <input name="title" required maxLength={200} defaultValue={b?.title ?? ""} className={IN} />
      </Row>
      <Row label="도서 이미지">
        <div className="flex flex-col gap-1.5">
          <input type="file" name="coverFile" accept="image/jpeg,image/png,image/gif" className="text-xs" />
          <input name="coverPath" type="url" placeholder="외부 URL (우선 노출)" defaultValue={b?.coverPath ?? ""} className={IN} />
          <p className="text-muted-foreground text-[11px]">파일과 외부 URL을 모두 등록하면 외부 URL이 우선 노출됩니다.</p>
          <ImageUploadHint
            size="600 × 850px"
            ratio="3:4"
            note="세로형 표지 권장, 다른 비율은 가운데 기준으로 잘려 보입니다"
          />
        </div>
      </Row>
      <Row label="도서 유형">
        <select name="bookType" defaultValue={b?.bookType ?? "physical"} className={IN}>
          <option value="physical">실물 도서(배송)</option>
          <option value="pdf">PDF 도서(다운로드)</option>
        </select>
      </Row>
      <Row label="PDF 파일">
        <div className="flex flex-col gap-1.5">
          <input type="file" name="pdfFile" accept="application/pdf" className="text-xs" />
          <p className="text-muted-foreground text-[11px]">PDF 유형 도서만. 구매한 회원이 다운로드합니다.</p>
        </div>
      </Row>
      <Row label="다운로드 횟수 제한">
        <div className="flex items-center gap-1.5">
          <input name="downloadLimit" type="number" min={0} defaultValue={b?.downloadLimit ?? 0} className="border-input bg-background h-9 w-24 rounded-lg border px-2 text-sm tabular-nums" />
          <span className="text-muted-foreground text-[11px]">회 · 0 = 무제한</span>
        </div>
      </Row>
      <Row label="도서정보">
        <input name="shortInfo" maxLength={300} defaultValue={b?.shortInfo ?? ""} className={IN} />
      </Row>

      <Row label="정가">
        <div className="flex items-center gap-1.5">
          <input name="listPriceKrw" type="number" min={0} defaultValue={b?.listPriceKrw ?? ""} placeholder="0" className="border-input bg-background h-9 w-32 rounded-lg border px-2 text-sm tabular-nums" />
          <span className="text-muted-foreground text-[11px]">원 · 할인 전 금액(숨기려면 0)</span>
        </div>
      </Row>
      <Row label="판매가" req>
        <div className="flex items-center gap-1.5">
          <input name="priceKrw" type="number" required min={0} defaultValue={b?.priceKrw ?? 0} className="border-input bg-background h-9 w-32 rounded-lg border px-2 text-sm tabular-nums" />
          <span className="text-muted-foreground text-[11px]">원 · 실결제 금액</span>
        </div>
      </Row>
      <Row label="배송료" req>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-sm"><input type="radio" name="shippingFeeType" value="cod" defaultChecked={(b?.shippingFeeType ?? "cod") === "cod"} /> 착불</label>
          <label className="flex items-center gap-1 text-sm"><input type="radio" name="shippingFeeType" value="prepaid" defaultChecked={b?.shippingFeeType === "prepaid"} /> 선불</label>
          <label className="flex items-center gap-1 text-sm"><input type="radio" name="shippingFeeType" value="free" defaultChecked={b?.shippingFeeType === "free"} /> 무료</label>
          <input name="shippingFeeKrw" type="number" min={0} defaultValue={b?.shippingFeeKrw ?? 0} className="border-input bg-background h-9 w-28 rounded-lg border px-2 text-sm tabular-nums" />
          <span className="text-muted-foreground text-[11px]">원(선불 시)</span>
        </div>
      </Row>
      <Row label="부가세 면세">
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="taxFree" defaultChecked={b?.taxFree ?? false} /> 면세 (PG 계약에 따름)</label>
      </Row>
      <Row label="그룹할인 적용">
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="groupDiscountOk" defaultChecked={b?.groupDiscountOk ?? false} /> 적용</label>
      </Row>
      <Row label="재고 관리">
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="trackStock" defaultChecked={b?.trackStock ?? false} /> 수량 관리(입고·판매차감). 해제 시 재고와 무관하게 항상 판매 가능</label>
      </Row>
      <Row label="1인당 판매 제한">
        <div className="flex items-center gap-1.5">
          <input name="perPersonLimit" type="number" min={1} defaultValue={b?.perPersonLimit ?? ""} placeholder="무제한" className="border-input bg-background h-9 w-24 rounded-lg border px-2 text-sm tabular-nums" />
          <span className="text-muted-foreground text-[11px]">개 · 비우면 무제한</span>
        </div>
      </Row>

      <Row label="이벤트 문구">
        <input name="eventPhrase" maxLength={60} placeholder="13자까지 권장" defaultValue={b?.eventPhrase ?? ""} className={IN} />
      </Row>
      <Row label="라벨">
        <div className="flex items-center gap-2">
          <input name="labelText" maxLength={20} placeholder="라벨 텍스트" defaultValue={b?.labelText ?? ""} className="border-input bg-background h-9 w-40 rounded-lg border px-2 text-sm" />
          <input name="labelColor" type="color" defaultValue={b?.labelColor ?? "#2563eb"} className="h-9 w-12 rounded border" />
        </div>
      </Row>
      <Row label="ISBN">
        <input name="isbn" maxLength={20} defaultValue={b?.isbn ?? ""} className="border-input bg-background h-9 w-48 rounded-lg border px-2 font-mono text-sm" />
      </Row>
      <Row label="저자 / 출판사">
        <div className="flex flex-wrap gap-2">
          <input name="author" maxLength={80} placeholder="저자" defaultValue={b?.author ?? ""} className="border-input bg-background h-9 w-40 rounded-lg border px-2 text-sm" />
          <input name="publisher" maxLength={80} placeholder="출판사" defaultValue={b?.publisher ?? ""} className="border-input bg-background h-9 w-40 rounded-lg border px-2 text-sm" />
        </div>
      </Row>
      <Row label="출간일">
        <input name="publishedOn" type="date" defaultValue={b?.publishedOn ?? ""} className="border-input bg-background h-9 w-40 rounded-lg border px-2 text-sm" />
      </Row>
      <Row label="미리보기 링크">
        <div className="flex items-center gap-1.5">
          <input name="previewUrl" type="url" placeholder="https://…" defaultValue={b?.previewUrl ?? ""} className={IN} />
          {b?.previewUrl ? (
            <a href={b.previewUrl} target="_blank" rel="noreferrer" className="border-border hover:bg-muted/50 shrink-0 rounded-md border px-2 py-1.5 text-[12px]">미리보기</a>
          ) : null}
        </div>
      </Row>

      <Row label="간략소개">
        <textarea name="shortIntro" rows={2} maxLength={1000} defaultValue={b?.shortIntro ?? ""} className={TA} />
      </Row>
      <Row label="도서소개">
        {/* 표·이미지 삽입 요청(2026-07-29 신고)으로 HtmlEditor 로 전환 — 상세 화면은 HTML
            포함 여부를 감지해 렌더하므로 기존 평문 소개는 그대로 표시된다. */}
        <HtmlEditor
          name="description"
          defaultValue={b?.description ?? ""}
          uploadUrl="/api/lms/editor-image"
          minHeight={200}
        />
      </Row>
      <Row label="저자소개">
        <textarea name="authorBio" rows={3} maxLength={20000} defaultValue={b?.authorBio ?? ""} className={TA} />
      </Row>
      <Row label="목차">
        <textarea name="toc" rows={4} maxLength={20000} defaultValue={b?.toc ?? ""} className={TA} />
      </Row>
      <Row label="기타 1 / 2">
        <div className="flex flex-col gap-1.5">
          <input name="extra1" maxLength={500} defaultValue={b?.extra1 ?? ""} className={IN} />
          <input name="extra2" maxLength={500} defaultValue={b?.extra2 ?? ""} className={IN} />
        </div>
      </Row>

      <Row label="추천도서">
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="isRecommended" defaultChecked={b?.isRecommended ?? false} /> 추천도서로 지정</label>
      </Row>
      <Row label="과정전용">
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="courseOnly" defaultChecked={b?.courseOnly ?? false} /> 도서목록 미노출 · 연결된 강의에서만 구매</label>
      </Row>
      <Row label="상태">
        <select name="saleStatus" defaultValue={b?.saleStatus ?? "draft"} className={IN}>
          <option value="draft">임시저장</option>
          <option value="on_sale">판매중</option>
          <option value="paused">판매중지</option>
          <option value="closed">중지(전체 숨김)</option>
        </select>
      </Row>
      <Row label="노출여부">
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="listed" defaultChecked={b?.listed ?? true} /> 도서목록에 노출 (해제해도 상세 페이지 접근은 가능)</label>
      </Row>
    </>
  );
}
