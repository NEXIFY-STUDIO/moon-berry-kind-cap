import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  LOCALE_STORAGE_KEY,
  translate,
  type Locale,
  type MessageKey,
} from "./messages";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    const v = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (v === "sk" || v === "en") return v;
  } catch {
    /* ignore */
  }
  return "en";
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLocaleState(readStoredLocale());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      /* ignore */
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale === "sk" ? "sk" : "en";
    }
  }, [locale, ready]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
  }, []);

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) =>
      translate(locale, key, vars),
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Fallback for tests / components outside provider
    return {
      locale: "en",
      setLocale: () => {},
      t: (key, vars) => translate("en", key, vars),
    };
  }
  return ctx;
}

/**
 * Fixed-size EN | SK control.
 * Labels never change with locale (prevents width jump) and the control is
 * intended to sit in a pinned corner so page reflow cannot move it vertically.
 */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t("lang.switch")}
      className={`inline-grid grid-cols-2 w-[4.75rem] shrink-0 rounded-lg border border-border overflow-hidden text-[11px] font-medium leading-none ${className}`}
    >
      <button
        type="button"
        onClick={() => setLocale("en")}
        aria-pressed={locale === "en"}
        aria-label={t("lang.en")}
        title={t("lang.en")}
        className={
          locale === "en"
            ? "h-8 grid place-items-center bg-accent text-accent-fg"
            : "h-8 grid place-items-center text-fg-muted hover:text-fg"
        }
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLocale("sk")}
        aria-pressed={locale === "sk"}
        aria-label={t("lang.sk")}
        title={t("lang.sk")}
        className={
          locale === "sk"
            ? "h-8 grid place-items-center bg-accent text-accent-fg"
            : "h-8 grid place-items-center text-fg-muted hover:text-fg"
        }
      >
        SK
      </button>
    </div>
  );
}
