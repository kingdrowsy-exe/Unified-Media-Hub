// One collator for every list in the app: case-insensitive, punctuation ignored, and numbers sorted
// by value so "Max 2" comes before "Max 10".
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base", ignorePunctuation: true });

export function compareAlpha(a: string, b: string): number {
  return collator.compare(a, b);
}

/** Sorts by a text key without touching the original array. */
export function sortAlpha<T>(items: readonly T[], key: (item: T) => string): T[] {
  return [...items].sort((a, b) => collator.compare(key(a), key(b)));
}
