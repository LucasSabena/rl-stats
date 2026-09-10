# RL Stats — User Flows & Experience Documentation

> Comprehensive UX documentation for the RL Stats desktop application.
> Language convention: Spanish for user-facing content, English for technical terms and system concepts.
>
> **Implementation status (v2.10.x).** This document is the original product
> spec and some flows diverge from the shipped app. Verified against the code:
> - Onboarding is a 3-phase overlay (Welcome → Setup → 7-step tour), not a
>   multi-step wizard, and there is no automated connection test yet.
> - History paginates with a "Load more" button (50 per page); the numbered
>   paginator described below is not implemented.
> - Post-match mood: the in-app modal waits for an answer; the optional focus
>   prompt over the game (`prompt_focus_enabled`, off by default) is
>   best-effort and hides when the next match starts.
> - Analytics, player directory, training packs and pro configs exist as
>   described; the "compare two matches" flow is not implemented.
>
> Treat everything else below as intended direction, not shipped behavior.

---

## 1. User Personas

### 1.1 "Competitive Grind" — Alejandro, 22 años

**Perfil**
- Rank: Diamante 3 / Campeón 1
- Horas jugadas: 2,400+
- Juega: 3-4 horas diarias, principalmente ranked 2v2 y 3v3
- Plataforma: Steam en Windows 11
- Hardware: Monitor 165Hz, doble pantalla

**Metas (Goals)**
1. Subir a Campeón 2 esta temporada
2. Identificar patrones en sus derrotas (¿falla más en overtime? ¿le cuesta contra equipos agresivos?)
3. Comparar su progreso semana a semana
4. Saber exactamente cuántas partidas ganó/perdió en cada sesión
5. Encontrar su "hora dorada" de rendimiento

**Frustraciones (Frustrations)**
- Odia que BakkesMod ya no funcione online
- Las páginas web como Tracker.Network requieren buscar manualmente y no tienen datos en vivo
- No sabe si realmente está mejorando o solo fluctúa
- Pierde la cuenta de cuántas partidas jugó en una sesión
- Quiere datos concretos, no "sensaciones" sobre su juego

**Comfort Tecnológico**
- Muy alto. Sabe editar archivos INI, usa Discord, OBS, bakkesmod offline.
- Entiende conceptos como MMR, win rate, consistencia.
- No le importa una curva de aprendizaje si los datos valen la pena.

**Sesión Típica**
1. Enciende PC, RL se abre automáticamente
2. Abre RL Stats (quizás desde el tray)
3. Juega 15-20 partidas ranked
4. Entre partidas, mira el tablero en vivo para ver quién lleva más goles
5. Al terminar, revisa "Historial" para ver cuántas ganó/perdió
6. Una vez por semana, abre "Análisis" para ver tendencias

**Features Clave**
- ⭐⭐⭐ Live Dashboard en tiempo real
- ⭐⭐⭐ Analytics con tendencias semanales
- ⭐⭐ Win/Loss ratio por sesión
- ⭐⭐ Comparativa de partidas
- ⭐ Estimaciones de distancia/boost

---

### 1.2 "Casual Enjoyer" — Marta, 28 años

**Perfil**
- Rank: Platino 2 / Diamante 1
- Horas jugadas: 600
- Juega: 3-5 partidas de casual 2-3 veces por semana
- Plataforma: Epic Games Store en Windows 10
- Hardware: Laptop gaming, monitor único

**Metas (Goals)**
1. Ver cuántos goles ha metido en total ("¡ya llevo 1,000!")
2. Recordar partidas épicas contra amigos
3. Ver estadísticas divertidas (velocidad máxima, demos, saves espectaculares)
4. Compartir stats con su grupo de amigos
5. Que la app sea "set it and forget it"

**Frustraciones (Frustrations)**
- Las apps de stats son "demasiado serias" y abrumadoras
- No quiere configurar nada complicado
- Solo quiere ver números grandes y gráficos bonitos
- Le da miedo tocar archivos de configuración de Rocket League
- Si algo no funciona a la primera, probablemente desinstala

**Comfort Tecnológico**
- Medio. Sabe instalar programas, pero no editar archivos de configuración.
- Usa Epic Games Launcher, Steam básico.
- Nunca usó BakkesMod. No sabe qué es un archivo INI.
- Quiere que todo "funcione solo".

**Sesión Típica**
1. Abre Rocket League cuando sus amigos la llaman
2. Se da cuenta de que RL Stats está abierto en el tray
3. Juega un par de partidas casual
4. Después de la última partida, curiosea el historial
5. Ríe al ver que un amigo suyo hizo 0 saves en 5 partidas
6. Cierra todo y se va

**Features Clave**
- ⭐⭐⭐ Onboarding simple y guiado
- ⭐⭐⭐ Historial visual con tarjetas bonitas
- ⭐⭐ Detalles de goles (velocidad, asistencias)
- ⭐ Auto-inicio con Windows
- ⭐ Exportar datos para compartir

---

### 1.3 "Content Creator" — Dani, 25 años

**Perfil**
- Creador de contenido de Rocket League en Twitch/YouTube
- 5,000+ seguidores
- Juega: Mix de ranked y privadas para contenido
- Plataforma: Steam en Windows 11
- Hardware: Setup dual PC, 3 monitores, OBS, Stream Deck

**Metas (Goals)**
1. Tener datos en vivo para comentar en stream ("¡Miren, voy 142 km/h!")
2. Generar contenido de "reviews de partidas" con datos concretos
3. Crear overlays con stats del match actual
4. Exportar datos para gráficos personalizados en videos
5. Tener una base de datos local de TODAS sus partidas para análisis profundos

**Frustraciones (Frustrations)**
- Las herramientas actuales no permiten exportar datos en formatos útiles (CSV, JSON)
- No hay forma fácil de capturar datos de partidas privadas o torneos
- Los overlays existentes son genéricos y no muestran stats de Rocket League
- Necesita que los datos sean 100% confiables (no puede decir números equivocados en stream)
- Quiere acceso programático a los datos (para sus propios scripts)

**Comfort Tecnológico**
- Experto. Programa sus propios bots de Discord, scripts de OBS.
- Conoce JSON, CSV, APIs REST.
- Edita archivos de configuración a diario.
- Entiende conceptos de red, puertos, TCP.

**Sesión Típica**
1. Prepara stream: abre OBS, RL, RL Stats
2. Durante stream, mantiene el Live Dashboard visible en monitor secundario
3. Comenta stats en vivo: "Vamos perdiendo pero tengo más shots"
4. Después del stream, revisa Analytics para ver su rendimiento promedio
5. Exporta datos de la sesión para un video de análisis
6. A veces revisa partidas viejas para clipes o análisis comparativos

**Features Clave**
- ⭐⭐⭐ Exportación de datos (JSON, CSV)
- ⭐⭐⭐ Live Dashboard con números grandes y legibles
- ⭐⭐ Datos precisos y timestamps exactos
- ⭐⭐ API local/Tauri commands para scripts propios
- ⭐ Modo overlay siempre visible

---

## 2. User Journey Maps

### 2.1 Journey Map — "Competitive Grind" (Alejandro)

| Fase | Acciones | Pensamientos | Emociones | Pain Points | Oportunidades |
|------|----------|--------------|-----------|-------------|---------------|
| **Discovery** | Busca "rocket league stats tracker" en Google. Encuentra Reddit hablando de RL Stats. | "Ojalá haya algo como BakkesMod pero que funcione online" | 😐 Curioso | No sabe si es confiable o seguro | Testimonios de comunidad, badges de "open source" |
| **Onboarding** | Descarga MSI desde GitHub. Instala. App abre con wizard de configuración. | "Espero que no sea un dolor de cabeza configurar el API" | 😐 Cauteloso | Editar el INI de RL puede ser intimidante | Wizard visual que detecta automáticamente la ruta de RL |
| **First Match** | Inicia RL. Juega una partida casual. Ve que el dashboard se llena de datos. | "¡Oh, wow! Ahí está mi nombre, mi equipo, todo en tiempo real" | 😃 Emocionado | Ninguno claro | Animaciones sutiles que recompensan la primera conexión |
| **Daily Use** | Abre Historial. Ve 15 partidas capturadas. Filtra por "Victorias". Ve su win rate. | "He ganado 9 de 15... no está mal. Vamos a ver el análisis" | 😊 Satisfecho | Querría ver métricas más avanzadas | Sugerencias contextuales: "¿Quieres ver tu tendencia semanal?" |
| **Power User** | Abre Analytics. Cambia a vista "Semana". Ve línea de victorias/derrotas. Exporta datos. | "Aquí puedo ver que miércoles y jueves juego peor. Interesante." | 🤓 Analítico | Falta de métricas avanzadas (MMR, rank) | Atajos de teclado, acceso rápido a exportar |

### 2.2 Journey Map — "Casual Enjoyer" (Marta)

| Fase | Acciones | Pensamientos | Emociones | Pain Points | Oportunidades |
|------|----------|--------------|-----------|-------------|---------------|
| **Discovery** | Amigo le envía link por Discord: "prueba esto para ver tus stats" | "A ver qué es esto, suena divertido" | 🙂 Curiosa | Desconfía de descargar ejecutables | Explicar que es open source, local, sin nube |
| **Onboarding** | Descarga e instala. Wizard le pregunta si quiere auto-configurar. Dice "Sí". | "¿Solo tengo que darle a un botón? ¡Perfecto!" | 😊 Aliviada | Si el auto-configurar falla, se frustra | Fallback claro: "Parece que necesitamos hacerlo manual, aquí te guiamos paso a paso" |
| **First Match** | Abre RL. Juega. No mira la app. Al terminar, ve notificación: "¡Partida guardada!" | "¡Oh, ya grabó mi partida sin que hiciera nada!" | 😃 Sorprendida | No sabe que la app estaba trabajando en segundo plano | Notificación amigable con resumen divertido |
| **Daily Use** | Al terminar de jugar, abre la app. Ve tarjetas de partidas con colores y badges. | "¡Mira, ganamos esta! Y aquí hice 3 goles" | 😊 Feliz | Navegación puede sentirse densa | Destacar visualmente lo más importante |
| **Power User** | Nunca llega. Ocasionalmente exporta un screenshot para Discord. | "Mira este dato loco" | 😄 Entretenida | No explora Analytics | Tarjetas de "Dato curioso" o "Estadística de la semana" |

