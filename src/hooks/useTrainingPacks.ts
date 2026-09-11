import { useMemo } from "react";
import type { TrainingPack } from "@/lib/trainingPacksTypes";
import { useUserTrainingPacks } from "@/hooks/useUserTrainingPacks";

const CURATED_PACKS: TrainingPack[] = [
  // ── Speedflip ──
  {
    id: "sf-musty",
    name: "Speedflip Kickoff Test",
    code: "A503-264C-A7EB-D282",
    creator: "Musty",
    category: "speedflip",
    difficulty: "advanced",
    description: "El pack clásico para practicar el speedflip. El tercer tiro es el más usado para medir tu tiempo. Imprescindible para mejorar tu saque.",
    featured: true,
  },
  {
    id: "sf-general",
    name: "Speed Flip Training",
    code: "936E-C293-5DF5-2D5C",
    creator: "Community",
    category: "speedflip",
    difficulty: "intermediate",
    description: "Práctica general de speedflip con diferentes ángulos y distancias. Ideal para empezar a aprender el movimiento.",
  },
  {
    id: "sf-mertzy",
    name: "Mertzy's Speedflip Pack",
    code: "7657-2F43-9B3A-A0A6",
    creator: "Mertzy",
    category: "speedflip",
    difficulty: "advanced",
    description: "Pack de speedflip creado por Mertzy con variaciones para dominar la mecánica desde distintas posiciones.",
  },

  // ── Aerial ──
  {
    id: "ae-poquito-pass",
    name: "Aerial Shots - Passes",
    code: "C7E0-9E0B-B739-A899",
    creator: "Poquito",
    category: "aerial",
    difficulty: "intermediate",
    description: "48 tiros aéreos tipo pase. Perfecto para practicar la lectura de balones altos y mejorar la precisión aérea.",
    featured: true,
  },
  {
    id: "ae-basic",
    name: "Basic Aerials",
    code: "F0BD-E416-D47D-AF28",
    creator: "Community",
    category: "aerial",
    difficulty: "beginner",
    description: "Aéreos básicos para principiantes. Aprende a conectar con el balón en el aire con tiros simples y progresivos.",
  },
  {
    id: "ae-fast",
    name: "Fast Aerials",
    code: "97B9-5B48-5277-8A85",
    creator: "Community",
    category: "aerial",
    difficulty: "advanced",
    description: "Practica los fast aerials, esenciales para llegar al balón antes que tus oponentes en rangos altos.",
  },
  {
    id: "ae-redirects",
    name: "Aerial Redirects",
    code: "F001-A333-AAEB-2786",
    creator: "Poquito",
    category: "aerial",
    difficulty: "advanced",
    description: "Tiros de redirección aérea. Mejora tu capacidad para desviar el balón hacia la portería desde pases altos.",
  },
  {
    id: "ae-doubletap",
    name: "Double Tap Playground",
    code: "CAFC-FB3E-3C0F-B8F1",
    creator: "Wayton Pilkin",
    category: "aerial",
    difficulty: "pro",
    description: "El pack definitivo para practicar doble toque. Creado por Wayton Pilkin, incluye situaciones variadas para dominar esta mecánica avanzada.",
    featured: true,
  },
  {
    id: "ae-sudden",
    name: "Sudden Aerials",
    code: "5D07-D0AA-964D-41D9",
    creator: "Wayton Pilkin",
    category: "aerial",
    difficulty: "intermediate",
    description: "Aéreos sorpresa que requieren reacción rápida. Ideal para mejorar tu tiempo de reacción y lectura de juego.",
  },

  // ── Dribbling ──
  {
    id: "dr-kevpert",
    name: "Catches, Dribbles & Flicks",
    code: "8FA1-DC94-C18D-D82B",
    creator: "Kevpert",
    category: "dribbling",
    difficulty: "intermediate",
    description: "Pack completo de Kevpert para practicar recepciones, dribbling en el suelo y flicks. Uno de los mejores para juego terrestre.",
    featured: true,
  },
  {
    id: "dr-ground1",
    name: "Ground Dribble Practice",
    code: "6CE5-76CC-936D-5DD8",
    creator: "Community",
    category: "dribbling",
    difficulty: "beginner",
    description: "Práctica de dribbling en el suelo. Ideal para aprender a mantener el balón encima del auto.",
  },
  {
    id: "dr-catch-flick",
    name: "Catch → Dribble → Flick",
    code: "E522-8440-4B25-3414",
    creator: "Community",
    category: "dribbling",
    difficulty: "advanced",
    description: "Secuencia completa: recepción, conducción y flick. Practica la transición fluida de cada fase del juego terrestre.",
  },
  {
    id: "dr-dribble-training",
    name: "Dribble Training",
    code: "04C1-42C8-6E5D-6F75",
    creator: "Community",
    category: "dribbling",
    difficulty: "intermediate",
    description: "Pack de entrenamiento de dribbling con progresión de dificultad. Perfecto para ir mejorando de a poco.",
  },
  {
    id: "dr-ground2",
    name: "Ground Dribble #2",
    code: "FB75-7365-83E8-7184",
    creator: "Community",
    category: "dribbling",
    difficulty: "intermediate",
    description: "Segunda parte del entrenamiento de dribbling en el suelo con ejercicios más desafiantes.",
  },

  // ── Shooting ──
  {
    id: "sh-ground",
    name: "Ground Shots",
    code: "6EB1-79B2-33B8-681C",
    creator: "Poquito",
    category: "shooting",
    difficulty: "beginner",
    description: "Tiros al arco desde el suelo. Pack fundamental de Poquito para mejorar la potencia y precisión de tus tiros rasantes.",
    featured: true,
  },
  {
    id: "sh-shouldnt-miss",
    name: "Shots You Shouldn't Miss",
    code: "42BF-686D-E047-574B",
    creator: "Community",
    category: "shooting",
    difficulty: "intermediate",
    description: "Tiros que no deberías fallar. Situaciones claras de gol que mejorarán tu consistencia ante el arco.",
  },
  {
    id: "sh-ground2",
    name: "Ground Shots Power",
    code: "686A-3255-1E41-942D",
    creator: "Community",
    category: "shooting",
    difficulty: "intermediate",
    description: "Tiros al suelo con énfasis en potencia. Trabaja en darle con fuerza y precisión al balón.",
  },
  {
    id: "sh-novice-striker",
    name: "Novice Striker",
    code: "137F-0F44-6FA1-91EE",
    creator: "Community",
    category: "shooting",
    difficulty: "beginner",
    description: "Pack de tiro para principiantes. Situaciones simples para desarrollar la confianza al rematar.",
  },

  // ── Kickoff ──
  {
    id: "ko-pack1",
    name: "Kickoff Training",
    code: "8939-4C63-B233-83C1",
    creator: "Community",
    category: "kickoff",
    difficulty: "intermediate",
    description: "Entrenamiento de saques variados. Practica diferentes tipos de kickoff para ganar el primer toque.",
    featured: true,
  },
  {
    id: "ko-pack2",
    name: "Kickoff Practice",
    code: "7EE0-F697-7453-7123",
    creator: "Community",
    category: "kickoff",
    difficulty: "beginner",
    description: "Práctica básica de kickoffs. Ideal para entender las bases del saque y mejorar la consistencia.",
  },
  {
    id: "ko-redirects",
    name: "Kickoff Redirects",
    code: "AEA3-64CF-4309-A0FA",
    creator: "Community",
    category: "kickoff",
    difficulty: "advanced",
    description: "Redirecciones después del saque. Practica aprovechar el kickoff para generar jugadas de gol inmediatas.",
  },

  // ── Wall & Ceiling ──
  {
    id: "wc-wall1",
    name: "Wall Shots",
    code: "9F6D-4387-4C57-2E4B",
    creator: "Community",
    category: "wall-ceiling",
    difficulty: "intermediate",
    description: "Tiros desde la muralla. Mejora tu juego de pared con situaciones variadas de tiro y aéreos.",
    featured: true,
  },
  {
    id: "wc-wall2",
    name: "Wall Shots Power",
    code: "2357-6259-ECC9-AE02",
    creator: "Community",
    category: "wall-ceiling",
    difficulty: "advanced",
    description: "Tiros potentes desde la muralla. Practica sacar fuerza de los tiros cuando el balón está en la pared.",
  },
  {
    id: "wc-off-wall",
    name: "Off-The-Wall Control",
    code: "1839-0F86-CE07-EE1F",
    creator: "Community",
    category: "wall-ceiling",
    difficulty: "advanced",
    description: "Control y dribbling aéreo saliendo de la pared. Esencial para jugadores que quieren llevar el juego al aire.",
  },

  // ── Goalie ──
  {
    id: "go-saves",
    name: "Saves Training",
    code: "CEAE-1B2A-63D2-02C6",
    creator: "Community",
    category: "goalie",
    difficulty: "intermediate",
    description: "Entrenamiento de atajadas. Practica las paradas más importantes para mantener tu arco en cero.",
  },
  {
    id: "go-backboard",
    name: "Backboard Saves",
    code: "D7F8-FD53-98D1-DAFE",
    creator: "Community",
    category: "goalie",
    difficulty: "advanced",
    description: "Atajadas desde el travesaño. Aprende a defenderte cuando el balón viene por arco, una habilidad clave en Champion+.",
    featured: true,
  },
  {
    id: "go-novice",
    name: "Novice Defender",
    code: "87E7-773A-CBE5-B2C3",
    creator: "Community",
    category: "goalie",
    difficulty: "beginner",
    description: "Defensa para principiantes. Situaciones simples para aprender las bases de la portería.",
  },

  // ── Defense ──
  {
    id: "df-shadow",
    name: "Shadow Defense",
    code: "5CCE-FB29-7B05-A0B1",
    creator: "Community",
    category: "defense",
    difficulty: "intermediate",
    description: "Entrenamiento de defensa sombra. Aprende a posicionarte correctamente mientras el oponente ataca.",
    featured: true,
  },
  {
    id: "df-clears",
    name: "Clears Training",
    code: "4B6F-902C-0C67-730D",
    creator: "Community",
    category: "defense",
    difficulty: "beginner",
    description: "Práctica de despejes. Aprende a sacar el balón de tu área con fuerza y precisión.",
  },
  {
    id: "df-corner",
    name: "Corner Defense",
    code: "12AD-1F43-BE6C-A750",
    creator: "Community",
    category: "defense",
    difficulty: "intermediate",
    description: "Defensa desde la esquina. Situaciones comunes donde el balón viene por el rincón y necesitas despejar.",
  },

  // ── Powershot ──
  {
    id: "ps-powershots",
    name: "Powershots",
    code: "7028-5E10-88EF-E83E",
    creator: "Community",
    category: "powershot",
    difficulty: "intermediate",
    description: "Tiros con máxima potencia. Practica darle al balón con toda la fuerza posible para que sea imparable.",
    featured: true,
  },
  {
    id: "ps-diamond-pack",
    name: "Diamond Pack Mix",
    code: "853D-A180-A66D-8137",
    creator: "Psyonix",
    category: "powershot",
    difficulty: "advanced",
    description: "Pack oficial de Psyonix con mezcla de tiros potentes, flicks y dribbles. Excelente para calentar antes de ranked.",
  },

  // ── Freestyle ──
  {
    id: "fs-freestyle",
    name: "Freestyle Training",
    code: "01EC-E23D-0A0D-7578",
    creator: "Community",
    category: "freestyle",
    difficulty: "pro",
    description: "Pack de freestyle para practicar movimientos creativos como reseteos, stalls y más.",
  },
  {
    id: "fs-aerial-fs",
    name: "Freestyle Aerials",
    code: "53BD-4CDF-CC23-F2CE",
    creator: "Community",
    category: "freestyle",
    difficulty: "advanced",
    description: "Aéreos freestyle. Situaciones para practicar tiros con estilo y creatividad en el aire.",
  },

  // ── Mixed / Warmup ──
  {
    id: "mx-thano-gold",
    name: "Gold Warmup Pack",
    code: "3FEA-24C3-E288-D58E",
    creator: "Thanovic",
    category: "shooting",
    difficulty: "beginner",
    description: "Pack de calentamiento de Thanovic. Mezcla de aéreos, tiros y dribbles para calentar antes de jugar.",
  },
  {
    id: "mx-thano-diamond",
    name: "Diamond Pack",
    code: "504C-DCCB-6FAB-666C",
    creator: "Thanovic",
    category: "shooting",
    difficulty: "advanced",
    description: "Pack de Thanovic para rango Diamond. Situaciones mixtas que simulan partidos reales.",
    featured: true,
  },
  {
    id: "mx-warmup",
    name: "Warmup Training",
    code: "DF5E-21DD-54B7-A56F",
    creator: "Community",
    category: "shooting",
    difficulty: "intermediate",
    description: "Pack de calentamiento general. Ideal para entrar en calor antes de una sesión de ranked.",
  },
  {
    id: "mx-gc-warmup",
    name: "50 Shot GC Warmup",
    code: "0973-0B96-91BB-39EB",
    creator: "Community",
    category: "shooting",
    difficulty: "pro",
    description: "50 tiros de calentamiento para Grand Champion. Situaciones avanzadas para mantener el nivel alto.",
  },
];

