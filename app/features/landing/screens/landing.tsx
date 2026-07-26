// feat-12 강의 플랫폼 랜딩 — /lecture/home. 편집형 배너 + 현장강의 일정 + 강사진 +
// 커리큘럼 + 후기 + 리담소식 + 도서 + FAQ + 오시는 길. 공개 접근(lecture.layout).
import { Link } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { listBookstoreBooks } from "~/features/bookstore/queries.server";
import { listSupportFaqGroups } from "~/features/cs-inquiries/faq.server";
import { listPasserSummaries } from "~/features/exam-results/analytics.server";
import { EXAM_ROUND_LABEL } from "~/features/exam-results/labels";
import { listInstructors } from "~/features/instructors/queries.server";
import { listFeaturedReviews } from "~/features/lms/reviews.server";

import { BannerTiers } from "../components/banner-tiers";
import { FaqTabs } from "../components/faq-tabs";
import { HeroCarousel } from "../components/hero-carousel";
import { InstructorRail } from "../components/instructor-rail";
import { KakaoFloat } from "../components/kakao-float";
import { LandingStyle } from "../components/landing-style";
import { ScheduleRail } from "../components/schedule-rail";
import { newsKindChipClass, newsKindLabel } from "../labels";
import { listBanners, listNews, listSchedules } from "../queries.server";

import { Reveal } from "../components/reveal";
import type { Route } from "./+types/landing";

export function meta() {
  return [
    { title: "리담변리사학원 — 변리사 시험, 합격까지 함께" },
    {
      name: "description",
      content:
        "전임 강사진의 현장강의와 조문·판례·문제 통합 학습으로 변리사 시험 합격까지 함께합니다. 현장강의 일정·수강신청·합격 수기.",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const todayISO = new Date().toISOString();
  const [
    banners,
    schedules,
    news,
    instructors,
    passers,
    faqGroups,
    books,
    featuredReviews,
  ] = await Promise.all([
    listBanners(client),
    listSchedules(client, { todayISO, limit: 4 }),
    listNews(client, { limit: 5 }),
    listInstructors(client),
    listPasserSummaries({
      year: null,
      round: null,
      limit: 3,
      excludeSynthetic: true,
    }).catch(() => []),
    listSupportFaqGroups(client).catch(() => []),
    // 리담 교재 섹션 — 도서몰(도서구입) 판매중 도서 노출.
    listBookstoreBooks(client).catch(() => []),
    // 운영자 큐레이션 수강 후기 — 강의 랜딩 노출(취사선택). 비로그인(anon)에도 보이도록
    //   adminClient 로 조회(공개·미블라인드만 반환하는 공개-안전 쿼리).
    listFeaturedReviews(adminClient).catch(() => []),
  ]);
  // 랜딩 강사진은 계열 구분 없이 한 줄 가로 레일(좌우 화살표) — 배치 순서(display_order) 그대로.
  return {
    banners,
    schedules,
    news,
    instructors,
    passers,
    faqGroups,
    books: books.slice(0, 6),
    featuredReviews,
    todayISO,
  };
}

export default function Landing({ loaderData }: Route.ComponentProps) {
  const {
    banners,
    schedules,
    news,
    instructors,
    passers,
    faqGroups,
    books,
    featuredReviews,
    todayISO,
  } = loaderData;
  // tier 1=메인 히어로 캐러셀, 2·3=히어로 아래 추가 단.
  const tier1 = banners.filter((b) => (b.tier ?? 1) === 1);
  const tier2 = banners.filter((b) => b.tier === 2);
  const tier3 = banners.filter((b) => b.tier === 3);
  return (
    <div className="llx">
      <LandingStyle />
      <HeroCarousel banners={tier1} schedules={schedules} todayISO={todayISO} />
      <BannerTiers tier2={tier2} tier3={tier3} />

      {/* 리담소식 */}
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
                <Link className="nrow" to={`/lecture/news/${it.news_id}`} key={it.news_id}>
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
                <p>
                  가입만 해도 특허법 강의와 통합 학습 자료를 15일간 무료로.
                </p>
                <Link className="btn gilt" to="/join">
                  무료로 시작 →
                </Link>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* 현장강의 일정 */}
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

      {/* 커리큘럼 / 수강신청 */}
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

      {/* 도서 */}
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
                <Link className="bk" to={`/lecture/books/${b.bookId}`} key={b.bookId}>
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

      {/* 강사진 */}
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

      {/* 수강생 후기 — 운영자가 취사선택(랜딩 노출)한 수강 후기. 없으면 섹션 숨김. */}
      {featuredReviews.length > 0 ? (
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
              {featuredReviews.map((r) => (
                <Reveal as="article" className="rev" key={r.reviewId}>
                  <span className="badge" aria-label={`별점 ${r.rating}점`}>
                    {"★".repeat(r.rating)}
                    {"☆".repeat(5 - r.rating)}
                  </span>
                  <p className="q" style={{ whiteSpace: "pre-line" }}>
                    {r.body.length > 220 ? r.body.slice(0, 220) + "…" : r.body}
                  </p>
                  <div className="who">
                    <span className="av">
                      {(r.authorName ?? "수").slice(0, 1)}
                    </span>
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
      ) : null}

      {/* 후기 (실데이터: 합격자 수기, 없으면 CTA) */}
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
            <Reveal
              className="eventcard"
              style={{ display: "block" }}
            >
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

      {/* FAQ — 고객센터에서 옮겨 온 실제 FAQ(support_faqs). 분류 가로 탭. */}
      {faqGroups.length > 0 ? (
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
              <FaqTabs groups={faqGroups} />
            </Reveal>
            <div style={{ marginTop: 24 }}>
              <Link className="btn ghost" to="/lecture/support">
                고객센터 문의하기 →
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {/* 최종 CTA + 오시는 길 */}
      <section className="final">
        <div className="wrap final-in">
          <Reveal>
            <h2>
              변리사의 꿈, <br />
              리담에서 시작하세요.
            </h2>
            <p>첫 시작부터 합격의 순간까지, 그 모든 과정에 함께하겠습니다.</p>
            <div className="cta" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
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

      <KakaoFloat />
    </div>
  );
}
