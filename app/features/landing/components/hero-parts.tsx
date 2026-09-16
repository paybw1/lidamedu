// 히어로 공용 조각 (feat-11-012 P3) — 배너 캐러셀과 소개 히어로가 함께 쓴다.
//   배너가 있을 때(HeroCarousel)와 없을 때(HeroIntro)가 **같은 오른쪽 카드·같은 강조 규칙**을
//   쓰도록 여기로 모았다. 둘이 갈라지면 배너를 내렸다 올릴 때마다 화면이 달라 보인다.
//   ★.llx 스코프 CSS(landing-style.tsx)를 그대로 쓴다 — 새 CSS 없음.
//   ★*.server 값 import 금지.
import { ddayFrom, remainingSeats, type ScheduleRow } from "../labels";

/** 제목 안의 한 조각만 강조(.hl — 슬랩 위 밝은 하이라이트). 강조어가 제목에 없으면 그대로 출력. */
export function Headline({ text, hl }: { text: string; hl: string | null }) {
  if (!hl || !text.includes(hl)) return <>{text}</>;
  const i = text.indexOf(hl);
  return (
    <>
      {text.slice(0, i)}
      <span className="hl">{hl}</span>
      {text.slice(i + hl.length)}
    </>
  );
}

/** 히어로 오른쪽 — 개강 임박 3건. */
export function ScheduleHeroCard({
  schedules,
  todayISO,
}: {
  schedules: ScheduleRow[];
  todayISO: string;
}) {
  const top = schedules.slice(0, 3);
  return (
    <div className="hcard" aria-label="개강 임박 강의">
      <div className="hh">
        <span className="lab">개강 임박</span>
        <span className="live">
          <span className="dot" />
          실시간 접수중
        </span>
      </div>
      {top.length === 0 ? (
        <p style={{ color: "var(--hero-soft)", fontSize: 13, padding: "8px 4px" }}>
          예정된 개강 일정이 곧 공개됩니다.
        </p>
      ) : (
        top.map((s) => {
          const d = ddayFrom(s.start_date, todayISO);
          return (
            <div className="hrow" key={s.schedule_id}>
              <div className="dday">
                <b>{d === null ? "예정" : `D-${d}`}</b>
                <span>
                  {s.start_date ? s.start_date.slice(5).replace("-", "/") : ""}{" "}
                  개강
                </span>
              </div>
              <div className="mid">
                <div className="s">
                  {s.subject_label} {s.title}
                </div>
                <div className="m">
                  {s.instructor_name}
                  {s.day_label ? ` · ${s.day_label}` : ""}
                </div>
              </div>
              <div className="seat">잔여 {remainingSeats(s)}석</div>
            </div>
          );
        })
      )}
    </div>
  );
}

/** 첫 화면 신뢰 지표 스트립. 값은 site-intro.ts 의 buildSiteFacts 가 만든다. */
export function TrustStrip({
  facts,
}: {
  facts: ReadonlyArray<{ n: string; u: string; l: string }>;
}) {
  if (facts.length === 0) return null;
  return (
    <div className="trust">
      {facts.map((f) => (
        <div className="t" key={f.l}>
          <span className="n">
            {f.n}
            <span className="u">{f.u}</span>
          </span>
          <span className="l">{f.l}</span>
        </div>
      ))}
    </div>
  );
}
