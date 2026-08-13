// errata Phase 4a — 추록·정오표 PDF 렌더러 (@react-pdf/renderer, 서버 전용).
// 인쇄 사양(§2.6): A4 세로·여백 최소·흑백 안전(문구·테두리 병행)·항목 페이지 경계 보호(wrap=false).
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

import type { ErrataSheetData, SheetItem } from "./sheet-data.server";

// 한글 폰트 — 자체 배포 파일(고정 URL). 단일 웨이트라 강조는 크기·테두리로.
const FONT_URL = "https://www.lidamipedu.com/fonts/NotoSerifKR-Regular.ttf";
Font.register({ family: "NotoSerifKR", src: FONT_URL });
// CJK 는 단어 경계가 없어 글자 단위 줄바꿈 허용이 필요하다.
Font.registerHyphenationCallback((word) => Array.from(word));

const KIND_LABEL: Record<string, string> = {
  typo: "정오",
  law_amend: "법령개정",
  precedent_change: "판례변경",
  addendum: "추록",
  answer_change: "정답정정",
  deletion: "삭제",
};

const s = StyleSheet.create({
  page: {
    fontFamily: "NotoSerifKR",
    fontSize: 9,
    lineHeight: 1.5,
    paddingTop: 34,
    paddingBottom: 40,
    paddingHorizontal: 36,
    color: "#111",
  },
  header: { borderBottomWidth: 1.5, borderBottomColor: "#111", paddingBottom: 10, marginBottom: 12 },
  h1: { fontSize: 15, lineHeight: 1.4 },
  headMeta: { fontSize: 9, color: "#444", marginTop: 7 },
  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  brand: { fontSize: 9, color: "#444" },

  sectionTitle: {
    fontSize: 11,
    marginTop: 12,
    marginBottom: 6,
    paddingLeft: 6,
    borderLeftWidth: 4,
    borderLeftColor: "#111",
  },
  recentBox: { borderWidth: 1, borderColor: "#888", padding: 6, marginBottom: 4 },
  recentLine: { fontSize: 9 },

  item: { borderBottomWidth: 0.5, borderBottomColor: "#bbb", paddingVertical: 6 },
  itemHead: { flexDirection: "row", gap: 6, marginBottom: 3, alignItems: "center" },
  loc: { fontSize: 10 },
  kindChip: {
    fontSize: 8,
    borderWidth: 0.8,
    borderColor: "#111",
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  critChip: {
    fontSize: 8,
    borderWidth: 1.2,
    borderColor: "#111",
    backgroundColor: "#eee",
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  dateTxt: { fontSize: 8, color: "#555" },
  title: { fontSize: 9.5, marginBottom: 2 },

  baRow: { flexDirection: "row", gap: 6, marginTop: 2 },
  baLabel: { width: 42, fontSize: 8.5, color: "#333" },
  baText: { flex: 1, fontSize: 9 },
  // 세로 배치용 — flex:1 텍스트를 컬럼(column) 안에 두면 높이가 0 으로 접혀
  // 내용이 이웃 요소와 겹친다(2단 대비 박스에서 실측). 컬럼 컨텍스트는 이것을 쓴다.
  colText: { fontSize: 9 },
  answerLine: { fontSize: 11, marginVertical: 2 },
  // ★react-pdf 는 flex-row 안 flex:1 컬럼의 높이 계산이 불안정(내용이 박스를 벗어나
  //   이웃 요소와 겹침) — 고정 백분율 폭으로 배치한다.
  twoCol: { flexDirection: "row", justifyContent: "space-between", marginTop: 3 },
  colBox: {
    width: "48.5%",
    backgroundColor: "#f4f4f4",
    borderLeftWidth: 2,
    borderLeftColor: "#777",
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  colHead: { fontSize: 8, color: "#333", marginBottom: 2 },
  insertLabel: { fontSize: 8.5, color: "#333", marginBottom: 1 },
  reason: { fontSize: 8, color: "#555", marginTop: 3 },

  warnBox: {
    borderWidth: 1.4,
    borderColor: "#111",
    backgroundColor: "#f2f2f2",
    padding: 7,
    marginBottom: 6,
  },
  warnText: { fontSize: 9.5 },

  empty: { fontSize: 9, color: "#555", paddingVertical: 8 },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: "#999",
    paddingTop: 4,
  },
  footerText: { fontSize: 7.5, color: "#555" },
});

function fmtDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

function locationOf(item: SheetItem): string {
  const parts: string[] = [];
  if (item.pageNo != null) parts.push(`p.${item.pageNo}`);
  if (item.lineHint) parts.push(item.lineHint);
  if (item.pageNo == null && item.sortKey != null) parts.push(`수록순 ${item.sortKey}`);
  if (parts.length === 0 && item.tocPath) parts.push(item.tocPath);
  return parts.join(" · ") || "위치 미상";
}

function summaryLine(item: SheetItem): string {
  const kind = KIND_LABEL[item.kind ?? ""] ?? item.kind ?? "";
  return `· ${locationOf(item)}  ${kind} — ${item.title ?? ""}`;
}

function ItemBody({ item }: { item: SheetItem }) {
  // 유형별 렌더링 (§2.4) — errata_payload 의 before/after 문구 사용.
  if (item.isWithdrawalNotice) {
    return (
      <Text style={s.colText}>
        이전에 안내한 위 항목을 철회합니다. 기존에 출력하신 정오표에서 해당 항목을
        적용하지 마십시오. {item.reason ? `(사유: ${item.reason})` : ""}
      </Text>
    );
  }
  switch (item.kind) {
    case "answer_change":
      return (
        <View>
          {item.title ? <Text style={s.answerLine}>{item.title}</Text> : null}
          {item.beforeText ? (
            <View style={s.baRow}>
              <Text style={s.baLabel}>변경 전</Text>
              <Text style={s.baText}>{item.beforeText}</Text>
            </View>
          ) : null}
          {item.afterText ? (
            <View style={s.baRow}>
              <Text style={s.baLabel}>변경 후</Text>
              <Text style={s.baText}>{item.afterText}</Text>
            </View>
          ) : null}
        </View>
      );
    case "law_amend":
      return (
        <View style={s.twoCol}>
          <View style={s.colBox}>
            <Text style={s.colHead}>구(舊)</Text>
            <Text style={s.colText}>{item.beforeText || "—"}</Text>
          </View>
          <View style={s.colBox}>
            <Text style={s.colHead}>신(新)</Text>
            <Text style={s.colText}>{item.afterText || "—"}</Text>
          </View>
        </View>
      );
    case "deletion":
      return (
        <Text style={s.colText}>
          {item.beforeText ? `${item.beforeText} — ` : ""}해당 부분을 출제범위에서
          제외합니다.
        </Text>
      );
    case "addendum":
      return (
        <View>
          <Text style={s.insertLabel}>다음 내용을 삽입합니다.</Text>
          <Text style={s.colText}>{item.afterText || item.title || ""}</Text>
        </View>
      );
    default:
      // typo / precedent_change / 기타 — 변경 전/후 2행 대조
      return (
        <View>
          <View style={s.baRow}>
            <Text style={s.baLabel}>변경 전</Text>
            <Text style={s.baText}>{item.beforeText || "—"}</Text>
          </View>
          <View style={s.baRow}>
            <Text style={s.baLabel}>변경 후</Text>
            <Text style={s.baText}>{item.afterText || "—"}</Text>
          </View>
        </View>
      );
  }
}

function Item({ item, showEffective }: { item: SheetItem; showEffective?: boolean }) {
  return (
    <View style={s.item} wrap={false}>
      <View style={s.itemHead}>
        <Text style={s.loc}>{locationOf(item)}</Text>
        <Text style={item.severity === "critical" ? s.critChip : s.kindChip}>
          {item.severity === "critical" ? "긴급 · " : ""}
          {item.isWithdrawalNotice ? "철회" : (KIND_LABEL[item.kind ?? ""] ?? item.kind ?? "")}
        </Text>
        <Text style={s.dateTxt}>
          {showEffective && item.effectiveDate
            ? `${fmtDate(item.effectiveDate)} 시행`
            : fmtDate(item.publishedAt)}
        </Text>
      </View>
      {item.title && item.kind !== "answer_change" ? (
        <Text style={s.title}>{item.title}</Text>
      ) : null}
      <ItemBody item={item} />
      {item.reason && !item.isWithdrawalNotice ? (
        <Text style={s.reason}>근거: {item.reason}</Text>
      ) : null}
    </View>
  );
}

export function ErrataSheetDocument({ data }: { data: ErrataSheetData }) {
  const examYear = data.targetExamYear ?? new Date().getFullYear() + 1;
  return (
    <Document
      title={`${data.publicationTitle} 추록·정오표`}
      author="리담변리사학원"
    >
      <Page size="A4" style={s.page}>
        {/* 머리 */}
        <View style={s.header}>
          <View style={s.headRow}>
            <Text style={s.h1}>{data.publicationTitle} — 추록 및 정오표</Text>
            <Text style={s.brand}>리담변리사학원</Text>
          </View>
          <Text style={s.headMeta}>
            {data.editionLabel} · {examYear}년 시험 대비 · 최종 갱신{" "}
            {fmtDate(data.updatedAt)} · 총 {data.itemCount}건
          </Text>
        </View>

        {/* 최근 추가 (§2.2) */}
        {data.recent.length > 0 ? (
          <View wrap={false}>
            <Text style={s.sectionTitle}>최근 추가 ({fmtDate(data.updatedAt)})</Text>
            <View style={s.recentBox}>
              {data.recent.map((it) => (
                <Text key={it.revisionId} style={s.recentLine}>
                  {summaryLine(it)}
                </Text>
              ))}
            </View>
          </View>
        ) : null}

        {/* 본문 — 시험 적용 항목, 페이지순 (§2.3) */}
        <Text style={s.sectionTitle}>시험 적용 항목 [페이지순]</Text>
        {data.applicable.length > 0 ? (
          data.applicable.map((it) => <Item key={it.revisionId} item={it} />)
        ) : (
          <Text style={s.empty}>등록된 정오 사항이 없습니다.</Text>
        )}

        {/* 철회 고지 (§2.5) */}
        {data.withdrawals.length > 0 ? (
          <View>
            <Text style={s.sectionTitle}>이전 안내 철회</Text>
            {data.withdrawals.map((it) => (
              <Item key={it.revisionId} item={it} />
            ))}
          </View>
        ) : null}

        {/* 참고 — 시험 미적용 (§2.3 ★) */}
        {data.reference.length > 0 ? (
          <View>
            <Text style={s.sectionTitle}>참고 — {examYear}년 시험 미적용</Text>
            <View style={s.warnBox} wrap={false}>
              <Text style={s.warnText}>
                [경고] 아래 항목은 시험일 이후 시행되거나 적용 여부가 판정되지 않은
                내용입니다. 답안 작성 시 반영하지 마십시오.
              </Text>
            </View>
            {data.reference.map((it) => (
              <Item key={it.revisionId} item={it} showEffective />
            ))}
          </View>
        ) : null}

        {/* 바닥 — 교재명·갱신일·페이지 (§2.6) */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            {data.publicationTitle} {data.editionLabel} · 갱신 {fmtDate(data.updatedAt)}
          </Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

export async function renderErrataSheetPdf(data: ErrataSheetData): Promise<Buffer> {
  return renderToBuffer(<ErrataSheetDocument data={data} />);
}
