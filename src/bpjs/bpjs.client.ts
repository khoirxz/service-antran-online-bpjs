import axios from "axios";
import crypto from "crypto";
import LZString from "lz-string";
import { generateSignature } from "./bpjs.signature";

const BPJS_BASE_URL =
  process.env.BPJS_BASE_URL || "https://api.bpjs-kesehatan.go.id";
const CONST_ID = process.env.BPJS_CONST_ID || "";
const SECRET_KEY = process.env.BPJS_SECRET_KEY || "";

export async function sendToBpjs(endpoint: string, payload: any) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = generateSignature(CONST_ID, SECRET_KEY, timestamp);

  return axios.post(`${BPJS_BASE_URL}${endpoint}`, payload, {
    headers: {
      "x-cons-id": CONST_ID,
      "x-timestamp": timestamp,
      "x-signature": signature,
      user_key: SECRET_KEY,
    },
    timeout: 10000,
  });
}

/**
 * Fetch jadwal dokter dari BPJS API
 * @param kodePoli - Kode poli BPJS (e.g., "ANA", "BED")
 * @param tanggal - Tanggal format YYYY-MM-DD (e.g., "2026-01-19")
 */
export async function getJadwalDokter(kodePoli: string, tanggal: string) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = generateSignature(CONST_ID, SECRET_KEY, timestamp);

  const response = await axios.get(
    `${BPJS_BASE_URL}/jadwaldokter/kodepoli/${kodePoli}/tanggal/${tanggal}`,
    {
      headers: {
        "x-cons-id": CONST_ID,
        "x-timestamp": timestamp,
        "x-signature": signature,
        user_key: SECRET_KEY,
      },
      timeout: 10000,
    },
  );

  // Response BPJS terenkripsi, perlu didekripsi
  if (response.data.response) {
    const decrypted = decryptBpjsResponse(response.data.response, timestamp);
    return JSON.parse(decrypted);
  }

  return response.data;
}

/**
 * Dekripsi response BPJS menggunakan AES-256-CBC + LZString decompression
 */
function decryptBpjsResponse(encryptedData: string, ts: string): string {
  // 1. Generate Key & IV (SHA256 dari ConsID + SecretKey + Timestamp)
  const key = crypto
    .createHash("sha256")
    .update(CONST_ID + SECRET_KEY + ts)
    .digest();

  // IV adalah 16 byte pertama dari key
  const iv = key.slice(0, 16);

  // 2. Dekripsi AES-256-CBC
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);

  let decrypted = decipher.update(encryptedData, "base64", "utf8");
  decrypted += decipher.final("utf8");

  // 3. Decompress LZString
  // BPJS menggunakan decompressFromEncodedURIComponent
  const decompressed = LZString.decompressFromEncodedURIComponent(decrypted);

  if (!decompressed) {
    throw new Error("Gagal decompress response BPJS");
  }

  return decompressed;
}
