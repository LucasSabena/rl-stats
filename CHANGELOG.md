# Changelog

## v2.3.1 — Official rank icons, career page, working loading states

### Official Rocket League rank icons

- All 22 rank tiers (Bronze I through Supersonic Legend) now use the real
  in-game insignia, sourced from the MIT-licensed
  [InGameRank](https://github.com/nixvio64/InGameRank) and optimized to webp
  at two sizes (228 KB total). The SVG insignia remains as a fallback if an
  icon ever fails to load. Icon indexing is covered by tests across the full
  MMR ladder.

### Loading states were invisible

- `Skeleton` asked for an `animate-shimmer` utility that was never defined —
  only the bare `@keyframes` existed. Every loading placeholder rendered as a
  transparent empty div, so all loading states looked like blank pages.

### Player profiles were unreachable

- The player detail route only accepted a numeric database row id, but live
  matches and match detail only carry a Rocket League PrimaryId, so a player
  link from those screens could never resolve. Added
  `get_player_detail_by_primary_id`; the route now accepts either form, and
  names are clickable in the live dashboard, match roster and stats table.

### Profile page rebuilt on local data

- The tracker/MMR integration behind it can no longer be authenticated. It is
  now a career view built entirely from the local match database: totals, win
  rate, streaks, kickoff goals, per-playlist breakdown, your share of the
  team's output, overtime/close/blowout records and your best hours.

### Share card

- It carried its own unrelated palette and asked for Outfit / Inter /
  JetBrains Mono — none of which are loaded any more, so every generated card
  silently rendered in the system fallback face. Repointed at the app tokens,
  switched to Geist, and it now waits for the webfont before drawing.

### Other

- Match history cards were loading each arena image three times per row; now
  loaded once, lazily, keeping the hover reveal.
- Fixed a nested `<button>` in the training pack card that made the favourite
  and copy controls unreachable by keyboard.
- Swept 33 files for letterspaced caps, 7-9px text, glow shadows and
  hover-lift; display numbers use tabular figures instead of a monospace face.
- Removed 5.5 MB of dead assets, including a 4.7 MB `icon.svg` referenced
  nowhere.
- Added attribution for the rank icons and the Geist typeface.

## v2.3.0 — Design system rebuild and stats correctness

### The design never actually rendered

- Self-hosted the UI fonts. The Tauri CSP is `style-src 'self'` / `font-src 'self'`, so the Google Fonts stylesheet was blocked outright — and the display font every heading asked for (Rajdhani) was never even requested. Every heading and label had been falling back to `system-ui`.
- Fixed light mode, which was a no-op: `@theme` only ever defined dark values, so the `.light` class the toggle applied had nothing to switch to. Rebuilt on OKLCH tokens wired through `@theme inline`, with the theme applied before first paint.
- Fixed the app logo. The sidebar pointed at a path Vite never serves, so it always fell back to a hand-drawn "RL" placeholder. Now uses the real mark, 705 KB down to 4.6 KB.
- Gave the brand accent its own hue so "selected" no longer reads as "blue team"; team blue/orange are reserved for team identity again.
- Stripped the decorative layer from the shared components: glossy sheens, radial hover glows, hover translation, blurred pill badges and colored icon tiles.
- Regrouped the sidebar by intent and collapsed the two duplicate connection indicators in the header into one.

### Stats correctness

- **Kickoff goals counted every goal in the match.** The round-start anchor defaulted to `0` and was only set from `RoundStarted`, which real streams don't emit — so the window evaluated to `time_remaining >= -7`, always true. Now anchored properly, with `GoalReplayEnd` accepted as the real-world marker.
- **Changing the session window or kickoff threshold left analytics stale.** Both are applied server-side, but saving settings only invalidated the settings query, so every analytics screen kept showing numbers derived from the old value.
- Ranks are derived from MMR again. The tracker integrations that supplied them are dead, so every rank field arrived as null and no rank was ever displayed.

### Reliability

- A Tauri command that never settles can no longer freeze a screen indefinitely. Calls are now bounded and raise a real error naming the command, with bulk-DB, network and filesystem commands exempted.
- Match detail surfaces the actual failure instead of a blanket "not found", with a retry.

### Other

- New hours-of-day win rate wheel: radius encodes win rate against a drawn 50% baseline, and low-sample hours are desaturated so a two-game "100%" hour can't pose as your best.
- Rank insignia drawn as SVG — legible at 16px, nothing to 404.
- Arena images no longer 404: variants can borrow another arena's image, and anything unmapped renders a generated tile so new Psyonix maps degrade gracefully.
- The OBS overlay is genuinely minimal now — no gradients, glows, per-player cards or letterspaced caps.
- `Select` gained full keyboard support and correct combobox/listbox ARIA; it was mouse-only.
- Removed dead styles (`tailwindcss-animate` classes with no plugin installed, a Radix variable that doesn't exist here) and a dead `useSessions` hook.
- Applied all 18 open Dependabot updates (npm, cargo, GitHub Actions), including `sysinfo` 0.34 to 0.39 and vitest 3 to 4.

## v2.1.0 — Live reliability, guided setup and clearer insights

### Stability and performance

- Reduced the live UI and overlay publication rate from 60 to 20 updates per second while retaining every packet in the match session.
- Removed repeated database/profile lookups from the hot live-update path.
- Limited process detection to process names and slowed its polling interval, avoiding unnecessary CPU, memory and disk sampling.
- Added bounded TCP buffering, safer resynchronization for malformed streams and non-blocking SQLite pool settings.
- Added persistent Rust/frontend diagnostics and a recoverable React error boundary.
- The overlay WebView is now hidden and reused instead of destroyed and recreated while the game is running.

### Detection and onboarding

- Rocket League detection now reads Steam manifests/libraries, Steam registry paths, Epic manifests and legacy paths.
- Manual paths are validated against the real executable before configuration.
- Existing `DefaultStatsAPI.ini` content is preserved; only the required Stats API values are merged.
- Local Steam accounts and the active account are detected before a match, with live PrimaryId detection retained as fallback.
- Replaced the card-based onboarding with a guided setup and an interactive spotlight tour through the real app.

### Live MMR, sharing and analytics

- Fixed live MMR refresh timing, playlist resolution and provider fallback behavior.
- Added transparent exact/historical/estimated MMR status per player.
- Rebuilt match sharing for cleaner previews and reliable copy/export behavior.
- Reorganized analytics hierarchy, filters, chart readability and responsive layouts.

## v2.0.0 — Cloud Sync, Stripe Billing & Multi-Profile Intelligence

### Features

**Cloud Sync with Supabase**
- Sistema completo de sincronización en la nube basado en Supabase.
- Cada perfil puede vincularse a un `cloud_owner_id` único generado localmente.
- **Sync bidireccional** (push + pull) de datos:
  - Partidas (`matches`, `match_players`, `match_events`).
  - Jugadores (`players`, `head_to_head`).
  - Configuraciones (`settings`, `presets`, `friends`).
  - Estadísticas diarias (`daily_rollups`).
- **Conflict resolution**: estrategia "server wins" con base en `updated_at`.
- **RPC optimizado**: `sync_push_entities` para bulk upsert en una sola llamada.
- **RLS policies**: cada usuario solo ve y modifica sus propios datos.
- Frontend:
  - `CloudSyncPanel`: UI completa de configuración de sync con toggle, estado, logs.
  - `useCloudAutoSync`: hook que ejecuta sync automático cada 5 minutos y al iniciar app.
  - `cloudClient.ts`: cliente HTTP para Supabase con autenticación anónima.
  - `cloudSync.ts`: lógica de diff, merge, push y pull.

**Stripe Billing & Subscription Plans**
- Integración completa con Stripe para suscripciones.
- **Planes**: Free (1 perfil, 100 partidas), Premium (5 perfiles, 1.000 partidas), Pro (ilimitado).
- **Edge Functions** (Supabase):
  - `create-checkout-session`: inicia checkout de Stripe.
  - `create-portal-session`: redirige al portal de administración de suscripciones.
  - `stripe-webhook`: procesa eventos `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`.
- Migraciones SQL:
  - `0004_billing_plans.sql`: tabla de planes con límites.
  - `0005_owner_entitlements.sql`: tabla de suscripciones activas por `cloud_owner_id`.
- Frontend: panel de billing integrado en `CloudSyncPanel` con botón de upgrade y gestión de suscripción.

**Smart Profile Handling v2**
- Detección automática de perfil al inicio de la app basada en `local_primary_id` guardado.
- Sugerencia inteligente de switch de perfil cuando se detecta una cuenta de Rocket League diferente.
- `AccountMismatchDialog` mejorado con opción de vincular perfil actual a la cuenta detectada.
- Auto-guardado de identidad detectada al finalizar partida.

**Onboarding v2 — Cloud Sync Step**
- Paso 4 del onboarding: configuración de cloud sync y billing.
- Guía paso a paso para vincular perfil a la nube.

### Backend (Rust)
- **`core/cloud/mod.rs`**: cliente Supabase, autenticación anónima, helpers de sync.
- **`core/storage/sync.rs`**: lógica de diff entre datos locales y remotos, merge, y conflict resolution.
- **`core/app_sync.rs`**: orquestador de sync completo (push + pull) con manejo de errores.
- **`commands/cloud.rs`**: 9 comandos Tauri nuevos:
  - `get_cloud_sync_status`, `get_cloud_owner_id`, `set_cloud_owner_id`.
  - `sync_push`, `sync_pull`, `sync_now`, `reset_cloud_sync`.
  - `get_subscription_status`, `create_billing_portal`.
- **`core/storage/migrations.rs`**: migraciones v19-v22 para tablas de sync (`sync_state`, `sync_anchors`).
- **`core/settings/mod.rs`**: agregados `cloud_owner_id`, `cloud_sync_enabled`, `cloud_sync_auto`.
- **`core/profiles/mod.rs`**: mejoras en `get_all_profile_settings` para iterar perfiles con settings.
- **`lib.rs`**: integra auto-sync en el startup loop y eventos de partida.

### Frontend (React/TypeScript)
- **`CloudSyncPanel.tsx`**: panel de ~660 líneas con configuración, estado, logs, billing, y acciones de sync.
- **`SettingsPanel.tsx`**: reorganizado para incluir Cloud Sync y Billing.
- **`Step4_CloudSync.tsx`**: nuevo paso del onboarding.
- **`cloudClient.ts`**: cliente HTTP tipado para Supabase con JWT anónimo.
- **`cloudSync.ts`**: lógica de sincronización con manejo de conflictos y límites de plan.
- **`useCloudAutoSync.ts`**: hook de auto-sync con intervalo configurable.
- **`api.ts`**: agregados 9 comandos de cloud sync y tipos de subscription.
- **`types.ts`**: extendido con tipos de cloud sync, billing, subscription status.
- **`schemas.ts`**: validaciones Zod para configuraciones de sync.
- **`App.tsx`**: integra `CloudSyncPanel`, `AccountMismatchDialog`, y providers de sync.

### Infrastructure
- **Supabase project**: configurado con PostgreSQL, Edge Functions, Auth, y Storage.
- **Migrations SQL** (5 archivos):
  - `0001_cloud_sync_schema.sql`: esquema base de entidades (matches, players, rollups, etc.).
  - `0002_sync_push_rpc.sql`: función RPC `sync_push_entities` para bulk upsert.
  - `0003_rpc_permissions.sql`: permisos de ejecución de RPC para usuarios anónimos.
  - `0004_billing_plans.sql`: planes y límites de suscripción.
  - `0005_owner_entitlements.sql`: suscripciones activas con Stripe.
- **Edge Functions** (3 archivos en Deno/TypeScript):
  - `create-checkout-session/index.ts`
  - `create-portal-session/index.ts`
  - `stripe-webhook/index.ts`
- **GitHub Actions**:
  - `.github/workflows/supabase-keepalive.yml`: workflow diario que ejecuta `select 1` para evitar pausa del proyecto Supabase (gratis).

### Documentation
- `docs/CLOUD_SYNC_PLAN.md`: arquitectura, flujo de datos, decisiones técnicas.
- `docs/CLOUD_BILLING_SETUP.md`: guía de configuración de Stripe + Supabase.
- `docs/SECURITY.md`: actualizado con políticas de datos en la nube.
- `.env.example`: variables de entorno para Supabase y Stripe.
- `supabase/README.md` y `supabase/functions/README.md`: documentación interna.

### Improvements
- `.gitignore`: agregado `supabase/.temp` y `.env.local`.
- `pnpm-workspace.yaml`: configurado para monorepo con Supabase functions.
- `skills-lock.json`: skills de agente para Stripe (`stripe-best-practices`, `stripe-projects`, `upgrade-stripe`).

### TODO / Future
- Implementar sync incremental basado en `last_sync_at` en vez de full diff.
- Agregar cifrado end-to-end de datos sensibles antes de enviar a Supabase.
- WebSocket para sync en tiempo real entre dispositivos.
- Compartir replays y highlights desde la nube.

## v1.8.0 — Account Mismatch Detection & Profile Identity Binding

### Features

**Account Mismatch Detection System**
- Durante una partida en vivo, la app detecta automáticamente el `primary_id` del jugador local comparando los jugadores del lobby con la identidad guardada en el perfil activo.
- Si el jugador detectado **no coincide** con el perfil activo, se emite un evento `account-mismatch` al frontend.
- El diálogo de mismatch muestra:
  - Nombre del jugador detectado vs perfil actual.
  - Botón para **cambiar al perfil coincidente** si existe un match previo.
  - Botón para **asociar la identidad detectada al perfil actual**.
  - Botón para **descartar** (ignorar hasta la próxima partida).

**Profile Identity Binding**
- `Profile` struct (Rust) ahora tiene `player_name` y `local_primary_id` opcionales.
- `find_matching_profile()`: busca un perfil cuya identidad coincida con un `primary_id` o `player_name`.
- `update_profile_player_identity()`: vincula un `primary_id` + `player_name` a un perfil existente.
- Al finalizar una partida, si se detecta una nueva identidad, se guarda automáticamente en `AppSettings` del perfil actual.

**Nuevos Commands (Tauri IPC)**
- `find_matching_profile_cmd` — busca perfil por identidad de jugador.
- `update_profile_player_identity_cmd` — actualiza identidad de un perfil.

### Frontend
- **`AccountMismatchDialog`**: modal global (renderizado en `App.tsx`) que responde al evento `account-mismatch`.
- **`useAccountMismatch`** hook: escucha evento `account-mismatch`, popula `accountMismatchStore`.
- **`accountMismatchStore`** (Zustand): gestiona estado del diálogo y datos del mismatch.
- **`api.ts`**: agregados `findMatchingProfile` y `updateProfilePlayerIdentity`.

### Backend
- **`lib.rs` — `process_events` loop**:
  - Detecta mismatch en cada `UpdateState` (solo cuando el lobby tiene jugadores).
  - Estado `MismatchState` para evitar alertas repetidas dentro de la misma partida.
  - Al persistir partida finalizada, extrae `detected_primary_id` y `detected_player_name`.
  - Auto-guarda identidad en settings si cambió respecto al valor previo.
- **`session/mod.rs`**:
  - `resolve_local_player_identity()` helper para detectar jugador local.
  - `persist_finished_match()` ahora retorna `PersistResult` con identidad detectada.

### i18n
- Nuevas keys en `profiles.json` (ES/EN/PT):
  - `accountMismatch.title`
  - `accountMismatch.detected`
  - `accountMismatch.currentProfile`
  - `accountMismatch.switchTo`
  - `accountMismatch.associate`
  - `accountMismatch.dismiss`

### TODO / Future
- Persistir estado de mismatch a través de reinicios de app.
- Opción "no preguntar de nuevo" / "recordar mi elección" por perfil.
- Auto-cambio de perfil sin diálogo si la confianza es alta.

## v1.7.3 — MMR Error Handling, Overlay Error Propagation & Settings Fix

### Features

**MMR Error Detail Modal**
- `PlayerCard` ahora muestra un badge de error cuando un jugador tiene `error` en su snapshot de MMR.
- Al hacer click en el badge, se abre un modal con el mensaje de error detallado (ej: "RapidAPI no disponible", "Perfil privado", etc.).
- Nuevo estado local `errorModalOpen` y componentes `Modal` + `Button` reutilizados.

**Overlay — MMR Error Map**
- `OverlayView` construye y propaga `mmrErrorMap` (Record&lt;primaryId, errorMessage&gt;) al `TeamSection`.
- Los errores de MMR ahora son visibles también en el overlay in-game.

### Fixes
- **Settings Serialization**: agregado `kickoff_goal_threshold_seconds` que faltaba en `api.ts` (`getSettings` / `setSettings`).
- El umbral de kickoff goals ahora persiste correctamente entre sesiones.

### Improvements
- i18n ES/EN/PT: nuevas keys `errorLabel` y `errorTitle` en `overlay.json`.

## v1.7.2 — RapidAPI MMR Integration, Arena Map Fixes & Arena Assets

### Features

**RapidAPI MMR Provider**
- Nueva fuente de MMR vía RapidAPI (`rl-data.p.rapidapi.com`) como provider adicional.
- Se consulta en paralelo con Tracker Network y RLStats para obtener el mejor resultado.
- Integración completa en `resolve_player_mmr` con fallback secuencial: RapidAPI → Tracker → RLStats → Local estimate.
- Nuevo componente `RapidApiSetup` en Settings para configurar la API key.
- Se agrega `rapidapi_key` a `AppSettings`; migraciones correspondientes en storage.

### Fixes
- **Arena Map (`arenaMap.ts`)**: corregido tipo arena `Farm_Grs` que no mapeaba correctamente a `farm_grs_p.webp`.
- **Arena Assets**: actualizados/reemplazados todos los thumbnails de arenas con versiones optimizadas/consolidadas.

### Improvements
- Clippy: agregado `#[allow(clippy::too_many_arguments)]` a `resolve_player_mmr` después de agregar parámetros de RapidAPI.
- Frontend: soporte visual en `PlayerCard` y `PlayerDetailPage` para MMR proveniente de RapidAPI.
- `Cargo.lock` actualizado.

## v1.7.1 — Local MMR Estimation, Analytics Scope & Training Packs Polish

### Features

**Local MMR Estimation System**
- Estimación de MMR local cuando no hay datos online disponibles.
- Partidas entre lobby y online se usan para rastrear evolución local: +/-9 MMR por partida.
- Se considera "estimado" si pasaron más de 3 partidas desde último refresh online.
- Se expone `estimated`, `stale`, `estimate_matches_since_refresh`, y `updated_at` en cada jugador del snapshot de MMR.
- Estado persistente en SQLite con TTL implícito (solo invalida cuando se refresca online).
- Fallback automático a último MMR online en DB cuando no hay estimación local previa.

**Analytics — Session Scope**
- Nuevos comandos backend (`get_session_scope_stats`) para calcular estadísticas de sesión por scope: `me`, `team`, `all`.
- Integra con filtros de playlist, match_type, y rango de fechas.
- Utiliza `local_stats` (calculados desde eventos de la sesión) para agregaciones locales.

**Training Packs Page Polish**
- Hook `useTrainingPacks` con caché de 5 min, refresco manual, y manejo de estado.
- Mejor filtrado por categoría y dificultad con contadores de packs por categoría.
- Modal de agregar packs con validación de campos y soporte multilenguaje.
- Soporte para favoritos locales con persistencia en `localStorage`.
- Mejoras visuales en `CategoryFilter` con iconos y estados activos/inactivos.

**Live Head-to-Head**
- Nuevo hook `useLiveHeadToHead` para consultar historial head-to-head contra oponentes del lobby.

### Fixes
- **Kickoff Goals Conceded**: se corrigió el cálculo de goles de saque concedidos en `get_match_sessions` para usar `opponent_kickoff_goals` de `local_stats` en vez del total del equipo contrario.
- **MMR Snapshot Timing** (refinado): el hook `useLiveMmr` ahora refetch MMR al evento `CountdownBegin` en lugar de `match-started`, sincronizando mejor con el cálculo de sesión.
- **Storage**: nueva función `get_latest_player_mmr_for_playlist` para obtener el último MMR online de un jugador en una playlist específica.

### Improvements
- Rust: clippy / cargo fmt fixes en `analytics.rs`, `mmr.rs`, `mmr/mod.rs`, `session/mod.rs`, `storage/mod.rs`.
- Frontend: mejora de tipos en `trainingPacksTypes.ts`, i18n completo EN/ES/PT para training packs.

## v1.7.0 — Training Packs Repository & User Presets

### Features

**Training Packs Repository**
- Nueva página `/training-packs` con catálogo completo de packs de entrenamiento.
- 60+ packs de la comunidad organizados por categoría (Speedflip, Aerials, Shooting, Dribbling, Defense, etc.) y dificultad (Beginner → Pro).
- Datos cargados desde `public/training-packs.json` — editable vía PRs en GitHub.
- Filtros por categoría, dificultad, búsquedas por nombre/creador/código.
- Favoritos locales persistidos en `localStorage`.
- Agregar packs personalizados con modal propio.
- i18n completo: ES/EN/PT para categorías, dificultades y UI.

**User Presets System**
- Gestión de configuraciones personales: Camera, Controls, Deadzone, Hardware.
- CRUD completo en base de datos SQLite.
- Exportar/importar presets como JSON.
- Botón de compartir con tarjeta visual generada por Canvas.

**Pro Configs Page**
- Catálogo de configs de jugadores profesionales (cam, controls, deadzone) organizados por continente/equipo.
- Búsqueda por nombre, equipo o nacionalidad.

### Improvements
- Training Packs: `public/training-packs.json` se sirve estáticamente y se descarga en vivo desde GitHub raw.
- Nueva ruta de sidebar: `Entrenamientos` (icono Dumbbell).

## v1.6.1 — Match Detail Kickoff Goals, MMR Timing & Update Flow

### Features

**Kickoff Goals en Match Detail**
- Agregada columna `kickoffGoals` en la tabla de estadísticas de jugadores (sortable).
- Badge con icono Rocket en el roster del equipo cuando un jugador tiene goles de saque.
- Traducciones ES/EN/PT: `stats.kickoffGoals`, `stats.kickoffGoalsShort`, `roster.kg`.

### Improvements

**Live MMR Snapshot Timing**
- Corregido el momento en que se captura el snapshot de MMR.
- Ahora escucha el evento `CountdownBegin` (cuando la sala está llena) en lugar de `match-started` (cuando se crea la sala, aún sin jugadores).

**Update Checker Flow**
- El check de actualizaciones ahora solo muestra la notificación toast con la nueva versión disponible.
- Ya no fuerza la descarga e instalación automática — el usuario decide cuándo actualizar.

## v1.6.0 — Overlay Speed Fix & Kickoff Goals Tracking

### Features

**Kickoff Goals Tracking**
- Detecta goles de saque (kickoff goals) tanto en tiempo normal como en overtime.
- Umbral de tiempo configurable desde el panel de ajustes (1-20 segundos, default 7s).
- Se detecta basandose en el evento `RoundStarted`/`CountdownBegin`.
- Datos agregados a analytics, overlay en vivo, y resumen de sesion.

**Overlay Speedometer Fix**
- Corregida la escala del indicador de velocidad en el overlay:
  - Factor real: 2200 uu/s / 82 game units = 26.829
  - Supersonico ahora se dispara a 82 (antes 44, debido a escala incorrecta).

### Improvements
- Campos de kickoff goals agregados a la base de datos SQLite via migracion v18.
- Traducciones ES/EN/PT para la nueva configuracion.

## v1.5.3 — CI Fixes & Release Workflow
- CI: clippy, test, y fmt fixes.
- Release: extraccion correcta de URL del installer via `gh api`.
