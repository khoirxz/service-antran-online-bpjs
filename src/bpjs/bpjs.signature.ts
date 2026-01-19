import crypto from "crypto";

export function generateSignature(
  const_id: string,
  secret_key: string,
  timestamp: string
) {
  const data = `${const_id}&${timestamp}`;
  return crypto.createHmac("sha256", secret_key).update(data).digest("base64");
}