### 2.3 Journey Map — "Content Creator" (Dani)

| Fase | Acciones | Pensamientos | Emociones | Pain Points | Oportunidades |
|------|----------|--------------|-----------|-------------|---------------|
| **Discovery** | Lee en Twitter/X que alguien hizo un tracker open source para RL Stats API. | "Esto podría ser oro para mis streams. Necesito probarlo YA." | 🤩 Emocionado | Necesita saber si es estable para producción | Changelog con estabilidad, versiones firmadas |
| **Onboarding** | Clona repo para revisar código. Compila desde source. Lee docs técnicas. | "El código se ve limpio. Rust + Tauri es una buena elección." | 🤓 Confianza | Compilar desde source puede fallar | Releases con instalador firmado, docs de build |
| **First Match** | Configura para que inicie automáticamente. Abre RL. Abre OBS. Comienza stream. | "Vamos a ver si los datos llegan sin lag. ¡Perfecto, 42ms de latencia!" | 😎 Profesional | Necesita monitor secundario para dashboard | Layouts compactos, números grandes, modo "siempre visible" |
| **Daily Use** | Mantiene dashboard en segundo monitor. Exporta datos post-stream. | "Necesito los datos de hoy para el video de mañana." | 🧐 Enfocado | Exportación manual es repetitiva | Auto-export opcional, webhooks, API local |
| **Power User** | Escribe scripts que consumen los comandos de Tauri. Crea overlays personalizados. | "Puedo hacer mi propio overlay con estos datos. Increíble." | 🚀 Empoderado | Falta documentación de API/commands | Documentación exhaustiva de commands, ejemplos |

---

## 3. Complete User Flows (with ASCII Wireframes)

### 3.1 Flow 1: First-Time Setup

**Objective**: Nuevo usuario descarga, instala, configura y ve su primera partida en el dashboard.
**Primary Persona**: Casual Enjoyer (Marta)
**Success Criteria**: Usuario ve datos en vivo en < 5 minutos desde abrir el instalador.

---

#### Step 1.1 — Download & Install

**Narrativa**: Usuario llega a la página de Releases en GitHub. Descarga `RLStats_Setup_x64.msi`. Ejecuta el instalador. Windows SmartScreen puede aparecer (es open source, no firmado con certificado EV en V1).

**ASCII Wireframe — Installer**
```
+-----------------------------------------------------------+
|  RL Stats Setup                                 |
+-----------------------------------------------------------+
|                                                           |
|     [App Icon]                                            |
|                                                           |
|     Welcome to RL Stats                         |
|                                                           |
|     RL Stats.          |
|     Local. Private. Free.                                 |
|                                                           |
|     [ License Agreement ]  (checked)                      |
|                                                           |
|     [ Install for all users ]  (radio)                    |
|     [ Install for me only  ]  (radio)                     |
|                                                           |
|                    [ Cancel ]  [ Install ]                 |
|                                                           |
+-----------------------------------------------------------+
```

**Decision Point**: Si SmartScreen bloquea → mostrar en la web docs de "How to bypass SmartScreen for open source apps".
**Error Path**: Instalación fallida (falta espacio, permisos) → mensaje claro con acción recomendada.
**Success Criteria**: App instalada, acceso directo en escritorio y menú inicio.

---

#### Step 1.2 — First Launch & Welcome

**Narrativa**: Usuario abre la app por primera vez. Aparece ventana de bienvenida con opciones de idioma. Se detecta automáticamente el español del sistema.

**ASCII Wireframe — Welcome Screen**
```
+-----------------------------------------------------------+
|                                                           |
|              [App Logo: 96px]                             |
|                                                           |
|              ¡Bienvenido a                                |
|              RL Stats!                          |
|                                                           |
|     Tu compañero de estadísticas para Rocket League.      |
|     Totalmente local y gratuito.                          |
|                                                           |
|     Idioma / Language:  [ Español ▼ ]                     |
|                                                           |
|              [ Comenzar ]                                 |
|                                                           |
|     [x] Iniciar automáticamente con Windows               |
|                                                           |
|                                                           |
|              v 1.0.0  |  Open Source (MIT)                |
|                                                           |
+-----------------------------------------------------------+
```

---

#### Step 1.3 — Stats API Configuration Wizard

**Narrativa**: El wizard detecta automáticamente la instalación de Rocket League (Steam/Epic). Si la encuentra, pregunta si quiere activar el Stats API automáticamente. Si no, muestra guía manual paso a paso.

**ASCII Wireframe — Auto-Detect Success**
```
+-----------------------------------------------------------+
|  Configuración del Stats API                              |
|  Paso 1 de 2                                              |
+-----------------------------------------------------------+
|                                                           |
|     [Check Icon]  Rocket League detectado                 |
|                                                           |
|     Ubicación:                                            |
|     C:\Program Files\Epic Games\RL...                    |
|                                                           |
|     [?] El Stats API permite que RL Stats       |
|         reciba datos en tiempo real de tus partidas.      |
|                                                           |
|     -------------------------------------------------     |
|     [x] Activar Stats API automáticamente                 |
|         (modifica TASystemSettings.ini)                   |
|                                                           |
|     [ ] Crear copia de seguridad del archivo original     |
|                                                           |
|                                                           |
|     [ Atrás ]              [ Continuar ]                  |
|                                                           |
+-----------------------------------------------------------+
```

**ASCII Wireframe — Auto-Detect Failed / Manual Guide**
```
+-----------------------------------------------------------+
|  Configuración del Stats API                              |
|  Paso 1 de 2                                              |
+-----------------------------------------------------------+
|                                                           |
|     [Warning Icon]  No se detectó Rocket League           |
|                                                           |
|     No te preocupes, puedes configurarlo manualmente:     |
|                                                           |
|     ┌─────────────────────────────────────────────┐      |
|     │  1. Cierra Rocket League                     │      |
|     │  2. Busca el archivo:                        │      |
|     │     TASystemSettings.ini                     │      |
|     │     (puede estar en Documentos\My Games\...)│      |
|     │  3. Añade esta línea:                        │      |
|     │     [TASystemSettings]                       │      |
|     │     bEnableStatTracking=true                 │      |
|     │  4. Guarda y reinicia Rocket League          │      |
|     └─────────────────────────────────────────────┘      |
|                                                           |
|     [ Abrir carpeta común ]  [ Copiar línea al portapapeles]│
|                                                           |
|     [ Omitir por ahora ]     [ Hecho, verificar ]         |
|                                                           |
+-----------------------------------------------------------+
```

**Decision Point**: Usuario elige "Continuar" → app modifica INI y verifica. Usuario elige "Omitir" → app funciona en modo "esperando conexión".
**Error Path**: Archivo INI no se puede modificar (RL abierto, permisos) → mensaje: "Cierra Rocket League e intenta de nuevo" con botón reintentar.

---

#### Step 1.4 — Connection Test

**Narrativa**: App intenta conectar a `127.0.0.1:49123`. Muestra estado en tiempo real. Si RL no está abierto, explica que debe abrirse.

**ASCII Wireframe — Waiting for Connection**
```
+-----------------------------------------------------------+
|  Configuración del Stats API                              |
|  Paso 2 de 2                                              |
+-----------------------------------------------------------+
|                                                           |
|     Estado de conexión:                                   |
|                                                           |
|     ┌─────────────────────────────────────────────┐      |
|     │                                             │      |
|     │        [Spinner]  Conectando...             │      |
|     │                                             │      |
|     │        127.0.0.1:49123                      │      |
|     │                                             │      |
|     └─────────────────────────────────────────────┘      |
|                                                           |
|     Para probar la conexión:                              |
|     1. Asegúrate de que el Stats API está activado        |
|     2. Abre Rocket League                                 |
|     3. Entra a cualquier partida (incluso entrenamiento)  |
|                                                           |
|     [ Reintentar conexión ]                               |
|                                                           |
|                    [ Finalizar ]                          |
|                                                           |
+-----------------------------------------------------------+
```

**ASCII Wireframe — Connection Success**
```
+-----------------------------------------------------------+
|  Configuración del Stats API                              |
|  Paso 2 de 2                                              |
+-----------------------------------------------------------+
|                                                           |
|     ┌─────────────────────────────────────────────┐      |
|     │                                             │      |
|     │        [Check Icon]  ¡Conectado!            │      |
|     │                                             │      |
|     │        Datos recibidos correctamente.       │      |
|     │                                             │      |
|     └─────────────────────────────────────────────┘      |
|                                                           |
|     La app capturará automáticamente tus partidas.        |
|     No necesitas hacer nada más.                          |
|                                                           |
|     [x] Minimizar a la bandeja al iniciar                 |
|                                                           |
|                    [ Ir al Dashboard ]                    |
|                                                           |
+-----------------------------------------------------------+
```

**Decision Point**: Conexión exitosa → onboarding completo. Conexión fallida → app sigue funcionando, muestra "Esperando partida..." en dashboard.
**Error Path**: Timeout de conexión → mensaje: "No se detectó Rocket League. ¿Está abierto? ¿El Stats API está activado?" con links a troubleshooting.

---

#### Step 1.5 — First Match Detected

**Narrativa**: Usuario abre Rocket League y entra a una partida. El dashboard detecta `MatchCreated` y cambia de "Esperando" a "En vivo".

**ASCII Wireframe — Dashboard: Waiting State**
```
+-----------------------------------------------------------+
|  [Sidebar]  |  Dashboard en Vivo                          |
|             |                                             |
|  [Pulsing   |  ┌─────────────────────────────────────┐   |
|   Dot]      |  │                                     │   |
|  En Vivo    |  │    [Radio Icon]                     │   |
|             |  │                                     │   |
|  Historial  |  │    Esperando partida...             │   |
|  Análisis   |  │                                     │   |
|  Ajustes    |  │    Inicia una partida en Rocket     │   |
|             |  │    League para ver estadísticas     │   |
|             |  │    en tiempo real.                  │   |
|             |  │                                     │   |
|             |  │    [Icono pulse animation]          │   |
|             |  │                                     │   |
|             |  └─────────────────────────────────────┘   |
|             |                                             |
|             |  Estado: Conectado a 127.0.0.1:49123       |
|             |  Último evento: hace 3s                    |
|             |                                             |
+-----------------------------------------------------------+
```

