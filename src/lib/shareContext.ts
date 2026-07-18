import type { ShareContext, ShareStat, MatchDetail, MatchSession, DailyRollup } from "@/lib/types";

/* ─── utils ─── */
function pickOne<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* ─── Headline pools ─── */
const MATCH_WIN_HEADLINES = [
  "Eso SÍ es Rocket League",
  "Partidazo · GG WP",
  "Sudamos pero valió",
  "Una más y a dormir... o no",
];
const MATCH_LOSS_HEADLINES = [
  "Nos robaron ese",
  "A veces se gana, a veces se whiffea",
  "Back to training pack",
  "El juego me debe una",
];
const MATCH_OT_WIN_HEADLINES = ["Infarto garantizado (pero ganamos)"];
const MATCH_OT_LOSS_HEADLINES = ["Mi corazón no aguanta tanto"];

const SESSION_GOOD_HEADLINES = [
  "Noche de gloria · imparable",
  "El grind rindió frutos",
  "Momentum OP · no paremos",
];
const SESSION_GOOD_WITH_FRIENDS_HEADLINES = [
  ...SESSION_GOOD_HEADLINES,
  "Noche de carrito con los panas",
];
const SESSION_BAD_HEADLINES = [
  "La caída libre del MMR",
  "¿Por qué sigo jugando?",
  "El carrito se apagó",
];

const DAY_HEADLINES = [
  "Bitácora de un main RL",
  "Hoy en las calles de Rocket League",
  "Día de carrito y café",
  "Hoy no toqué pasto",
];

const WEEK_HEADLINES = [
  "Esta semana en Rocket League",
  "7 días de humo y boost",
  "Informe de batalla semanal",
];

/* ─── Micro-copy generators ─── */
function goalLabel(goals: number, isHero: boolean): string {
  if (isHero) return "HAT-TRICK";
  if (goals >= 3) return pickOne(["BANGERS", "HAT-TRICK", "GOAL FACTORY"]);
  return "GOLES";
}

function saveLabel(saves: number, isHero: boolean): string {
  if (isHero) return "THE WALL";
  if (saves >= 3) return pickOne(["CLUTCH SAVES", "THE WALL", "MILAGROS"]);
  return "SAVES";
}

function demoLabel(demos: number, isHero: boolean): string {
  if (isHero) return "DEMO KING";
  if (demos >= 3) return pickOne(["DEMO KING", "SHADOW REALM", "BAPTISMS"]);
  return "DEMOS";
}

function assistLabel(): string {
  return pickOne(["PLAYMAKER", "DIMES"]);
}

function shotLabel(): string {
  return pickOne(["TIROS", "TRIGGER HAPPY"]);
}

function scoreLabel(isHighest: boolean, isHero: boolean): string {
  if (isHero && isHighest) return "MVP SCORE";
  if (isHero) return "CARRY POINTS";
  return pickOne(["MVP SCORE", "CARRY POINTS"]);
}

