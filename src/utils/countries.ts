// Mapowanie 3-literowych kodów FIS / MKOl na 2-literowe kody ISO 3166-1 alpha-2 dla flag
export const FIS_TO_ISO: Record<string, string> = {
  POL: 'pl',
  GER: 'de',
  AUT: 'at',
  SLO: 'si',
  NOR: 'no',
  FIN: 'fi',
  JPN: 'jp',
  SUI: 'ch',
  USA: 'us',
  CAN: 'ca',
  FRA: 'fr',
  ITA: 'it',
  CZE: 'cz',
  EST: 'ee',
  KAZ: 'kz',
  BUL: 'bg',
  UKR: 'ua',
  SVK: 'sk',
  SWE: 'se',
  ROU: 'ro',
  RUS: 'ru',
  CHN: 'cn',
  KOR: 'kr',
  TUR: 'tr',
  BLR: 'by',
  GEO: 'ge',
  LAT: 'lv',
  LTU: 'lt',
  GBR: 'gb',
  ESP: 'es',
  AND: 'ad',
  HUN: 'hu',
  CRO: 'hr',
  BIH: 'ba',
  SRB: 'rs',
  GRE: 'gr',
  NED: 'nl',
  BEL: 'be',
  DEN: 'dk',
  ISL: 'is',
  IRL: 'ie',
  NZL: 'nz',
  AUS: 'au',
  ARG: 'ar',
  BRA: 'br',
  CHI: 'cl',
  TPE: 'tw',
  KGZ: 'kg',
  UZB: 'uz',
  MGL: 'mn',
  MKD: 'mk',
  MNE: 'me',
  ALB: 'al',
  ARM: 'am',
  AZE: 'az',
  MDA: 'md',
  LUX: 'lu',
  LIE: 'li',
  MON: 'mc',
  SMR: 'sm',
  ISR: 'il',
  PRK: 'kp',
  RSA: 'za',
  MEX: 'mx',
}

export function normalizeCountryCode(code?: string | null): string {
  if (!code || typeof code !== 'string') return ''
  return code.trim().toUpperCase()
}

export function fisToIso2(code?: string | null): string | null {
  const cleaned = normalizeCountryCode(code)
  if (!cleaned || cleaned === 'FIS' || cleaned === 'UNK' || cleaned === '-' || cleaned === 'N/A') {
    return null
  }
  if (FIS_TO_ISO[cleaned]) {
    return FIS_TO_ISO[cleaned]
  }
  if (cleaned.length === 2 && /^[A-Z]{2}$/.test(cleaned)) {
    return cleaned === 'UK' ? 'gb' : cleaned.toLowerCase()
  }
  return null
}

export function getFlagUrl(code?: string | null, explicitSrc?: string | null): string | null {
  if (explicitSrc && typeof explicitSrc === 'string' && explicitSrc.trim()) {
    return explicitSrc.trim()
  }
  const iso = fisToIso2(code)
  if (!iso) return null
  return `https://flagcdn.com/w80/${iso}.png`
}
