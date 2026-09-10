#!/usr/bin/env node
/* global console, process */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Run against an installed CLI path to distinguish package proof from source proof.
// Uses the normal token store; never prints credentials or account/market payloads.
const bin = resolve(process.argv[2] ?? "dist/cli.js");
const anonymous = process.argv.includes("--anonymous");
const expectedTools = [
  "get_account",
  "get_market_status",
  "list_trade_ideas",
  "get_available_filters",
  "get_performance_stats",
  "list_trade_history",
  "list_education",
  "get_education_article",
  "get_watchlist",
  "get_preferences",
  "analyze_ticker",
].sort();
const expectedPrompts = [
  "getting_started",
  "account_overview",
  "cash_secured_put_plan",
  "screen_ideas",
  "ticker_downside_review",
  "wheel_strategy_review",
  "performance_retrospective",
  "assignment_review",
  "watchlist_digest",
  "learn_concept",
  "learning_path",
].sort();
const client = new Client({
  name: "greekssurge-live-verifier",
  version: "1.0.0",
});
const receipt = {
  bin,
  mode: anonymous ? "anonymous" : "authenticated",
  startedAt: new Date().toISOString(),
  tools: [],
  prompts: [],
  filterRoundTrips: [],
};
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [bin, "serve"],
  env: Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined),
  ),
});

async function call(name, args = {}, roundTrip = false) {
  const result = await client.callTool({ name, arguments: args });
  const envelope = result.structuredContent;
  assert.ok(
    !result.isError,
    `${name} failed (${envelope?.data?.code ?? "protocol error"}); no response contents logged`,
  );
  assert.equal(envelope?.source, "https://csp.greekssurge.com");
  assert.ok(envelope.retrievedAt);
  assert.match(envelope.disclaimer, /not financial advice/i);
  assert.ok(envelope.data && typeof envelope.data === "object");
  (roundTrip ? receipt.filterRoundTrips : receipt.tools).push({
    name,
    arguments: Object.keys(args),
    ok: true,
    keys: Object.keys(envelope.data).sort(),
  });
  return envelope.data;
}

try {
  await client.connect(transport);
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map((t) => t.name).sort(), expectedTools);
  for (const tool of tools.tools) {
    assert.equal(tool.annotations?.readOnlyHint, true);
    assert.equal(tool.annotations?.destructiveHint, false);
  }
  const prompts = await client.listPrompts();
  assert.deepEqual(prompts.prompts.map((p) => p.name).sort(), expectedPrompts);
  await call("get_market_status");
  const filters = await call("get_available_filters");
  const education = await call("list_education");
  const slug = education.lessons[0]?.slug;
  assert.ok(slug, "No live education slug available to chain");
  await call("get_education_article", { slug });
  let ticker = filters.tickers[0];
  if (!anonymous) {
    await call("get_account");
    const ideas = await call("list_trade_ideas", { limit: 3 });
    ticker = ideas.items[0]?.ticker ?? ticker;
    await call("get_performance_stats");
    await call("list_trade_history", { limit: 3 });
    await call("get_watchlist");
    await call("get_preferences");
    assert.ok(ticker, "No live ticker available to chain");
    await call("analyze_ticker", { ticker });
    for (const [key, bucket] of [
      ["roi", "rois"],
      ["capital", "capitals"],
      ["pop", "probOtms"],
      ["mode", "modes"],
    ]) {
      for (const option of filters[bucket])
        await call("list_trade_ideas", { [key]: option.value, limit: 1 }, true);
    }
    for (const option of filters.outcomes)
      await call(
        "list_trade_history",
        { outcome: option.value, limit: 1 },
        true,
      );
    assert.deepEqual(receipt.tools.map((t) => t.name).sort(), expectedTools);
  }
  const sample = {
    ticker,
    topic: "cash-secured puts",
    outcome: filters.outcomes[0]?.value,
  };
  for (const prompt of prompts.prompts) {
    const realistic = Object.fromEntries(
      (prompt.arguments ?? [])
        .filter((a) => sample[a.name])
        .map((a) => [a.name, sample[a.name]]),
    );
    for (const args of [undefined, {}, realistic]) {
      const result = await client.getPrompt({
        name: prompt.name,
        ...(args === undefined ? {} : { arguments: args }),
      });
      const text = result.messages
        .map((m) => (m.content.type === "text" ? m.content.text : ""))
        .join("\n");
      assert.match(text, /read-only/i);
      assert.match(text, /not financial advice/i);
      assert.match(text, /untrusted data/i);
    }
    receipt.prompts.push({
      name: prompt.name,
      omitted: true,
      empty: true,
      realistic: true,
    });
  }
  receipt.ok = true;
} catch (error) {
  receipt.ok = false;
  receipt.error = error.message;
  process.exitCode = 1;
} finally {
  await client.close();
  receipt.finishedAt = new Date().toISOString();
  console.log(JSON.stringify(receipt, null, 2));
}
