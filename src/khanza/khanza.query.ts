import { khanzaDb } from "./khanza.client";

export async function fetchRegisterEvents(lastDate: string, lastTime: string) {
  const [rows] = await khanzaDb.query(
    `SELECT no_rawat, tgl_registrasi, jam_reg FROM reg_periksa
        WHERE kd_pj = 'BPJ' AND (tgl_registrasi > ? OR (tgl_registrasi = ? AND jam_reg > ?)
        )
        ORDER BY tgl_registrasi, jam_reg LIMIT 100`,
    [lastDate, lastDate, lastTime]
  );

  return rows as {
    no_rawat: string;
    tgl_registrasi: Date;
    jam_reg: string;
  }[];
}

export async function fetchTaskId(taskId: 2 | 3 | 4, lastEventTime: string) {
  const [rows] = await khanzaDb.query(
    `SELECT no_rawat, task_id_${taskId.toString()} as event_time FROM reg_periksa
        WHERE task_id_${taskId.toString()} IS NOT NULL AND task_id_${taskId.toString()} > ?
        ORDER BY task_id_${taskId.toString()} LIMIT 100`,
    [lastEventTime]
  );

  return rows as {
    no_rawat: string;
    event_time: string;
  }[];
}
