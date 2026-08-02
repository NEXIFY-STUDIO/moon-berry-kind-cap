import { Trash2, History, RefreshCw, Cloud, HardDrive, Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HistoryMode, HistorySummary } from "@/lib/history/store";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

type Props = {
  items: HistorySummary[];
  activeId?: string | null;
  mode?: HistoryMode;
  loading?: boolean;
  error?: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRetry?: () => void;
  onClearAll?: () => void;
};

function SkeletonRows() {
  return (
    <ul className="space-y-2" data-testid="history-skeleton">
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="h-[4.25rem] rounded-[var(--radius-md)] border border-border bg-bg-subtle/60 animate-pulse"
        />
      ))}
    </ul>
  );
}

export function HistoryList({
  items,
  activeId,
  mode = "local",
  loading = false,
  error = null,
  onSelect,
  onDelete,
  onRetry,
  onClearAll,
}: Props) {
  const { t } = useI18n();

  const badge =
    mode === "remote" ? (
      <span
        data-testid="history-badge-synced"
        className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success"
      >
        <Cloud className="size-3" />
        {t("history.badge.synced")}
      </span>
    ) : (
      <span
        data-testid="history-badge-local"
        className="inline-flex items-center gap-1 rounded-full border border-border bg-bg-subtle px-2 py-0.5 text-[10px] font-medium text-fg-muted"
      >
        <HardDrive className="size-3" />
        {t("history.badge.local")}
      </span>
    );

  if (loading) {
    return (
      <div className="panel p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <History className="size-4 text-fg-muted" />
            <h3 className="text-sm font-semibold">{t("history.loading")}</h3>
          </div>
          {badge}
        </div>
        <SkeletonRows />
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel p-5 text-sm" data-testid="history-error">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 text-fg">
            <History className="size-4" />
            <span className="font-medium">{t("history.errorTitle")}</span>
          </div>
          {badge}
        </div>
        <p className="text-danger text-xs mb-3">{error}</p>
        {onRetry && (
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw className="size-3.5" />
            {t("history.retry")}
          </Button>
        )}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="panel p-5 text-sm text-fg-muted">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-fg">
            <History className="size-4" />
            <span className="font-medium">{t("action.history")}</span>
          </div>
          {badge}
        </div>
        <p className="mt-2">{t("history.empty")}</p>
      </div>
    );
  }

  return (
    <div className="panel p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <History className="size-4 text-fg-muted shrink-0" />
          <h3 className="text-sm font-semibold truncate">
            {t("history.title", { count: items.length })}
          </h3>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {badge}
          {onClearAll && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px] text-fg-muted hover:text-danger"
              onClick={onClearAll}
              aria-label={t("history.clearAll")}
            >
              <Eraser className="size-3.5" />
              <span className="hidden sm:inline">{t("history.clearAll")}</span>
            </Button>
          )}
        </div>
      </div>
      <ul className="space-y-2">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id}>
              <div
                className={cn(
                  "group flex items-start gap-2 rounded-[var(--radius-md)] border px-3 py-2.5 transition-colors",
                  active
                    ? "border-border-strong bg-bg-subtle"
                    : "border-border bg-bg/40 hover:bg-bg-subtle/80",
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onSelect(item.id)}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate text-sm font-medium text-fg">
                      {item.title}
                    </span>
                    {item.remoteOnly && (
                      <span className="shrink-0 rounded-full border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[9px] text-accent">
                        {t("history.remoteOnly")}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] mono text-fg-subtle">
                    {item.sourceUrl || item.id}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {item.tech.slice(0, 3).map((tech) => (
                      <span
                        key={tech}
                        className="rounded-full bg-bg-elevated border border-border px-1.5 py-0.5 text-[10px] text-fg-muted"
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0 opacity-70 hover:opacity-100"
                  aria-label={t("action.delete")}
                  onClick={() => onDelete(item.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
