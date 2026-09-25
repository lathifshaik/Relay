---
"@relay/bridge": minor
---

New package: `relay-bridge <url>` turns a web app into an MCP server without changing the app or opening a browser. It discovers actions from a Relay manifest, an OpenAPI spec, or the app's frontend (API calls in its JavaScript and forms on its pages), and uses the caller's own session via `RELAY_BRIDGE_TOKEN` / `RELAY_BRIDGE_COOKIE`.
