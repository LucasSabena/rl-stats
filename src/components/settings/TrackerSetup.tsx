import { useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { useFetchTrackerProfile } from "@/hooks/useTrackerProfile";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { CheckCircle, XCircle, RefreshCw, Link, ExternalLink, Eye, EyeOff, Info } from "lucide-react";
import type { AppSettings, TrackerPlatform } from "@/lib/types";

const PLATFORMS: { value: TrackerPlatform; label: string }[] = [
  { value: "epic", label: "Epic Games" },
  { value: "steam", label: "Steam" },
  { value: "psn", label: "PlayStation" },
  { value: "xbl", label: "Xbox Live" },
  { value: "switch", label: "Nintendo Switch" },
];

function parseProfileUrl(url: string): { platform: TrackerPlatform | null; username: string | null } {
  const trimmed = url.trim();
  const match = trimmed.match(
    /rocketleague\.tracker\.network\/rocket-league\/profile\/(epic|steam|psn|xbl|switch)\/([^/\s?#]+)/i
  );
  if (!match) return { platform: null, username: null };
  const platform = match[1].toLowerCase() as TrackerPlatform;
  const username = decodeURIComponent(match[2]);
  return { platform, username };
}

export function TrackerSetup() {
  const { t } = useTranslation(["tracker", "common"]);
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const fetchProfile = useFetchTrackerProfile();

  const [profileUrl, setProfileUrl] = useState("");
  const [localKey, setLocalKey] = useState("");
  const [localPlatform, setLocalPlatform] = useState<TrackerPlatform>("epic");
  const [localUsername, setLocalUsername] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [testError, setTestError] = useState("");
  const [parsed, setParsed] = useState(false);

  if (isLoading) return null;

  const apiKey = settings?.trackerApiKey ?? "";
  const platform = (settings?.trackerPlatform as TrackerPlatform) ?? "epic";
  const username = settings?.trackerUsername ?? "";

  const profileLink = platform && username
    ? `https://rocketleague.tracker.network/rocket-league/profile/${platform}/${encodeURIComponent(username)}/overview`
    : null;

  function handleUrlChange(url: string) {
    setProfileUrl(url);
    const result = parseProfileUrl(url);
    if (result.platform && result.username) {
      setLocalPlatform(result.platform);
      setLocalUsername(result.username);
      setParsed(true);
    } else {
      setParsed(false);
    }
  }

  async function handleSave() {
    await updateSettings.mutateAsync({
      ...(settings ?? {}),
      playerName: settings?.playerName ?? "",
      autoStart: settings?.autoStart ?? true,
      rlPath: settings?.rlPath ?? null,
      platform: settings?.platform ?? null,
      defaultMatchType: settings?.defaultMatchType ?? "ranked",
      trackerApiKey: localKey || apiKey,
      trackerPlatform: localPlatform || platform,
      trackerUsername: localUsername || username,
    } as AppSettings);
  }

  async function handleTestConnection() {
    setTestStatus("loading");
    setTestError("");
    await handleSave();
    try {
      await fetchProfile.mutateAsync();
      setTestStatus("success");
    } catch (err) {
      setTestStatus("error");
      setTestError(err instanceof Error ? err.message : t("tracker:setup.connectionError"));
    }
  }

  return (
    <div className="group rounded-xl border border-border-subtle bg-bg-surface/60 p-5 transition-all duration-200 hover:border-border-default hover:bg-bg-surface/80">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-primary-subtle transition-colors group-hover:bg-accent-primary/20">
            <Link size={16} className="text-accent-primary" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-text-primary">
              {t("tracker:setup.title")}
            </h4>
            <p className="text-xs text-text-muted">
              {t("tracker:setup.description")}
            </p>
          </div>
        </div>
        {testStatus === "success" && (
          <Badge variant="live" className="gap-1.5 bg-accent-success/15 text-accent-success border border-accent-success/30">
            <CheckCircle size={12} />
            {t("tracker:setup.connected")}
          </Badge>
        )}
        {testStatus === "error" && (
          <Badge variant="default" className="gap-1.5 bg-accent-danger/15 text-accent-danger border border-accent-danger/30">
            <XCircle size={12} />
            {t("tracker:setup.error")}
          </Badge>
        )}
      </div>

      <div className="space-y-5">
        {/* Profile URL */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-text-secondary">
            {t("tracker:setup.profileUrlLabel")}
          </label>
          <input
            type="text"
            value={profileUrl}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder={t("tracker:setup.profileUrlPlaceholder")}
            className="w-full rounded-lg border border-border-subtle bg-bg-base px-3.5 py-2.5 font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/20 transition-all duration-200 hover:border-border-highlight"
          />
          <p className="text-[11px] text-text-muted">
            {t("tracker:setup.profileUrlHint", { link: <a key="tn" href="https://rocketleague.tracker.network/" target="_blank" rel="noopener noreferrer" className="text-accent-primary hover:underline transition-colors">rocketleague.tracker.network</a> })}
          </p>
          {parsed && (
            <div className="flex items-center gap-1.5 rounded-md bg-accent-success/10 px-2.5 py-1.5">
              <CheckCircle size={12} className="text-accent-success shrink-0" />
              <p className="text-[11px] text-accent-success">
                {t("tracker:setup.detected")} <span className="font-semibold">{localPlatform.toUpperCase()}</span> / {localUsername}
              </p>
            </div>
          )}
          {profileUrl && !parsed && (
            <div className="flex items-center gap-1.5 rounded-md bg-accent-warning/10 px-2.5 py-1.5">
              <XCircle size={12} className="text-accent-warning shrink-0" />
              <p className="text-[11px] text-accent-warning">
                {t("tracker:setup.parseFail")}
              </p>
            </div>
          )}
        </div>

        {/* API Key */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-text-secondary flex items-center gap-2">
            {t("tracker:setup.apiKeyLabel")}
            <span className="rounded-md bg-accent-info/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent-info border border-accent-info/20">{t("tracker:setup.apiKeyRequired")}</span>
          </label>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={localKey || apiKey}
              onChange={(e) => setLocalKey(e.target.value)}
              placeholder={t("tracker:setup.apiKeyPlaceholder")}
              className="w-full rounded-lg border border-border-subtle bg-bg-base px-3.5 py-2.5 pr-10 font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/20 transition-all duration-200 hover:border-border-highlight"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
              aria-label={showKey ? t("tracker:setup.hideKey") : t("tracker:setup.showKey")}
            >
              {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <div className="rounded-lg border border-accent-warning/25 bg-accent-warning/5 px-4 py-3">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-accent-warning/10">
                <Info size={11} className="text-accent-warning" />
              </div>
              <div className="text-[11px] leading-relaxed text-text-tertiary">
                <p className="mb-1 font-semibold text-text-secondary">{t("tracker:setup.availabilityTitle")}</p>
                <p>{t("tracker:setup.availabilityDescription")}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent to-border-subtle" />
          <span className="text-[10px] font-medium text-text-tertiary">{t("tracker:setup.orManual")}</span>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent to-border-subtle" />
        </div>

        {/* Platform + Username grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Platform */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-text-secondary">{t("tracker:setup.platformLabel")}</label>
            <Select
              value={localPlatform || platform}
              onChange={(val) => setLocalPlatform(val as TrackerPlatform)}
              options={PLATFORMS}
              className="w-full"
            />
          </div>

          {/* Username */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-text-secondary">{t("tracker:setup.usernameLabel")}</label>
            <input
              type="text"
              value={localUsername || username}
              onChange={(e) => setLocalUsername(e.target.value)}
              placeholder={t("tracker:setup.usernamePlaceholder")}
              className="w-full rounded-lg border border-border-subtle bg-bg-base px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/20 transition-all duration-200 hover:border-border-highlight"
            />
          </div>
        </div>

        {testError && (
          <div className="rounded-lg border border-accent-danger/20 bg-accent-danger/5 px-4 py-3">
            <p className="text-xs text-accent-danger whitespace-pre-wrap">
              {testError}
            </p>
          </div>
        )}
        {testStatus === "success" && !testError && (
          <div className="rounded-lg border border-accent-success/20 bg-accent-success/5 px-4 py-3">
            <p className="text-xs text-accent-success">
              {t("tracker:setup.successMessage")}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="primary" size="sm" onClick={handleTestConnection} disabled={testStatus === "loading"}>
            {testStatus === "loading" ? <><RefreshCw size={14} className="mr-1.5 animate-spin" />{t("tracker:setup.searching")}</> : <><Link size={14} className="mr-1.5" />{t("tracker:setup.connect")}</>}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSave} disabled={updateSettings.isPending}>
            {t("tracker:setup.save")}
          </Button>
          {profileLink && (
            <Button variant="ghost" size="sm" onClick={() => void openUrl(profileLink)}>
              <ExternalLink size={14} className="mr-1" />
              {t("tracker:setup.openInBrowser")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
