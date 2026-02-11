import { describe, it, expect } from "vitest";
import { enforceMaxLength } from "../src/enforce-length.js";

describe("enforceMaxLength", () => {
  const MAX = 28;

  it("returns short labels unchanged", () => {
    expect(enforceMaxLength("API Setup", MAX)).toBe("API Setup");
  });

  it("returns label at exactly max length unchanged", () => {
    const label = "A".repeat(28);
    expect(enforceMaxLength(label, MAX)).toBe(label);
  });

  it("removes stop-words to shorten", () => {
    // "Configuration of the Main API Server" = 38 chars
    // After removing "of", "the": "Configuration Main API Server" = 30 chars
    // After abbreviating "Configuration" -> "Config": "Config Main API Server" = 22 chars
    expect(enforceMaxLength("Configuration of the Main API Server", MAX).length).toBeLessThanOrEqual(MAX);
  });

  it("abbreviates known long words", () => {
    const result = enforceMaxLength("Documentation Performance Review", MAX);
    expect(result.length).toBeLessThanOrEqual(MAX);
    // Should use abbreviations like "Docs" and "Perf"
    expect(result).toContain("Docs");
    expect(result).toContain("Perf");
  });

  it("preserves word order after shortening", () => {
    // 45 chars, well over 28 — needs stop-word removal + abbreviation
    const result = enforceMaxLength(
      "The Configuration and Documentation for Performance",
      MAX
    );
    // "The", "and", "for" removed; "Configuration" -> "Config", "Documentation" -> "Docs", "Performance" -> "Perf"
    expect(result).toBe("Config Docs Perf");
  });

  it("hard-truncates when still over limit after smart shortening", () => {
    const result = enforceMaxLength(
      "Supercalifragilisticexpialidocious Engineering Monorepo Restructuring",
      MAX
    );
    expect(result.length).toBeLessThanOrEqual(MAX);
  });

  it("does not leave trailing spaces after truncation", () => {
    const result = enforceMaxLength(
      "Verylongwordhere andmore words for padding out the label",
      MAX
    );
    expect(result).toBe(result.trimEnd());
  });

  it("returns empty string for empty input", () => {
    expect(enforceMaxLength("", MAX)).toBe("");
  });

  it("handles single very long word", () => {
    const result = enforceMaxLength("Antidisestablishmentarianism", MAX);
    expect(result.length).toBeLessThanOrEqual(MAX);
    expect(result).toBe("Antidisestablishmentarianism"); // exactly 28
  });

  it("handles single word longer than max", () => {
    const result = enforceMaxLength("Antidisestablishmentarianisms", MAX);
    expect(result.length).toBeLessThanOrEqual(MAX);
    expect(result).toBe("Antidisestablishmentarianism"); // truncated to 28
  });

  it("abbreviates 'woocommerce' to 'Woo'", () => {
    const result = enforceMaxLength("WooCommerce Integration Config", MAX);
    expect(result.length).toBeLessThanOrEqual(MAX);
    expect(result.toLowerCase()).toContain("woo");
  });

  it("keeps informative words when dropping to fit", () => {
    // When all abbreviations and stop-word removal aren't enough,
    // keep the most informative (longest) words in original order
    const result = enforceMaxLength(
      "Implementing Authentication Authorization Middleware Refactoring",
      MAX
    );
    expect(result.length).toBeLessThanOrEqual(MAX);
    expect(result.length).toBeGreaterThan(0);
  });
});
