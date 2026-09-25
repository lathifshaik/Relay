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

## Signing in

For pages behind a login, give the bridge your own session:

- `RELAY_BRIDGE_TOKEN`: an API token, sent as `Authorization: Bearer ...`
- `RELAY_BRIDGE_COOKIE`: the `Cookie` header from a browser where you're logged in

The bridge does not log in with a password itself.

## Options

| Flag | |
|---|---|
| `--scan` | Print the discovered actions as JSON and exit |
| `--save <file>` | Write the discovered actions to a file, e.g. to review or edit them |
| `--graph <file>` | Serve actions from a saved file instead of discovering again |
| `--read-only` | Only expose GET actions |
| `--max-pages <n>` | Pages to read when scanning the frontend (default 15) |

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
