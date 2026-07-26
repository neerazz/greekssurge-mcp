import { EventEmitter } from "node:events";
import WebSocket from "ws";

export interface CdpTransport extends Pick<EventEmitter, "on" | "off"> {
  send(data: string): void;
  close(): void;
}

export interface CdpTab {
  id: string;
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

export class CdpSession {
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  constructor(private readonly transport: CdpTransport) {
    this.transport.on("message", this.onMessage);
    this.transport.on("error", this.onError);
  }

  async sendCommand(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = 5_000,
  ): Promise<unknown> {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
      this.transport.send(payload);
    });
  }

  close(): void {
    this.transport.off("message", this.onMessage);
    this.transport.off("error", this.onError);
    this.transport.close();
  }

  private readonly onMessage = (data: unknown) => {
    const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
    const message = JSON.parse(text) as {
      id?: number;
      result?: unknown;
      error?: { message?: string };
    };
    if (typeof message.id !== "number") return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error)
      pending.reject(new Error(message.error.message ?? "CDP command failed"));
    else pending.resolve(message.result);
  };

  private readonly onError = (error: unknown) => {
    for (const pending of this.pending.values())
      pending.reject(
        error instanceof Error ? error : new Error("CDP transport failed"),
      );
    this.pending.clear();
  };
}

export function connectCdp(webSocketDebuggerUrl: string): CdpSession {
  return new CdpSession(
    new WebSocket(webSocketDebuggerUrl) as unknown as CdpTransport,
  );
}

export async function listTabs(
  port: number,
  fetchImpl: typeof fetch = fetch,
): Promise<CdpTab[]> {
  const response = await fetchImpl(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) throw new Error("Unable to enumerate Chromium tabs.");
  return (await response.json()) as CdpTab[];
}

export function findGreeksSurgeTab(tabs: CdpTab[]): CdpTab | undefined {
  return tabs.find(
    (tab) =>
      tab.type === "page" &&
      tab.url.startsWith("https://csp.greekssurge.com/") &&
      tab.webSocketDebuggerUrl,
  );
}

export async function readGsTokenFromTab(
  session: CdpSession,
  tabUrl: string,
): Promise<string | undefined> {
  const origin = new URL(tabUrl).origin;
  if (origin !== "https://csp.greekssurge.com") {
    throw new Error(
      "Refusing to evaluate CDP JavaScript outside the exact GreeksSurge origin.",
    );
  }
  const result = (await session.sendCommand("Runtime.evaluate", {
    expression: "localStorage.getItem('gs_token')",
    returnByValue: true,
  })) as { result?: { type?: string; value?: unknown } };
  return typeof result.result?.value === "string" &&
    result.result.value.length > 0
    ? result.result.value
    : undefined;
}