**ASCII Wireframe — Dashboard: Match Started (Warmup)**
```
+-----------------------------------------------------------+
|  [Sidebar]  |  Dashboard en Vivo                    [Live]│
|             |                                             |
|  [Pulsing   |  ┌─────────────────────────────────────┐   |
|   Dot]      |  │  [Badge: CALENTAMIENTO]  3:21      │   |
|  En Vivo    |  │  Arena: DFH Stadium                  │   |
|             |  └─────────────────────────────────────┘   |
|  Historial  |                                             |
|  Análisis   |  +------------------+ +------------------+  |
|  Ajustes    |  |  EQUIPO AZUL     | |  EQUIPO NARANJA  |  |
|             |  |  [Loading cards] | |  [Loading cards] |  |
|             |  +------------------+ +------------------+  |
|             |                                             |
|             |  ┌─────────────────────────────────────┐   |
|             |  │  Feed de Eventos                    │   |
|             |  │  [MatchCreated] Partida iniciada    │   |
|             |  │  [CountdownBegin] 3... 2... 1...   │   |
|             |  └─────────────────────────────────────┘   |
|             |                                             |
+-----------------------------------------------------------+
```

**Success Criteria**: Usuario ve su nombre, su equipo, y el timer en vivo. Entiende que "funciona".

---

### 3.2 Flow 2: Live Match Experience

**Objective**: Usuario experimenta una partida completa desde detección hasta resumen post-partida.
**Primary Persona**: Competitive Grind (Alejandro)
**Success Criteria**: Todos los eventos clave son visibles. Usuario entiende el estado del partido sin mirar el juego.

---

#### Step 2.1 — Match Start Detected

**Narrativa**: Evento `MatchCreated` llega. Dashboard muestra arena, modo, y jugadores conectados. Timer muestra calentamiento.

**ASCII Wireframe — Dashboard Active (Early Match)**
```
+-----------------------------------------------------------+
|  [Sidebar]  |  Dashboard en Vivo                    [Live]│
|             |  [Badge: EN VIVO]  4:52  [Score: 0 - 0]    |
|  [Pulsing   |  Arena: DFH Stadium  |  Modo: 3v3         |
|   Dot]      |                                             |
|  En Vivo    |  +--------------------+ +--------------------+ |
|             |  |  [Shield] AZUL     | |  [Shield] NARANJA  | |
|  Historial  |  |                    | |                    | |
|  Análisis   |  |  [Avatar] Alenx    | |  [Avatar] Opponent1| |
|  Ajustes    |  |  Score: 120        | |  Score: 95         | |
|             |  |  G:0 S:1 A:0 Sv:0  | |  G:0 S:2 A:1 Sv:0  | |
|             |  |  Boost: [████░░]   | |  Boost: [██████░░] | |
|             |  |  1420 uu/s         | |  1380 uu/s         | |
|             |  |                    | |                    | |
|             |  |  [Avatar] Teammate1| |  [Avatar] Opp2     | |
|             |  |  Score: 85         | |  Score: 110        | |
|             |  |  G:0 S:0 A:0 Sv:1  | |  G:0 S:1 A:0 Sv:1  | |
|             |  |  Boost: [██████░░] | |  Boost: [███░░░░]  | |
|             |  +--------------------+ +--------------------+ |
|             |                                             |
|             |  ┌─────────────────────────────────────┐   |
|             |  │  Feed de Eventos                    │   |
|             |  │  [BallHit] Alenx · 1420 uu/s       │   |
|             |  │  [BallHit] Opponent1 · 1380 uu/s   │   |
|             |  │  [StatfeedEvent] Alenx: Shot        │   |
|             |  └─────────────────────────────────────┘   |
|             |                                             |
+-----------------------------------------------------------+
```

---

#### Step 2.2 — Goal Scored Event

**Narrativa**: Evento `GoalScored` llega. El feed muestra quién marcó, asistencia, velocidad del balón. Score cambia con animación. Dashboard muestra breve overlay de "GOL".

**ASCII Wireframe — Goal Event**
```
+-----------------------------------------------------------+
|  [Sidebar]  |  Dashboard en Vivo                    [Live]│
|             |  [Badge: EN VIVO]  3:15  [Score: 1 - 0]    |
|             |  Arena: DFH Stadium  |  Modo: 3v3         |
|             |                                             |
|             |  +--------------------+ +--------------------+ |
|             |  |  [Shield] AZUL     | |  [Shield] NARANJA  | |
|             |  |  [BIG "1"]         | |  [BIG "0"]         | |
|             |  +--------------------+ +--------------------+ |
|             |                                             |
|             |  ┌─────────────────────────────────────┐   |
|             |  │  🏆 ¡GOL!                           │   |
|             |  │                                     │   |
|             |  │  Marcador: Alenx                    │   |
|             |  │  Asistencia: Teammate1              │   |
|             |  │  Velocidad del balón: 87 km/h       │   |
|             |  │  Tiempo: 1:45 restante              │   |
|             |  │                                     │   |
|             |  │  [Avatars de equipo azul celebrando]│   |
|             |  └─────────────────────────────────────┘   |
|             |                                             |
|             |  ┌─────────────────────────────────────┐   |
|             |  │  Feed de Eventos                    │   |
|             |  │  [GoalScored] Alenx (asist: Tmate1) │   |
|             |  │  [BallHit] Opp1 · 920 uu/s          │   |
|             |  │  [StatfeedEvent] Alenx: Goal        │   |
|             |  │  [StatfeedEvent] Tmate1: Assist     │   |
|             |  └─────────────────────────────────────┘   |
|             |                                             |
+-----------------------------------------------------------+
```

**Interaction**: Score number hace animación `scale(1.2)` + flash de color verde. Event feed hace `slideIn` desde la derecha.

---

#### Step 2.3 — Overtime

**Narrativa**: Timer llega a 0:00 pero el partido continúa. Badge cambia a "PRÓRROGA". Timer cambia a formato "OT +0:23".

**ASCII Wireframe — Overtime State**
```
+-----------------------------------------------------------+
|  [Sidebar]  |  Dashboard en Vivo                    [Live]│
|             |  [Badge: PRÓRROGA]  OT +0:23  [Score: 2-2] |
|             |  Arena: DFH Stadium  |  Modo: 3v3         |
|             |                                             |
|             |  +--------------------+ +--------------------+ |
|             |  |  [Shield] AZUL     | |  [Shield] NARANJA  | |
|             |  |  [Score: 2]        | |  [Score: 2]        | |
|             |  |  [Amber glow]      | |  [Amber glow]      | |
|             |  +--------------------+ +--------------------+ |
|             |                                             |
|             |  ┌─────────────────────────────────────┐   |
|             |  │  ⚠️ Tiempo reglamentario agotado    │   |
|             |  │     ¡Primero en marcar gana!        │   |
|             |  └─────────────────────────────────────┘   |
|             |                                             |
|             |  [Player Cards with amber border]          |
|             |                                             |
+-----------------------------------------------------------+
```

---

#### Step 2.4 — Match Ended

**Narrativa**: Evento `MatchEnded` llega. Dashboard muestra resultado final. Sidebar deja de pulsar. Aparece CTA "Ver Resumen de Partida".

**ASCII Wireframe — Match Finished**
```
+-----------------------------------------------------------+
|  [Sidebar]  |  Dashboard en Vivo                            |
|             |  [Badge: FINALIZADO]  5:12 total             |
|             |  Arena: DFH Stadium  |  Modo: 3v3             |
|             |                                                 |
|             |  +--------------------+ +--------------------+ |
|             |  |  [Shield] AZUL     | |  [Shield] NARANJA  | |
|             |  |                    | |                    | |
|             |  |      [ 3 ]         | |      [ 2 ]         | |
|             |  |                    | |                    | |
|             |  |    ✓ VICTORIA      | |    DERROTA         | |
|             |  |                    | |                    | |
|             |  |  ┌──────────────┐  | |  ┌──────────────┐  | |
|             |  |  │ ⭐ MVP       │  | |  │              │  | |
|             |  |  │ Alenx        │  | |  │              │  | |
|             |  |  │ 450 pts      │  | |  │              │  | |
|             |  |  └──────────────┘  | |  └──────────────┘  | |
|             |  +--------------------+ +--------------------+ |
|             |                                                 |
|             |  ┌─────────────────────────────────────┐     |
|             |  │  Resumen Rápido                     │     |
|             |  │  Goles: 3  |  Tiros: 7  |  Saves: 2  │     |
|             |  │  Asist.: 1 |  Demos: 0  |  Vel.max:  │     |
|             |  │  1520 uu/s                          │     |
|             |  └─────────────────────────────────────┘     |
|             |                                                 |
|             |       [ Ver Resumen de Partida ]              |
|             |                                                 |
|             |  Estado: Esperando próxima partida...         |
|             |                                                 |
+-----------------------------------------------------------+
```

**Decision Point**: Usuario clickea "Ver Resumen" → navega a Match Detail. Usuario cierra app → partida ya guardada en History.

---

#### Step 2.5 — Navigate to History

**Narrativa**: Usuario clickea en "Historial" en el sidebar. Ve la partida recién terminada al tope de la lista.

**ASCII Wireframe — History with New Match**
```
+-----------------------------------------------------------+
|  [Sidebar]  |  Historial de Partidas                        |
|             |                                                 |
|  En Vivo    |  [Date ▼] [Resultado ▼] [Modo ▼] [Buscar...] |
|             |                                                 |
|  [Active]   |  ┌─────────────────────────────────────┐     |
|  Historial  |  │ [NEW]  Hoy, 22:15                    │     |
|             |  │ 3v3 Casual · DFH Stadium             │     |
|             |  │                                     │     |
|             |  │  [AZUL] 3  -  2 [NARANJA]          │     |
|             |  │                                     │     |
|             |  │ [Win Badge]  Duración: 5:12         │     |
|             |  │ ⭐ MVP: Alenx (450 pts)              │     |
|             |  │                                     │     |
|             |  │ [Ver Detalles]                      │     |
|             |  └─────────────────────────────────────┘     |
|             |                                                 |
|  Análisis   |  ┌─────────────────────────────────────┐     |
|  Ajustes    |  │  Hoy, 21:45                          │     |
|             |  │ 2v2 Ranked · Champions Field         │     |
|             |  │ [NARANJA] 2  -  1 [AZUL]             │     |
|             |  │ [Win Badge]  Duración: 4:32         │     |
|             |  └─────────────────────────────────────┘     |
|             |                                                 |
+-----------------------------------------------------------+
```

