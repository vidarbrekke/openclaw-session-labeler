/**
 * Enforce a maximum character length on a label using smart shortening
 * before falling back to hard truncation.
 *
 * Strategy (applied in order until the label fits):
 *  1. Remove stop-words.
 *  2. Replace known long words with shorter equivalents.
 *  3. Keep only the N most informative words (longest) in original order.
 *  4. Hard truncate to maxChars.
 */

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "of",
  "to",
  "for",
  "with",
  "on",
  "in",
  "is",
  "are",
  "was",
  "be",
  "by",
  "at",
  "or",
  "its",
]);

/** Map of case-insensitive long words to compact equivalents. */
const ABBREVIATIONS: Record<string, string> = {
  configuration: "Config",
  documentation: "Docs",
  performance: "Perf",
  implementation: "Impl",
  integration: "Integ",
  development: "Dev",
  application: "App",
  environment: "Env",
  infrastructure: "Infra",
  authentication: "Auth",
  authorization: "Authz",
  management: "Mgmt",
  deployment: "Deploy",
  repository: "Repo",
  notification: "Notif",
  woocommerce: "Woo",
  kubernetes: "K8s",
  database: "DB",
  javascript: "JS",
  typescript: "TS",
  refactoring: "Refactor",
  troubleshooting: "Debug",
  optimization: "Optim",
};

export function enforceMaxLength(label: string, maxChars: number): string {
  if (!label) return "";
  if (label.length <= maxChars) return label;

  let words = label.split(/\s+/);

  // Step 1: Remove stop-words
  const withoutStops = words.filter((w) => !STOP_WORDS.has(w.toLowerCase()));
  if (withoutStops.length > 0) {
    words = withoutStops;
  }
  let candidate = words.join(" ");
  if (candidate.length <= maxChars) return candidate;

  // Step 2: Abbreviate known long words
  words = words.map((w) => {
    const lower = w.toLowerCase();
    if (ABBREVIATIONS[lower]) {
      return ABBREVIATIONS[lower];
    }
    return w;
  });
  candidate = words.join(" ");
  if (candidate.length <= maxChars) return candidate;

  // Step 3: Keep the most informative words (longest), preserving original order
  // Sort indices by word length descending, keep top N that fit
  const indexed = words.map((w, i) => ({ word: w, index: i }));
  indexed.sort((a, b) => b.word.length - a.word.length);

  for (let keep = Math.min(4, words.length); keep >= 1; keep--) {
    const selected = indexed
      .slice(0, keep)
      .sort((a, b) => a.index - b.index)
      .map((e) => e.word);
    const shortened = selected.join(" ");
    if (shortened.length <= maxChars) return shortened;
  }

  // Step 4: Hard truncate
  return candidate.slice(0, maxChars).trimEnd();
}
