import { AlertTriangle, CheckCircle2, Download, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CompletenessReport } from "@/lib/rebuild/completeness";
import type { RebuildSpec } from "@/lib/rebuild/spec";
import { stableStringify } from "@/lib/rebuild/spec";
import { useI18n } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";
import { downloadText } from "@/lib/blueprint/storage";

type Props = {
  spec: RebuildSpec;
  report: CompletenessReport;
};

export function CompletenessCard({ spec, report }: Props) {
  const { t } = useI18n();
  const score = report.score;
  const tone =
    score >= 75 ? "success" : score >= 45 ? "warning" : "danger";

  function downloadSpec() {
    downloadText(
      `${spec.id}.rebuild-spec.json`,
      stableStringify(spec),
      "application/json",
    );
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-bg-subtle/50 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Gauge className="size-4 text-accent shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-fg">
              {t("rebuild.completeness", { score })}
            </div>
            <div className="text-[11px] text-fg-subtle">
              {t("rebuild.completenessHint")}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            data-testid="completeness-score"
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold mono",
              tone === "success" &&
                "border-success/30 bg-success/10 text-success",
              tone === "warning" &&
                "border-warning/30 bg-warning/10 text-warning",
              tone === "danger" && "border-danger/30 bg-danger/10 text-danger",
            )}
          >
            {score}%
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={downloadSpec}
            data-testid="download-rebuild-spec"
          >
            <Download className="size-3.5" />
            {t("rebuild.downloadSpec")}
          </Button>
        </div>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-bg border border-border flex">
        {report.weights.map((w) => (
          <div
            key={w.id}
            title={`${w.id}: ${w.earned}/${w.max}`}
            className={cn(
              "h-full transition-all",
              w.ok
                ? "bg-accent/80"
                : w.earned > 0
                  ? "bg-warning/70"
                  : "bg-transparent",
            )}
            style={{ width: `${w.max}%` }}
          />
        ))}
      </div>

      {report.missing.length > 0 && (
        <ul className="space-y-1.5" data-testid="completeness-missing">
          {report.missing.map((w) => (
            <li
              key={w.id}
              className="flex items-start gap-2 text-xs text-fg-muted"
            >
              <AlertTriangle className="size-3.5 text-warning shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="font-medium text-fg">
                  {t(w.labelKey as MessageKey)}{" "}
                  <span className="text-fg-subtle mono font-normal">
                    {w.earned}/{w.max}
                  </span>
                </div>
                {w.fixKey && (
                  <div className="text-fg-muted">{t(w.fixKey as MessageKey)}</div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {report.missing.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-success">
          <CheckCircle2 className="size-3.5" />
          {t("rebuild.complete")}
        </div>
      )}
    </div>
  );
}
