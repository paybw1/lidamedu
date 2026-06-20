// 차트 색 SSOT — 손수 만든 차트(라이브러리 없음)들이 공유하는 색 규칙.
// 원칙(docs/survey/색정합성-점검.md ③ A안):
//   - 성과(점수·정답률): emerald(좋음)→lime→amber→orange→rose(나쁨) 의미 그라데이션.
//   - 활동·볼륨(히트맵·학습량 막대 등): primary(파랑) 단색 — 디자인 시스템 brand hue.
// 전부 테마 토큰/Tailwind 의미 클래스라 light/dark 자동 대응.

/**
 * 점수·정답률(0~100) → 의미 그라데이션 배경 클래스.
 * null(데이터 없음) = 중립 회색. 정답률 추이·합격예측 추이 등 성과 막대가 공유.
 */
export function scoreBgTone(value: number | null): string {
  if (value === null) return "bg-muted-foreground/30";
  if (value >= 80) return "bg-emerald-500/80";
  if (value >= 60) return "bg-lime-500/80";
  if (value >= 40) return "bg-amber-500/80";
  if (value >= 20) return "bg-orange-500/80";
  return "bg-rose-500/80";
}
