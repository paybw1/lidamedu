import type { CSSProperties, ReactNode } from "react";

import { COZY_INK_SOFT, COZY_LINE } from "~/core/lib/cozy-tokens";

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  style?: CSSProperties;
};

export default function CozyCard({ title, subtitle, children, style }: Props) {
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: `1px solid ${COZY_LINE}`,
        borderRadius: 16,
        padding: 18,
        boxShadow: "0 2px 16px rgba(107,66,38,0.06)",
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h3>
        {subtitle ? (
          <span style={{ fontSize: 11.5, color: COZY_INK_SOFT }}>
            {subtitle}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
