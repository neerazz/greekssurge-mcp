import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { it, expect } from "vitest";
import { createGreeksSurgeMcpServer } from "../src/mcp/create-server.js";

it("renders every optional prompt over the protocol with omitted or empty arguments", async () => {
  const server = createGreeksSurgeMcpServer({
    tokenProvider: async () => undefined,
    clientFactory: () => {
      throw new Error("Prompt rendering must not access the API");
    },
  });
  const client = new Client({ name: "prompt-contract-test", version: "1.0.0" });
  const [left, right] = InMemoryTransport.createLinkedPair();
  await server.connect(left);
  await client.connect(right);
  try {
    const catalog = await client.listPrompts();
    for (const prompt of catalog.prompts) {
      for (const args of [undefined, {}]) {
        const result = await client.getPrompt({
          name: prompt.name,
          ...(args === undefined ? {} : { arguments: args }),
        });
        expect(result.messages.length).toBeGreaterThan(0);
      }
    }
    await expect(
      client.getPrompt({ name: "screen_ideas", arguments: { ticker: "" } }),
    ).rejects.toThrow();
    await expect(client.getPrompt({ name: "nonexistent" })).rejects.toThrow();
  } finally {
    await client.close();
    await server.close();
  }
});
