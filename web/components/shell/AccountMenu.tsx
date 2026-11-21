"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight, ChevronsUpDown, Coins, Languages, LogOut, Monitor, Moon, Palette, Settings, Sun } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { THEME_PACK_ORDER, ThemePacks } from "@shared/constants/themes";
import { APP_LANGUAGES, type AppLanguageCode } from "@shared/lib/appLanguages";

import { useAuth } from "@/components/AuthProvider";
import { CheckoutReturnDialog } from "@/components/credits/CheckoutReturnDialog";
import { useLanguage } from "@/components/LanguageProvider";
import { useTheme } from "@/components/ThemeProvider";
import { signOut } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { useCreditBalance } from "@/lib/credits/balance";
import { formatCount } from "@/lib/credits/format";
import type { ThemePreference } from "@/lib/theme";

const itemClass =
  "relative flex h-10 cursor-pointer select-none items-center gap-3 rounded-xl px-3 text-[15px] text-text outline-none data-[highlighted]:bg-element data-[disabled]:opacity-50";

function Avatar({ email, size = "md" }: { email: string; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-primary font-bold text-on-primary uppercase",
        size === "sm" ? "h-8 w-8 text-sm" : "h-9 w-9 text-[15px]",
      )}
    >
      {email.charAt(0) || "?"}
    </span>
  );
}

function SubMenu({ icon, label, value, children }: { icon: ReactNode; label: string; value: string; children: ReactNode }) {
  return (
    <Menu.Sub>
      <Menu.SubTrigger className={cn(itemClass, "data-[state=open]:bg-element")}>
        {icon}
        <span className="flex-1">{label}</span>
        <span className="truncate text-sm text-muted">{value}</span>
        <ChevronRight aria-hidden className="h-4 w-4 text-muted rtl:rotate-180" />
      </Menu.SubTrigger>
      <Menu.Portal>
        <Menu.SubContent
          sideOffset={6}
          collisionPadding={12}
          className="z-50 min-w-56 animate-pop-in rounded-2xl border border-frosted-border bg-surface p-1.5 shadow-lift"
        >
          {children}
        </Menu.SubContent>
      </Menu.Portal>
    </Menu.Sub>
  );
}

function RadioItem({ value, children }: { value: string; children: ReactNode }) {
  return (
    <Menu.RadioItem value={value} className={itemClass}>
      <span className="grid w-4 place-items-center">
        <Menu.ItemIndicator>
          <Check aria-hidden className="h-4 w-4 text-primary" />
        </Menu.ItemIndicator>
      </span>
      {children}
    </Menu.RadioItem>
  );
}

/**
 * The balance, one click from anywhere, and a way to buy more. Kept to one quiet line in the menu, not on the button.
 */
function CreditsItem() {
  const { t, i18n } = useTranslation();
  const { quota, loading } = useCreditBalance();
  const empty = quota != null && quota.totalCredits <= 0;
  return (
    <Menu.Item asChild className={itemClass}>
      <Link href="/settings/credits">
        <Coins aria-hidden className="h-4 w-4" />
        <span className="flex-1">{t("settings.recipeCredits")}</span>
        {quota ? (
          <span className={cn("text-sm tabular-nums", empty ? "font-semibold text-accent" : "text-muted")}>
            {empty ? t("web.credits.menuBuy") : formatCount(quota.totalCredits, i18n.language)}
          </span>
        ) : loading ? (
          <span aria-hidden className="h-3.5 w-6 rounded-full bg-element motion-safe:animate-pulse" />
        ) : null}
      </Link>
    </Menu.Item>
  );
}

/**
 * Who is signed in, and the choices people change most on the web: light or dark, the colour theme, the
 * language. One click away from every page; the full set lives in Settings. Opens with Enter, Space or the
 * arrow keys, and Escape closes it.
 */
