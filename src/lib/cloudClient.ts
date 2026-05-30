import type { CloudPushRequest } from "./types";

const SESSION_STORAGE_KEY = "rl-stats-cloud-session";

export type CloudPlanCode = "cloud_basic" | "cloud_supporter";

export interface CloudSession {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user: {
    id: string;
    email?: string;
  };
}

export interface CloudSubscription {
  plan_code: string | null;
  status: string | null;
  current_period_end: string | null;
  stripe_customer_id?: string | null;
}

export interface CloudProfileRecord {
  id: string;
  entity_key: string;
  name: string | null;
  player_name: string | null;
  deleted_at: string | null;
}

export interface CloudPushResponse {
  status: string;
  duplicate: boolean;
  batch_id: string | null;
  device_id: string | null;
  processed: number;
  results: unknown;
}

interface CloudCredentials {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

function normalizeSupabaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function authHeaders(
  credentials: CloudCredentials,
  accessToken?: string,
): HeadersInit {
  return {
    apikey: credentials.supabaseAnonKey,
    Authorization: `Bearer ${accessToken ?? credentials.supabaseAnonKey}`,
    "Content-Type": "application/json",
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error_description" in payload
        ? String((payload as { error_description: unknown }).error_description)
        : payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error: unknown }).error)
          : `Cloud request failed (${response.status})`;
    throw new Error(message);
  }

  return payload as T;
}