**Success Criteria**: Usuario ve su partida inmediatamente. Badges claros. Acceso a detalles en un click.

---

### 3.3 Flow 3: Review Past Performance

**Objective**: Usuario abre la app, navega a historial, filtra, selecciona una partida, ve detalles, y compara con otra.
**Primary Persona**: Competitive Grind (Alejandro)
**Success Criteria**: Usuario encuentra cualquier partida en < 10 segundos. Comparativa es clara y accionable.

---

#### Step 3.1 — Open App & Navigate to History

**Narrativa**: Usuario abre RL Stats desde el menú inicio o bandeja del sistema. App muestra la última vista usada (en este caso, abre en Live). Usuario clickea "Historial".

**ASCII Wireframe — History Page (Default View)**
```
+-----------------------------------------------------------+
|  [Sidebar]  |  Historial de Partidas              142 total│
|             |                                                 |
|  En Vivo    |  ┌──────────┬──────────┬──────┬─────────────┐|
|             |  │ [Date ▼] │[Result ▼]│[Modo▼]│[🔍 Buscar..]│|
|             |  └──────────┴──────────┴──────┴─────────────┘|
|             |                                                 |
|  [Active]   |  ┌─────────────────────────────────────┐     |
|  Historial  |  │  Hoy, 22:15  ·  [3v3]  ·  [WIN]     │     |
|             |  │                                     │     |
|             |  │  [AZUL] 3  -  2 [NARANJA]          │     |
|             |  │  Duración: 5:12  |  Arena: DFH     │     |
|             |  │  MVP: Alenx (450 pts)               │     |
|             |  │  [Ver Detalles]                     │     |
|             |  └─────────────────────────────────────┘     |
|             |                                                 |
|             |  ┌─────────────────────────────────────┐     |
|             |  │  Hoy, 21:45  ·  [2v2]  ·  [WIN]     │     |
|             |  │  [NARANJA] 2  -  1 [AZUL]          │     |
|             |  │  Duración: 4:32  |  Arena: Champions│     |
|             |  └─────────────────────────────────────┘     |
|             |                                                 |
|             |  ┌─────────────────────────────────────┐     |
|             |  │  Ayer, 20:10 ·  [1v1]  ·  [LOSS]    │     |
|             |  │  [AZUL] 1  -  4 [NARANJA]          │     |
|             |  │  Duración: 3:45  |  Arena: Neo Tokyo│     |
|             |  └─────────────────────────────────────┘     |
|             |                                                 |
|             |  [  < 1  2  3  ... 15  >  ]                    |
|             |                                                 |
+-----------------------------------------------------------+
```

---

#### Step 3.2 — Apply Filters

**Narrativa**: Usuario quiere ver solo partidas de 2v2 ranked ganadas esta semana. Abre filtros.

**ASCII Wireframe — Filters Applied**
```
+-----------------------------------------------------------+
|  [Sidebar]  |  Historial de Partidas              23 total │
|             |                                                 |
|  En Vivo    |  ┌───────────────────────────────────────────┐|
|             |  │ Filtros activos:                           │|
|             |  │ [Resultado: Victoria ✕] [Modo: 2v2 ✕]     │|
|             |  │ [Fecha: Últimos 7 días ✕]                  │|
|             |  │                               [ Limpiar ] │|
|             |  └───────────────────────────────────────────┘|
|             |                                                 |
|  Historial  |  ┌─────────────────────────────────────┐     |
|             |  │  Hoy, 21:45  ·  [2v2]  ·  [WIN]     │     |
|             |  │  [NARANJA] 2  -  1 [AZUL]          │     |
|             |  │  Duración: 4:32                     │     |
|             |  │  [Ver Detalles]  [ Comparar ▼ ]     │     |
|             |  └─────────────────────────────────────┘     |
|             |                                                 |
|             |  ┌─────────────────────────────────────┐     |
|             |  │  Ayer, 19:20 ·  [2v2]  ·  [WIN]     │     |
|             |  │  [AZUL] 3  -  1 [NARANJA]          │     |
|             |  │  [Ver Detalles]  [ Comparar ▼ ]     │     |
|             |  └─────────────────────────────────────┘     |
|             |                                                 |
+-----------------------------------------------------------+
```

**Interaction**: Cada filtro es un tag removable. "Limpiar" quita todos. Resultados se actualizan en tiempo real (sin reload).

---

#### Step 3.3 — Select Match & View Detail

**Narrativa**: Usuario clickea en una partida. Navega a Match Detail con todas las secciones.

**ASCII Wireframe — Match Detail: Header & Score Timeline**
```
+-----------------------------------------------------------+
|  [Sidebar]  |  ← Volver al Historial                        |
|             |                                                 |
|  En Vivo    |  ┌─────────────────────────────────────┐     |
|  Historial  |  │  Hoy, 21:45  ·  2v2 Ranked         │     |
|  [Active]   |  │                                     │     |
|             |  │  [AZUL]           [NARANJA]        │     |
|             |  │    3                 1              │     |
|             |  │  [WIN Badge]      [LOSS Badge]     │     |
|             |  │                                     │     |
|             |  │  Duración: 4:32  |  Arena: Champions│     |
|             |  │  Overtime: No                       │     |
|             |  └─────────────────────────────────────┘     |
|             |                                                 |
|             |  ┌─────────────────────────────────────┐     |
|             |  │  Línea Temporal del Marcador        │     |
|             |  │                                     │     |
|             |  │  Azul ──────────────────────────    │     |
|             |  │       1    2       3                │     |
|             |  │       ●────●───────●                │     |
|             |  │       ↑    ↑       ↑                │     |
|             |  │      2:15 3:40    4:05              │     |
|             |  │                                     │     |
|             |  │  Naranja ────────────────────       │     |
|             |  │            1                        │     |
|             |  │            ●                        │     |
|             |  │            ↑                        │     |
|             |  │           1:30                      │     |
|             |  └─────────────────────────────────────┘     |
|             |                                                 |
|  [Tabs]     │  [ Estadísticas ]  [ Goles ]  [ Timeline ]    |
|             |                                                 |
+-----------------------------------------------------------+
```

---

#### Step 3.4 — View Player Stats Table

**Narrativa**: Usuario está en tab "Estadísticas". Ve tabla sortable con todos los jugadores.

**ASCII Wireframe — Match Detail: Stats Table**
```
+-----------------------------------------------------------+
|  [Sidebar]  |  Match Detail · 2v2 Ranked · Hoy 21:45       |
|             |                                                 |
|  Historial  |  [ Estadísticas ]  [ Goles ]  [ Timeline ]    |
|  [Active]   |                                                 |
|             |  ┌────────────────────────────────────────────┐|
|             |  │Jugador   │Eq│Pts│G│S│A│Sv│Dem│Vel.Max│Boost│|
|             |  ├────────────────────────────────────────────┤|
|             |  │⭐ Alenx  │🔵│450│2│5│1│ 1│ 0 │ 1520  │ 45% │|
|             |  │Teammate1│🔵│280│1│3│2│ 0│ 1 │ 1380  │ 52% │|
|             |  │─────────┼──┼───┼─┼─┼─┼──┼───┼───────┼─────│|
|             |  │Opp1     │🟠│320│1│4│0│ 2│ 0 │ 1450  │ 38% │|
|             |  │Opp2     │🟠│195│0│2│1│ 0│ 2 │ 1280  │ 61% │|
|             |  └────────────────────────────────────────────┘|
|             |                                                 |
|             |  Ordenar por: [ Puntos ▼ ]                    |
|             |                                                 |
|             |  [Exportar datos de esta partida]             |
|             |                                                 |
+-----------------------------------------------------------+
```

**Interaction**: Click en header de columna ordena asc/desc. Hover en fila resalta. Fila del usuario actual siempre tiene indicador sutil (border izquierdo azul).

---

#### Step 3.5 — Compare with Another Match

**Narrativa**: Usuario quiere comparar su rendimiento de hoy vs ayer. Vuelve a History, selecciona otra partida con checkbox, clickea "Comparar".

**ASCII Wireframe — Match Comparison**
```
+-----------------------------------------------------------+
|  [Sidebar]  |  ← Volver al Historial                        |
|             |                                                 |
|  Historial  |  Comparativa de Partidas                      |
|  [Active]   |                                                 |
|             |  ┌─────────────────┐ ┌─────────────────┐      |
|             |  │ Partida A       │ │ Partida B       │      |
|             |  │ Hoy, 21:45      │ │ Ayer, 19:20     │      |
|             |  │ 2v2 Ranked      │ │ 2v2 Ranked      │      |
|             |  │ WIN 3-1         │ │ WIN 3-1         │      |
|             |  └─────────────────┘ └─────────────────┘      |
|             |                                                 |
|             |  ┌───────────────────────────────────────────┐|
|             |  │            │ Alenx (A) │ Alenx (B) │ Δ    │|
|             |  │ Puntos     │   450     │   380     │ +70  │|
|             |  │ Goles      │     2     │     1     │ +1   │|
|             |  │ Tiros      │     5     │     4     │ +1   │|
|             |  │ Asistencias│     1     │     2     │ -1   │|
|             |  │ Saves      │     1     │     3     │ -2   │|
|             |  │ Vel. Max   │  1520     │  1480     │ +40  │|
|             |  │ Boost Prom.│   45%     │   52%     │ -7%  │|
|             |  └───────────────────────────────────────────┘|
|             |                                                 |
|             |  [+] Añadir otra partida  [Exportar comparativa]│
|             |                                                 |
+-----------------------------------------------------------+
```

**Success Criteria**: Comparativa muestra deltas claros. Colores verde/rojo indican mejora/declive.

---

### 3.4 Flow 4: Analytics Deep Dive

**Objective**: Usuario explora tendencias de rendimiento a largo plazo.
**Primary Persona**: Competitive Grind (Alejandro)
**Success Criteria**: Usuario identifica patrones y toma decisiones sobre su juego basado en datos.

---

#### Step 4.1 — Navigate to Analytics

**Narrativa**: Usuario clickea "Análisis" en el sidebar. Vista por defecto: "Semana".

