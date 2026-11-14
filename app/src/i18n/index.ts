// Every string the user sees goes through t('key'). Keys live in
// locales/en.json; a test fails if the code uses one that isn't there.

import en from '../locales/en.json';

export type StringKey = keyof typeof en;

const strings: Record<string, string> = en;

/** Looks up a string and fills in its {placeholders}. */
export function t(key: StringKey, values: Record<string, string | number> = {}): string {
  const template = strings[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

/** Picks the singular or plural key by count, and passes the count in. */
export function plural(count: number, one: StringKey, many: StringKey, none?: StringKey): string {
  if (count === 0 && none) return t(none, { count });
  return t(count === 1 ? one : many, { count });
}
