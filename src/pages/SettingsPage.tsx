import { useTranslation } from "react-i18next";
import { PageContainer } from "@/components/layout/PageContainer";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { IniHelper } from "@/components/settings/IniHelper";
import { DataManagement } from "@/components/settings/DataManagement";
import { UpdateChecker } from "@/components/settings/UpdateChecker";
import { OverlayConfig } from "@/components/settings/OverlayConfig";
import { OverlayStreaming } from "@/components/settings/OverlayStreaming";
import { TrackerSetup } from "@/components/settings/TrackerSetup";
import { RapidApiSetup } from "@/components/settings/RapidApiSetup";
import { ParseBotSetup } from "@/components/settings/ParseBotSetup";
import { ProfileManagement } from "@/components/settings/ProfileManagement";
import { CloudSyncPanel } from "@/components/settings/CloudSyncPanel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import {
  Settings,
  Gamepad2,
  Database,
  LayoutTemplate,
  MonitorPlay,
  Users,
  Cloud,
} from "lucide-react";

export function SettingsPage() {
  const { t } = useTranslation("settings");

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-border-subtle">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-primary-subtle">
            <Settings size={20} className="text-accent-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              {t("pageTitle")}
            </h2>
            <p className="text-xs text-text-tertiary">{t("pageDescription")}</p>
          </div>
        </div>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="mb-6 w-full flex-wrap h-auto justify-start gap-1 bg-transparent border-none p-0">
            <TabsTrigger
              value="general"
              className="data-[state=active]:bg-bg-surface data-[state=active]:border-border-subtle border border-transparent rounded-lg py-2 px-4"
            >
              <Settings size={14} className="mr-2" />
              {t("pageSections.general")}
            </TabsTrigger>
            <TabsTrigger
              value="game"
              className="data-[state=active]:bg-bg-surface data-[state=active]:border-border-subtle border border-transparent rounded-lg py-2 px-4"
            >
              <Gamepad2 size={14} className="mr-2" />
              Game Config
            </TabsTrigger>
            <TabsTrigger
              value="overlay"
              className="data-[state=active]:bg-bg-surface data-[state=active]:border-border-subtle border border-transparent rounded-lg py-2 px-4"
            >
              <LayoutTemplate size={14} className="mr-2" />
              Overlay
            </TabsTrigger>
            <TabsTrigger
              value="streaming"
              className="data-[state=active]:bg-bg-surface data-[state=active]:border-border-subtle border border-transparent rounded-lg py-2 px-4"
            >
              <MonitorPlay size={14} className="mr-2" />
              Streaming
            </TabsTrigger>
            <TabsTrigger
              value="profiles"
              className="data-[state=active]:bg-bg-surface data-[state=active]:border-border-subtle border border-transparent rounded-lg py-2 px-4"
            >
              <Users size={14} className="mr-2" />
              {t("pageSections.profiles")}
            </TabsTrigger>
            <TabsTrigger
              value="cloud"
              className="data-[state=active]:bg-bg-surface data-[state=active]:border-border-subtle border border-transparent rounded-lg py-2 px-4"
            >
              <Cloud size={14} className="mr-2" />
              Cloud Sync
            </TabsTrigger>
            <TabsTrigger
              value="data"
              className="data-[state=active]:bg-bg-surface data-[state=active]:border-border-subtle border border-transparent rounded-lg py-2 px-4"
            >
              <Database size={14} className="mr-2" />
              {t("pageSections.data")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6">
            <SettingsPanel />
            <UpdateChecker />
          </TabsContent>

          <TabsContent value="game" className="space-y-6">
            <IniHelper />
            <RapidApiSetup />
            <TrackerSetup />
            <ParseBotSetup />
          </TabsContent>

          <TabsContent value="overlay" className="space-y-6">
            <OverlayConfig />
          </TabsContent>

          <TabsContent value="streaming" className="space-y-6">
            <OverlayStreaming />
          </TabsContent>

          <TabsContent value="profiles" className="space-y-6">
            <ProfileManagement />
          </TabsContent>

          <TabsContent value="cloud" className="space-y-6">
            <CloudSyncPanel />
          </TabsContent>

          <TabsContent value="data" className="space-y-6">
            <DataManagement />
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}
