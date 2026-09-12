/**
 * Release metadata.
 *
 * The download button must always point at the newest GitHub release. The
 * asset name embeds the version (`RL.Stats_<version>_x64-setup.exe`), so a
 * static URL would go stale on every bump; we resolve it through the GitHub
 * API instead and fall back to the stable `/releases/latest` redirect when
 * the API is unreachable (offline, rate limit, CSP).
 */

export const REPO_URL = "https://github.com/LucasSabena/rl-stats";
export const RELEASES_URL = `${REPO_URL}/releases`;
export const RELEASES_LATEST_URL = `${REPO_URL}/releases/latest`;
export const API_LATEST_URL =
  "https://api.github.com/repos/LucasSabena/rl-stats/releases/latest";

export interface ReleaseInfo {
  version: string;
  downloadUrl: string;
  publishedAt: string | null;
  /** Where the data came from, for debugging and graceful UI. */
  source: "api" | "fallback";
}

interface GithubRelease {
  tag_name?: string;
  published_at?: string;
  assets?: { name?: string; browser_download_url?: string }[];
}

function normalizeVersion(tag: string): string {
  return tag.replace(/^v/, "");
}

/**
 * Picks the NSIS installer asset. Falls back to the first `.exe` so a rename
 * in the release workflow degrades instead of breaking.
 */
function pickInstaller(release: GithubRelease): string | null {
  const assets = release.assets ?? [];
  const installer =
    assets.find((asset) => /setup\.exe$/i.test(asset.name ?? "")) ??
    assets.find((asset) => /\.exe$/i.test(asset.name ?? ""));
  return installer?.browser_download_url ?? null;
}

export async function fetchLatestRelease(signal?: AbortSignal): Promise<ReleaseInfo> {
  try {
    const response = await fetch(API_LATEST_URL, {
      signal,
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) throw new Error(`GitHub API responded ${response.status}`);
    const release = (await response.json()) as GithubRelease;
    const tag = release.tag_name;
    const downloadUrl = pickInstaller(release);
    if (!tag || !downloadUrl) throw new Error("Release is missing tag or installer asset");
    return {
      version: normalizeVersion(tag),
      downloadUrl,
      publishedAt: release.published_at ?? null,
      source: "api",
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    // The `/releases/latest` endpoint always redirects to the newest tag, so
    // the button stays correct even when metadata is unavailable.
    return {
      version: "",
      downloadUrl: RELEASES_LATEST_URL,
      publishedAt: null,
      source: "fallback",
    };
  }
}
