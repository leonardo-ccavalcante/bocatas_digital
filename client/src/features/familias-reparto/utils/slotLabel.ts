const MES_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "10 ago · Mañana" — compact human label for a slot (day × turno). */
export function slotLabel(date: string, turno: string): string {
  const [, m, d] = date.split("-");
  const t = turno === "manana" ? "Mañana" : "Tarde";
  return `${parseInt(d, 10)} ${MES_ES[parseInt(m, 10) - 1] ?? m} · ${t}`;
}
