import { COZY_INK_SOFT, COZY_LINE, type CozyPalette } from "~/core/lib/cozy-tokens";

type IconName = "clock" | "check" | "target";

type Props = {
  icon: IconName;
  label: string;
  value: string;
  unit: string;
  delta: string;
  palette: CozyPalette;
};

export default function CozyStatChip({
  icon,
  label,
  value,
  unit,
  delta,
  palette,
}: Props) {
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: `1px solid ${COZY_LINE}`,
        borderRadius: 14,
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: palette.tint,
          color: palette.primary,
          display: "grid",
          placeItems: "center",
        }}
      >
        <StatIcon name={icon} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11.5, color: COZY_INK_SOFT, marginBottom: 2 }}>
          {label}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
          <span
            style={{
              fontSize: 22,
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.02em",
            }}
          >
            {value}
          </span>
          <span style={{ fontSize: 11, color: COZY_INK_SOFT }}>{unit}</span>
        </div>
      </div>
      <div
        style={{
          fontSize: 10.5,
          color: palette.primary,
          fontWeight: 600,
          textAlign: "right",
        }}
      >
        ▲<br />
        {delta}
      </div>
    </div>
  );
}

function StatIcon({ name }: { name: IconName }) {
  const sw = 1.6;
  if (name === "clock") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth={sw} />
        <path
          d="M9 6v3l2 1.5"
          stroke="currentColor"
          strokeWidth={sw}
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (name === "check") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path
          d="M3 9.5l3.5 3L15 5"
          stroke="currentColor"
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth={sw} />
      <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth={sw} />
      <circle cx="9" cy="9" r="0.8" fill="currentColor" />
    </svg>
  );
}
