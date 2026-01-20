import { khanzaDb } from "./khanza.client";

export async function fetchRegisterEvents(lastDate: string, lastTime: string) {
  const [rows] = await khanzaDb.query(
    `
    SELECT
      rp.no_reg,
      rp.no_rawat,
      rp.tgl_registrasi,
      CASE DAYOFWEEK(rp.tgl_registrasi)
        WHEN 1 THEN 'Minggu'
        WHEN 2 THEN 'Senin'
        WHEN 3 THEN 'Selasa'
        WHEN 4 THEN 'Rabu'
        WHEN 5 THEN 'Kamis'
        WHEN 6 THEN 'Jumat'
        WHEN 7 THEN 'Sabtu'
      END as nama_hari,
      rp.jam_reg as jam_registrasi,
      mpd.kd_dokter_bpjs as kd_dokter, 
      mpd.nm_dokter_bpjs as nama_dokter,
      rp.no_rkm_medis,
      mp.kd_poli_bpjs as kd_poli,
      mp.nm_poli_bpjs as nama_poli,
      rp.jenis_kunjungan,
      rp.status_poli as pasien_baru,
      j.jam_mulai,
      j.jam_selesai,
      j.kuota as kuota_jkn,
      rp.task_id_3,
      rp.task_id_4,
      rp.task_id_5,
      rp.task_id_6,
      rp.task_id_7
    FROM reg_periksa rp
    LEFT JOIN maping_dokter_dpjpvclaim mpd ON rp.kd_dokter = mpd.kd_dokter
    LEFT JOIN maping_poli_bpjs mp ON rp.kd_poli = mp.kd_poli_bpjs
    LEFT JOIN jadwal j ON rp.kd_dokter = j.kd_dokter 
      AND rp.kd_poli = j.kd_poli 
      AND CASE DAYOFWEEK(rp.tgl_registrasi)
        WHEN 1 THEN 'MINGGU'
        WHEN 2 THEN 'SENIN'
        WHEN 3 THEN 'SELASA'
        WHEN 4 THEN 'RABU'
        WHEN 5 THEN 'KAMIS'
        WHEN 6 THEN 'JUMAT'
        WHEN 7 THEN 'SABTU'
      END = j.hari_kerja
    WHERE rp.kd_pj = 'BPJ'
    AND (rp.tgl_registrasi > ? OR (rp.tgl_registrasi = ? AND rp.jam_reg > ?))
    AND rp.jenis_kunjungan IS NOT NULL
    ORDER BY
      rp.tgl_registrasi,
      rp.jam_reg
    LIMIT 100
    `,
    [lastDate, lastDate, lastTime],
  );

  return rows as {
    no_reg: string;
    no_rawat: string;
    tgl_registrasi: string;
    jam_registrasi: string;
    nama_hari: string;
    jam_reg: string;
    kd_dokter: string;
    nama_dokter: string;
    no_rkm_medis: string;
    kd_poli: string;
    nama_poli: string;
    type_patient: string;
    jenis_kunjungan: string;
    pasien_baru: "Lama" | "Baru";
    jam_mulai: string;
    jam_selesai: string;
    kuota_jkn: number;
    task_id_3: string;
    task_id_4: string;
    task_id_5: string;
    task_id_6: string;
    task_id_7: string;
  }[];
}

export async function fetchTaskId(
  taskId: 3 | 4 | 5,
  lastEventTime: string,
): Promise<{ no_rawat: string; event_time: string }[]> {
  const query = `
    SELECT no_rawat, task_id_${taskId.toString()} as event_time
    FROM reg_periksa
    WHERE task_id_${taskId.toString()} IS NOT NULL AND task_id_${taskId.toString()} > ?
    ORDER BY task_id_${taskId.toString()} LIMIT 100
  `;

  const [rows] = await khanzaDb.query(query, [lastEventTime]);

  return (Array.isArray(rows) ? rows : []).map((row) => ({
    no_rawat: (row as any).no_rawat,
    event_time: (row as any).event_time,
  }));
}

export async function aggregateRegisterEventsByPoliDokterTanggal(
  tanggal: string,
  poliId: string,
  dokterId: string,
) {
  const [rows] = await khanzaDb.query(
    `SELECT rp.kd_poli, mp.nm_poli_bpjs as nama_poli,
    rp.tgl_registrasi as tanggal, j.jam_mulai, j.jam_selesai,
    j.kuota as kuota_jkn, COUNT(rp.no_reg) as total_register
    FROM reg_periksa rp 
    LEFT JOIN maping_poli_bpjs mp ON rp.kd_poli = mp.kd_poli_bpjs 
    LEFT JOIN jadwal j ON rp.kd_dokter = j.kd_dokter 
      AND rp.kd_poli = j.kd_poli 
      AND CASE DAYOFWEEK(rp.tgl_registrasi)
        WHEN 1 THEN 'MINGGU'
        WHEN 2 THEN 'SENIN'
        WHEN 3 THEN 'SELASA'
        WHEN 4 THEN 'RABU'
        WHEN 5 THEN 'KAMIS'
        WHEN 6 THEN 'JUMAT'
        WHEN 7 THEN 'SABTU'
      END = j.hari_kerja
    WHERE rp.tgl_registrasi = ? 
    AND rp.kd_poli = ? 
    AND rp.kd_dokter = ? 
    GROUP BY rp.kd_poli, mp.nm_poli_bpjs, rp.tgl_registrasi, j.jam_mulai, j.jam_selesai, j.kuota
    `,
    [tanggal, poliId, dokterId],
  );

  return rows as {
    kd_poli: string;
    nama_poli: string;
    tanggal: string;
    jam_mulai: string;
    jam_selesai: string;
    kuota_jkn: number;
    total_register: number;
  }[];
}
