/**
 * Single source of truth for the landing copy.
 *
 * Every feature claim below was verified against the codebase before writing
 * (see landing/README.md for the evidence table). Do not add features the app
 * does not ship, and never promise cloud features that are still opt-in or
 * unfinished.
 */
import type { Lang } from "./i18n";

export interface Copy {
  meta: { title: string; description: string };
  nav: { features: string; overlays: string; privacy: string; faq: string; download: string };
  hero: {
    badge: string;
    title: string;
    titleAccent: string;
    subtitle: string;
    ctaPrimary: string;
    ctaSecondary: string;
    free: string;
    freeDetail: string;
    local: string;
    localDetail: string;
    noAccount: string;
    noAccountDetail: string;
    platform: string;
    versionLoading: string;
    version: string;
  };
  live: {
    kicker: string;
    title: string;
    body: string;
    points: string[];
    hint: string;
  };
  overlays: {
    kicker: string;
    title: string;
    body: string;
    items: { name: string; description: string }[];
    note: string;
  };
  history: {
    kicker: string;
    title: string;
    body: string;
    points: string[];
  };
  analytics: {
    kicker: string;
    title: string;
    body: string;
    cards: { title: string; body: string }[];
  };
  mood: {
    kicker: string;
    title: string;
    body: string;
    quote: string;
    quoteDetail: string;
    levels: string[];
  };
  privacy: {
    kicker: string;
    title: string;
    body: string;
    items: { title: string; body: string }[];
    pathLabel: string;
    path: string;
  };
  extras: {
    title: string;
    items: { title: string; body: string }[];
  };
  free: {
    kicker: string;
    title: string;
    body: string;
    included: string[];
    optionalTitle: string;
    optionalBody: string;
    optionalCta: string;
    license: string;
  };
  faq: {
    title: string;
    items: { q: string; a: string }[];
  };
  finalCta: {
    title: string;
    body: string;
    note: string;
  };
  footer: {
    tagline: string;
    product: string;
    community: string;
    languages: string;
    madeBy: string;
    trademark: string;
  };
  screenshotAlts: Record<string, string>;
}

