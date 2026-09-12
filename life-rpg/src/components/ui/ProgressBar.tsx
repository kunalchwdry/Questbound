interface ProgressBarProps {
  value: number;
  max: number;
  label: string;
  color?: string;
  className?: string;
}

export function ProgressBar({ value, max, label, color, className }: ProgressBarProps) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div
      className={`bar ${className ?? ""}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(Math.min(value, max))}
      aria-label={label}
    >
      <span
        style={{
          width: `${pct}%`,
          background: color ?? "linear-gradient(90deg, var(--xp), var(--xp-2))",
        }}
      />
    </div>
  );
}
