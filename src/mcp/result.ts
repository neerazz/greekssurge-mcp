import { EDUCATIONAL_NO_ADVICE_DISCLOSURE } from "./disclaimer.js";

export interface ToolEnvelope<TData> {
  [key: string]: unknown;
  source: "https://csp.greekssurge.com";
  retrievedAt: string;
  disclaimer: string;
  data: TData;
  meta?: Record<string, unknown>;
}

export function capArray<T>(items: T[], limit = 100): T[] {
  return items.slice(0, Math.max(0, Math.min(limit, 100)));
}

export function envelope<TData>(
  data: TData,
  meta?: Record<string, unknown>,
): ToolEnvelope<TData> {
  return {
    source: "https://csp.greekssurge.com",
    retrievedAt: new Date().toISOString(),
    disclaimer: EDUCATIONAL_NO_ADVICE_DISCLOSURE,
    data,
    ...(meta ? { meta } : {}),
  };
}

export function textSummary(toolName: string, data: unknown): string {
  const rendered = JSON.stringify(data);
  const suffix =
    rendered.length > 220 ? `${rendered.slice(0, 220)}…` : rendered;
  return `${toolName}: ${suffix}`;
}

export function toolError(code: string, message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: `${code}: ${message}` }],
    structuredContent: envelope({ code, message }),
  };
}
