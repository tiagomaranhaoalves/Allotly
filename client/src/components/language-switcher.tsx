import { useTranslation } from "react-i18next";
import { Globe, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS, type SupportedLanguage } from "@/i18n";

interface Props {
  variant?: "light" | "dark";
}

const SHORT_LABELS: Record<SupportedLanguage, string> = {
  en: "EN",
  "pt-BR": "PT",
  es: "ES",
};

export function LanguageSwitcher({ variant = "light" }: Props) {
  const { i18n, t } = useTranslation();
  const current = (SUPPORTED_LANGUAGES as readonly string[]).includes(i18n.resolvedLanguage || "")
    ? (i18n.resolvedLanguage as SupportedLanguage)
    : "en";

  const triggerClass =
    variant === "dark"
      ? "gap-1.5 h-8 px-2.5 text-white/70 hover:text-white hover:bg-white/5"
      : "gap-1.5 h-8 px-2.5 text-muted-foreground hover:text-foreground";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={triggerClass}
          aria-label={t("language.label")}
          data-testid="button-language-switcher"
        >
          <Globe className="w-4 h-4" />
          <span className="text-xs font-semibold tabular-nums">{SHORT_LABELS[current]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {SUPPORTED_LANGUAGES.map((lng) => (
          <DropdownMenuItem
            key={lng}
            onClick={() => i18n.changeLanguage(lng)}
            className="flex items-center justify-between gap-3 cursor-pointer"
            data-testid={`menuitem-lang-${lng}`}
          >
            <span>{LANGUAGE_LABELS[lng]}</span>
            {current === lng && <Check className="w-3.5 h-3.5 text-indigo-500" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
