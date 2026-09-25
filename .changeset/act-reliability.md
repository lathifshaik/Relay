---
"@relay/core": minor
"@relay/express": patch
"@relay/fastify": patch
"@relay/hono": patch
"@relay/mcp": patch
---

Make `/relay/act` reliable and tighten output safety.

- Express: wait for async and callback-style handlers to respond instead of returning `{}`; add `handlerTimeoutMs` (default 30s).
- Express, Fastify, Hono: a non-2xx route response now yields `RELAY_UPSTREAM_ERROR` (4xx kept, 5xx mapped to 502) instead of an empty 200.
- Fastify, Hono: GET/DELETE actions receive their inputs in the query string.
- Core: output projection recurses into nested objects and arrays; new `RelayUpstreamError`, `buildRouteUrl`, `methodHasBody` exports; `verifyToken` refuses an empty signing key and non-string scopes; block list works with `/g` regexes; more secret patterns (GitHub, Slack, Google).
- MCP: client requests time out after 30s (`timeoutMs`).
