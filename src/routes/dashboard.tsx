/**
 * TEST tools catalog at /dashboard.
 * When approved, this becomes the production dashboard route.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  GitCompareArrows,
  History,
  Home,
  Import,
  LayoutDashboard,
  ScanLine,
} from "lucide-react";
import { ToolCard } from "@/components/dashboard/tool-card";
import {
  TOOL_CARDS,
  TOOL_CATEGORIES,
  cardsByCategory,
  homeHrefForAction,
  type ToolCardDef,
} from "@/lib/dashboard/catalog";
import { LanguageSwitcher, useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { locale } = useI18n();
  const sk = locale === "sk";

  function handleActivate(card: ToolCardDef) {
    window.location.href = homeHrefForAction(card.action);
  }

  const sideNav: Array<{
    href: string;
    label: string;
    icon: typeof Home;
    active: boolean;
  }> = [
    {
      href: "/",
      label: sk ? "Domov" : "Home",
      icon: Home,
      active: false,
    },
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      active: true,
    },
    {
      href: "/?open=history",
      label: sk ? "História" : "History",
      icon: History,
      active: false,
    },
    {
      href: "/?open=compare",
      label: sk ? "Porovnať" : "Compare",
      icon: GitCompareArrows,
      active: false,
    },
    {
      href: "/?open=import",
      label: "Import",
      icon: Import,
      active: false,
    },
  ];

  return (
    <div className="min-h-dvh bg-bg text-fg flex">
      <div className="fixed top-3 right-3 sm:top-4 sm:right-4 z-40">
        <LanguageSwitcher />
      </div>

      {/* Sidebar */}
      <aside className="hidden md:flex w-[220px] shrink-0 flex-col border-r border-border bg-bg-elevated/40">
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-border">
          <div className="flex size-8 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-bg-subtle text-accent">
            <ScanLine className="size-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight">Blueprint</span>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          {sideNav.map((item) => {
            const Icon = item.icon;
            const cls = cn(
              "flex items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-sm transition-colors",
              item.active
                ? "bg-bg-subtle text-fg font-medium border border-border"
                : "text-fg-muted hover:text-fg hover:bg-bg-subtle/60",
            );
            return (
              <a key={item.label} href={item.href} className={cls}>
                <Icon className="size-4 shrink-0" />
                {item.label}
              </a>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border text-[11px] text-fg-subtle space-y-1">
          <p className="font-medium text-warning/90">TEST ROUTE</p>
          <p className="mono">/dashboard</p>
          <p>
            {sk
              ? "Po schválení sa stane ostrou verziou"
              : "Promote when UI is approved"}
          </p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="md:hidden h-14 shrink-0 border-b border-border px-3 flex items-center justify-between gap-2 bg-bg pr-[5.5rem]">
          <div className="flex items-center gap-2 min-w-0">
            <ScanLine className="size-4 text-accent shrink-0" />
            <span className="text-sm font-semibold truncate">Dashboard</span>
            <span className="text-[10px] text-warning mono">test</span>
          </div>
          <a
            href="/"
            className="text-xs text-fg-muted hover:text-fg border border-border rounded-lg px-2.5 py-1.5"
          >
            {sk ? "Domov" : "Home"}
          </a>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8 space-y-8">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-subtle px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
                <span className="size-1.5 rounded-full bg-accent" />
                {sk ? "Nástroje" : "Tools"}
                <span className="text-warning font-mono normal-case tracking-normal">
                  · test
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-balance">
                {sk
                  ? "Katalóg Blueprint nástrojov."
                  : "Blueprint tools catalog."}
              </h1>
              <p className="text-sm text-fg-muted max-w-2xl text-balance">
                {sk
                  ? "Každý nástroj spúšťa existujúcu funkciu appky — sken, analýza, WordPress extract, export alebo AI rebuild."
                  : "Each tool launches an existing app feature — scan, analysis, WordPress extract, export, or AI rebuild."}
              </p>
              <p className="text-xs text-fg-subtle">
                {TOOL_CARDS.length} {sk ? "nástrojov" : "tools"} ·{" "}
                {TOOL_CATEGORIES.length} {sk ? "kategórií" : "categories"}
              </p>
            </div>

            {TOOL_CATEGORIES.map((cat) => {
              const cards = cardsByCategory(cat.id);
              if (cards.length === 0) return null;
              return (
                <section key={cat.id} className="space-y-3">
                  <div className="flex items-end justify-between gap-3 border-b border-border pb-2">
                    <div>
                      <h2 className="text-sm font-semibold text-fg">
                        {sk ? cat.labelSk : cat.labelEn}
                      </h2>
                      {(sk ? cat.descSk : cat.descEn) && (
                        <p className="text-xs text-fg-subtle mt-0.5">
                          {sk ? cat.descSk : cat.descEn}
                        </p>
                      )}
                    </div>
                    <span className="text-[11px] mono text-fg-subtle shrink-0">
                      {cards.length}
                    </span>
                  </div>
                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {cards.map((card) => (
                      <ToolCard
                        key={card.id}
                        card={card}
                        onActivate={handleActivate}
                      />
                    ))}
                  </div>
                </section>
              );
            })}

            <footer className="pt-4 pb-8 border-t border-border text-xs text-fg-subtle flex flex-wrap gap-x-4 gap-y-1">
              <span>TEST · /dashboard</span>
              <a href="/" className="text-fg-muted hover:text-accent">
                {sk ? "← Späť na sken" : "← Back to scan"}
              </a>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
