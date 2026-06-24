import { ArrowRightIcon } from "lucide-react";

import {
  FONT,
  LandingButton,
  PALETTE,
  Reveal,
} from "~/features/home/lib/landing";

export function FinalCta() {
  return (
    <section
      aria-labelledby="finalcta-h2"
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: "80px 24px 96px",
      }}
    >
      <Reveal
        style={{
          maxWidth: 720,
          margin: "0 auto",
          background: PALETTE.gradientPeople,
          color: "#fff",
          borderRadius: 16,
          padding: "clamp(36px, 5vw, 56px)",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
          boxShadow: "0 16px 48px rgba(45, 91, 168, 0.22)",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: -40,
            right: -40,
            width: 160,
            height: 160,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.22)",
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: -50,
            left: -50,
            width: 180,
            height: 180,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.12)",
          }}
        />

        <h2
          id="finalcta-h2"
          style={{
            font: `700 clamp(28px, 4vw, 40px)/1.25 ${FONT.display}`,
            letterSpacing: "-0.01em",
            margin: "0 0 12px",
            position: "relative",
            color: "#fff",
          }}
        >
          오늘부터 한 걸음씩, 차근차근 ☕
        </h2>
        <p
          style={{
            font: "400 16px/1.7 Pretendard, sans-serif",
            color: "rgba(255,255,255,0.84)",
            letterSpacing: "-0.01em",
            margin: "0 0 28px",
            position: "relative",
          }}
        >
          가입은 1분이면 충분합니다. 카드 정보 없이 시작해 보세요.
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 10,
            flexWrap: "wrap",
            position: "relative",
          }}
        >
          <LandingButton
            size="lg"
            variant="onDark"
            to="/join"
            iconRight={<ArrowRightIcon size={17} strokeWidth={1.8} />}
          >
            무료로 시작하기
          </LandingButton>
          <LandingButton size="lg" variant="onDarkGhost" to="/login">
            이미 계정이 있어요
          </LandingButton>
        </div>
      </Reveal>
    </section>
  );
}
