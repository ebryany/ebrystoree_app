/** Label waktu chat murni (id-ID): jam untuk hari ini, "Kemarin", lalu tanggal. */

export function shortChatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const time = date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  if (date.getTime() >= startOfToday) return time;
  if (date.getTime() >= startOfToday - 86_400_000) return "Kemarin";
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function chatDayLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  if (day === startOfToday) return "Hari ini";
  if (day === startOfToday - 86_400_000) return "Kemarin";
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
