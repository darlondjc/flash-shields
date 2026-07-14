// TheSportsDB usa formatos de temporada diferentes por região: ligas das
// Américas rodam dentro de um único ano civil ("2026" — Brasileirão fev-dez,
// MLS fev-nov), enquanto ligas europeias cruzam dois anos ("2025-2026",
// ago-mai) — confirmado empiricamente contra a API (eventsround.php só
// devolve jogos com o formato certo).
export function currentSeason(regionId: string, now = new Date()): string {
  const year = now.getFullYear();

  if (regionId === 'south-america' || regionId === 'north-america') {
    return String(year);
  }

  // A temporada europeia começa em agosto; antes disso ainda estamos na
  // temporada que começou no ano anterior.
  const month = now.getMonth() + 1;
  return month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}