const es: Copy = {
  meta: {
    title: "RL Stats — Tu compañero local para Rocket League",
    description:
      "MMR en vivo de todos los jugadores, overlays para OBS, historial completo y análisis de tu rendimiento. 100% gratis, 100% local, sin cuentas ni telemetría.",
  },
  nav: {
    features: "Funciones",
    overlays: "Overlays",
    privacy: "Privacidad",
    faq: "Preguntas",
    download: "Descargar",
  },
  hero: {
    badge: "Windows 10/11 · v{{version}}",
    title: "Tu rendimiento en Rocket League,",
    titleAccent: "en tus propias manos",
    subtitle:
      "MMR en vivo de todos los jugadores del lobby, overlays de transmisión, historial completo y análisis que te dice cuándo parar. Todo corre en tu PC. Nada sale de ella.",
    ctaPrimary: "Descargar para Windows",
    ctaSecondary: "Ver funciones",
    free: "Gratis",
    freeDetail: "Sin cuentas ni suscripción",
    local: "Local",
    localDetail: "Tus datos quedan en tu PC",
    noAccount: "Sin telemetría",
    noAccountDetail: "Cero analytics, cero tracking",
    platform: "Windows 10/11 (64-bit)",
    versionLoading: "Consultando la última versión…",
    version: "Última versión: v{{version}}",
  },
  live: {
    kicker: "En vivo",
    title: "El MMR de todo el lobby, mientras juegas",
    body:
      "El juego solo te muestra tu rango. RL Stats resuelve el MMR de cada jugador en la cancha, por playlist, y te lo muestra en tiempo real junto al marcador.",
    points: [
      "MMR exacto, con marcas claras cuando es estimado o viene de caché",
      "Promedios por equipo para leer la cancha de un vistazo",
      "Head-to-head contra cada rival y cada compañero",
      "Reloj, marcador, boost y stats individuales en una sola vista",
    ],
    hint: "Captura real de la app con datos de demostración",
  },
  overlays: {
    kicker: "Overlays",
    title: "Tu transmisión con pinta de broadcast",
    body:
      "Seis overlays listos para OBS, servidos desde tu propia máquina. Los personalizás desde Ajustes, sin tocar una línea de código, y podés escribir los tuyos con el SDK incluido.",
    items: [
      { name: "Enhanced", description: "Scorebug completo, rosters, serie y velocidad de pelota." },
      { name: "Scoreboard", description: "Marcador con reloj y badge de tiempo suplementario." },
      { name: "Player Stats", description: "Tablas por equipo con Pts, G, A, At y Ti." },
      { name: "Event Feed", description: "Feed en vivo de goles, atajadas y demoliciones." },
      { name: "Alerts", description: "Alertas a pantalla completa para cambiar de escena." },
      { name: "All-in-One", description: "Todo junto para escenas sin espacio para más." },
    ],
    note: "SDK incluido para escribir tus propios overlays.",
  },
  history: {
    kicker: "Historial",
    title: "Cada partida, guardada y buscable",
    body:
      "RL Stats captura cada partida automáticamente mientras jugás. Después la podés revisar como una planilla de transmisión: quién hizo qué, cuándo y a qué velocidad.",
    points: [
      "Goles con asistidor, minuto y velocidad del remate",
      "Stats completas de los seis jugadores de la cancha",
      "Filtros por resultado, playlist, tipo de partida y fecha",
      "Exportás el historial a CSV cuando quieras",
    ],
  },
  analytics: {
    kicker: "Análisis",
    title: "Patrones que no ves a simple vista",
    body:
      "RL Stats cruza tus partidas y te muestra lo que ningún marcador te dice: a qué hora jugás mejor, con quién ganás y en qué momento de la sesión se te cae el rendimiento.",
    cards: [
      { title: "Punto de quiebre", body: "Detecta el juego exacto donde tu win rate se derrumba y te sugiere cortar." },
      { title: "Química", body: "Win rate con cada compañero, y comparación entre SoloQ y premade." },
      { title: "Mapa semanal", body: "Heatmap 7×24 de tu win rate en horario local." },
      { title: "Insights", body: "Mejor playlist, mejor horario, remontadas y partidas cerradas." },
    ],
  },
  mood: {
    kicker: "Ánimo",
    title: "¿Cómo te sentiste después de esa partida?",
    body:
      "RL Stats te pregunta al terminar cada partida y cruza tu ánimo con tu rendimiento. No es decoración: es la métrica que te dice si seguir jugando te está haciendo bien.",
    quote: "“Genial” → 89% WR",
    quoteDetail: "“Furioso” → 0% WR",
    levels: ["Genial", "Feliz", "Neutro", "Enojado", "Furioso"],
  },
  privacy: {
    kicker: "Privacidad",
    title: "Tus datos no salen de tu computadora",
    body:
      "RL Stats no tiene servidores que reciban tus partidas. La base de datos vive en tu carpeta de usuario, funciona sin internet y podés exportarla o borrarla cuando quieras.",
    items: [
      { title: "Sin cuenta", body: "No te registrás, no inicias sesión, no hay email que confirmar." },
      { title: "Sin telemetría", body: "Cero analytics, cero crash reporting remoto, cero trackers." },
      { title: "100% offline", body: "El streaming de datos del juego es por TCP local, en tu propia máquina." },
      { title: "Tuyo para siempre", body: "Export e import en JSON, backups automáticos y borrado total sin pedir permiso." },
    ],
    pathLabel: "Tu base de datos",
    path: "%APPDATA%\\com.lukit.rl-stats\\rl_stats_default.db",
  },
  free: {
    kicker: "Precio",
    title: "Todo lo que ves acá es gratis",
    body:
      "No hay versión limitada. Las funciones locales, que son todas las importantes, no tienen candado ni licencia.",
    included: [
      "MMR en vivo sin límite",
      "Los seis overlays y el SDK",
      "Historial y análisis completos",
      "Entrenamientos y Pro Configs",
      "Actualizaciones automáticas",
      "Múltiples perfiles locales",
    ],
    optionalTitle: "La única parte paga es opcional",
    optionalBody:
      "Existe un Cloud Sync temprano para respaldar y sincronizar tus datos entre PCs. Es opcional, y las funciones locales siguen siendo gratis para siempre.",
    optionalCta: "Más sobre Cloud Sync",
    license: "Código abierto bajo licencia MIT",
  },
  extras: {
    title: "Y además",
    items: [
      { title: "Pro Configs", body: "41 configuraciones reales de jugadores profesionales, buscables." },
      { title: "Entrenamientos", body: "Packs curados y los tuyos, sincronizados con tu perfil." },
      { title: "Jugadores", body: "Head-to-head con cada persona con la que cruzaste." },
      { title: "Command palette", body: "Ctrl+K para saltar a cualquier parte sin soltar el teclado." },
    ],
  },
  faq: {
    title: "Preguntas frecuentes",
    items: [
      {
        q: "¿Necesito una cuenta?",
        a: "No. RL Stats funciona entero sin cuentas, sin login y sin internet. La única excepción opcional es el MMR en vivo, que consulta fuentes públicas y que activás vos desde Ajustes.",
      },
      {
        q: "¿De dónde sale el MMR si el juego no lo da?",
        a: "La API de stats del juego no expone MMR. RL Stats lo resuelve con una cadena de fuentes: scraping de sitios públicos (opcional), tu propia API key de RapidAPI o Parse.bot, historial local y, como último recurso, una estimación. La interfaz siempre marca si el número es exacto, cacheado o estimado.",
      },
      {
        q: "¿Cómo captura las partidas?",
        a: "Habilitás el stats API de Rocket League una vez (la app te guía con el archivo .ini) y RL Stats escucha el stream TCP en 127.0.0.1:49123. No se inyecta en el juego ni modifica archivos del mismo.",
      },
      {
        q: "¿Está baneable?",
        a: "No. Solo lee la API oficial de stats que Psyonix expone para herramientas locales. No interactúa con el cliente del juego ni con los servidores de partida.",
      },
      {
        q: "¿Funciona en Mac o Linux?",
        a: "Hoy solo Windows 10/11 de 64 bits. La app es de código abierto, así que la puerta queda abierta, pero no hay builds para otras plataformas.",
      },
      {
        q: "¿Por qué es gratis?",
        a: "Porque las funciones que importan corren en tu máquina y no le cuestan a nadie. El proyecto es MIT y se sostiene con el Cloud Sync opcional.",
      },
    ],
  },
  finalCta: {
    title: "Bajalo, jugá una partida y mirá lo que faltaba",
    body: "Instalador liviano de Windows. Se conecta solo, captura tu primera partida y no te interrumpe.",
    note: "Gratis · Local · Código abierto",
  },
  footer: {
    tagline: "El compañero local para Rocket League.",
    product: "Producto",
    community: "Comunidad",
    languages: "Idioma",
    madeBy: "Hecho por Lucas Sabena",
    trademark: "Rocket League es una marca registrada de Psyonix. Este es un proyecto no oficial, sin afiliación con Psyonix.",
  },
  screenshotAlts: {
    live: "Panel en vivo de RL Stats con marcador, MMR de los cuatro jugadores y promedio por equipo",
    history: "Historial de partidas de RL Stats con resultados, playlists e íconos de ánimo",
    matchDetail: "Detalle de partida con stats completas, goles y roster",
    analytics: "Panel de análisis con win rate, evolución y MMR histórico",
    insights: "Análisis avanzado con mejor horario, arena y rendimiento situacional",
    mood: "Panel de ánimo cruzando cada estado emocional con el win rate",
    fatigue: "Curva de sesión mostrando el punto de quiebre del rendimiento",
    overlayWindow: "Overlay flotante de RL Stats sobre el juego",
    moodPrompt: "Modal de RL Stats preguntando cómo te sentiste tras la partida",
    players: "Directorio de jugadores con head-to-head y relación",
    trainingPacks: "Catálogo de training packs",
    proConfigs: "Directorio de configuraciones de jugadores profesionales",
    streaming: "Ajustes de streaming con overlays para OBS",
    commandPalette: "Command palette de RL Stats",
    sessionSummary: "Resumen de sesión al cerrar Rocket League",
  },
};

