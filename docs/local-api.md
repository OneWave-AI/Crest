# Local API and MCP

Crest 2.5.1 exposes an authenticated loopback API while the app is open:

- REST: `http://127.0.0.1:19431/v1`
- OpenAPI 3.1: `http://127.0.0.1:19431/openapi.json`
- MCP: `http://127.0.0.1:19431/mcp`
- Token: `~/.crest/api-token` (created on first launch, permissions `0600`)
- Connection metadata: `~/.crest/api-connection.json`

Settings → API & MCP shows live availability and connection details. The service
binds only to `127.0.0.1`, requires `Authorization: Bearer <token>` on every
request, rejects browser Origin headers and unexpected Host headers, and limits
request bodies to 256 KB. It has no wildcard CORS or cloud inference fallback.
This personal loopback service uses a preprovisioned bearer token; it is not an
OAuth authorization server and should not be exposed through a public tunnel.

## MCP protocol

The endpoint uses the official TypeScript SDK v2 `createMcpHandler` and Node
adapter, implementing the published **2026-07-28** specification. Every HTTP
request creates a fresh MCP server instance. There is no protocol session store,
`Mcp-Session-Id`, sticky connection, GET event stream, or DELETE session operation.
The SDK provides `server/discover`, protocol negotiation, required per-request
`_meta`, routing-header validation, `resultType`, and JSON-RPC errors. The same
endpoint also supports stateless legacy 2025 initialize clients.

Sources checked for this implementation:

- [Published specification](https://modelcontextprotocol.io/specification/2026-07-28)
- [Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
- [Official SDK HTTP handler](https://ts.sdk.modelcontextprotocol.io/v2/serving/http.html)
- [Protocol versions and compatibility](https://ts.sdk.modelcontextprotocol.io/v2/protocol-versions)

Available tools:

| Tool | Purpose |
| --- | --- |
| `crest_status` | App version and recent tasks |
| `crest_models` | Ollama status and installed models |
| `crest_start_task` | Start local review, generation, or explicit-file editing |
| `crest_task_status` | Get result by application task ID |
| `crest_cancel_task` | Cancel work by application task ID |

Use an absolute `projectPath`, a focused `prompt`, and an explicit `files` array.
`mode` defaults to `review` and `model` defaults to `qwen3.5:4b`. Smaller
installed models can be selected by name. `requestKey` is optional and makes
retries safe across both REST and MCP clients. Do not reuse a key for new work.

Review tasks return an answer without writes. Edit tasks can create or replace
only listed source files. Source context is capped at 160 KB across 20 files;
each file is capped at 100 KB. Traversal, symlinks, `.git`, `node_modules`, `.env`,
credential files and private keys are rejected. Results are checked against the
allowlist and original contents before applying. Original contents are saved in
`~/.crest/task-backups/<id>/originals.json` (`null` means the file was new).

These are bounded code-generation jobs, not autonomous shell agents. The calling
agent must review the diff and run tests. A partially applied job reports every
successfully written path and its backup location. Cancellation does not undo
already applied files. Never assume an errored job changed nothing.

One model task runs at a time to limit laptop memory use. Inference is limited to
local Ollama with a 16K context and a ten-minute timeout. Jobs return IDs
immediately so MCP calls do not need a long-lived HTTP request. Task IDs and
reports are durable application data, not MCP sessions. The latest 100 reports
and retry keys are restored after restart. Interrupted work is marked failed and
is never automatically replayed. Backups remain on disk until manually removed.

## Connect Claude Code

Run locally; the token is never needed in a chat message:

```sh
crest_token="$(cat "$HOME/.crest/api-token")"
claude mcp add --scope user --transport http crest-local \
  http://127.0.0.1:19431/mcp \
  --header "Authorization: Bearer $crest_token"
unset crest_token
```

## Connect Codex

Add the server with `codex mcp add crest-local --url http://127.0.0.1:19431/mcp`.
In `~/.codex/config.toml`, supply the bearer header in that server's
`http_headers.Authorization` field, reading the token from the local file when
configuring it. Keep the config private (`0600`). Alternatively configure
`bearer_token_env_var` if the app is launched with that environment variable.
Restart existing agent sessions after registration so they discover the tools.

Suggested task instruction:

> Use crest-local to delegate this small coding task to Qwen on my laptop.
> Supply the project path and named files, poll the task, then review and test
> the resulting changes.

Local inference has no API token charge. Claude and Codex still consume their
own plan limits when planning, calling tools, reviewing and testing work.
The 4B default fits more comfortably alongside other laptop apps. Select
`qwen3-coder:30b` explicitly when enough memory is available for the larger model.

## REST contract

| Method | Path | Result |
| --- | --- | --- |
| GET | `/v1/status` | App version and recent tasks |
| GET | `/v1/models` | Local Ollama availability and installed models |
| GET | `/v1/tasks` | Latest 100 application task reports |
| POST | `/v1/tasks` | `202`, task report, and `Location` to poll |
| GET | `/v1/tasks/{id}` | Task status and eventual result |
| DELETE | `/v1/tasks/{id}` | Idempotent cancellation, not deletion or rollback |
| GET | `/openapi.json` | OpenAPI 3.1 schema |

POST requires `Content-Type: application/json`. A retry can supply an
`Idempotency-Key` header or `requestKey` body field. The same key and parameters
return the same task; different parameters return `409`. Keys are retained with
the latest 100 task reports. Repeated POSTs without a key can start fresh work.

```json
{
  "projectPath": "/absolute/path/to/project",
  "prompt": "Fix add so it adds both arguments. Keep the public interface.",
  "files": ["src/add.py"],
  "mode": "edit",
  "model": "qwen3.5:4b",
  "requestKey": "fix-add-unique-request-1"
}
```

Task status is `running`, `completed`, `failed`, or `cancelled`. `summary`,
`changedFiles`, `backupPath`, and `error` explain the outcome. A GET of a failed
task is still `200`: the request succeeded and describes a failed application job.

REST errors use `application/problem+json` with `type`, `title`, `status`,
`detail`, `code`, and `requestId`. All responses include `X-Request-Id` and
`Cache-Control: no-store`. Status codes distinguish malformed JSON (`400`),
authentication (`401`), forbidden origins/hosts (`403`), missing resources
(`404`), wrong methods (`405`), a busy worker or conflicting retry key (`409`),
body limits (`413`), media types (`415`), invalid task inputs (`422`), and
unavailable task storage (`503`). MCP errors retain the SDK's JSON-RPC envelopes.

## Verify

```sh
npm test
npx tsc --noEmit
npm run build
# With the packaged Crest app and Ollama running:
node scripts/smoke-local-api.mjs
```

For Mac builds under an iCloud-synced source folder, put the bundle in a local
output directory to avoid Finder metadata being reattached during signing:

```sh
npm run build:mac -- --arm64 --publish never --config.directories.output=/absolute/non-synced/output
```

The live smoke test uses temporary source files, invokes the actual MCP endpoint
with the current protocol, asks local Qwen to fix a function, polls its handle,
and runs assertions on the generated code. It does not touch existing projects.
