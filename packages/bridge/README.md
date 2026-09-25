# @relay/bridge

Turn a web app into an MCP server without changing the app and without a browser.

```sh
npx relay-bridge https://your-app.example.com
```

The bridge works out what the app can do from the best source it can find:

1. **Relay manifest.** If the app runs Relay middleware, its actions are used as-is.
2. **OpenAPI / Swagger spec.** Common locations such as `/openapi.json` and `/v3/api-docs` are checked, and exact schemas come from the spec.
3. **The frontend.** Otherwise it reads the app's pages and the JavaScript they load. It picks up the API calls the frontend makes (`fetch`, `axios.post`, `/api/...` strings) and the forms on each page.

Each action becomes an MCP tool with a typed input schema. A `read_page` tool returns any page of the site as plain text. The AI works through structured calls and never needs screenshots.

## Saving tokens

The bridge avoids sending the AI the same thing twice:

- **It learns the site's layout.** Navigation, headers and footers that repeat across different kinds of page are learned while the site is scanned and left out of `read_page` results. The reply says how many lines were hidden. Lines are compared per route template, so a line repeated across `/orders/1` and `/orders/2` is never mistaken for layout.
- **Repeat reads send only changes.** Reading the same page or GET endpoint again returns `{"unchanged": true}` or a short list of changes, e.g. `{"path": "orders[id=2].qty", "from": 1, "to": 3}`. Pass `_full: true` to get everything. Writes always return the full reply.
- **The site map is saved.** Actions and learned layout are kept in `~/.relay-bridge/<host>.json` (readable only by you) and reused for 24 hours, so a restart doesn't rescan the site.
- **Replies are compact JSON.**

Every request is logged to stderr and sent to the MCP client as a log message:

```
read /orders → 200 · 949 B in → 514 B out (46% smaller) · 5 layout lines hidden
read /orders → 200 · 949 B in → 40 B out (96% smaller) · 5 layout lines hidden, unchanged since last read
get_api_orders → 200 · 903 B in → 117 B out (87% smaller) · 1 change since last read
```

## Using it with Claude

```json
{
  "mcpServers": {
    "my-app": {
      "command": "npx",
      "args": ["relay-bridge", "https://your-app.example.com", "--read-only"],
      "env": { "RELAY_BRIDGE_TOKEN": "..." }
    }
  }
}
```

## What each tool means

Every action gets a name, a description and a risk level:

- **Names come from the app's own code.** An API call inside `sendInvoice()` becomes the tool `send_invoice`. It's described as "POST /api/v2/x, called by the app's sendInvoice(). Afterwards the app shows: "Invoice sent"". Forms are named from their heading and button. Minified code has no useful names, so those endpoints keep path-based ids.
- **Risk:** `read`, `write`, `destructive` (delete, cancel, revoke) or `external` (sends messages, charges money, publishes, places orders; usually can't be undone).
- **MCP hints:** tools carry the standard annotations (`readOnlyHint`, `destructiveHint`, `openWorldHint`, `idempotentHint`), so clients can ask the user before risky calls.
- **Confirmation:** with `--confirm risky` (the default), a destructive or external tool doesn't run on the first call. It returns what would happen and a one-time code bound to those exact inputs. The agent has to show the user and call again with `_confirm`. `--confirm writes` extends this to every change.
- **Your corrections win:** `relay-bridge labels <url>` writes `~/.relay-bridge/<host>.labels.json`. Rename tools, rewrite descriptions, change risk, or set `"hidden": true`. Entries are keyed by `METHOD /path`, so they survive rescans.

## Signing in

Log in to the site in your own browser as usual. 2FA, single sign-on and CAPTCHAs are all handled by you, the way the site intends. Then hand the bridge that session:

```sh
relay-bridge login https://your-app.example.com
# paste the Cookie request header (DevTools → Network) or an API token
```

The bridge checks that the session is signed in and saves it to `~/.relay-bridge/<host>.session.json` (readable only by you). `relay-bridge logout <url>` forgets it. `RELAY_BRIDGE_COOKIE` / `RELAY_BRIDGE_TOKEN` override it.

When the session expires (a 401, a redirect to a login page, or a login form where data should be), tools return `SIGNED_OUT` with instructions to log in again, not the login page.

The bridge never types passwords, creates accounts, or gets past 2FA or CAPTCHAs.

## When the app changes

- An API action that now gets a 405, a 410, a 404 on a fixed path, or an HTML page where data was expected returns `ENDPOINT_CHANGED`. The bridge then re-reads the site (at most every 10 minutes) and updates the tool list live (`notifications/tools/list_changed`).
- If a reply loses fields it used to have, a `note` says so.
- The bridge is a polite client: at most 5 requests a second by default (`--rate`), it honors `429`/`503` `Retry-After`, and it identifies itself honestly as `relay-bridge`. It doesn't try to get around a site that blocks it; use the site's official API or ask the owner to add Relay.

## Site permission

- **Owners can opt out.** A site can publish `/.well-known/relay.json`:
  - `{"agents": "deny"}`: the bridge refuses to run.
  - `{"agents": "official-only"}`: only a Relay manifest or OpenAPI spec is used, never the frontend.
  - `{"agents": "allow"}`: everything is allowed.
- **robots.txt:** a group for `relay-bridge` that disallows `/` counts as `deny`. Pages robots.txt disallows are skipped while scanning.
- **Official sources come first.** They're always used when present.
- **Terms:** when reading a frontend, the bridge reminds you to use it only where the site's terms allow.

## Options

| Flag | |
|---|---|
| `--scan` | Print the discovered actions as JSON and exit |
| `--save <file>` | Write the discovered actions to a file, e.g. to review or edit them |
| `--graph <file>` | Serve actions from a saved file instead of discovering again |
| `--read-only` | Only expose actions that read |
| `--confirm <policy>` | `risky` (default), `writes` or `none` |
| `--rate <n>` | At most n requests per second to the site (default 5) |
| `--max-pages <n>` | Pages to read when scanning the frontend (default 15) |
| `--refresh` | Rescan the site even if its saved map is recent |
| `--no-cache` | Don't read or write the saved map |
| `--cache-dir <dir>` | Where site maps are kept (default `~/.relay-bridge`) |

## Safety

- Discovery only makes GET requests and never follows logout or delete links.
- Paths on Relay's default block list (`/admin`, `/payment`, `/password`, ...) are marked denied and not exposed.
- Inputs are validated before any request is made.
- Replies pass through Relay's secret redaction.
- `read_page` only reads the app's own origin.

## Limits

- Frontend scanning only sees URLs written in the code. URLs assembled at runtime from pieces are missed.
- Endpoints found only as a bare string get a guessed method (GET).
- Endpoints with unreadable body fields take a whole `body` object.
- Response shapes aren't known without a spec, so `returns` is empty for scanned endpoints.
