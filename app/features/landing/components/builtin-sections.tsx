// feat-11-009 — 기존 메인화면 섹션을 붙박이 모듈로 옮겨 담은 것.
//
// ★내용은 손대지 않았다. screens/landing.tsx 에 있던 JSX 를 그대로 옮겨 kind 별
//   컴포넌트로 나눴을 뿐이다. 모듈형 CMS 로 바꾸면서 지금 화면을 잃지 않기 위한 장치라,
//   여기서 디자인을 고치면 "첫날 화면 그대로" 라는 전제가 깨진다.
// 붙박이는 설정이 없다 — 각 섹션의 내용은 자기 소유 화면에서 관리한다
//   (소식=/admin/lecture-news, 일정=/admin/lecture-schedules, 도서=도서몰 …).
import type { ComponentProps } from "react";

import { Link } from "react-router";

import { EXAM_ROUND_LABEL } from "~/features/exam-results/labels";
import { REVIEWS_ENABLED } from "~/features/lms/reviews-config";

import { FaqTabs } from "./faq-tabs";
import { InstructorRail } from "./instructor-rail";
import { LectureVideoSection } from "./lecture-video-section";
import { Reveal } from "./reveal";
import { ScheduleRail } from "./schedule-rail";
import { newsKindChipClass, newsKindLabel } from "../labels";
import type { NewsRow, ScheduleRow } from "../labels";

// ── 공부방법 & 맛보기 영상 ──────────────────────────────────────────────
export function BuiltinVideo({
  videos,
}: {
  videos: ComponentProps<typeof LectureVideoSection>["videos"];
}) {
  return <LectureVideoSection videos={videos} />;
}