const en: Copy = {
  meta: {
    title: "RL Stats — Your local Rocket League companion",
    description:
      "Live MMR for every player, OBS overlays, full match history and performance analysis. 100% free, 100% local, no accounts, no telemetry.",
  },
  nav: {
    features: "Features",
    overlays: "Overlays",
    privacy: "Privacy",
    faq: "FAQ",
    download: "Download",
  },
  hero: {
    badge: "Windows 10/11 · v{{version}}",
    title: "Your Rocket League performance,",
    titleAccent: "in your own hands",
    subtitle:
      "Live MMR for everyone in the lobby, streaming overlays, full match history and analysis that tells you when to stop. It all runs on your PC. None of it leaves it.",
    ctaPrimary: "Download for Windows",
    ctaSecondary: "See features",
    free: "Free",
    freeDetail: "No accounts, no subscription",
    local: "Local",
    localDetail: "Your data stays on your PC",
    noAccount: "No telemetry",
    noAccountDetail: "Zero analytics, zero tracking",
    platform: "Windows 10/11 (64-bit)",
    versionLoading: "Checking the latest version…",
    version: "Latest version: v{{version}}",
  },
  live: {
    kicker: "Live",
    title: "The whole lobby's MMR, while you play",
    body:
      "The game only shows your own rank. RL Stats resolves the MMR of every player on the pitch, per playlist, and shows it in real time next to the scoreboard.",
    points: [
      "Exact MMR, clearly flagged when it is estimated or from cache",
      "Per-team averages so you can read the match at a glance",
      "Head-to-head against every opponent and teammate",
      "Clock, score, boost and individual stats in a single view",
    ],
    hint: "Real screenshot of the app running on demo data",
  },
  overlays: {
    kicker: "Overlays",
    title: "Give your stream a broadcast look",
    body:
      "Six OBS-ready overlays served straight from your machine. Customize them from Settings without touching code, or write your own with the bundled SDK.",
    items: [
      { name: "Enhanced", description: "Full scorebug, rosters, series and ball speed." },
      { name: "Scoreboard", description: "Score with clock and overtime badge." },
      { name: "Player Stats", description: "Per-team tables with Pts, G, A, S and Sh." },
      { name: "Event Feed", description: "Live feed of goals, saves and demos." },
      { name: "Alerts", description: "Full-screen alerts for scene switches." },
      { name: "All-in-One", description: "Everything together for tight scenes." },
    ],
    note: "Bundled SDK for writing your own overlays.",
  },
  history: {
    kicker: "History",
    title: "Every match, saved and searchable",
    body:
      "RL Stats captures every match automatically while you play. Afterwards you can review it like a broadcast sheet: who did what, when, and how fast.",
    points: [
      "Goals with assister, minute and shot speed",
      "Full stats for all six players on the pitch",
      "Filters by result, playlist, match type and date",
      "Export your history to CSV whenever you want",
    ],
  },
  analytics: {
    kicker: "Analysis",
    title: "Patterns you can't see at a glance",
    body:
      "RL Stats cross-references your matches and surfaces what no scoreboard tells you: when you play best, who you win with, and at which point in a session your performance drops.",
    cards: [
      { title: "Breakpoint", body: "Finds the exact game where your win rate collapses and suggests stopping." },
      { title: "Chemistry", body: "Win rate with each teammate, plus SoloQ vs premade comparison." },
      { title: "Weekly map", body: "7×24 heatmap of your win rate in local time." },
      { title: "Insights", body: "Best playlist, best hour, comebacks and close games." },
    ],
  },
  mood: {
    kicker: "Mood",
    title: "How did that match feel?",
    body:
      "RL Stats asks after every match and cross-references your mood with your performance. It is not decoration: it is the metric that tells you whether queueing again is doing you any good.",
    quote: "“Amazing” → 89% WR",
    quoteDetail: "“Furious” → 0% WR",
    levels: ["Amazing", "Happy", "Neutral", "Angry", "Furious"],
  },
  privacy: {
    kicker: "Privacy",
    title: "Your data never leaves your computer",
    body:
      "RL Stats has no servers receiving your matches. The database lives in your user folder, works offline and you can export or delete it whenever you want.",
    items: [
      { title: "No account", body: "No sign-up, no login, no email to confirm." },
      { title: "No telemetry", body: "Zero analytics, zero remote crash reporting, zero trackers." },
      { title: "100% offline", body: "The game data stream is local TCP, on your own machine." },
      { title: "Yours forever", body: "JSON export/import, automatic backups and full wipe with no questions asked." },
    ],
    pathLabel: "Your database",
    path: "%APPDATA%\\com.lukit.rl-stats\\rl_stats_default.db",
  },
  free: {
    kicker: "Pricing",
    title: "Everything you see here is free",
    body: "There is no limited edition. The local features, which are all the important ones, have no lock and no license key.",
    included: [
      "Unlimited live MMR",
      "All six overlays plus the SDK",
      "Full history and analysis",
      "Training packs and Pro Configs",
      "Automatic updates",
      "Multiple local profiles",
    ],
    optionalTitle: "The only paid part is optional",
    optionalBody:
      "There is an early Cloud Sync for backing up and syncing your data across PCs. It is optional, and the local features stay free forever.",
    optionalCta: "More about Cloud Sync",
    license: "Open source under the MIT license",
  },
  extras: {
    title: "And more",
    items: [
      { title: "Pro Configs", body: "41 real pro player setups, searchable." },
      { title: "Training", body: "Curated packs plus your own, synced to your profile." },
      { title: "Players", body: "Head-to-head with everyone you have crossed paths with." },
      { title: "Command palette", body: "Ctrl+K to jump anywhere without leaving the keyboard." },
    ],
  },
  faq: {
    title: "Frequently asked questions",
    items: [
      {
        q: "Do I need an account?",
        a: "No. RL Stats runs entirely without accounts, login or internet. The one optional exception is live MMR, which queries public sources and that you enable yourself from Settings.",
      },
      {
        q: "Where does the MMR come from if the game doesn't provide it?",
        a: "The game's stats API does not expose MMR. RL Stats resolves it through a chain of sources: public site scraping (optional), your own RapidAPI or Parse.bot key, local history and, as a last resort, an estimate. The UI always flags whether a number is exact, cached or estimated.",
      },
      {
        q: "How does it capture matches?",
        a: "You enable Rocket League's stats API once (the app walks you through the .ini file) and RL Stats listens to the TCP stream at 127.0.0.1:49123. It does not inject into the game or modify its files.",
      },
      {
        q: "Can I get banned for this?",
        a: "No. It only reads the official stats API Psyonix exposes for local tools. It does not interact with the game client or with match servers.",
      },
      {
        q: "Does it work on Mac or Linux?",
        a: "Today it is Windows 10/11 64-bit only. The app is open source, so the door is open, but there are no builds for other platforms.",
      },
      {
        q: "Why is it free?",
        a: "Because the features that matter run on your machine and cost nobody anything. The project is MIT and is sustained by the optional Cloud Sync.",
      },
    ],
  },
  finalCta: {
    title: "Install it, play one match, see what you were missing",
    body: "Lightweight Windows installer. It connects on its own, captures your first match and stays out of the way.",
    note: "Free · Local · Open source",
  },
  footer: {
    tagline: "The local companion for Rocket League.",
    product: "Product",
    community: "Community",
    languages: "Language",
    madeBy: "Made by Lucas Sabena",
    trademark: "Rocket League is a registered trademark of Psyonix. This is an unofficial project, not affiliated with Psyonix.",
  },
  screenshotAlts: {
    live: "RL Stats live dashboard with scoreboard, MMR for all four players and per-team averages",
    history: "RL Stats match history with results, playlists and mood icons",
    matchDetail: "Match detail with full stats, goals and rosters",
    analytics: "Analytics panel with win rate, performance trend and MMR history",
    insights: "Advanced analysis with best hour, arena and situational performance",
    mood: "Mood panel cross-referencing each emotional state with win rate",
    fatigue: "Session curve showing the performance breakpoint",
    overlayWindow: "RL Stats floating overlay on top of the game",
    moodPrompt: "RL Stats modal asking how the match felt",
    players: "Player directory with head-to-head and relationship",
    trainingPacks: "Training pack catalog",
    proConfigs: "Pro player settings directory",
    streaming: "Streaming settings with OBS overlays",
    commandPalette: "RL Stats command palette",
    sessionSummary: "Session summary shown when Rocket League closes",
  },
};

