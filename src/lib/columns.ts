/** Form fields use camelCase; database columns are snake_case. */
export function toColumns(rest: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(rest).map(([k, v]) => [k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), v]),
  );
}
