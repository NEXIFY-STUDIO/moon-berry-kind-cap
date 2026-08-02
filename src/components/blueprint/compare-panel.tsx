import { useMemo, useState } from "react";
import { GitCompareArrows, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { compareBlueprints } from "@/lib/blueprint/compare";
import type { Blueprint, BlueprintCompareResult } from "@/lib/blueprint/types";
import type { HistorySummary } from "@/lib/history/store";
import { get as historyGet } from "@/lib/history/store";
import { useI18n } from "@/lib/i18n/context";

type Props = {
  history: HistorySummary[];
  current?: Blueprint | null;
};

export function ComparePanel({ history, current }: Props) {
  const { t } = useI18n();
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  const [result, setResult] = useState<BlueprintCompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const options = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of history) {
      map.set(h.id, h.title);
    }
    if (current) map.set(current.id, current.meta.title || current.id);
    return [...map.entries()];
  }, [history, current]);

  async function runCompare() {
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const left =
        (current && current.id === leftId ? current : null) ||
        (await historyGet(leftId));
      const right =
        (current && current.id === rightId ? current : null) ||
        (await historyGet(rightId));
      if (!left || !right) {
        setError(t("compare.error"));
        return;
      }
      setResult(compareBlueprints(left, right));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-2">
        <GitCompareArrows className="size-4 text-fg-muted" />
        <h3 className="text-sm font-semibold">{t("compare.title")}</h3>
      </div>
      <p className="text-xs text-fg-muted">{t("compare.desc")}</p>

      <label className="block space-y-1">
        <span className="text-[11px] uppercase tracking-wide text-fg-subtle">
          {t("compare.left")}
        </span>
        <select
          className="flex h-10 w-full rounded-[var(--radius-sm)] border border-border bg-input px-2 text-sm text-fg"
          value={leftId}
          onChange={(e) => setLeftId(e.target.value)}
        >
          <option value="">{t("compare.pick")}</option>
          {options.map(([id, title]) => (
            <option key={id} value={id}>
              {title.slice(0, 40)}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-[11px] uppercase tracking-wide text-fg-subtle">
          {t("compare.right")}
        </span>
        <select
          className="flex h-10 w-full rounded-[var(--radius-sm)] border border-border bg-input px-2 text-sm text-fg"
          value={rightId}
          onChange={(e) => setRightId(e.target.value)}
        >
          <option value="">{t("compare.pick")}</option>
          {options.map(([id, title]) => (
            <option key={id} value={id}>
              {title.slice(0, 40)}
            </option>
          ))}
        </select>
      </label>

      <Button
        variant="secondary"
        className="w-full"
        disabled={!leftId || !rightId || leftId === rightId || busy}
        onClick={() => void runCompare()}
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <GitCompareArrows className="size-3.5" />
        )}
        {t("action.compare")}
      </Button>

      {error && <p className="text-xs text-danger">{error}</p>}

      {result && (
        <div className="space-y-2 rounded-[var(--radius-md)] border border-border bg-bg-subtle/60 p-3">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant={result.identical ? "success" : "warning"}>
              {result.identical ? t("compare.identical") : t("compare.diff")}
            </Badge>
            {result.summary.hashChanged && <Badge variant="danger">hash</Badge>}
            {result.summary.titleChanged && <Badge>title</Badge>}
          </div>
          <ul className="text-xs text-fg-muted space-y-1">
            <li>
              {t("compare.tech", {
                added: result.summary.techAdded.length,
                removed: result.summary.techRemoved.length,
              })}
            </li>
            <li>
              {t("compare.assets", { delta: result.summary.assetCountDelta })}
            </li>
            <li>
              {t("compare.links", { delta: result.summary.linkCountDelta })}
            </li>
            <li>
              {t("compare.pages", { delta: result.summary.pageCountDelta })}
            </li>
          </ul>
          {result.changes.length > 0 && (
            <div className="max-h-40 overflow-y-auto space-y-1 border-t border-border pt-2">
              {result.changes.slice(0, 25).map((c, i) => (
                <div
                  key={`${c.path}-${i}`}
                  className="mono text-[10px] text-fg-subtle break-all"
                >
                  <span className="text-fg-muted">[{c.kind}]</span> {c.path}
                  {c.left ? ` − ${c.left.slice(0, 60)}` : ""}
                  {c.right ? ` + ${c.right.slice(0, 60)}` : ""}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