const pt: Copy = {
  meta: {
    title: "RL Stats — Seu companheiro local para Rocket League",
    description:
      "MMR ao vivo de todos os jogadores, overlays para OBS, histórico completo e análise de desempenho. 100% grátis, 100% local, sem contas e sem telemetria.",
  },
  nav: {
    features: "Recursos",
    overlays: "Overlays",
    privacy: "Privacidade",
    faq: "Perguntas",
    download: "Baixar",
  },
  hero: {
    badge: "Windows 10/11 · v{{version}}",
    title: "Seu desempenho no Rocket League,",
    titleAccent: "nas suas mãos",
    subtitle:
      "MMR ao vivo de todos no lobby, overlays de transmissão, histórico completo e análises que dizem quando parar. Tudo roda no seu PC. Nada sai dele.",
    ctaPrimary: "Baixar para Windows",
    ctaSecondary: "Ver recursos",
    free: "Grátis",
    freeDetail: "Sem contas nem assinatura",
    local: "Local",
    localDetail: "Seus dados ficam no seu PC",
    noAccount: "Sem telemetria",
    noAccountDetail: "Zero analytics, zero rastreamento",
    platform: "Windows 10/11 (64-bit)",
    versionLoading: "Consultando a última versão…",
    version: "Última versão: v{{version}}",
  },
  live: {
    kicker: "Ao vivo",
    title: "O MMR do lobby inteiro, enquanto você joga",
    body:
      "O jogo só mostra o seu rank. O RL Stats resolve o MMR de cada jogador em campo, por playlist, e mostra em tempo real ao lado do placar.",
    points: [
      "MMR exato, com marcação clara quando é estimado ou vem do cache",
      "Médias por equipe para ler a partida de relance",
      "Head-to-head contra cada adversário e companheiro",
      "Relógio, placar, boost e stats individuais em uma única tela",
    ],
    hint: "Captura real do app rodando com dados de demonstração",
  },
  overlays: {
    kicker: "Overlays",
    title: "Sua transmissão com cara de broadcast",
    body:
      "Seis overlays prontos para OBS, servidos direto da sua máquina. Personalize tudo pelas Configurações, sem tocar em código, ou escreva os seus com o SDK incluído.",
    items: [
      { name: "Enhanced", description: "Scorebug completo, escalações, série e velocidade da bola." },
      { name: "Scoreboard", description: "Placar com relógio e badge de prorrogação." },
      { name: "Player Stats", description: "Tabelas por equipe com Pts, G, A, D e Ch." },
      { name: "Event Feed", description: "Feed ao vivo de gols, defesas e demolições." },
      { name: "Alerts", description: "Alertas em tela cheia para trocas de cena." },
      { name: "All-in-One", description: "Tudo junto para cenas sem espaço." },
    ],
    note: "SDK incluído para escrever seus próprios overlays.",
  },
  history: {
    kicker: "Histórico",
    title: "Cada partida, salva e pesquisável",
    body:
      "O RL Stats captura cada partida automaticamente enquanto você joga. Depois você revisa como uma planilha de transmissão: quem fez o quê, quando e a que velocidade.",
    points: [
      "Gols com assistência, minuto e velocidade do chute",
      "Stats completas dos seis jogadores em campo",
      "Filtros por resultado, playlist, tipo de partida e data",
      "Exportação do histórico para CSV quando quiser",
    ],
  },
  analytics: {
    kicker: "Análise",
    title: "Padrões que você não vê a olho nu",
    body:
      "O RL Stats cruza suas partidas e mostra o que nenhum placar diz: em que horário você joga melhor, com quem você ganha e em que ponto da sessão seu desempenho cai.",
    cards: [
      { title: "Ponto de quebra", body: "Acha o jogo exato em que seu win rate despenca e sugere parar." },
      { title: "Química", body: "Win rate com cada companheiro, além de SoloQ vs premade." },
      { title: "Mapa semanal", body: "Heatmap 7×24 do seu win rate no horário local." },
      { title: "Insights", body: "Melhor playlist, melhor horário, viradas e jogos apertados." },
    ],
  },
  mood: {
    kicker: "Humor",
    title: "Como foi essa partida pra você?",
    body:
      "O RL Stats pergunta ao fim de cada partida e cruza seu humor com o desempenho. Não é enfeite: é a métrica que diz se continuar jogando está te fazendo bem.",
    quote: "“Incrível” → 89% WR",
    quoteDetail: "“Furioso” → 0% WR",
    levels: ["Incrível", "Feliz", "Neutro", "Bravo", "Furioso"],
  },
  privacy: {
    kicker: "Privacidade",
    title: "Seus dados não saem do seu computador",
    body:
      "O RL Stats não tem servidores recebendo suas partidas. O banco de dados fica na sua pasta de usuário, funciona offline e você pode exportar ou apagar quando quiser.",
    items: [
      { title: "Sem conta", body: "Sem cadastro, sem login, sem e-mail para confirmar." },
      { title: "Sem telemetria", body: "Zero analytics, zero crash reporting remoto, zero trackers." },
      { title: "100% offline", body: "O stream de dados do jogo é TCP local, na sua própria máquina." },
      { title: "Seu para sempre", body: "Export/import em JSON, backups automáticos e exclusão total." },
    ],
    pathLabel: "Seu banco de dados",
    path: "%APPDATA%\\com.lukit.rl-stats\\rl_stats_default.db",
  },
  free: {
    kicker: "Preço",
    title: "Tudo o que você vê aqui é grátis",
    body: "Não existe versão limitada. Os recursos locais, que são todos os importantes, não têm cadeado nem licença.",
    included: [
      "MMR ao vivo sem limite",
      "Os seis overlays e o SDK",
      "Histórico e análise completos",
      "Treinos e Pro Configs",
      "Atualizações automáticas",
      "Vários perfis locais",
    ],
    optionalTitle: "A única parte paga é opcional",
    optionalBody:
      "Existe um Cloud Sync inicial para backup e sincronização entre PCs. É opcional, e os recursos locais continuam grátis para sempre.",
    optionalCta: "Mais sobre o Cloud Sync",
    license: "Código aberto sob licença MIT",
  },
  extras: {
    title: "E mais",
    items: [
      { title: "Pro Configs", body: "41 configurações reais de jogadores profissionais, pesquisáveis." },
      { title: "Treinos", body: "Packs curados e os seus, sincronizados com seu perfil." },
      { title: "Jogadores", body: "Head-to-head com cada pessoa que você cruzou." },
      { title: "Command palette", body: "Ctrl+K para ir a qualquer lugar sem sair do teclado." },
    ],
  },
  faq: {
    title: "Perguntas frequentes",
    items: [
      {
        q: "Preciso de conta?",
        a: "Não. O RL Stats funciona inteiro sem contas, sem login e sem internet. A única exceção opcional é o MMR ao vivo, que consulta fontes públicas e você ativa nas Configurações.",
      },
      {
        q: "De onde vem o MMR se o jogo não fornece?",
        a: "A API de stats do jogo não expõe MMR. O RL Stats resolve com uma cadeia de fontes: scraping de sites públicos (opcional), sua própria chave RapidAPI ou Parse.bot, histórico local e, em último caso, uma estimativa. A interface sempre indica se o número é exato, cacheado ou estimado.",
      },
      {
        q: "Como ele captura as partidas?",
        a: "Você habilita a stats API do Rocket League uma vez (o app guia o processo pelo arquivo .ini) e o RL Stats escuta o stream TCP em 127.0.0.1:49123. Ele não injeta nada no jogo nem modifica arquivos dele.",
      },
      {
        q: "Posso ser banido por isso?",
        a: "Não. Ele apenas lê a API oficial de stats que a Psyonix expõe para ferramentas locais. Não interage com o cliente do jogo nem com os servidores de partida.",
      },
      {
        q: "Funciona em Mac ou Linux?",
        a: "Hoje só Windows 10/11 64-bit. O app é código aberto, então a porta fica aberta, mas não há builds para outras plataformas.",
      },
      {
        q: "Por que é grátis?",
        a: "Porque os recursos que importam rodam na sua máquina e não custam nada a ninguém. O projeto é MIT e se sustenta com o Cloud Sync opcional.",
      },
    ],
  },
  finalCta: {
    title: "Instale, jogue uma partida e veja o que faltava",
    body: "Instalador leve para Windows. Conecta sozinho, captura sua primeira partida e não atrapalha.",
    note: "Grátis · Local · Código aberto",
  },
  footer: {
    tagline: "O companheiro local para Rocket League.",
    product: "Produto",
    community: "Comunidade",
    languages: "Idioma",
    madeBy: "Feito por Lucas Sabena",
    trademark: "Rocket League é uma marca registrada da Psyonix. Este é um projeto não oficial, sem afiliação com a Psyonix.",
  },
  screenshotAlts: {
    live: "Painel ao vivo do RL Stats com placar, MMR dos quatro jogadores e médias por equipe",
    history: "Histórico de partidas do RL Stats com resultados, playlists e ícones de humor",
    matchDetail: "Detalhe da partida com stats completas, gols e escalações",
    analytics: "Painel de análise com win rate, evolução e MMR histórico",
    insights: "Análise avançada com melhor horário, arena e desempenho situacional",
    mood: "Painel de humor cruzando cada estado emocional com o win rate",
    fatigue: "Curva de sessão mostrando o ponto de quebra do desempenho",
    overlayWindow: "Overlay flutuante do RL Stats sobre o jogo",
    moodPrompt: "Modal do RL Stats perguntando como foi a partida",
    players: "Diretório de jogadores com head-to-head e relação",
    trainingPacks: "Catálogo de training packs",
    proConfigs: "Diretório de configurações de jogadores profissionais",
    streaming: "Configurações de streaming com overlays para OBS",
    commandPalette: "Command palette do RL Stats",
    sessionSummary: "Resumo de sessão ao fechar o Rocket League",
  },
};

export const COPY: Record<Lang, Copy> = { es, en, pt };
