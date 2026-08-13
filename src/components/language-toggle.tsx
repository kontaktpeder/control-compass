import { useT } from "@/components/locale-provider";
import { LOCALES, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function LanguageToggle({ className }: { className?: string }) {
  const { locale, setLocale, t } = useT();
  return (
    <div className={cn("inline-flex rounded-md border border-border p-0.5", className)} role="group" aria-label={t("lang.label")}>
      {LOCALES.map((l) => (
        <button
          key={l.id}
          type="button"
          onClick={() => setLocale(l.id as Locale)}
          className={cn(
            "rounded px-2 py-0.5 text-[11px] font-medium transition",
            locale === l.id
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {l.id.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