export function AccountMenu({ variant }: { variant: "full" | "compact" }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { preference, setPreference, pack, setPack } = useTheme();
  const { language, setLanguage } = useLanguage();
  const email = user?.email ?? "";

  const modes: { value: ThemePreference; label: string; icon: ReactNode }[] = [
    { value: "system", label: t("theme.auto"), icon: <Monitor aria-hidden className="h-4 w-4" /> },
    { value: "light", label: t("theme.light"), icon: <Sun aria-hidden className="h-4 w-4" /> },
    { value: "dark", label: t("theme.dark"), icon: <Moon aria-hidden className="h-4 w-4" /> },
  ];
  const currentMode = modes.find((mode) => mode.value === preference) ?? modes[0];
  const currentLanguage = APP_LANGUAGES.find((lang) => lang.code === language);

  async function handleSignOut() {
    await signOut();
    router.replace("/auth?mode=signin");
  }

  return (
    <>
      {/* Back from Polar's checkout, on whichever page it was bought from. The menu is on every signed-in page. */}
      <CheckoutReturnDialog />
      <Menu.Root>
        <Menu.Trigger
          aria-label={t("web.accountMenu")}
          className={cn(
            "group flex items-center rounded-2xl text-start transition-colors hover:bg-element data-[state=open]:bg-element",
            variant === "full" ? "w-full gap-3 p-2" : "p-1",
          )}
        >
          <Avatar email={email} size={variant === "full" ? "md" : "sm"} />
          {variant === "full" ? (
            <>
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-muted">{t("web.account")}</span>
                <span className="block truncate text-sm font-semibold text-text" dir="ltr">
                  {email}
                </span>
              </span>
              <ChevronsUpDown aria-hidden className="h-4 w-4 shrink-0 text-muted" />
            </>
          ) : null}
        </Menu.Trigger>

        <Menu.Portal>
          <Menu.Content
            align={variant === "full" ? "start" : "end"}
            side={variant === "full" ? "top" : "bottom"}
            sideOffset={8}
            collisionPadding={12}
            className="z-50 w-72 animate-pop-in rounded-2xl border border-frosted-border bg-surface p-1.5 shadow-lift"
          >
            <div className="flex items-center gap-3 px-3 pt-2 pb-3">
              <Avatar email={email} />
              <div className="min-w-0">
                <p className="text-xs text-muted">{t("web.signedInAs")}</p>
                <p className="truncate text-sm font-semibold text-text" dir="ltr">
                  {email}
                </p>
              </div>
            </div>
            <CreditsItem />
            <Menu.Separator className="mx-1 my-1 h-px bg-border" />

            <SubMenu icon={currentMode.icon} label={t("settings.appearance")} value={currentMode.label}>
              <Menu.RadioGroup value={preference} onValueChange={(value) => setPreference(value as ThemePreference)}>
                {modes.map((mode) => (
                  <RadioItem key={mode.value} value={mode.value}>
                    {mode.icon}
                    {mode.label}
                  </RadioItem>
                ))}
              </Menu.RadioGroup>
            </SubMenu>

            <SubMenu icon={<Palette aria-hidden className="h-4 w-4" />} label={t("web.colorTheme")} value={t(`themes.${pack}.name`)}>
              <Menu.RadioGroup value={pack} onValueChange={(value) => setPack(value as typeof pack)}>
                {THEME_PACK_ORDER.map((id) => (
                  <RadioItem key={id} value={id}>
                    <span aria-hidden className="flex -space-x-1 rtl:space-x-reverse">
                      {ThemePacks[id].swatches.map((color) => (
                        <span key={color} className="h-3.5 w-3.5 rounded-full ring-2 ring-surface" style={{ backgroundColor: color }} />
                      ))}
                    </span>
                    {t(`themes.${id}.name`)}
                  </RadioItem>
                ))}
              </Menu.RadioGroup>
            </SubMenu>

            <SubMenu
              icon={<Languages aria-hidden className="h-4 w-4" />}
              label={t("settings.language")}
              value={currentLanguage?.nativeLabel ?? language}
            >
              <Menu.RadioGroup value={language} onValueChange={(value) => setLanguage(value as AppLanguageCode)}>
                {APP_LANGUAGES.map((lang) => (
                  <RadioItem key={lang.code} value={lang.code}>
                    <span lang={lang.code}>{lang.nativeLabel}</span>
                  </RadioItem>
                ))}
              </Menu.RadioGroup>
            </SubMenu>

            <Menu.Separator className="mx-1 my-1 h-px bg-border" />
            <Menu.Item asChild className={itemClass}>
              <Link href="/settings">
                <Settings aria-hidden className="h-4 w-4" />
                {t("tabs.settings")}
              </Link>
            </Menu.Item>
            <Menu.Item className={cn(itemClass, "text-danger")} onSelect={() => void handleSignOut()}>
              <LogOut aria-hidden className="h-4 w-4 rtl:rotate-180" />
              {t("settings.signOut")}
            </Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
    </>
  );
}