// ── 리담소식 ────────────────────────────────────────────────────────────
export function BuiltinNews({ news }: { news: NewsRow[] }) {
  return (
    <section className="band" id="news">
      <div className="wrap">
        <Reveal className="shead">
          <div>
            <p className="eyebrow">리담소식</p>
            <h2>공지 · 이벤트</h2>
          </div>
          <Link className="more" to="/lecture/news">
            소식 전체 →
          </Link>
        </Reveal>
        <div className="newswrap">
          <Reveal className="newslist">
            {news.map((it) => (
              <Link
                className="nrow"
                to={`/lecture/news/${it.news_id}`}
                key={it.news_id}
              >
                <span className={`chip ${newsKindChipClass(it.kind)}`}>
                  {newsKindLabel(it.kind)}
                </span>
                <span className="nt">{it.title}</span>
                <span className="nd tnum">
                  {it.published_at.slice(5, 10).replace("-", "/")}
                </span>
              </Link>
            ))}
            {news.length === 0 ? (
              <p style={{ color: "var(--soft)", fontSize: 14, padding: "8px 0" }}>
                등록된 소식이 없습니다.
              </p>
            ) : null}
          </Reveal>
          <Reveal className="eventcard">
            <div className="in">
              <span className="k">진행중 이벤트</span>
              <h3>
                특허법 무료체험
                <br />
                15일, 지금 시작
              </h3>
              <p>가입만 해도 특허법 강의와 통합 학습 자료를 15일간 무료로.</p>
              <Link className="btn gilt" to="/join">
                무료로 시작 →
              </Link>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ── 현장강의 일정 ───────────────────────────────────────────────────────
export function BuiltinSchedule({
  schedules,
  todayISO,
}: {
  schedules: ScheduleRow[];
  todayISO: string;
}) {
  return (
    <section className="band tint" id="schedule">
      <div className="wrap">
        <Reveal className="shead">
          <div>
            <p className="eyebrow">현장강의 일정</p>
            <h2>다가오는 개강, 한눈에</h2>
            <p>과목·강사·요일·잔여석을 개강일 순으로.</p>
          </div>
          <Link className="more" to="/lecture/schedule">
            전체 시간표 →
          </Link>
        </Reveal>
        {schedules.length === 0 ? (
          <p style={{ color: "var(--soft)", fontSize: 14 }}>
            예정된 개강 일정이 곧 공개됩니다.
          </p>
        ) : (
          <Reveal>
            <ScheduleRail schedules={schedules} todayISO={todayISO} />
          </Reveal>
        )}
      </div>
    </section>
  );
}

// ── 수강신청 3단 ────────────────────────────────────────────────────────
export function BuiltinCurriculum() {
  return (
    <section className="band" id="curriculum">
      <div className="wrap">
        <Reveal className="shead">
          <div>
            <p className="eyebrow">수강신청</p>
            <h2>내게 맞는 방식으로 시작하기</h2>
            <p>과목 단위부터 전 과목 종합반, 기간 자유 이용권까지.</p>
          </div>
          <Link className="more" to="/lecture/catalog">
            전체 상품 →
          </Link>
        </Reveal>
        <div className="tiers">
          <Reveal className="tier">
            <span className="tn">과목별 수강</span>
            <div className="desc">필요한 과목만 골라 듣습니다.</div>
            <ul>
              <li>
                <span className="ck">✓</span>선택 과목 현장·영상 강의
              </li>
              <li>
                <span className="ck">✓</span>조문·판례·문제 통합 자료
              </li>
              <li>
                <span className="ck">✓</span>과목별 진도·오답 관리
              </li>
            </ul>
            <Link className="btn ghost" to="/lecture/catalog">
              과목 선택하기
            </Link>
          </Reveal>
          <Reveal className="tier feat">
            <span className="tn">종합반 (1·2차)</span>
            <div className="desc">
              전 과목 + 반별 커리큘럼 + 과제·상담·모의고사까지 한 번에.
            </div>
            <ul>
              <li>
                <span className="ck">✓</span>전 과목 현장강의 + 실시간
              </li>
              <li>
                <span className="ck">✓</span>반별 게시판·과제·1:1 상담
              </li>
              <li>
                <span className="ck">✓</span>주간 모의고사 + 약점 개인과제
              </li>
              <li>
                <span className="ck">✓</span>출결·진도 리포트
              </li>
            </ul>
            <Link className="btn gilt" to="/lecture/catalog">
              종합반 신청
            </Link>
          </Reveal>
          <Reveal className="tier">
            <span className="tn">기간 이용권(T-PASS)</span>
            <div className="desc">기간 내 개설 영상 강의 무제한.</div>
            <ul>
              <li>
                <span className="ck">✓</span>기간 내 영상 강의 무제한
              </li>
              <li>
                <span className="ck">✓</span>배속·구간반복·기기 2대
              </li>
              <li>
                <span className="ck">✓</span>도서 구매 할인
              </li>
            </ul>
            <Link className="btn ghost" to="/lecture/catalog">
              기간권 보기
            </Link>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

export interface LandingBook {
  bookId: string;
  title: string;
  coverPath: string | null;
  priceKrw: number;
}

// ── 리담 교재 ───────────────────────────────────────────────────────────
export function BuiltinBooks({ books }: { books: LandingBook[] }) {
  return (
    <section className="band tint" id="books">
      <div className="wrap">
        <Reveal className="shead">
          <div>
            <p className="eyebrow">리담 교재</p>
            <h2>강의와 하나로 설계된 교재</h2>
          </div>
          <Link className="more" to="/lecture/books">
            도서몰 →
          </Link>
        </Reveal>
        {books.length > 0 ? (
          <Reveal className="books">
            {books.map((b) => (
              <Link
                className="bk"
                to={`/lecture/books/${b.bookId}`}
                key={b.bookId}
              >
                <div className="cov">
                  {b.coverPath ? (
                    <img
                      className="bkimg"
                      src={b.coverPath}
                      alt={b.title}
                      loading="lazy"
                    />
                  ) : (
                    <span className="bt">{b.title}</span>
                  )}
                </div>
                <span className="bkt">{b.title}</span>
                <span className="cap tnum">
                  {b.priceKrw.toLocaleString("ko-KR")}원
                </span>
              </Link>
            ))}
          </Reveal>
        ) : (
          <p style={{ color: "var(--soft)", fontSize: 14 }}>
            판매 중인 교재가 곧 공개됩니다.
          </p>
        )}
      </div>
    </section>
  );
}

// ── 전임 강사진 ─────────────────────────────────────────────────────────
export function BuiltinInstructors({
  instructors,
}: {
  instructors: ComponentProps<typeof InstructorRail>["items"];
}) {
  return (
    <section className="band" id="tutors">
      <div className="wrap">
        <Reveal className="shead">
          <div>
            <p className="eyebrow">전임 강사진</p>
            <h2>가르치는 사람이 곧 교재입니다</h2>
            <p>과목마다 전임 강사가 강의와 학습 자료를 함께 설계합니다.</p>
          </div>
          <Link className="more" to="/about/instructors">
            강사진 전체 →
          </Link>
        </Reveal>
        {/* 계열 구분 없이 한 줄 가로 레일 — 양 끝 화살표 버튼으로 좌우로 넘긴다. */}
        <Reveal className="igroup">
          <InstructorRail items={instructors} />
        </Reveal>
      </div>
    </section>
  );
}

export interface LandingReview {
  reviewId: string;
  rating: number;
  body: string;
  authorName: string | null;
  targetLabel: string;
}

// ── 수강생 후기 ─────────────────────────────────────────────────────────
export function BuiltinReviews({ reviews }: { reviews: LandingReview[] }) {
  // 기능 숨김이거나 큐레이션된 후기가 없으면 섹션을 통째로 감춘다(기존 동작 유지).
  if (!REVIEWS_ENABLED || reviews.length === 0) return null;
  return (
    <section className="band" id="course-reviews">
      <div className="wrap">
        <Reveal className="shead">
          <div>
            <p className="eyebrow">수강생 후기</p>
            <h2>강의를 들은 수강생의 목소리</h2>
            <p>강의를 완강한 수강생이 직접 남긴 평가입니다.</p>
          </div>
        </Reveal>
        <div className="revs">
          {reviews.map((r) => (
            <Reveal as="article" className="rev" key={r.reviewId}>
              <span className="badge" aria-label={`별점 ${r.rating}점`}>
                {"★".repeat(r.rating)}
                {"☆".repeat(5 - r.rating)}
              </span>
              <p className="q" style={{ whiteSpace: "pre-line" }}>
                {r.body.length > 220 ? r.body.slice(0, 220) + "…" : r.body}
              </p>
              <div className="who">
                <span className="av">{(r.authorName ?? "수").slice(0, 1)}</span>
                <span>
                  <span className="nm">{r.authorName ?? "수강생"}</span>{" "}
                  <span className="mt">· {r.targetLabel}</span>
                </span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export interface LandingPasser {
  resultId: string;
  examYear: number;
  examRound: keyof typeof EXAM_ROUND_LABEL;
  summaryMd: string;
  displayName: string | null;
  scoreBucket: string | null;
  verified: boolean;
}

// ── 합격 수기 ───────────────────────────────────────────────────────────
export function BuiltinPassers({ passers }: { passers: LandingPasser[] }) {
  return (
    <section className="band tint" id="reviews">
      <div className="wrap">
        <Reveal className="shead">
          <div>
            <p className="eyebrow">합격 수기 · 수강 후기</p>
            <h2>먼저 걸어간 선배들의 기록</h2>
            <p>합격자가 직접 남긴 학습 전략과 후기.</p>
          </div>
          <Link className="more" to="/community/review">
            수기 전체 →
          </Link>
        </Reveal>
        {passers.length > 0 ? (
          <div className="revs">
            {passers.slice(0, 3).map((p) => (
              <Reveal as="article" className="rev" key={p.resultId}>
                <span className="badge">
                  ✓ {p.examYear} {EXAM_ROUND_LABEL[p.examRound]} 합격
                </span>
                <p className="q" style={{ whiteSpace: "pre-line" }}>
                  {p.summaryMd.length > 220
                    ? p.summaryMd.slice(0, 220) + "…"
                    : p.summaryMd}
                </p>
                <div className="who">
                  <span className="av">
                    {(p.displayName ?? "합").slice(0, 1)}
                  </span>
                  <span>
                    <span className="nm">{p.displayName ?? "익명 합격자"}</span>{" "}
                    <span className="mt">
                      · {p.scoreBucket ?? ""} {p.verified ? "· 인증" : ""}
                    </span>
                  </span>
                </div>
              </Reveal>
            ))}
          </div>
        ) : (
          <Reveal className="eventcard" style={{ display: "block" }}>
            <div className="in">
              <span className="k">합격 수기</span>
              <h3>합격자들의 생생한 학습 기록</h3>
              <p>
                먼저 합격한 선배들의 학습 전략과 후기를 커뮤니티 합격 수기
                게시판에서 확인하세요.
              </p>
              <Link className="btn gilt" to="/community/review">
                합격 수기 보러가기 →
              </Link>
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}

// ── 자주 묻는 질문 ──────────────────────────────────────────────────────
export function BuiltinFaq({
  groups,
}: {
  groups: ComponentProps<typeof FaqTabs>["groups"];
}) {
  if (groups.length === 0) return null;
  return (
    <section className="band" id="faq">
      <div className="wrap">
        <Reveal className="shead">
          <div>
            <p className="eyebrow">자주 묻는 질문</p>
            <h2>궁금한 점을 먼저 확인하세요</h2>
            <p className="faqhint">
              분류를 눌러 자주 묻는 질문을 확인하고, 해결되지 않으면 고객센터로
              문의해 주세요.
            </p>
          </div>
        </Reveal>
        <Reveal>
          <FaqTabs groups={groups} />
        </Reveal>
        <div style={{ marginTop: 24 }}>
          <Link className="btn ghost" to="/lecture/support">
            고객센터 문의하기 →
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── 최종 CTA · 오시는 길 ────────────────────────────────────────────────
export function BuiltinFinal() {
  return (
    <section className="final">
      <div className="wrap final-in">
        <Reveal>
          <h2>
            변리사의 꿈, <br />
            리담에서 시작하세요.
          </h2>
          <p>첫 시작부터 합격의 순간까지, 그 모든 과정에 함께하겠습니다.</p>
          <div
            className="cta"
            style={{ display: "flex", gap: 12, flexWrap: "wrap" }}
          >
            <Link className="btn gilt" to="/lecture/catalog">
              수강신청 →
            </Link>
            <Link className="btn ghost on-navy" to="/lecture/support">
              상담 문의
            </Link>
          </div>
        </Reveal>
        <Reveal className="loc">
          <div className="li">
            <span className="k">주소</span>
            <span className="v">서울 서초구 서초대로 131 로고스빌딩 2층</span>
          </div>
          <div className="li">
            <span className="k">지하철</span>
            <span className="v">7호선 내방역 8번 출구 도보 4분</span>
          </div>
          <div className="li">
            <span className="k">문의</span>
            <span className="v">
              <Link to="/lecture/support" style={{ textDecoration: "underline" }}>
                고객센터
              </Link>
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
