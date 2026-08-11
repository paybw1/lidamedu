// feat-12 현장강의 상세 — /lecture/schedule/:scheduleId. 공개. 과정(course) 판매 페이지.
//   결제금액 → 과정소개 → 강의목차 → 일정 정보. 하단 sticky 장바구니·수강신청.
import { Link, data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { MarkdownView } from "~/features/problems/components/markdown-view";

import { LandingStyle } from "../components/landing-style";
import { ScheduleBuyBar } from "../components/schedule-buy-bar";
import {
  FORMAT_LABEL,
  ddayFrom,
  type LectureFormat,
} from "../labels";
import { getSchedule } from "../queries.server";

import type { Route } from "./+types/schedule-detail";

export function meta({ data: d }: Route.MetaArgs) {
  return [{ title: `${d?.schedule?.title ?? "현장강의"} | 리담변리사학원` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const id = params.scheduleId;
  if (!id) throw data("현장강의를 찾을 수 없습니다", { status: 404 });
  const schedule = await getSchedule(client, id);
  if (!schedule || !schedule.published)
    throw data("현장강의를 찾을 수 없습니다", { status: 404 });

  // 연결 상품(가격·결제 권위).
  let plan: {
    code: string;
    name: string;
    priceKrw: number;
    buyable: boolean;
  } | null = null;
  if (schedule.plan_code) {
    const { data: p } = await client
      .from("subscription_plans")
      .select("code, name, price_krw, is_active, sale_status")
      .eq("code", schedule.plan_code)
      .maybeSingle();
    if (p)
      plan = {
        code: p.code,
        name: p.name,
        priceKrw: p.price_krw,
        buyable: p.is_active && p.sale_status === "on_sale",
      };
  }
  return {
    schedule,
    plan,
    todayISO: new Date().toISOString(),
    tossClientKey: process.env.TOSS_CLIENT_KEY ?? null,
  };
}

const STATUS_LABEL: Record<string, string> = {
  soon: "개강 임박",
  open: "접수중",
  waitlist: "대기접수",
  closed: "마감",
};

export default function ScheduleDetail({ loaderData }: Route.ComponentProps) {
  const { schedule: s, plan, todayISO, tossClientKey } = loaderData;
  const d = ddayFrom(s.start_date, todayISO);

  return (
    <div className="llx">
      <LandingStyle />
      <DetailStyle />

      <main
        className="wrap"
        style={{ maxWidth: 820, padding: "36px 24px 120px" }}
      >
        <Link className="more" to="/lecture/schedule">
          ← 강의 일정으로
        </Link>

        {/* 헤더: 과목·강좌명·강사 + 결제금액 */}
        <div className="sd-head">
          <div className="sd-top">
            <span className={`sd-tag ${s.status}`}>
              {s.status === "soon" && d !== null
                ? `D-${d} 임박`
                : STATUS_LABEL[s.status] ?? s.status}
            </span>
            <span className="sd-subj">◆ {s.subject_label}</span>
          </div>
          <h1 className="sd-title">{s.title}</h1>
          <p className="sd-tutor">{s.instructor_name}</p>

          <div className="sd-price">
            <span className="k">수강료</span>
            {plan ? (
              <b className="tnum">{plan.priceKrw.toLocaleString("ko-KR")}원</b>
            ) : (
              <b className="muted">가격 문의</b>
            )}
          </div>
        </div>

        {/* 과정소개 */}
        {s.intro_md ? (
          <section className="sd-sec">
            <h2>과정 소개</h2>
            <div className="sd-md">
              <MarkdownView text={s.intro_md} trusted />
            </div>
          </section>
        ) : null}

        {/* 강의목차 */}
        {s.curriculum_md ? (
          <section className="sd-sec">
            <h2>강의 목차</h2>
            <div className="sd-md">
              <MarkdownView text={s.curriculum_md} trusted />
            </div>
          </section>
        ) : null}

        {/* 일정 정보 */}
        <section className="sd-sec">
          <h2>강의 정보</h2>
          <dl className="sd-meta">
            <div>
              <dt>개강일</dt>
              <dd className="tnum">
                {s.start_date ? s.start_date.replace(/-/g, ". ") : "예정"}
                {d !== null ? <span className="dday">D-{d}</span> : null}
              </dd>
            </div>
            <div>
              <dt>요일 · 시간</dt>
              <dd>
                {s.day_label ?? "-"}
                {s.time_label ? ` · ${s.time_label}` : ""}
              </dd>
            </div>
            <div>
              <dt>수업 형태</dt>
              <dd>{FORMAT_LABEL[s.format as LectureFormat]}</dd>
            </div>
            <div>
              <dt>강사</dt>
              <dd>{s.instructor_name}</dd>
            </div>
          </dl>
          {s.note ? (
            <div className="sd-note">
              <div className="sd-note-h">안내</div>
              <p>{s.note}</p>
            </div>
          ) : null}
        </section>
      </main>

      <ScheduleBuyBar
        planCode={plan?.code ?? null}
        buyable={plan?.buyable ?? false}
        tossClientKey={tossClientKey}
        failPath={`/lecture/schedule/${s.schedule_id}?failed=1`}
      />
    </div>
  );
}

function DetailStyle() {
  return (
    <style>{`
.llx .sd-head{margin-top:16px;background:var(--lsurface);border:1px solid var(--line);border-radius:18px;padding:26px 28px;box-shadow:var(--lshadow)}
.llx .sd-top{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.llx .sd-tag{font-size:12px;font-weight:800;color:#fff;padding:4px 11px;border-radius:8px}
.llx .sd-tag.soon{background:var(--hot)}.llx .sd-tag.open{background:var(--blue)}.llx .sd-tag.waitlist{background:var(--warn)}.llx .sd-tag.closed{background:var(--faint)}
.llx .sd-subj{font-size:13px;font-weight:800;color:var(--gilt);letter-spacing:.04em}
.llx .sd-title{font-size:clamp(22px,3vw,30px);font-weight:900;letter-spacing:-.03em;margin:14px 0 6px;text-wrap:balance}
.llx .sd-tutor{font-size:15px;color:var(--soft);font-weight:700}
.llx .sd-price{display:flex;align-items:baseline;gap:10px;margin-top:18px;padding-top:18px;border-top:1px solid var(--line)}
.llx .sd-price .k{font-size:13px;font-weight:800;color:var(--faint)}
.llx .sd-price b{font-size:28px;font-weight:900;letter-spacing:-.03em;color:var(--ink)}
.llx .sd-price b.muted{font-size:20px;color:var(--soft)}
.llx .sd-sec{margin-top:30px}
.llx .sd-sec>h2{font-size:18px;font-weight:900;letter-spacing:-.02em;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid var(--gilt-soft);display:inline-block}
.llx .sd-md{font-size:15px;line-height:1.8;color:var(--ink)}
.llx .sd-md :is(h1,h2,h3){font-weight:800;margin:16px 0 8px}
.llx .sd-md ul,.llx .sd-md ol{padding-left:20px;margin:8px 0}
.llx .sd-md li{margin:4px 0}
.llx .sd-md table{border-collapse:collapse;width:100%;margin:10px 0;font-size:14px}
.llx .sd-md th,.llx .sd-md td{border:1px solid var(--line);padding:8px 10px;text-align:left}
.llx .sd-md th{background:var(--lground);font-weight:800}
.llx .sd-meta{display:grid;grid-template-columns:repeat(2,1fr);gap:14px 20px;background:var(--lsurface);border:1px solid var(--line);border-radius:14px;padding:20px}
.llx .sd-meta dt{font-size:12px;font-weight:800;color:var(--faint);margin-bottom:4px}
.llx .sd-meta dd{font-size:15px;font-weight:700;color:var(--ink);display:flex;align-items:center;gap:8px}
.llx .sd-meta .dday{font-size:12px;font-weight:900;color:var(--gilt);background:var(--blue-wash);padding:2px 8px;border-radius:6px}
.llx .sd-note{background:var(--lground);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin-top:14px}
.llx .sd-note-h{font-size:12px;font-weight:800;color:var(--gilt);margin-bottom:6px}
.llx .sd-note p{font-size:14px;color:var(--soft);line-height:1.75;white-space:pre-wrap}
/* 하단 sticky 구매 바 */
.llx .sbuy{position:sticky;bottom:0;left:0;right:0;z-index:20;background:color-mix(in srgb,var(--lsurface) 92%,transparent);backdrop-filter:blur(8px);border-top:1px solid var(--line2);box-shadow:0 -8px 24px -16px rgba(22,41,74,.5)}
.llx .sbuy-in{max-width:820px;margin:0 auto;padding:12px 24px;display:flex;align-items:center;justify-content:flex-end;gap:16px}
.llx .sbuy-btns{display:flex;gap:8px;flex-shrink:0}
@media (max-width:560px){
  .llx .sd-meta{grid-template-columns:1fr}
}
`}</style>
  );
}
