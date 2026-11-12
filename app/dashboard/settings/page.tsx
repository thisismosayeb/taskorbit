import { getDashboardContext } from "@/lib/actions/workspace";
import { isManager } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RenameWorkspaceForm } from "@/components/settings/rename-workspace-form";
import { PreferencesSection } from "@/components/settings/preferences-form";
import { getServerLocale, createTranslator } from "@/lib/i18n/server";

export default async function SettingsPage() {
  const locale = await getServerLocale();
  const t = createTranslator(locale);
  const ctx = await getDashboardContext();
  if (!ctx.user || !ctx.workspace || !ctx.role) return null;
  const manager = isManager(ctx.role);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{t("settings.title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("settings.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.yourAccount")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="settings-name">{t("settings.nameLabel")}</Label>
            <Input id="settings-name" value={ctx.profile?.full_name ?? ""} readOnly disabled />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-email">{t("settings.emailReadOnlyLabel")}</Label>
            <Input id="settings-email" value={ctx.user.email ?? ""} readOnly disabled />
          </div>
          <div className="space-y-1.5">
            <span className="text-sm font-medium">{t("settings.roleLabel")}</span>
            <div>
              <Badge variant={manager ? "primary" : "mint"}>{manager ? t("roles.manager") : t("roles.developer")}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <PreferencesSection />

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.activeWorkspace")}</CardTitle>
          <CardDescription>
            {t("settings.workspaceDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {manager ? (
            <RenameWorkspaceForm workspaceId={ctx.workspace.id} currentName={ctx.workspace.name} />
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="settings-workspace">{t("workspace.name")}</Label>
              <Input id="settings-workspace" value={ctx.workspace.name} readOnly disabled />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="settings-timezone">{t("workspace.timezone")}</Label>
            <Input id="settings-timezone" value={ctx.workspace.timezone} readOnly disabled />
            <p className="text-xs text-muted">{t("settings.timezoneNote")}</p>
          </div>
          <p className="text-xs text-muted">
            {t("settings.languageNote")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
