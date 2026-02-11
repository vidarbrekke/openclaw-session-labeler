/**
 * Sanitize raw LLM output into a clean label string.
 *
 * Steps:
 *  1. Take only the first line (LLMs sometimes return multiple).
 *  2. Trim whitespace.
 *  3. Remove surrounding quotes / backticks / markdown bold markers.
 *  4. Replace newlines / tabs with spaces.
 *  5. Collapse multiple spaces.
 *  6. Remove trailing punctuation (. , ; : ! ?).
 *  7. Remove leading list markers (- * •).
 */
export function sanitize(raw: string): string {
  if (!raw) return "";

  // 1) Take only the first non-empty line
  let label = raw.split(/\r?\n/).find((line) => line.trim() !== "") ?? "";

  // 2) Trim whitespace
  label = label.trim();

  if (!label) return "";

  // 3) Remove leading list markers: "- ", "* ", "• "
  label = label.replace(/^[-*•]\s+/, "");

  // 4) Replace tabs with spaces, collapse multiple spaces
  label = label.replace(/\t/g, " ");
  label = label.replace(/ {2,}/g, " ");

  // 5) Remove surrounding quotes, backticks, markdown bold
  label = label.replace(/^["'`]+|["'`]+$/g, "");
  label = label.replace(/^\*{1,2}|\*{1,2}$/g, "");
  label = label.trim();

  // 6) Remove trailing punctuation
  label = label.replace(/[.,;:!?]$/, "");

  // Final trim
  label = label.trim();

  return label;
}
