/**
 * Helper untuk serialize BigInt ke string
 */
export function serializeBigInt(obj: any): any {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  );
}