/* ─── Match ─── */
export function buildMatchShareContext(
  match: MatchDetail,
  friends: string[],
  username: string,
  localId?: string | null,
  locale?: string
): ShareContext {
  const isWin =
    match.localTeamNum != null && match.winnerTeamNum === match.localTeamNum;
  const isOT = match.isOvertime;

  let title: string;
  if (isWin) {
    title = isOT ? pickOne(MATCH_OT_WIN_HEADLINES) : pickOne(MATCH_WIN_HEADLINES);
  } else {
    title = isOT ? pickOne(MATCH_OT_LOSS_HEADLINES) : pickOne(MATCH_LOSS_HEADLINES);
  }

  const localPlayer = match.players.find((p) => p.team === match.localTeamNum);
  const allScores = match.players.map((p) => p.score);
  const isHighestScore = localPlayer ? localPlayer.score >= Math.max(...allScores) : false;

  let heroType: "goals" | "saves" | "demos" | "score" = "score";
  if (localPlayer) {
    if (localPlayer.saves > localPlayer.goals && localPlayer.saves >= 3) {
      heroType = "saves";
    } else if (localPlayer.goals >= 3) {
      heroType = "goals";
    } else if (localPlayer.demos >= 4) {
      heroType = "demos";
    }
  }

  const g = localPlayer?.goals ?? 0;
  const a = localPlayer?.assists ?? 0;
  const s = localPlayer?.saves ?? 0;
  const sh = localPlayer?.shots ?? 0;
  const sc = localPlayer?.score ?? 0;
  const d = localPlayer?.demos ?? 0;

  const stats: ShareStat[] = [
    { label: goalLabel(g, heroType === "goals"), value: String(g), highlight: heroType === "goals" },
    { label: assistLabel(), value: String(a) },
    { label: saveLabel(s, heroType === "saves"), value: String(s), highlight: heroType === "saves" },
    { label: shotLabel(), value: String(sh) },
    { label: scoreLabel(isHighestScore, heroType === "score"), value: String(sc), highlight: heroType === "score" },
    { label: demoLabel(d, heroType === "demos"), value: String(d), highlight: heroType === "demos" },
  ];

  const matchPlayers = [...match.players]
    .sort((a, b) => b.score - a.score)
    .map((p) => ({
      name: p.name,
      score: p.score,
      goals: p.goals,
      assists: p.assists,
      saves: p.saves,
      isLocal: localId ? p.id === localId : p.name === username,
    }));

  return {
    type: "match",
    title,
    subtitle: match.arena ?? undefined,
    stats,
    friendsPresent: friends,
    username,
    teamScore: match.localTeamNum === 1 ? match.teamOrangeScore : match.teamBlueScore,
    opponentScore: match.localTeamNum === 1 ? match.teamBlueScore : match.teamOrangeScore,
    win: isWin,
    dateLabel: new Date(match.startTime * 1000).toLocaleDateString(locale, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    matchPlayers,
  };
}

/* ─── Session ─── */
export function buildSessionShareContext(
  session: MatchSession,
  friends: string[],
  username: string,
  locale?: string
): ShareContext {
  const wr =
    session.match_count > 0
      ? Math.round((session.wins / session.match_count) * 100)
      : 0;

  const isGood = wr >= 50;
  const title = pickOne(
    isGood
      ? friends.length > 0
        ? SESSION_GOOD_WITH_FRIENDS_HEADLINES
        : SESSION_GOOD_HEADLINES
      : SESSION_BAD_HEADLINES
  );

  const stats: ShareStat[] = [
    { label: "WIN RATE", value: `${wr}%`, highlight: true },
    { label: "MATCHES", value: String(session.match_count) },
    { label: "WINS", value: String(session.wins) },
    { label: "LOSSES", value: String(session.losses) },
    { label: "GOLES", value: String(session.goals_scored) },
    { label: "PLAYMAKER", value: String(session.total_assists) },
    { label: "SAVES", value: String(session.total_saves) },
  ];

  return {
    type: "session",
    title,
    subtitle: `${session.match_count} partidas · ${wr}% WR`,
    stats,
    friendsPresent: friends,
    username,
    win: session.wins > session.losses,
    dateLabel: `${new Date(session.start_time).toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
    })} – ${new Date(session.end_time).toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
    })}`,
  };
}

/* ─── Day ─── */
export function buildDayShareContext(
  rollup: DailyRollup,
  friends: string[],
  username: string,
  locale?: string
): ShareContext {
  const wr =
    rollup.matchesPlayed > 0
      ? Math.round((rollup.wins / rollup.matchesPlayed) * 100)
      : 0;

  const stats: ShareStat[] = [
    { label: "WIN RATE", value: `${wr}%`, highlight: true },
    { label: "MATCHES", value: String(rollup.matchesPlayed) },
    { label: "WINS", value: String(rollup.wins) },
    { label: "GOLES", value: String(rollup.totalGoals) },
    { label: "SAVES", value: String(rollup.totalSaves) },
    { label: "DEMOS", value: String(rollup.totalDemos) },
  ];

  return {
    type: "day",
    title: pickOne(DAY_HEADLINES),
    stats,
    friendsPresent: friends,
    username,
    win: rollup.wins > rollup.losses,
    dateLabel: new Date(rollup.date).toLocaleDateString(locale, {
      weekday: "long",
      month: "long",
      day: "numeric",
    }),
  };
}

/* ─── Week ─── */
export function buildWeekShareContext(
  rollups: DailyRollup[],
  summary: {
    totalMatches: number;
    wins: number;
    losses: number;
    totalGoals: number;
    totalSaves: number;
    totalDemos: number;
  },
  friends: string[],
  username: string,
  locale?: string
): ShareContext {
  const wr =
    summary.totalMatches > 0
      ? Math.round((summary.wins / summary.totalMatches) * 100)
      : 0;

  const stats: ShareStat[] = [
    { label: "WIN RATE", value: `${wr}%`, highlight: true },
    { label: "MATCHES", value: String(summary.totalMatches) },
    { label: "WINS", value: String(summary.wins) },
    { label: "GOLES", value: String(summary.totalGoals) },
    { label: "SAVES", value: String(summary.totalSaves) },
    { label: "DEMOS", value: String(summary.totalDemos) },
  ];

  const start = rollups[0]?.date;
  const end = rollups[rollups.length - 1]?.date;

  const startLabel = start
    ? new Date(start).toLocaleDateString(locale, { month: "short", day: "numeric" })
    : "";
  const endLabel = end
    ? new Date(end).toLocaleDateString(locale, { month: "short", day: "numeric" })
    : "";

  return {
    type: "week",
    title: pickOne(WEEK_HEADLINES),
    subtitle: `${summary.totalMatches} partidas · ${wr}% WR`,
    stats,
    friendsPresent: friends,
    username,
    win: summary.wins > summary.losses,
    dateLabel: `${startLabel} – ${endLabel}`,
  };
}

export function buildSummaryShareContext(
  summary: {
    totalMatches: number;
    wins: number;
    losses: number;
    totalGoals: number;
    totalSaves: number;
    totalDemos: number;
  },
  friends: string[],
  username: string,
  title: string,
  dateLabel: string
): ShareContext {
  const wr =
    summary.totalMatches > 0
      ? Math.round((summary.wins / summary.totalMatches) * 100)
      : 0;

  const stats: ShareStat[] = [
    { label: "WIN RATE", value: `${wr}%`, highlight: true },
    { label: "MATCHES", value: String(summary.totalMatches) },
    { label: "WINS", value: String(summary.wins) },
    { label: "GOLES", value: String(summary.totalGoals) },
    { label: "SAVES", value: String(summary.totalSaves) },
    { label: "DEMOS", value: String(summary.totalDemos) },
  ];

  return {
    type: "week", // Use week layout as it fits summary well
    title,
    stats,
    friendsPresent: friends,
    username,
    win: summary.wins > summary.losses,
    dateLabel,
  };
}

