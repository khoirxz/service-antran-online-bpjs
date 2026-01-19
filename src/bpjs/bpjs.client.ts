import axios from "axios";
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
      "x-const-id": CONST_ID,
      "x-timestamp": timestamp,
      "x-signature": signature,
      user_key: SECRET_KEY,
    },
    timeout: 10000,
  });
}
