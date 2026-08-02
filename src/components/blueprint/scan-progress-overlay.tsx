import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import { clampPercent } from "@/lib/scan/progress-machine";

type Props = {
  active: boolean;
  percent: number;
  finishing?: boolean;
  className?: string;
};

const R = 54;
const C = 2 * Math.PI * R;

export function ScanProgressOverlay({
  active,
  percent,
  finishing = false,
  className,
}: Props) {
  const { t } = useI18n();
  const p = clampPercent(percent);
  const offset = C * (1 - p / 100);

  if (!active) return null;

  return (
    <div
      className={cn("scan-progress-overlay", finishing && "is-finishing", className)}
      data-testid="scan-progress-overlay"
      role="status"
      aria-live="polite"
      aria-busy={!finishing}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={p}
    >
      <div className="scan-progress-overlay__card">
        <div className="scan-progress-overlay__ring-wrap">
          <svg
            className="scan-progress-overlay__svg"
            viewBox="0 0 128 128"
            width="128"
            height="128"
            aria-hidden
          >
            <circle
              className="scan-progress-overlay__track"
              cx="64"
              cy="64"
              r={R}
              fill="none"
              strokeWidth="6"
            />
            <circle
              className="scan-progress-overlay__bar"
              cx="64"
              cy="64"
              r={R}
              fill="none"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={offset}
              transform="rotate(-90 64 64)"
            />
          </svg>
          {finishing && <span className="scan-progress-overlay__spark" aria-hidden />}
          <div className="scan-progress-overlay__pct mono" data-testid="scan-progress-pct">
            {p}
            <span className="scan-progress-overlay__pct-sign">%</span>
          </div>
        </div>
        <p className="scan-progress-overlay__label">{t("scan.progress")}</p>
      </div>
    </div>
  );
}
