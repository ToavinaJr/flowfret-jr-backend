export function normalizeOptionalText(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined || value === null) return value;
  const result = value.trim();
  return result.length ? result : null;
}

export function normalizeList(
  values: string[] | undefined,
): string[] | undefined {
  if (!values) return values;
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
