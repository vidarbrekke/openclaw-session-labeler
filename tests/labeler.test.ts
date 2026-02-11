import { describe, it, expect, vi } from "vitest";
import { generateLabel, heuristicLabel } from "../src/labeler.js";
import type { LlmClient, LabelerInput } from "../src/types.js";

function makeInput(overrides?: Partial<LabelerInput>): LabelerInput {
  return {
    requests: [
      "Help me set up Stripe webhooks for payment processing",
      "Now I need to handle failed payments and send retry emails",
      "Can you add a dashboard showing payment analytics?",
    ],
    max_chars: 28,
    ...overrides,
  };
}

function mockLlm(response: string): LlmClient {
  return {
    complete: vi.fn().mockResolvedValue(response),
  };
}

function failingLlm(): LlmClient {
  return {
    complete: vi.fn().mockRejectedValue(new Error("LLM unavailable")),
  };
}

describe("generateLabel", () => {
  it("returns sanitized and length-enforced LLM output", async () => {
    const llm = mockLlm("Stripe Payment Dashboard");
    const result = await generateLabel(llm, makeInput());
    expect(result).toBe("Stripe Payment Dashboard");
    expect(result.length).toBeLessThanOrEqual(28);
  });

  it("sanitizes LLM output with quotes and trailing period", async () => {
    const llm = mockLlm('"Stripe Payment Setup."');
    const result = await generateLabel(llm, makeInput());
    expect(result).toBe("Stripe Payment Setup");
  });

  it("enforces max length on long LLM output", async () => {
    const llm = mockLlm(
      "Stripe Payment Processing Dashboard with Analytics"
    );
    const result = await generateLabel(llm, makeInput());
    expect(result.length).toBeLessThanOrEqual(28);
  });

  it("falls back to heuristic when LLM fails", async () => {
    const llm = failingLlm();
    const result = await generateLabel(llm, makeInput());
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(28);
  });

  it("falls back to heuristic when LLM returns empty", async () => {
    const llm = mockLlm("");
    const result = await generateLabel(llm, makeInput());
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(28);
  });

  it("falls back to heuristic when LLM returns only whitespace", async () => {
    const llm = mockLlm("   \n\n  ");
    const result = await generateLabel(llm, makeInput());
    // sanitize("   \n\n  ") => "" => falls back to heuristic which extracts keywords
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(28);
  });

  it("returns 'General' when LLM and heuristic both produce nothing", async () => {
    const llm = mockLlm("");
    const result = await generateLabel(llm, {
      requests: ["hi", "ok", "yes"],
      max_chars: 28,
    });
    expect(result).toBe("General");
  });
});

describe("heuristicLabel", () => {
  it("extracts keywords from requests", () => {
    const result = heuristicLabel(makeInput());
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(28);
  });

  it("returns 'General' for empty requests", () => {
    const result = heuristicLabel({
      requests: ["hi", "ok", "yes"],
      max_chars: 28,
    });
    // All words are <= 3 chars so filtered out
    expect(result).toBe("General");
  });

  it("respects max_chars", () => {
    const result = heuristicLabel(makeInput({ max_chars: 15 }));
    expect(result.length).toBeLessThanOrEqual(15);
  });

  it("filters common filler words from fallback labels", () => {
    const result = heuristicLabel({
      requests: [
        "Please help me with WooCommerce plugin setup",
        "I need help with WooCommerce checkout tax settings",
        "Can you help with WooCommerce shipping zones",
      ],
      max_chars: 28,
    });
    expect(result.toLowerCase()).toContain("woo");
    expect(result.toLowerCase()).not.toContain("help");
    expect(result.toLowerCase()).not.toContain("please");
  });
});
