import {
  COZY_INK,
  COZY_INK_SOFT,
  COZY_LINE,
  type CozyPalette,
} from "~/core/lib/cozy-tokens";

export type ChecklistItem = {
  label: string;
  meta: string;
  done: boolean;
};

type Props = {
  palette: CozyPalette;
  items: ChecklistItem[];
  onToggle: (index: number) => void;
};

export default function CozyChecklist({ palette, items, onToggle }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((it, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onToggle(i)}
          style={{
            all: "unset",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 14px",
            background: it.done ? palette.tint : "#FFFFFF",
            border: `1px solid ${it.done ? palette.soft : COZY_LINE}`,
            borderRadius: 14,
            transition: "all 160ms ease",
          }}
        >
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: 7,
              background: it.done ? palette.primary : "transparent",
              border: `1.5px solid ${it.done ? palette.primary : "#C9B9A6"}`,
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            {it.done ? (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2.5 6.2l2.4 2.3L9.5 3.5"
                  stroke="#FFF"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : null}
          </span>
          <span
            style={{
              flex: 1,
              fontSize: 14.5,
              fontWeight: 500,
              color: it.done ? COZY_INK_SOFT : COZY_INK,
              textDecoration: it.done ? "line-through" : "none",
              textDecorationColor: COZY_INK_SOFT,
            }}
          >
            {it.label}
          </span>
          <span
            style={{
              fontSize: 12,
              color: COZY_INK_SOFT,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {it.meta}
          </span>
        </button>
      ))}
    </div>
  );
}