export function getStoredCloudSession(): CloudSession | null {
  const raw = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as CloudSession;
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

export function storeCloudSession(session: CloudSession | null): void {
  if (!session) {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearCloudSession(): void {
  storeCloudSession(null);
}

export async function refreshCloudSession(
  credentials: CloudCredentials,
  session: CloudSession,
): Promise<CloudSession> {
  if (!session.refresh_token) return session;

  const response = await fetch(
    `${normalizeSupabaseUrl(credentials.supabaseUrl)}/auth/v1/token?grant_type=refresh_token`,
    {
      method: "POST",
      headers: authHeaders(credentials),
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    },
  );
  const refreshed = await parseResponse<CloudSession>(response);
  storeCloudSession(refreshed);
  return refreshed;
}

export async function ensureFreshCloudSession(
  credentials: CloudCredentials,
): Promise<CloudSession | null> {
  const session = getStoredCloudSession();
  if (!session) return null;

  const expiresAt = session.expires_at ?? 0;
  const shouldRefresh =
    expiresAt > 0 && expiresAt - Math.floor(Date.now() / 1000) < 300;
  if (!shouldRefresh) return session;

  try {
    return await refreshCloudSession(credentials, session);
  } catch {
    clearCloudSession();
    return null;
  }
}

export async function signInWithPassword(
  credentials: CloudCredentials,
  email: string,
  password: string,
): Promise<CloudSession> {
  const response = await fetch(
    `${normalizeSupabaseUrl(credentials.supabaseUrl)}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: authHeaders(credentials),
      body: JSON.stringify({ email, password }),
    },
  );
  const session = await parseResponse<CloudSession>(response);
  storeCloudSession(session);
  return session;
}

export async function signUpWithPassword(
  credentials: CloudCredentials,
  email: string,
  password: string,
): Promise<CloudSession> {
  const response = await fetch(
    `${normalizeSupabaseUrl(credentials.supabaseUrl)}/auth/v1/signup`,
    {
      method: "POST",
      headers: authHeaders(credentials),
      body: JSON.stringify({ email, password }),
    },
  );
  const session = await parseResponse<Partial<CloudSession>>(response);
  if (!session.access_token || !session.user) {
    throw new Error(
      "Account created. Check your email to confirm it, then sign in.",
    );
  }
  const completeSession = session as CloudSession;
  storeCloudSession(completeSession);
  return completeSession;
}

export async function getCloudUser(
  credentials: CloudCredentials,
  session: CloudSession,
): Promise<CloudSession["user"]> {
  const response = await fetch(
    `${normalizeSupabaseUrl(credentials.supabaseUrl)}/auth/v1/user`,
    {
      headers: authHeaders(credentials, session.access_token),
    },
  );
  return parseResponse<CloudSession["user"]>(response);
}

export async function signOut(
  credentials: CloudCredentials,
  session: CloudSession,
): Promise<void> {
  await fetch(
    `${normalizeSupabaseUrl(credentials.supabaseUrl)}/auth/v1/logout`,
    {
      method: "POST",
      headers: authHeaders(credentials, session.access_token),
    },
  );
  clearCloudSession();
}

export async function hasCloudSyncAccess(
  credentials: CloudCredentials,
  session: CloudSession,
): Promise<boolean> {
  const response = await fetch(
    `${normalizeSupabaseUrl(credentials.supabaseUrl)}/rest/v1/rpc/has_active_cloud_sync`,
    {
      method: "POST",
      headers: authHeaders(credentials, session.access_token),
      body: JSON.stringify({ p_user_id: session.user.id }),
    },
  );
  return parseResponse<boolean>(response);
}

export async function getCloudSubscription(
  credentials: CloudCredentials,
  session: CloudSession,
): Promise<CloudSubscription | null> {
  const response = await fetch(
    `${normalizeSupabaseUrl(credentials.supabaseUrl)}/rest/v1/billing_subscriptions?select=plan_code,status,current_period_end,stripe_customer_id&limit=1`,
    { headers: authHeaders(credentials, session.access_token) },
  );
  const rows = await parseResponse<CloudSubscription[]>(response);
  return rows[0] ?? null;
}

export async function createCheckoutSession(
  credentials: CloudCredentials,
  session: CloudSession,
  planCode: CloudPlanCode,
): Promise<string> {
  const response = await fetch(
    `${normalizeSupabaseUrl(credentials.supabaseUrl)}/functions/v1/create-checkout-session`,
    {
      method: "POST",
      headers: authHeaders(credentials, session.access_token),
      body: JSON.stringify({
        planCode,
        successUrl: "https://rl-stats.local/cloud/success",
        cancelUrl: "https://rl-stats.local/cloud/cancel",
      }),
    },
  );
  const payload = await parseResponse<{ url?: string }>(response);
  if (!payload.url) throw new Error("Checkout session did not return a URL");
  return payload.url;
}

export async function createPortalSession(
  credentials: CloudCredentials,
  session: CloudSession,
): Promise<string> {
  const response = await fetch(
    `${normalizeSupabaseUrl(credentials.supabaseUrl)}/functions/v1/create-portal-session`,
    {
      method: "POST",
      headers: authHeaders(credentials, session.access_token),
      body: JSON.stringify({
        returnUrl: "https://rl-stats.local/cloud/return",
      }),
    },
  );
  const payload = await parseResponse<{ url?: string }>(response);
  if (!payload.url) throw new Error("Portal session did not return a URL");
  return payload.url;
}

export async function pushCloudChanges(
  credentials: CloudCredentials,
  session: CloudSession,
  request: CloudPushRequest,
): Promise<CloudPushResponse> {
  const response = await fetch(
    `${normalizeSupabaseUrl(credentials.supabaseUrl)}/rest/v1/rpc/sync_push`,
    {
      method: "POST",
      headers: authHeaders(credentials, session.access_token),
      body: JSON.stringify(request),
    },
  );
  return parseResponse<CloudPushResponse>(response);
}

export async function listCloudProfiles(
  credentials: CloudCredentials,
  session: CloudSession,
): Promise<CloudProfileRecord[]> {
  const response = await fetch(
    `${normalizeSupabaseUrl(credentials.supabaseUrl)}/rest/v1/cloud_profiles?select=id,entity_key,name,player_name,deleted_at&deleted_at=is.null&order=manifest_created_at.desc.nullslast`,
    { headers: authHeaders(credentials, session.access_token) },
  );
  return parseResponse<CloudProfileRecord[]>(response);
}