**ASCII Wireframe — Analytics: Overview**
```
+-----------------------------------------------------------+
|  [Sidebar]  |  Análisis de Rendimiento                      |
|             |                                                 |
|  En Vivo    |  [ Día ]  [ Semana ]  [ Mes ]  [ Sesión ]    |
|  Historial  |                                                 |
|             |  ┌──────────────┐  ┌──────────────┐           |
|  Análisis   |  │ Win Rate     │  │ Puntuación   │           |
|  [Active]   |  │              │  │ Promedio     │           |
|             |  │    58%       │  │    342       │           |
|             |  │  [sparkline] │  │  [sparkline] │           |
|             |  │  ↑ +5% vs    │  │  ↑ +12 vs    │           |
|             |  │    semana    │  │    anterior  │           |
|             |  └──────────────┘  └──────────────┘           |
|             |                                                 |
|             |  ┌─────────────────────────────────────┐     |
|             |  │  Rendimiento en el Tiempo           │     |
|             |  │  [Line Chart: 7 days]               │     |
|             |  │                                     │     |
|             |  │  100% ┤    ╭─╮                      │     |
|             |  │   75% ┤╭──╯  ╰──╮                   │     |
|             |  │   50% ┤╯        ╰────               │     |
|             |  │       L M X J V S D                 │     |
|             |  │  Victorias ─────  Derrotas ── ──    │     |
|             |  └─────────────────────────────────────┘     |
|             |                                                 |
|             |  ┌──────────────┐  ┌──────────────┐           |
|             |  │ Desglose     │  │ Mejores      │           |
|             |  │ de Stats     │  │ Momentos     │           |
|             |  │ [Bar Chart]  │  │              │           |
|             |  │ G A S Sv Dem │  │ • 5 goles    │           |
|             |  │              │  │   en 1 part. │           |
|             |  │              │  │ • Racha: 4W  │           |
|             |  │              │  │ • Vel.max:   │           |
|             |  │              │  │   1650 uu/s  │           |
|             |  └──────────────┘  └──────────────┘           |
|             |                                                 |
+-----------------------------------------------------------+
```

---

#### Step 4.2 — Switch Time Period & Metrics

**Narrativa**: Usuario cambia a "Mes". El gráfico y las métricas se actualizan. Luego cambia la métrica del gráfico principal de "Victorias" a "Goles por partida".

**ASCII Wireframe — Analytics: Month View, Goals Metric**
```
+-----------------------------------------------------------+
|  [Sidebar]  |  Análisis de Rendimiento                      |
|             |                                                 |
|  En Vivo    |  [ Día ]  [ Semana ]  [ Mes ]  [ Sesión ]    |
|  Historial  |                                                 |
|  Análisis   |  [ Métrica: Goles por Partida ▼ ]            |
|  [Active]   |                                                 |
|             |  ┌─────────────────────────────────────┐     |
|             |  │  Goles por Partida - Últimos 30 días│     |
|             |  │  Promedio: 2.3  |  Mejor: 5.0      │     |
|             |  │                                     │     |
|             |  │  6.0 ┤                              │     |
|             |  │  4.5 ┤    ╭──╮    ╭─╮              │     |
|             |  │  3.0 ┤╭──╯  ╰────╯  ╰──╮           │     |
|             |  │  1.5 ┤╯                   ╰───       │     |
|             |  │      S1 S2 S3 S4 S5 S6 S7           │     |
|             |  │  (semanas del mes)                  │     |
|             |  └─────────────────────────────────────┘     |
|             |                                                 |
|             |  [Exportar datos del período]                 |
|             |                                                 |
+-----------------------------------------------------------+
```

---

#### Step 4.3 — Export Data

**Narrativa**: Usuario clickea "Exportar". Aparece diálogo para elegir formato (CSV, JSON) y rango de fechas.

**ASCII Wireframe — Export Dialog**
```
+-----------------------------------------------------------+
|                                                           |
|  ┌─────────────────────────────────────────────────────┐  |
|  │  Exportar Datos                                     │  |
|  │                                                     │  |
|  │  Formato:  [ CSV ● ]  [ JSON ○ ]                   │  |
|  │                                                     │  |
|  │  Período:                                           │  |
|  │  [ Últimos 7 días  ● ]                             │  |
|  │  [ Últimos 30 días ○ ]                             │  |
|  │  [ Todo el historial ○ ]                           │  |
|  │  [ Personalizado    ○ ]  [__/__/__] a [__/__/__]  │  |
|  │                                                     │  |
|  │  Datos a incluir:                                   │  |
|  │  [x] Partidas              [x] Eventos             │  |
|  │  [x] Estadísticas          [ ] Snapshots (raw)     │  |
|  │                                                     │  |
|  │  Tamaño estimado: 1.2 MB                            │  |
|  │                                                     │  |
|  │           [ Cancelar ]    [ Exportar ]              │  |
|  │                                                     │  |
|  └─────────────────────────────────────────────────────┘  |
|                                                           |
+-----------------------------------------------------------+
```

**Success Criteria**: Archivo exportado correctamente. Notificación de éxito.

---

### 3.5 Flow 5: Settings & Data Management

**Objective**: Usuario configura la app, gestiona datos, y verifica actualizaciones.
**Primary Persona**: Todos
**Success Criteria**: Configuraciones se guardan y persisten. El usuario entiende el impacto de cada opción.

---

#### Step 5.1 — Open Settings

**Narrativa**: Usuario clickea "Ajustes" en el sidebar. App muestra última sección de settings usada (default: General).

**ASCII Wireframe — Settings: General Tab**
```
+-----------------------------------------------------------+
|  [Sidebar]  |  Ajustes                                      |
|             |                                                 |
|  En Vivo    |  [ General ]  [ Juego ]  [ Datos ]  [ Actualizaciones ] [ Acerca de ] |
|  Historial  |                                                 |
|  Análisis   |  General                                        |
|             |                                                 |
|  [Active]   |  Idioma / Language                              |
|  Ajustes    |  [ Español ▼ ]                                  |
|             |                                                 |
|  -----------│  Apariencia                                      |
|             |  Tema:  [ Oscuro ● ]  [ Claro ○ ]  [ Sistema ○ ] │
|             |                                                 |
|             |  Comportamiento                                 |
|             |  [x] Iniciar automáticamente con Windows        |
|             |  [x] Minimizar a la bandeja al cerrar           |
|             |  [ ] Mostrar notificaciones de partidas         |
|             |  [x] Animaciones (desactivar para rendimiento)  │
|             |                                                 |
|             |  Notificaciones                                 |
|             |  [x] Mostrar resumen post-partida               |
|             |  [x] Alertar si Stats API no está configurado   │
|             |                                                 |
|             |              [ Restaurar valores por defecto ]  │
|             |                                                 |
+-----------------------------------------------------------+
```

---

#### Step 5.2 — Game Tab (Stats API Config)

**Narrativa**: Usuario verifica configuración del Stats API. Puede re-ejecutar el wizard.

**ASCII Wireframe — Settings: Game Tab**
```
+-----------------------------------------------------------+
|  [Sidebar]  |  Ajustes                                      |
|             |                                                 |
|  Ajustes    |  [ General ]  [ Juego ]  [ Datos ]  [ Actualizaciones ] [ Acerca de ] |
|  [Active]   |                                                 |
|             |  Configuración del Juego                        |
|             |                                                 |
|             |  Ubicación de Rocket League:                    |
|             |  C:\Program Files\Epic Games\RL...             |
|             |  [ Cambiar ruta... ]                            |
|             |                                                 |
|             |  Stats API:                                     |
|             |  [✓] Activo en TASystemSettings.ini             |
|             |  [ Reconfigurar automáticamente ]               |
|             |                                                 |
|             |  Detección de partida:                          |
|             |  Tiempo de espera: [ 30 ] segundos              |
|             |  [?] Tiempo máximo de espera para detectar      |
|             |      un nuevo match después de que RL envíe     │
|             |      el primer evento.                          │
|             |                                                 |
|             |  [ Ejecutar diagnóstico de conexión ]           │
|             |                                                 |
+-----------------------------------------------------------+
```

---

#### Step 5.3 — Data Tab (Storage & Export)

**Narrativa**: Usuario revisa cuánto espacio ocupan los datos. Decide exportar un backup y luego limpiar datos antiguos.

**ASCII Wireframe — Settings: Data Tab**
```
+-----------------------------------------------------------+
|  [Sidebar]  |  Ajustes                                      |
|             |                                                 |
|  Ajustes    |  [ General ]  [ Juego ]  [ Datos ]  [ Actualizaciones ] [ Acerca de ] |
|  [Active]   |                                                 |
|             |  Gestión de Datos                               |
|             |                                                 |
|             |  Uso de almacenamiento:                         |
|             |  ┌─────────────────────────────────────┐       |
|             |  │  [████████░░░░░░░░]  42% usado     │       |
|             |  │  420 MB / 1 GB                      │       |
|             |  │                                     │       |
|             |  │  Partidas:        1,247             │       |
|             |  │  Eventos:         4.2M              │       |
|             |  │  Snapshots:       890K              │       |
|             |  │                                     │       |
|             |  │  [ Limpiar snapshots antiguos ]     │       |
|             |  │  (mantener últimos 30 días)         │       |
|             |  └─────────────────────────────────────┘       |
|             |                                                 |
|             |  Exportar e Importar                            │
|             |  [ Exportar todos los datos ]                   │
|             |  [ Importar desde archivo... ]                  │
|             |  [ Crear copia de seguridad automática ]        │
|             |                                                 |
|             |  Zona Peligrosa                                 │
|             |  [ Limpiar historial antiguo (> 90 días) ]      │
|             |  [ ⚠️ Eliminar TODOS los datos ]                │
|             |                                                 |
+-----------------------------------------------------------+
```

**Decision Point**: "Eliminar TODOS los datos" requiere confirmación con typing del nombre de la app.

---

#### Step 5.4 — Check for Updates

**Narrativa**: Usuario va a "Actualizaciones". App verifica automáticamente al entrar. Muestra versión actual y si hay nueva versión.

