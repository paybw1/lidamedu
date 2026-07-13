// feat-12 현장강의 상세 — /lecture/schedule/:scheduleId. 공개. 일정 카드에서 진입.
import { Link, data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";

import { LandingStyle } from "../components/landing-style";
import {
  FORMAT_LABEL,
  fillPercent,
  ddayFrom,
  remainingSeats,
  type LectureFormat,
} from "../labels";
import { getSchedule } from "../queries.server";

import type { Route } from "./+types/schedule-detail";

export function meta({ data: d }: Route.MetaArgs) {
  return [
    { title: `${d?.schedule?.title ?? "현장강의"} | 리담변리사학원` },
  ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const id = params.scheduleId;
  if (!id) throw data("현장강의를 찾을 수 없습니다", { status: 404 });
  const schedule = await getSchedule(client, id);
  if (!schedule || !schedule.published)
    throw data("현장강의를 찾을 수 없습니다", { status: 404 });
  return { schedule, todayISO: new Date().toISOString() };
}

const STATUS_LABEL: Record<string, string> = {
  soon: "개강 임박",
  open: "접수중",
  waitlist: "대기접수",
  closed: "마감",
};

export default function ScheduleDetail({ loaderData }: Route.ComponentProps) {
  const { schedule: s, todayISO } = loaderData;
  const rem = remainingSeats(s);
  const d = ddayFrom(s.start_date, todayISO);

  return (
    <div className="llx">
      <LandingStyle />
      <DetailStyle />

      <main className="wrap" style={{ maxWidth: 820, padding: "36px 24px 72px" }}>
        <Link className="more" to="/lecture/schedule">
          ← 강의 일정으로
        </Link>

        <div className="sd-card">
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
              <dt>정원</dt>
              <dd className="tnum">
                {s.status === "closed" || rem === 0
                  ? "마감"
                  : `잔여 ${rem} / ${s.capacity}석`}
              </dd>
            </div>
          </dl>

          <div className="sd-gauge">
            <i style={{ width: `${fillPercent(s)}%` }} />
          </div>

          {s.note ? (
            <div className="sd-note">
              <div className="sd-note-h">안내</div>
              <p>{s.note}</p>
            </div>
          ) : null}

          <div className="sd-cta">
            <Link className="btn gilt" to="/lecture/catalog">
              수강신청 →
            </Link>
            <Link className="btn ghost" to="/lecture/support">
              문의하기
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function DetailStyle() {
  return (
    <style>{`
.llx .sd-card{margin-top:16px;background:var(--lsurface);border:1px solid var(--line);border-radius:18px;padding:28px;box-shadow:var(--lshadow)}
.llx .sd-top{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.llx .sd-tag{font-size:12px;font-weight:800;color:#fff;padding:4px 11px;border-radius:8px}
.llx .sd-tag.soon{background:var(--hot)}.llx .sd-tag.open{background:var(--blue)}.llx .sd-tag.waitlist{background:var(--warn)}.llx .sd-tag.closed{background:var(--faint)}
.llx .sd-subj{font-size:13px;font-weight:800;color:var(--gilt);letter-spacing:.04em}
.llx .sd-title{font-size:clamp(22px,3vw,30px);font-weight:900;letter-spacing:-.03em;margin:14px 0 6px;text-wrap:balance}
.llx .sd-tutor{font-size:15px;color:var(--soft);font-weight:700}
.llx .sd-meta{display:grid;grid-template-columns:repeat(2,1fr);gap:14px 20px;margin:22px 0 16px;border-top:1px solid var(--line);padding-top:20px}
.llx .sd-meta dt{font-size:12px;font-weight:800;color:var(--faint);margin-bottom:4px}
.llx .sd-meta dd{font-size:15px;font-weight:700;color:var(--ink);display:flex;align-items:center;gap:8px}
.llx .sd-meta .dday{font-size:12px;font-weight:900;color:var(--gilt);background:var(--blue-wash);padding:2px 8px;border-radius:6px}
.llx .sd-gauge{height:8px;border-radius:99px;background:var(--line);overflow:hidden;margin-bottom:20px}
.llx .sd-gauge i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--gilt-2),var(--gilt))}
.llx .sd-note{background:var(--lground);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin-bottom:22px}
.llx .sd-note-h{font-size:12px;font-weight:800;color:var(--gilt);margin-bottom:6px}
.llx .sd-note p{font-size:14px;color:var(--soft);line-height:1.75;white-space:pre-wrap}
.llx .sd-cta{display:flex;gap:10px;flex-wrap:wrap}
@media (max-width:560px){.llx .sd-meta{grid-template-columns:1fr}}
`}</style>
  );
}
