import {
  AlertTriangle,
  Archive,
  Blocks,
  Bot,
  Code2,
  Database,
  FileArchive,
  FileCode2,
  FileJson,
  FormInput,
  GitCompareArrows,
  Globe,
  Globe2,
  Hash,
  History,
  Import,
  Layers,
  LayoutGrid,
  LayoutTemplate,
  Map,
  Network,
  Package,
  Palette,
  Sparkles,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  homeHrefForAction,
  type ToolCardDef,
} from "@/lib/dashboard/catalog";
import { useI18n } from "@/lib/i18n/context";

const ICONS: Record<string, LucideIcon> = {
  AlertTriangle,
  Archive,
  Blocks,
  Bot,
  Code2,
  Database,
  FileArchive,
  FileCode2,
  FileJson,
  FormInput,
  GitCompareArrows,
  Globe,
  Globe2,
  Hash,
  History,
  Import,
  Layers,
  LayoutGrid,
  LayoutTemplate,
  Map,
  Network,
  Package,
  Palette,
  Sparkles,
  Wand2,
};

const TONE_ICON: Record<NonNullable<ToolCardDef["tone"]>, string> = {
  default: "bg-bg-subtle text-fg-muted border-border",
  accent: "bg-accent/15 text-accent border-accent/30",
  info: "bg-info/15 text-info border-info/30",
  success: "bg-success/15 text-success border-success/30",
  warning: "bg-warning/15 text-warning border-warning/30",
};

type Props = {
  card: ToolCardDef;
  onActivate?: (card: ToolCardDef) => void;
};

export function ToolCard({ card, onActivate }: Props) {
  const { locale } = useI18n();
  const Icon = ICONS[card.icon] ?? Blocks;
  const tone = card.tone ?? "default";
  const href = homeHrefForAction(card.action);
  const title = locale === "sk" ? card.titleSk : card.titleEn;
  const description = locale === "sk" ? card.descSk : card.descEn;

  const body = (
    <>
      <div
        className={cn(
          "size-11 shrink-0 rounded-[var(--radius-md)] border grid place-items-center transition-colors",
          TONE_ICON[tone],
        )}
      >
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <h3 className="text-sm font-semibold tracking-tight text-fg truncate">
          {title}
        </h3>
        <p className="text-xs leading-relaxed text-fg-muted line-clamp-2">
          {description}
        </p>
      </div>
    </>
  );

  const className = cn(
    "group flex items-start gap-3 rounded-[var(--radius-lg)] border border-border bg-bg-elevated/80 p-3.5",
    "transition-[border-color,background-color,box-shadow,transform] duration-150",
    "hover:border-border-strong hover:bg-bg-subtle hover:shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-accent)_35%,transparent)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
    "active:scale-[0.99]",
  );

  if (onActivate) {
    return (
      <button
        type="button"
        className={cn(className, "w-full text-left")}
        onClick={() => onActivate(card)}
      >
        {body}
      </button>
    );
  }

  return (
    <a href={href} className={className}>
      {body}
    </a>
  );
}