**ASCII Wireframe — Settings: Updates Tab (Update Available)**
```
+-----------------------------------------------------------+
|  [Sidebar]  |  Ajustes                                      |
|             |                                                 |
|  Ajustes    |  [ General ]  [ Juego ]  [ Datos ]  [ Actualizaciones ] [ Acerca de ] |
|  [Active]   |                                                 |
|             |  Actualizaciones                                |
|             |                                                 |
|             |  ┌─────────────────────────────────────┐       |
|             |  │  [Bell Icon]                        │       |
|             |  │                                     │       |
|             |  │  ¡Nueva versión disponible!         │       |
|             |  │                                     │       |
|             |  │  Actual:    v1.0.2                  │       |
|             |  │  Nueva:     v1.1.0                  │       |
|             |  │                                     │       |
|             |  │  Cambios principales:               │       |
|             |  │  • Nuevo: Heatmap de horario        │       |
|             |  │  • Mejora: 40% más rápido el inicio │       |
|             |  │  • Fix: Corregido crash al exportar │       |
|             |  │                                     │       |
|             |  │  [ Ver notas completas en GitHub ]  │       |
|             |  │                                     │       |
|             |  │        [ Descargar e Instalar ]     │       |
|             |  │        [ Omitir esta versión ]      │       |
|             |  └─────────────────────────────────────┘       |
|             |                                                 |
|             |  Canal de actualización:                        │
|             |  [ Estable ● ]  [ Beta ○ ]                     │
|             |                                                 |
|             |  [ Verificar ahora ]  Última vez: hace 2 días  │
|             |                                                 |
+-----------------------------------------------------------+
```

**Success Criteria**: Update se descarga e instala. App reinicia automáticamente.

---

## 4. Information Architecture

### 4.1 Site Map / Navigation Structure

```
RL Stats
│
├── Sidebar Navigation (persistent)
│   ├── En Vivo (Live Match)        — Pulse indicator when active
│   ├── Historial (Match History)   — Default landing if live inactive
│   ├── Análisis (Analytics)        — Time-based performance
│   └── Ajustes (Settings)          — Configuration & data
│
├── En Vivo / Live Match Dashboard
│   ├── States:
│   │   ├── Waiting      — "Esperando partida..."
│   │   ├── Warmup       — Match detected, countdown
│   │   ├── Active       — Full dashboard with real-time data
│   │   ├── Replay       — Goal replay overlay
│   │   └── Finished     — Final score, CTA to detail
│   ├── Sections:
│   │   ├── Header       — Timer, Score, Arena, Mode
│   │   ├── Team Panels  — Player cards (Blue vs Orange)
│   │   ├── Event Feed   — Real-time event stream
│   │   └── Game Info    — Ball speed, overtime status
│   └── Actions:
│       └── "Ver Resumen" (post-match only)
│
├── Historial / Match History
│   ├── Filters Bar
│   │   ├── Date Range   — Hoy, Ayer, Últimos 7d, Últimos 30d, Personalizado
│   │   ├── Result       — Todas, Victorias, Derrotas
│   │   ├── Mode         — Todas, 1v1, 2v2, 3v3, 4v4, Extra modes
│   │   └── Search       — Text search (player name, arena)
│   ├── Match List
│   │   ├── Match Card   — Horizontal summary
│   │   └── Pagination   — Infinite scroll or numbered
│   └── Actions:
│       ├── Ver Detalles
│       ├── Comparar (multi-select)
│       └── Eliminar
│
├── Match Detail (deep link from History)
│   ├── Header             — Score, teams, result, date
│   ├── Score Timeline     — Visual goal timeline
│   ├── Stats Table        — All players, all metrics, sortable
│   ├── Goals Detail       — Goal-by-goal breakdown
│   ├── Event Timeline     — Chronological all events
│   └── Actions:
│       ├── Exportar partida
│       └── Comparar con otra
│
├── Comparativa / Match Comparison
│   ├── Match Headers      — Side-by-side summaries
│   ├── Stats Delta Table  — Side-by-side with +/-
│   └── Actions:
│       └── Añadir otra partida
│
├── Análisis / Analytics
│   ├── Time Period Tabs   — Día, Semana, Mes, Sesión
│   ├── KPI Cards          — Win Rate, Avg Score, etc.
│   ├── Main Chart         — Configurable metric over time
│   ├── Breakdown Chart    — Bar/radar chart of stats
│   └── Peak Performances  — Best moments list
│
└── Ajustes / Settings
    ├── General            — Language, theme, startup, notifications
    ├── Juego              — RL path, Stats API config, detection timeout
    ├── Datos              — Storage usage, export/import, cleanup
    ├── Actualizaciones    — Check updates, channel, release notes
    └── Acerca de          — Version, license, credits, links
```

### 4.2 Content Hierarchy

```
H1 — Page Title (e.g., "Dashboard en Vivo", "Historial de Partidas")
  ├─ H2 — Section Title (e.g., "Equipo Azul", "Feed de Eventos")
  │   ├─ H3 — Card/Panel Title (e.g., player name, metric name)
  │   │   ├─ Data Value (big number, primary stat)
  │   │   ├─ Data Label (small text, what the number means)
  │   │   └─ Metadata (timestamp, secondary info)
  │   └─ H3 — Secondary Panel
  └─ H2 — Secondary Section
      └─ H3 — Sub-section

Visual Weight Priority:
1. Live Score / Match Result   — Hero size, highest contrast
2. Active Player / Current User — Highlight border, accent color
3. Primary Stats (Goals, Shots, Saves) — Mono font, large size
4. Secondary Stats (Boost, Speed) — Standard body, muted if idle
5. Metadata (Timestamps, Arena) — Caption size, tertiary color
```

### 4.3 Taxonomy (Match Categorization)

```
Match Classification:
│
├── By Result
│   ├── Victoria (Win)
│   ├── Derrota (Loss)
│   └── Empate (Draw) — rare, possible in some modes
│
├── By Mode (inferred from player count)
│   ├── Duel (1v1)
│   ├── Doubles (2v2)
│   ├── Standard (3v3)
│   ├── Chaos (4v4)
│   └── Unknown / Private match
│
├── By Context (inferred)
│   ├── Online Ranked
│   ├── Online Casual
│   ├── Offline / Exhibition
│   ├── Private Match
│   └── Training / Workshop
│
├── By Duration
│   ├── Normal (≤ 5:00 + up to 2:00 OT)
│   ├── Long OT (> 2:00 overtime)
│   └── Forfeit (ended early)
│
├── By Personal Performance
│   ├── MVP (highest score in match)
│   ├── Carry (score > 40% of team total)
│   ├── Support (assists + saves > goals)
│   └── Below Average (score < team avg)
│
└── By Time
    ├── Session (contiguous play period, ≤ 30min gap)
    ├── Day / Week / Month
    └── Time of Day (morning, afternoon, evening, night)
```

### 4.4 Search & Filter Behavior

```
Filter Logic:
- Filters are AND-combined (Result=Win AND Mode=2v2)
- Date range is inclusive of start/end
- Text search matches: player names, arena names
- Filters persist per session (clear on app close)
- URL/deep-linkable filters (future)

Search Behavior:
- Debounced at 300ms
- Results update in real-time (no "Search" button needed)
- Empty state shows "No se encontraron partidas con estos filtros"
- "Limpiar filtros" resets to default

Sort Behavior (History):
- Default: Fecha descendente (newest first)
- Options: Fecha, Duración, Puntuación, Resultado
- Click header toggles asc/desc

Filter Persistence:
- Last used filters are remembered for current session
- On app restart, filters reset to "Todas / Últimos 30 días"
```

---

## 5. Interaction Patterns

### 5.1 Live Data Updates

```
UpdateState Events (throttled to 100ms):
- Boost bar: Smooth width transition (150ms ease-out)
- Speed number: Instant update (no animation, data is king)
- Score: Scale pop (300ms) + color flash on change
- Timer: Updates every second, format mm:ss

Discrete Events (GoalScored, StatfeedEvent, etc.):
- Event Feed: Newest at top, slideIn from right (200ms)
- Feed max items: 50, older items auto-remove
- Goal overlay: Fade in (200ms), stay 3s, fade out (300ms)
- Sound: Optional notification beep (disabled by default)

Connection Status Changes:
- Connected → Disconnected: Banner slides down from top
- Disconnected → Connected: Banner slides up, brief "Reconectado" toast
- Reconnection attempts: Shown in status bar with countdown
```

### 5.2 Error Display

```
Error Toast Notification:
- Position: Bottom-right corner (desktop convention)
- Duration: 5 seconds (auto-dismiss) or persistent if critical
- Types:
  - Info (blue):    "Partida guardada"
  - Success (green):"Exportación completada"
  - Warning (amber):"Stats API no detectado. ¿RL está abierto?"
  - Error (red):    "Error al exportar: permisos insuficientes"

Inline Errors (forms/settings):
- Red border on field + text below field
- Icon: Alert circle (16px)
- Clears on user input

Banner Errors (persistent):
- Full-width banner below header
- Used for: Connection lost, API not configured, update required
- Action button in banner for resolution

Empty States (soft errors):
- Illustrated icon (48px, muted)
- Clear title + explanation
- Action button if applicable
```

### 5.3 Loading States

```
App Startup:
- Window opens immediately
- Content area shows skeleton screens
- Sidebar is static (no skeleton needed)
- Database connection happens in background

Page Navigation:
- 200ms fade transition (no spinner for < 300ms loads)
- If > 300ms, show skeleton in content area
- Never block entire UI

Data Fetching (History, Analytics):
- Skeleton cards matching layout of content
- Shimmer animation (1200ms, left to right)
- Spinner only for actions (export, import, delete)

Live Dashboard Waiting:
- Icon + "Esperando partida..." + subtle pulse
- Not a loading state per se, but a persistent waiting state
```

### 5.4 Empty States

```
No Matches Yet:
- Icon: Gamepad2 (48px, Text Tertiary #64748B)
- Title: "No hay partidas capturadas aún"
- Description: "Abre Rocket League, activa el Stats API, y juega una partida. Capturaremos los datos automáticamente."
- Action: "Cómo activar el Stats API" → opens Settings > Juego

No Live Match:
- Icon: Radio (48px, Text Tertiary)
- Title: "Esperando partida..."
- Description: "Inicia una partida en Rocket League para ver datos en tiempo real."
- Animation: Icon pulse (2s infinite)

No Data for Period (Analytics):
- Icon: BarChart3 (48px, Text Tertiary)
- Title: "No hay datos para este período"
- Description: "Juega algunas partidas para ver tu análisis aquí."
- Suggestion: "Jugar ahora" (opens RL via protocol if possible)

No Search Results:
- Icon: Search (48px, Text Tertiary)
- Title: "No se encontraron partidas"
- Description: "Intenta con otros términos o limpia los filtros."
- Action: "Limpiar filtros"

No Events in Match:
- Icon: Activity (48px, Text Tertiary)
- Title: "Sin eventos detallados"
- Description: "Esta partida se capturó con datos mínimos."
```

### 5.5 Notifications

