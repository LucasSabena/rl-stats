import { useState } from "react";
import { Eye, EyeOff, Save, Globe } from "lucide-react";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { AppSettings } from "@/lib/types";

export function ParseBotSetup() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const [showKey, setShowKey] = useState(false);
  const [localKey, setLocalKey] = useState("");
  const [localScraperId, setLocalScraperId] = useState("");
  const [localEndpoint, setLocalEndpoint] = useState("");
  const [localEnabled, setLocalEnabled] = useState<boolean | null>(null);

  if (isLoading) return null;

  const apiKey = settings?.parsebotApiKey ?? "";
  const scraperId = settings?.parsebotScraperId ?? "";
  const endpoint = settings?.parsebotEndpoint ?? "";
  const enabled = localEnabled ?? settings?.parsebotEnabled ?? false;

  async function handleSave() {
    await updateSettings.mutateAsync({
      ...(settings ?? {}),
      parsebotApiKey: localKey || apiKey,
      parsebotScraperId: localScraperId || scraperId,
      parsebotEndpoint: localEndpoint || endpoint,
      parsebotEnabled: enabled,
    } as AppSettings);
  }

  return (
    <div className="group rounded-xl border border-border-subtle bg-bg-surface/60 p-5 transition-all duration-200 hover:border-border-default hover:bg-bg-surface/80">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-primary-subtle transition-colors group-hover:bg-accent-primary/20">
            <Globe size={16} className="text-accent-primary" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-text-primary">Parse.bot</h4>
            <p className="text-xs text-text-muted">
              Scraper configurable con bypass anti-bot. Ideal cuando RLStats o Tracker estan detras de Cloudflare.
            </p>
          </div>
        </div>

        <Badge variant={enabled ? "live" : "default"} className="border border-border-subtle">
          {enabled ? "Activo" : "Desactivado"}
        </Badge>
      </div>

      <div className="space-y-4">
        <label className="flex items-center gap-3 rounded-lg border border-border-subtle bg-bg-base px-3.5 py-3 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setLocalEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-border-default"
          />
          <span>Usar Parse.bot como proveedor de MMR (entre Tracker y RLStats)</span>
        </label>

        <div className="space-y-2">
          <label className="text-xs font-medium text-text-secondary">API Key de Parse.bot</label>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={localKey || apiKey}
              onChange={(e) => setLocalKey(e.target.value)}
              placeholder="pmx_tu_api_key_aqui"
              className="w-full rounded-lg border border-border-subtle bg-bg-base px-3.5 py-2.5 pr-10 font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/20 transition-all duration-200 hover:border-border-highlight"
            />
            <button
              type="button"
              onClick={() => setShowKey((current) => !current)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
              aria-label={showKey ? "Ocultar key" : "Mostrar key"}
            >
              {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-medium text-text-secondary">Scraper ID</label>
            <input
              type="text"
              value={localScraperId || scraperId}
              onChange={(e) => setLocalScraperId(e.target.value)}
              placeholder="scraper-abc123"
              className="w-full rounded-lg border border-border-subtle bg-bg-base px-3.5 py-2.5 font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/20 transition-all duration-200 hover:border-border-highlight"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-text-secondary">Endpoint</label>
            <input
              type="text"
              value={localEndpoint || endpoint}
              onChange={(e) => setLocalEndpoint(e.target.value)}
              placeholder="get_profile"
              className="w-full rounded-lg border border-border-subtle bg-bg-base px-3.5 py-2.5 font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/20 transition-all duration-200 hover:border-border-highlight"
            />
          </div>
        </div>

        <div className="rounded-lg border border-accent-info/20 bg-accent-info/5 px-4 py-3 text-[11px] leading-relaxed text-text-tertiary">
          <p className="mb-1 font-semibold text-text-secondary">Como configurar Parse.bot</p>
          <p>1. Crea una cuenta en parse.bot (plan free: 200 creditos, sin tarjeta).</p>
          <p>2. Crea un scraper nuevo apuntando a rlstats.net o tracker.network con la tarea "get player MMR by platform and identifier".</p>
          <p>3. Copia el Scraper ID y el nombre del endpoint desde el dashboard de parse.bot.</p>
          <p>4. Genera una API key en Settings &gt; API Keys y pegala aqui.</p>
          <p className="mt-1.5">Cada usuario usa su propia cuenta y creditos. La app envia platform e identifier al scraper.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={handleSave} disabled={updateSettings.isPending}>
            <Save size={14} className="mr-1.5" />
            {updateSettings.isPending ? "Guardando..." : "Guardar Parse.bot"}
          </Button>
        </div>
      </div>
    </div>
  );
}