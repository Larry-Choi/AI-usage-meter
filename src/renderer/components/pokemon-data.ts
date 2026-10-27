export interface PokemonProfile {
  id: number
  name: string
  sprite: string
  fallback: string
}

export const POKEMON_PROFILES: Record<string, PokemonProfile> = {
  pikachu: {
    id: 25,
    name: "피카츄",
    sprite: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/25.gif",
    fallback: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png"
  },
  charizard: {
    id: 6,
    name: "리자몽",
    sprite: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/6.gif",
    fallback: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/6.png"
  },
  charmander: {
    id: 4,
    name: "파이리",
    sprite: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/4.gif",
    fallback: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/4.png"
  },
  squirtle: {
    id: 7,
    name: "꼬부기",
    sprite: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/7.gif",
    fallback: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/7.png"
  },
  wartortle: {
    id: 8,
    name: "어니부기",
    sprite: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/8.gif",
    fallback: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/8.png"
  },
  bulbasaur: {
    id: 1,
    name: "이상해씨",
    sprite: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/1.gif",
    fallback: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png"
  },
  lucario: {
    id: 448,
    name: "루카리오",
    sprite: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/448.gif",
    fallback: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/448.png"
  },
  gengar: {
    id: 94,
    name: "팬텀",
    sprite: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/94.gif",
    fallback: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/94.png"
  },
  snorlax: {
    id: 143,
    name: "잠만보",
    sprite: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/143.gif",
    fallback: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/143.png"
  },
  mewtwo: {
    id: 150,
    name: "뮤츠",
    sprite: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/150.gif",
    fallback: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/150.png"
  },
  eevee: {
    id: 133,
    name: "이브이",
    sprite: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/133.gif",
    fallback: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/133.png"
  },
  slowpoke: {
    id: 79,
    name: "야돈",
    sprite: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/79.gif",
    fallback: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/79.png"
  },
  magikarp: {
    id: 129,
    name: "잉어킹",
    sprite: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/129.gif",
    fallback: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/129.png"
  }
}

export function getPokemonForAccount(provider: string, accountName: string, percentUsed: number, customPokemon?: string): PokemonProfile {
  // 사용자가 직접 지정한 포켓몬이 있는 경우 우선 반영
  if (customPokemon && POKEMON_PROFILES[customPokemon]) {
    return POKEMON_PROFILES[customPokemon]
  }

  // 100% 소진 시 기본적으로 잉어킹(기절)
  if (percentUsed >= 100) {
    return POKEMON_PROFILES.magikarp
  }

  // 0%이고 쿨다운 대기 시 잠만보
  if (percentUsed === 0) {
    return POKEMON_PROFILES.snorlax
  }

  // 85% 이상 과부하 / 주의 시 팬텀
  if (percentUsed >= 85) {
    return POKEMON_PROFILES.gengar
  }

  const normProv = provider.toLowerCase()
  const normName = accountName.toLowerCase()

  if (normProv === 'cursor' || normName.includes('cursor')) {
    return POKEMON_PROFILES.lucario || POKEMON_PROFILES.pikachu
  }
  if (normProv === 'antigravity' || normName.includes('antigravity') || normName.includes('agy')) {
    return POKEMON_PROFILES.mewtwo
  }
  if (normProv === 'claude' || normName.includes('claude')) {
    return percentUsed >= 70 ? POKEMON_PROFILES.charizard : POKEMON_PROFILES.eevee
  }
  if (normProv === 'codex' || normProv === 'openai' || normName.includes('gpt')) {
    return POKEMON_PROFILES.pikachu
  }
  
  return POKEMON_PROFILES.pikachu
}