```
System Notifications (Windows native via Tauri):
- Post-match summary: "Victoria 3-2 · 450 pts · MVP"
- Connection lost: "Desconectado de Rocket League"
- Update available: "RL Stats v1.1.0 disponible"
- Setting: user can disable all notifications

In-App Toast Notifications:
- Export complete
- Settings saved
- Data cleared
- Backup created

Badge Notifications:
- Sidebar icon badge for update available (not for live match, that's a pulse)
- Tray icon tooltip shows last match result (optional)

Notification Priority:
1. Critical: Connection lost mid-match, data corruption risk
2. High: Post-match summary (if user has setting on)
3. Normal: Update available, export complete
4. Low: Settings saved, filters applied
```

### 5.6 Keyboard Shortcuts Map

```
Global (any page):
┌──────────────────────┬────────────────────────────────┐
│ Shortcut             │ Action                         │
├──────────────────────┼────────────────────────────────┤
│ Ctrl + 1             │ Go to Live Dashboard           │
│ Ctrl + 2             │ Go to History                  │
│ Ctrl + 3             │ Go to Analytics                │
│ Ctrl + ,             │ Go to Settings                 │
│ Ctrl + R             │ Refresh current view           │
│ Ctrl + F             │ Focus search/filter (context)  │
│ Ctrl + E             │ Export current view/data       │
│ F11                  │ Toggle fullscreen              │
│ Ctrl + Shift + D     │ Toggle developer tools         │
│ Ctrl + Q             │ Quit app                       │
│ Ctrl + Shift + M     │ Minimize to tray               │
└──────────────────────┴────────────────────────────────┘

History Page:
┌──────────────────────┬────────────────────────────────┐
│ Shortcut             │ Action                         │
├──────────────────────┼────────────────────────────────┤
│ ↑ / ↓                │ Navigate match cards           │
│ Enter                │ Open selected match detail     │
│ Delete               │ Delete selected match (confirm)│
│ Escape               │ Clear filters / Close modal    │
│ Ctrl + A             │ Select all visible matches     │
│ Ctrl + Click         │ Multi-select matches           │
└──────────────────────┴────────────────────────────────┘

Match Detail:
┌──────────────────────┬────────────────────────────────┐
│ Shortcut             │ Action                         │
├──────────────────────┼────────────────────────────────┤
│ ←                    │ Back to history                │
│ Tab                  │ Cycle through tabs             │
│ Ctrl + C             │ Copy selected stat value       │
└──────────────────────┴────────────────────────────────┘

Live Dashboard:
┌──────────────────────┬────────────────────────────────┐
│ Shortcut             │ Action                         │
├──────────────────────┼────────────────────────────────┤
│ Space                │ Pause/resume event feed scroll │
│ S                    │ Toggle sidebar expand/collapse │
│ T                    │ Toggle team panels layout      │
└──────────────────────┴────────────────────────────────┘
```

---

## 6. Accessibility Guidelines

### 6.1 Keyboard Navigation Paths

#### Flow 1: First-Time Setup (Keyboard Only)
```
1. [Tab] → Focus "Comenzar" button → [Enter]
2. [Tab] → Navigate wizard options
   - [Space] to toggle checkboxes
   - [Tab] → "Continuar" → [Enter]
3. [Tab] → "Reintentar conexión" or "Finalizar"
4. [Enter] on "Ir al Dashboard"

Focus Trap: Modal wizard traps focus until completed or cancelled.
Escape: On wizard steps, [Esc] asks "¿Salir del asistente?" (non-blocking).
```

#### Flow 2: Live Match Experience (Keyboard Only)
```
1. App auto-detects match (no user action needed)
2. [Ctrl + 1] → Go to Live Dashboard (always accessible)
3. [Tab] → Navigate player cards (focus ring visible)
   - Arrow keys to move between teams
4. [Space] on player card → Expand detailed stats
5. [Esc] → Collapse expanded card
6. No keyboard action needed for real-time events (passive consumption)
```

#### Flow 3: Review Past Performance (Keyboard Only)
```
1. [Ctrl + 2] → Go to History
2. [Tab] → Navigate to filter bar
3. [Ctrl + F] → Focus search input
4. [Tab] → Navigate match cards
5. [Enter] on match card → Open detail
6. [Tab] → Navigate tabs (Estadísticas, Goles, Timeline)
7. [Tab] → Navigate stats table (arrow keys for grid)
8. [←] → Back to history
```

#### Flow 4: Analytics Deep Dive (Keyboard Only)
```
1. [Ctrl + 3] → Go to Analytics
2. [Tab] → Navigate period tabs
3. [Arrow Left/Right] → Switch between tabs
4. [Tab] → Focus chart
   - Chart has `role="img"` with `aria-label` describing data
5. [Tab] → Navigate to "Exportar" button
```

#### Flow 5: Settings & Data Management (Keyboard Only)
```
1. [Ctrl + ,] → Go to Settings
2. [Tab] → Navigate setting categories (tablist)
3. [Arrow Left/Right] → Switch setting tabs
4. [Tab] → Navigate controls within tab
5. Danger zone buttons require confirmation dialog (focus moves to dialog)
```

### 6.2 Screen Reader Announcements

```
Live Match Events (aria-live regions):
- Goal scored: aria-live="polite" → "Gol de Alenx. Asistencia de Teammate1. Velocidad 87 kilómetros por hora"
- Match ended: aria-live="assertive" → "Partida finalizada. Victoria 3 a 2"
- Connection status: aria-live="polite" → "Conectado a Rocket League" / "Desconectado"

Page Changes:
- Route change: Announce new page title via aria-live
- "Navegando a Historial de Partidas"

Dynamic Updates:
- Timer: NOT announced every second (too noisy). Announced on significant changes (overtime, match end).
- Score change: Announced with context → "Marcador: 2 a 1"
- Event feed: Each new event is a list item in a live region with `aria-atomic="false"` (only new item announced)

Data Tables:
- Table has `aria-label="Estadísticas de jugadores"`
- Sortable headers: `aria-sort="ascending/descending/none"`
- Selected row: `aria-selected="true"`
```

### 6.3 Focus Management

```
Focus Indicators:
- All interactive elements: 2px solid Accent Primary (#3B82F6), 2px offset
- Focus ring visible on: buttons, links, inputs, table rows, cards
- Focus ring NOT visible on: static text, decorative icons

Focus Restoration:
- After closing modal/dialog: Focus returns to trigger element
- After page navigation: Focus resets to top of content (h1)
- After delete confirmation: Focus moves to next item in list

Focus Traps:
- Modal dialogs: Yes, focus cycles within modal
- Sidebar: No, focus moves naturally to content
- Event feed: No, it's a passive region

Skip Links:
- "Saltar al contenido principal" link at top of app (visible on focus)
- Allows screen reader users to bypass sidebar
```

### 6.4 Color-Blind Friendly Design

```
Color-Blindness Support:
- Never rely on color alone to convey information
- Team Blue vs Orange:
  - Blue: Shield icon + label "AZUL"
  - Orange: Shield icon + label "NARANJA"
  - Borders: Blue uses solid line, Orange uses dashed/dotted (configurable)
  - Score: Left side always Blue, Right side always Orange (spatial consistency)

Status Indications:
- Win: Green badge + checkmark icon + text "Victoria"
- Loss: Red badge + X icon + text "Derrota"
- Live: Green pulse + "EN VIVO" text
- Overtime: Amber badge + clock icon + "PRÓRROGA"

Charts:
- Line charts: Solid vs dashed lines (not just blue vs orange)
- Bar charts: Patterns or hatching in addition to color
- All charts have tooltips with text labels

Testing Checklist:
- [ ] Test with Deuteranopia (red-green) filter
- [ ] Test with Protanopia (red-blind) filter
- [ ] Test with Tritanopia (blue-yellow) filter
- [ ] Test in grayscale
- [ ] Verify all info is understandable without color
```

### 6.5 Motion Sensitivity

```
Respect prefers-reduced-motion:
- If user has OS setting for reduced motion:
  - Disable pulse animation on live indicator (static green dot)
  - Disable score pop animation (instant change)
  - Disable card hover lift (static shadow change)
  - Disable page transition slide (pure fade)
  - Disable skeleton shimmer (static placeholder)
  - Disable event feed slideIn (instant appear)
  - Keep: Subtle color transitions (not motion)

App Setting:
- "Animaciones" toggle in Settings > General
- Overrides system preference if explicitly set
- Default: Follow system preference

Epilepsy Safety:
- No flashing at > 3Hz
- Score flash is single pulse (safe)
- No strobe effects anywhere
```

---

## 7. Edge Cases & Error Handling

### 7.1 Rocket League Not Running

```
Scenario: User opens RL Stats but RL is not running.

UI State:
- Dashboard shows "Esperando partida..." with Radio icon
- Status bar: "Conectado a 127.0.0.1:49123" (connection open, no data)
- Connection indicator: Yellow/amber ("esperando")

User Action:
- Can browse History, Analytics, Settings normally
- Live Dashboard is passive waiting state

Auto-Recovery:
- App keeps TCP connection attempt with exponential backoff
- When RL opens and Stats API sends first event, dashboard wakes up automatically
- Notification: "Rocket League detectado. Listo para capturar."

Error Message:
- Title: "Rocket League no detectado"
- Body: "Abre Rocket League para ver estadísticas en vivo. El historial y análisis siguen disponibles."
- Action: "Abrir Rocket League" (attempts to launch via Steam/Epic protocol)
```

### 7.2 Stats API Not Configured

```
Scenario: RL is running but Stats API INI setting is false or missing.

Detection:
- App connects to port 49123 but receives no events
- After 30 seconds of silence: trigger warning

UI State:
- Banner: "Stats API no configurado"
- Dashboard: "Esperando partida..." + warning icon

User Action:
- Click banner → opens Settings > Juego
- "Reconfigurar automáticamente" button
- Manual guide if auto fails

Error Message:
- Title: "Stats API no está activado"
- Body: "Rocket League no está enviando datos. Activa el Stats API en la configuración."
- Action: "Configurar ahora" → Settings

Recovery:
- After INI is fixed and RL restarted, app auto-detects on next match
```

### 7.3 Connection Lost Mid-Match

