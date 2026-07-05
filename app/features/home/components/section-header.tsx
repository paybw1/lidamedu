import { FONT, PALETTE, Reveal } from "~/features/home/lib/landing";

interface SectionHeaderProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  align?: "center" | "left";
  /** 부제 최대폭(px). 문장 단위 \n 줄바꿈이 접히지 않게 긴 문장 섹션에서 넓힌다. */
  subtitleMaxWidth?: number;
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  align = "center",
  subtitleMaxWidth = 560,
}: SectionHeaderProps) {
  return (
    <header
      style={{
        textAlign: align,
        marginBottom: 40,
        maxWidth: 720,
        marginLeft: align === "center" ? "auto" : 0,
        marginRight: align === "center" ? "auto" : 0,
      }}
    >
      <Reveal>
        <div style={{ marginBottom: 14 }}>
          <div
            aria-hidden="true"
            style={{
              width: 24,
              height: 2,
              borderRadius: 2,
              background: PALETTE.link,
              marginBottom: 10,
              marginLeft: align === "center" ? "auto" : 0,
              marginRight: align === "center" ? "auto" : 0,
            }}
          />
          <div
            style={{
              font: `600 14px/1 ${FONT.display}`,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: PALETTE.link,
            }}
          >
            {eyebrow}
          </div>
        </div>
      </Reveal>
      <Reveal delay={80}>
        <h2
          style={{
            font: `700 clamp(24px, 3.4vw, 34px)/1.25 ${FONT.display}`,
            color: PALETTE.ink,
            letterSpacing: "-0.01em",
            margin: 0,
            whiteSpace: "pre-line",
          }}
        >
          {title}
        </h2>
      </Reveal>
      {subtitle ? (
        <Reveal delay={160}>
          <p
            style={{
              font: "400 16px/1.7 Pretendard, sans-serif",
              color: PALETTE.inkSoft,
              margin: "14px auto 0",
              maxWidth: subtitleMaxWidth,
              letterSpacing: "-0.01em",
              whiteSpace: "pre-line",
            }}
          >
            {subtitle}
          </p>
        </Reveal>
      ) : null}
    </header>
  );
}
