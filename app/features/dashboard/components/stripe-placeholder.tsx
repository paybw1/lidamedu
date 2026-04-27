type Props = {
  label: string;
  w: number | string;
  h: number | string;
  accent?: string;
  radius?: number;
  dense?: boolean;
};

export default function StripePlaceholder({
  label,
  w,
  h,
  accent = "#C17D52",
  radius = 12,
  dense = false,
}: Props) {
  const stripeBg = `repeating-linear-gradient(135deg, ${accent}22 0 8px, ${accent}11 8px 16px)`;
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: radius,
        background: stripeBg,
        border: `1px solid ${accent}33`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
        fontSize: dense ? 10 : 11,
        color: accent,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        flexShrink: 0,
      }}
    >
      {label}
    </div>
  );
}
