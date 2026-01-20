/**
 * Helper untuk format tanggal lokal (WIB) tanpa konversi timezone
 * Menghindari masalah UTC offset yang mengubah tanggal
 */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Buat Date di UTC dari string YYYY-MM-DD tanpa terkena offset lokal.
 * Gunakan ini saat menyimpan kolom tanggal (tanpa waktu) agar tidak mundur sehari.
 */
export function createUtcDateFromLocalDateString(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Buat Date UTC dari kombinasi tanggal lokal (YYYY-MM-DD) dan waktu lokal (HH:mm:ss).
 * Menjaga jam-menit-detik apa adanya tanpa terpengaruh offset timezone host.
 */
export function createUtcDateTimeFromLocal(
  dateStr: string,
  timeStr: string,
): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour = 0, minute = 0, second = 0] = timeStr
    .split(":")
    .map((part) => Number(part));

  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}