```
Scenario: TCP connection drops while a match is active (RL crash, network hiccup, sleep mode).

Detection:
- No data received for > 5 seconds while match is active
- Ingestor attempts reconnection (max 5 attempts, exponential backoff)

UI State:
- Banner slides down: "Conexión perdida. Reconectando... (intento 1/5)"
- Dashboard grays out slightly (opacity 0.7)
- Timer freezes at last known value
- "EN VIVO" badge changes to "RECONEXIÓN" (amber)

Data Integrity:
- Match data up to disconnect point is PRESERVED
- SQLite transaction: partial match is saved
- On reconnect: if same match GUID, resume. If new match, close previous as "incomplete"

Error Message:
- Title: "Conexión perdida"
- Body: "Se perdió la conexión con Rocket League. Intentando reconectar..."
- Progress: "Intento 2 de 5 en 4 segundos..."

Recovery Success:
- Banner: "¡Reconectado! Resumiendo partida..."
- Dashboard restores full opacity
- Missing time period noted in match detail as "Datos incompletos"

Recovery Failure:
- After 5 failed attempts: "No se pudo reconectar. Partida guardada parcialmente."
- Match in history marked with "Incompleta" badge
```

### 7.4 Corrupted Data

```
Scenario: SQLite database has corrupted rows or invalid JSON in event_data.

Detection:
- Parse error when querying match detail
- Integrity check on startup (PRAGMA integrity_check)

UI State:
- If integrity check fails: Banner "Problema detectado en la base de datos"
- Corrupted match shows error card in history instead of crashing

User Action:
- Settings > Datos > "Ejecutar diagnóstico de base de datos"
- Option to repair (if possible) or delete corrupted entries
- Option to restore from backup

Error Message:
- Title: "Datos corruptos detectados"
- Body: "Algunas partidas no se pudieron cargar correctamente. Puedes intentar repararlos o eliminarlos."
- Action: "Reparar" / "Eliminar datos corruptos" / "Restaurar backup"

Prevention:
- WAL mode (Write-Ahead Logging) for SQLite
- Backups automatic every N matches (configurable)
- JSON schema validation before persistence
- Graceful degradation: skip corrupted events, load rest of match
```

### 7.5 First Match Ever (Empty States)

```
Scenario: Fresh install, no historical data. All pages empty.

Dashboard:
- "Esperando partida..." (normal waiting state)
- Not an error, just empty

History:
- Empty state: Gamepad2 icon + "No hay partidas capturadas aún"
- Action: "Cómo activar Stats API" → wizard

Analytics:
- Empty state: BarChart3 icon + "No hay datos para este período"
- Suggestion: "Juega tu primera partida para comenzar"

Match Detail:
- N/A (can't access without history)

Settings > Datos:
- Shows "0 MB usado" + "0 partidas"
- Export/Import available but empty
```

### 7.6 Very Long Play Sessions

```
Scenario: User plays for 6+ hours. Hundreds of events. Memory/performance concerns.

Performance Measures:
- Event feed max items: 50 (older auto-removed from UI, kept in DB)
- UpdateState snapshots: throttled to 100ms, not every frame
- Memory: Old match data purged from frontend store, kept in SQLite
- Session: Auto-split into logical sessions if > 30min gap between matches

UI State:
- No degradation in UI responsiveness
- Analytics queries remain < 1s (indexed DB)
- Live dashboard: same performance regardless of session length

Data Retention:
- Default: Keep all data indefinitely
- Optional: Auto-delete matches older than X days (Settings > Datos)
- Snapshots (bulky): auto-clean after 30 days by default

Edge: 24h+ session
- Session table records end_time
- If no end_time (app crash), session auto-closes on next startup
- No data loss
```

### 7.7 Disk Full

```
Scenario: User's disk is near capacity. SQLite can't write new data.

Detection:
- SQLite write error: "database or disk is full"
- Pre-write check: verify available space > 50MB

UI State:
- Banner: "Espacio en disco insuficiente"
- Live dashboard still works (read-only)
- New matches can't be saved

User Action:
- Settings > Datos > "Limpiar snapshots antiguos" (frees space)
- "Exportar y eliminar" (backup then clear)
- Manual disk cleanup

Error Message:
- Title: "Sin espacio en disco"
- Body: "No se pueden guardar nuevas partidas. Libera espacio o limpia datos antiguos."
- Action: "Ir a Gestión de Datos" / "Cerrar"

Graceful Degradation:
- App continues to show live data (in-memory only)
- Warning: "Datos en vivo no se están guardando"
- When disk space available again, normal operation resumes
```

---

## 8. Metrics & Success Criteria

### 8.1 Task Completion Rates

```
Task: First-time setup completion
- Target: > 90% of users who open the installer complete setup
- Measurement: Funnel from "installer opened" → "first match captured"
- Failure points: SmartScreen block, INI config confusion, connection timeout

Task: Find a specific past match
- Target: > 85% success in < 10 seconds
- Measurement: Usability test with task "Encuentra la partida que jugaste ayer"
- Success: User locates match and opens detail

Task: Export data
- Target: > 80% success without external help
- Measurement: Task "Exporta tus partidas de la última semana a CSV"
- Success: File created in expected location

Task: View live dashboard during match
- Target: > 95% (should be automatic)
- Measurement: Users with at least one match captured / Total active users
- Failure: Stats API not configured, connection issues

Task: Compare two matches
- Target: > 70% discoverability (users find the feature)
- Target: > 90% completion once discovered
- Measurement: Multi-select usage in analytics
```

### 8.2 Time on Task

```
Onboarding (first launch to first match visible):
- Target: < 5 minutes
- Acceptable: < 10 minutes
- Measurement: Timestamp from app first open to first MatchCreated event

Finding a match in history (with filters):
- Target: < 10 seconds
- Acceptable: < 20 seconds
- Measurement: From History page load to Match Detail open

Exporting data:
- Target: < 30 seconds
- Acceptable: < 60 seconds
- Measurement: From "Exportar" click to file saved

Checking analytics overview:
- Target: < 5 seconds
- Acceptable: < 10 seconds
- Measurement: From Analytics page load to KPIs visible

Recovering from connection loss:
- Target: < 10 seconds (automatic)
- Acceptable: < 30 seconds
- Measurement: From disconnect event to reconnect success
```

### 8.3 Error Rates

```
App Crash Rate:
- Target: < 0.1% of sessions
- Measurement: Crash reports / Total sessions (opt-in only)

Failed Match Capture:
- Target: < 2% of matches have incomplete data
- Measurement: Matches marked incomplete / Total matches
- Causes: Connection loss, app crash, invalid events

Export Failures:
- Target: < 1% of export attempts
- Measurement: Failed exports / Total exports
- Causes: Disk full, permissions, corrupted data

Stats API Misconfiguration:
- Target: < 10% of new users need manual INI setup
- Measurement: Users using manual guide / Total new users
- Goal: Improve auto-detect to reduce this

Update Failures:
- Target: < 5% of update attempts
- Measurement: Failed updates / Total update prompts
```

### 8.4 User Satisfaction Indicators

```
Retention Metrics:
- Day 1 retention: > 60% of installers open app again
- Day 7 retention: > 40%
- Day 30 retention: > 25%
- Measurement: Unique users opening app on day N after install

Engagement Metrics:
- Average sessions per week: > 3 (aligned with RL play frequency)
- Average session duration: > 2 minutes (not just "open and close")
- Feature usage distribution: Live 60%, History 25%, Analytics 15%
- Measurement: Event tracking (local only, anonymous aggregates)

Sentiment Indicators:
- GitHub stars / Total downloads ratio: > 5%
- Issues labeled "feature request" vs "bug": > 1:1 (more features than bugs = healthy)
- Average issue response time: < 48 hours
- Measurement: GitHub metrics

Success Criteria by Persona:
Competitive Grind:
- Uses Analytics at least once per week
- Has > 50 matches captured
- Export feature used at least once

Casual Enjoyer:
- Has app auto-start enabled
- Opens History after > 50% of play sessions
- Zero support tickets about "cómo funciona"

Content Creator:
- Uses Export feature weekly
- Has written or requested plugin/script integration
- Recommends app to audience

Net Promoter Score (NPS):
- Target: > 40 (would recommend to a friend)
- Measurement: In-app survey after 10th match captured
- Question: "¿Qué tan probable es que recomiendes RL Stats a un amigo?"
```

---

## Appendix A: ASCII Wireframe Style Guide

For consistency across all wireframes in this document:

```
Box Drawing Characters:
- Corners: ┌ ┐ └ ┘
- Horizontal: ─
- Vertical: │
- Intersections: ├ ┤ ┬ ┴ ┼

Layout Conventions:
- Sidebar shown as [Sidebar] column on left
- Active nav item marked with [Active]
- Live indicator: [Pulsing Dot]
- Buttons: [ Button Text ]
- Inputs: [ Placeholder... ] or [ Value    ]
- Dropdowns: [ Value ▼ ]
- Badges: [Badge: TEXT]
- Icons represented by [Icon Name] or emoji shorthand (for wireframes only)

Color Hints (text labels in wireframes):
- 🔵 = Team Blue
- 🟠 = Team Orange
- ⭐ = MVP / Highlight
- ✓ = Success/Check
- ⚠️ = Warning
```

---

## Appendix B: Glossary

| Español | English | Definition |
|---------|---------|------------|
| Dashboard en Vivo | Live Dashboard | Real-time match statistics view |
| Historial | History / Match History | List of all captured matches |
| Análisis | Analytics | Performance trends and aggregated statistics |
| Ajustes | Settings | Application configuration |
| Partida | Match | A single Rocket League game |
| Evento | Event | Discrete occurrence (goal, save, demo, etc.) |
| Stats API | Stats API | Official Rocket League local TCP data stream |
| INI | INI File | Rocket League configuration file (TASystemSettings.ini) |
| Prórroga | Overtime | Extra time after regulation tie |
| MVP | MVP | Most Valuable Player (highest score) |
| Promedio | Average / Mean | Arithmetic mean of a metric |
| Vel. Max | Max Speed | Highest speed achieved in a match |
| Boost | Boost | Rocket League boost resource (0-100%) |
| uu/s | uu/s | Unreal Units per second (game speed unit) |
| Racha | Streak | Consecutive wins or losses |
| Snapshot | Snapshot | Periodic state capture for replay/analysis |

---

> **Document Info**
> Created: 2026-05-02
> Based on: DESIGN.md v1.0, PRODUCT.md v1.0, ARCHITECTURE.md v1.0
> Author: UX Architecture Team
> Status: Draft — Ready for development review
