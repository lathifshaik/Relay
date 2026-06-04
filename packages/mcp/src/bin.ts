import { runServer } from "./server.js";

function parseToken(argv: readonly string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--token" && i + 1 < argv.length) return argv[i + 1];
    if (typeof arg === "string" && arg.startsWith("--token=")) return arg.slice("--token=".length);
  }
  return undefined;
}

const token = parseToken(process.argv.slice(2)) ?? process.env.RELAY_TOKEN;

const opts: { token?: string } = {};
if (token !== undefined) opts.token = token;

runServer(opts).catch((err: unknown) => {
  // MCP servers communicate over stdout via JSON-RPC; log errors to stderr.
  process.stderr.write(
    `@relay/mcp fatal: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
