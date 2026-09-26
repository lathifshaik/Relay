---
"@relay/core": minor
"@relay/express": minor
"@relay/next": minor
"@relay/hono": minor
"@relay/fastify": minor
"@relay/bridge": minor
---

Connect an agent to a person's account (OAuth device authorization, RFC 8628). With `connect` and `identify` set, adapters serve `/relay/connect`, `/relay/connect/token`, a consent page at `/relay/approve` (sign-in via the app's own login, per-action checkboxes, CSRF and framing protection), `/relay/connections` and revoke, plus `/.well-known/relay.json`. Tokens are scoped to what the person approved and revocable; handlers see the user the agent acts for (`req.relay.subject`, `ctx.agent`, `getRelayAgent(c)`, `request.relayAgent`). `relay-bridge login` uses the flow automatically on Relay sites.
