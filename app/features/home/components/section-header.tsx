import { PALETTE, Reveal } from "~/features/home/lib/landing";

interface SectionHeaderProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  align?: "center" | "left";
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  align = "center",
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
        <div
          style={{
            font: "600 12px/1 Pretendard, sans-serif",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: PALETTE.primary,
            marginBottom: 14,
          }}
        >
          {eyebrow}
        </div>
      </Reveal>
      <Reveal delay={80}>
        <h2
          style={{
            font: "800 clamp(24px, 3.4vw, 34px)/1.25 Pretendard, sans-serif",
            color: PALETTE.ink,
            letterSpacing: "-0.022em",
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
              maxWidth: 560,
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
