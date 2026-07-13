// feat-12 강의 플랫폼 랜딩 — /lecture/home. 편집형 배너 + 현장강의 일정 + 강사진 +
// 커리큘럼 + 후기 + 리담소식 + 도서 + FAQ + 오시는 길. 공개 접근(lecture.layout).
import { Link } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { listPasserSummaries } from "~/features/exam-results/analytics.server";
import { EXAM_ROUND_LABEL } from "~/features/exam-results/labels";
import { listInstructors } from "~/features/instructors/queries.server";

import { HeroCarousel } from "../components/hero-carousel";
import { LandingStyle } from "../components/landing-style";
import {
  FORMAT_LABEL,
  NEWS_KIND_LABEL,
  fillPercent,
  ddayFrom,
  remainingSeats,
  type LectureFormat,
  type NewsKind,
  type ScheduleStatus,
} from "../labels";
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
  const [banners, schedules, news, instructors, passers] = await Promise.all([
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
  ]);
  // 랜딩 강사진은 계열 구분 없이 한 줄 가로 스크롤 — 배치 순서(display_order) 그대로.
  return { banners, schedules, news, instructors, passers, todayISO };
}

const SEAT_CLASS = (rem: number) =>
  rem === 0 ? "low" : rem <= 8 ? "low" : rem <= 16 ? "mid" : "ok";

export default function Landing({ loaderData }: Route.ComponentProps) {
  const { banners, schedules, news, instructors, passers, todayISO } =
    loaderData;
  return (
    <div className="llx">
      <LandingStyle />
      <HeroCarousel banners={banners} schedules={schedules} todayISO={todayISO} />

      {/* 현장강의 일정 */}
      <section className="band" id="schedule">
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
            <div className="strip">
              {schedules.map((s) => {
                const rem = remainingSeats(s);
                const d = ddayFrom(s.start_date, todayISO);
                return (
                  <Reveal as="article" className="sc" key={s.schedule_id}>
                    <span className={`tag ${s.status}`}>
                      {s.status === "soon" && d !== null
                        ? `D-${d} 임박`
                        : s.status === "open"
                          ? "접수중"
                          : s.status === "waitlist"
                            ? "대기접수"
                            : "마감"}
                    </span>
                    <span className="subj">◆ {s.subject_label}</span>
                    <h3>{s.title}</h3>
                    <div className="tutor">{s.instructor_name}</div>
                    <div className="meta">
                      <div>
                        <span className="k">개강</span>
                        <span className="v tnum">
                          {s.start_date
                            ? s.start_date.slice(5).replace("-", "/")
                            : "예정"}
                        </span>
                      </div>
                      <div>
                        <span className="k">요일</span>
                        <span className="v">
                          {s.day_label ?? "-"}
                          {s.time_label ? ` ${s.time_label}` : ""}
                        </span>
                      </div>
                      <div>
                        <span className="k">형태</span>
                        <span className="v">
                          {FORMAT_LABEL[s.format as LectureFormat]}
                        </span>
                      </div>
                    </div>
                    <div className="gauge">
                      <i style={{ width: `${fillPercent(s)}%` }} />
                    </div>
                    <div className="foot">
                      <span className={`seatn ${SEAT_CLASS(rem)}`}>
                        {s.status === "closed" || rem === 0
                          ? "마감"
                          : `잔여 ${rem} / ${s.capacity}석`}
                      </span>
                      {d !== null ? <span className="ddayb">D-{d}</span> : null}
                    </div>
                  </Reveal>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* 강사진 */}
      <section className="band tint" id="tutors">
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
          {/* 계열 구분 없이 한 줄 가로 스크롤 — 너무 길면 좌우로 넘긴다. */}
          <Reveal className="igroup">
            <div className="igrid">
              {instructors.map((it) => (
                <Link
                  className="ic"
                  to={`/about/instructors/${it.slug}`}
                  key={it.instructorId}
                >
                  <span className="por">
                    {it.photoPath ? (
                      <img src={it.photoPath} alt={it.name} loading="lazy" />
                    ) : (
                      <b>{it.monogram ?? it.name.slice(0, 1)}</b>
                    )}
                  </span>
                  <span className="icb">
                    <span className="nm">{it.name}</span>
                    <span className="role">{it.subjectLabel}</span>
                  </span>
                </Link>
              ))}
            </div>
          </Reveal>
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

      {/* 리담소식 */}
      <section className="band" id="news">
        <div className="wrap">
          <Reveal className="shead">
            <div>
              <p className="eyebrow">리담소식</p>
              <h2>공지 · 이벤트 · 합격 속보</h2>
            </div>
            <Link className="more" to="/lecture/news">
              소식 전체 →
            </Link>
          </Reveal>
          <div className="newswrap">
            <Reveal className="newslist">
              {news.map((it) => (
                <Link className="nrow" to={`/lecture/news/${it.news_id}`} key={it.news_id}>
                  <span className={`chip ${it.kind}`}>
                    {NEWS_KIND_LABEL[it.kind as NewsKind]}
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
          <Reveal className="books">
            {[
              ["리담\n특허법\n기본서", "기본이론"],
              ["리담\n상표법\n조문노트", "조문 정리"],
              ["디자인\n보호법\n기본서", "기본이론"],
              ["민법\n핵심\n정리", "1차 대비"],
              ["민사\n소송법\n사례", "2차 논술"],
              ["자연\n과학\n기출", "기출 문제집"],
            ].map(([t, cap], i) => (
              <Link className="bk" to="/lecture/books" key={i}>
                <div className="cov">
                  <span className="bt" style={{ whiteSpace: "pre-line" }}>
                    {t}
                  </span>
                </div>
                <span className="cap">{cap}</span>
              </Link>
            ))}
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section className="band" id="faq">
        <div className="wrap">
          <Reveal className="shead" style={{ justifyContent: "center", textAlign: "center" }}>
            <div>
              <p className="eyebrow">자주 묻는 질문</p>
              <h2>궁금한 점을 먼저 확인하세요</h2>
            </div>
          </Reveal>
          <Reveal className="faq">
            {[
              [
                "현장강의와 영상강의는 무엇이 다른가요?",
                "현장강의는 정해진 요일·시간에 강의실(또는 실시간)로 참여하며, 반별 게시판·과제·상담이 함께 제공됩니다. 영상강의는 기간 이용권으로 기간 내 무제한 수강할 수 있습니다.",
              ],
              [
                "무료체험은 어떻게 신청하나요?",
                "회원가입만 하면 특허법 강의와 통합 학습 자료를 15일간 무료로 이용할 수 있습니다. 별도 결제 정보는 필요하지 않습니다.",
              ],
              [
                "종합반은 어떤 과목이 포함되나요?",
                "특허법·상표법·디자인보호법·민법·민사소송법 전 과목과 자연과학, 반별 커리큘럼·과제·모의고사·1:1 상담이 포함됩니다.",
              ],
              [
                "수강 취소·환불 규정이 궁금합니다.",
                "개강 전 100% 환불, 이후에는 수강 경과에 따라 관련 법령 기준으로 환불됩니다. 자세한 규정은 고객센터에서 확인하실 수 있습니다.",
              ],
            ].map(([q, a], i) => (
              <details className="qa" key={i} open={i === 0}>
                <summary>
                  <span className="q">Q</span>
                  {q}
                  <span className="ar">▾</span>
                </summary>
                <div className="a">{a}</div>
              </details>
            ))}
          </Reveal>
        </div>
      </section>

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
    </div>
  );
}
