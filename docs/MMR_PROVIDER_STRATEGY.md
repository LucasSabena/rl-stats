# MMR Provider Strategy

## Goal

Mostrar MMR del lobby sin tocar memoria, sin inyeccion y sin depender de APIs internas del cliente de Rocket League.

## Safe path

1. Leer `PrimaryId` desde la `Stats API` oficial local.
2. Resolver MMR fuera del juego con proveedores externos.
3. Mostrar resultados en la companion app y overlay externa del proyecto.

## Providers

### RapidAPI Rocket League

- Fuente primaria opcional cuando el usuario habilita una suscripcion valida.
- Ventaja: devuelve rank, division y MMR estructurados.
- Riesgo: el plan gratuito permite muy pocas consultas para un lobby en vivo.

### Tracker Network

- Integracion de compatibilidad para credenciales previamente autorizadas.
- Tracker Network no ofrece acceso API de Rocket League para integraciones nuevas.
- No debe presentarse como el camino recomendado de configuracion.

### RLStats

- Fallback publico de solo lectura y mejor esfuerzo.
- Ventaja: acepta `EpicID`, `SteamID64` y otros IDs de plataforma visibles en `PrimaryId`.
- Riesgo: no expone una API formal y Cloudflare puede bloquear clientes automatizados.

## Current implementation

- Command Tauri: `fetch_live_mmr_snapshot`
- Cache local SQLite: `mmr_cache`
- Fallback al ultimo MMR exacto guardado por jugador y playlist.
- Estimacion de lobby, claramente marcada, a partir del MMR local cuando no hay dato rival.
- TTL:
  - `tracker`: 15 min
  - `rlstats`: 30 min
- Playlist inferida desde tamano del lobby:
  - `2 players` => `duel`
  - `4 players` => `doubles`
  - `6 players` => `standard`

## Known limitations

1. La `Stats API` local no expone MMR ni una playlist confiable.
2. Modos extra, privadas y playlists especiales pueden quedar sin inferencia exacta.
3. RLStats puede exigir un challenge de navegador que `reqwest` no puede completar.
4. Sin proveedor autorizado no es posible prometer MMR exacto para todos los jugadores; la UI debe distinguir exacto, historico, estimado y no disponible.

## Next step if we want more reliability

1. Evaluar un proveedor estable con licencia y cuota compatible con consultas de lobby.
2. Mantener cache e historial para minimizar costo, latencia y rate limits.
3. No ocultar la calidad del dato: exacto, historico y estimado deben verse diferentes.