export function useTrainingPacks() {
  // Packs live in SQLite now (and sync to the cloud); favorites stay in the
  // local store because they can also point at curated packs.
  const {
    data: storedPacks,
    isLoading,
    isError,
    refetch,
  } = useUserTrainingPacks();

  const userPacks = useMemo<TrainingPack[]>(
    () =>
      (storedPacks ?? []).map((pack) => ({
        ...pack,
        // Stored as free-form text; the UI narrows it back to the known
        // category/difficulty unions when rendering.
        category: pack.category as TrainingPack["category"],
        difficulty: pack.difficulty as TrainingPack["difficulty"],
        sourceUrl: pack.sourceUrl ?? undefined,
        type: "user" as const,
      })),
    [storedPacks],
  );

  const packs = useMemo<TrainingPack[]>(() => {
    const merged: TrainingPack[] = [...CURATED_PACKS, ...userPacks];

    const unique = new Map<string, TrainingPack>();
    for (const pack of merged) {
      if (!unique.has(pack.id)) {
        unique.set(pack.id, pack);
      }
    }

    return Array.from(unique.values()).sort((a, b) => {
      const aFeatured = a.featured ? 1 : 0;
      const bFeatured = b.featured ? 1 : 0;
      if (aFeatured !== bFeatured) return bFeatured - aFeatured;
      return a.name.localeCompare(b.name);
    });
  }, [userPacks]);

  const featuredPacks = useMemo(
    () => packs.filter((p) => p.featured),
    [packs]
  );

  const filteredPacks = (
    search: string,
    category: string | null,
    difficulty: string | null
  ): TrainingPack[] => {
    const query = search.trim().toLowerCase();

    return packs.filter((pack) => {
      if (category !== null && pack.category !== category) return false;
      if (difficulty !== null && pack.difficulty !== difficulty) return false;

      if (query.length > 0) {
        const haystack = [
          pack.name,
          pack.creator,
          pack.code,
          ...(pack.tags ?? []),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      return true;
    });
  };

  return {
    packs,
    userPacks,
    featuredPacks,
    isLoading,
    isError,
    filteredPacks,
    refetch,
  };
}
