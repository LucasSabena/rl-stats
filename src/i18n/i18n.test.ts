import { describe, expect, it } from "vitest";

const BASE_LANGUAGE = "es";
const LANGUAGES = ["en", "pt"] as const;

interface LocaleFile {
  lang: string;
  namespace: string;
  data: Record<string, unknown>;
}

const localeModules = import.meta.glob("./locales/*/*.json", {
  eager: true,
}) as Record<string, { default: Record<string, unknown> }>;

function parseModulePath(modulePath: string): { lang: string; namespace: string } {
  const match = modulePath.match(/^\.\/locales\/([^/]+)\/(.+)\.json$/);
  if (!match) throw new Error(`Unexpected locale module path: ${modulePath}`);
  return { lang: match[1], namespace: match[2] };
}

const files: LocaleFile[] = Object.entries(localeModules).map(
  ([modulePath, module]) => ({
    ...parseModulePath(modulePath),
    data: module.default,
  }),
);

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

function getLocaleFile(lang: string, namespace: string): LocaleFile {
  const file = files.find(
    (candidate) => candidate.lang === lang && candidate.namespace === namespace,
  );
  if (!file) {
    throw new Error(`Missing ${lang} locale file for namespace "${namespace}".`);
  }
  return file;
}

const namespaces = [...new Set(files.map((file) => file.namespace))].sort();

describe("i18n locale key parity", () => {
  it("loads every locale namespace", () => {
    expect(files.length).toBeGreaterThan(0);
    expect(namespaces.length).toBeGreaterThan(0);
  });

  it.each(namespaces)(
    "%s: en and pt expose exactly the same keys as es",
    (namespace) => {
      const baseKeys = new Set(flattenKeys(getLocaleFile(BASE_LANGUAGE, namespace).data));

      for (const lang of LANGUAGES) {
        const targetKeys = new Set(flattenKeys(getLocaleFile(lang, namespace).data));

        const missing = [...baseKeys]
          .filter((key) => !targetKeys.has(key))
          .sort();
        const extra = [...targetKeys]
          .filter((key) => !baseKeys.has(key))
          .sort();

        expect(
          missing,
          `${lang}/${namespace} is missing keys:\n${missing.join("\n")}`,
        ).toEqual([]);
        expect(
          extra,
          `${lang}/${namespace} has keys that are not in ${BASE_LANGUAGE}:\n${extra.join("\n")}`,
        ).toEqual([]);
      }
    },
  );
});
