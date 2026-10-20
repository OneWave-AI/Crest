# Crest for iPhone

The native SwiftUI companion in `ios/` lets you chat with local Qwen and request
source-file edits on your Mac. Inference runs through the Mac's Ollama daemon;
no Claude, Codex, OpenAI, or other paid model API is used by the phone harness.
The initial connection works on the same Wi-Fi. Keep the Mac awake, Crest open,
and Ollama running while it works. Backgrounding the phone does not cancel a job.

## Install on your iPhone

1. Open `ios/CrestPhone.xcodeproj` in Xcode (Xcode 26 was used for validation).
2. In Xcode → Settings → Accounts, sign in with your Apple developer account.
3. Select the CrestPhone app target, then Signing & Capabilities, and choose
   your development team. The repository deliberately leaves the team blank.
4. Choose your paired iPhone as the run destination and run the CrestPhone
   scheme. Enable Developer Mode or approve device trust if iOS requests it.
5. Allow local-network access when Crest asks. Camera access is used only for
   the pairing scanner; a manual pairing-link field is also available.

An Apple signing/provisioning identity is required for installation on a real
iPhone, independently of the local model. Simulator builds require no account.
The app supports iOS 17 and later, including iPad layouts. The source is native
SwiftUI with Foundation, Security, CryptoKit and VisionKit; it has no third-party
Swift package dependencies.

If you change the project specification, regenerate with `xcodegen generate`
from `ios/`. The generated Xcode project and shared scheme are checked in.

## Pair

1. In Mac Crest 2.6.0+, open Settings → API & MCP.
2. Enable iPhone access. It starts a separate HTTPS listener on port `19432`.
3. Choose Pair an iPhone, then scan its QR code from Crest on the phone.
4. Choose Allow a project on the Mac to expose an existing project. An isolated
   Scratchpad under `~/.crest/mobile-workspace` is available initially.

The phone can access only the folders explicitly approved on the Mac. Pairing
codes expire after five minutes, are single-use, and are not the Mac's local
MCP credential. The QR carries a private HTTPS endpoint, a one-time code, and the
SHA-256 fingerprint of the laptop certificate. The phone validates that pin,
the host, certificate lifetime and TLS server-authentication usage before sending
credentials. It refuses redirects. Credentials are stored in the phone Keychain;
the Mac stores only their hashes. Revoke devices or remove projects in the Mac
settings, or turn phone access off entirely.

The service accepts private-network source addresses and rejects browser Origin
headers and unexpected Host headers. TLS 1.2 is the minimum. The separate local
MCP API remains bound to loopback and cannot be accessed with phone credentials.
No public tunnel, third-party relay, or internet-facing port forwarding is set up.
If macOS asks about incoming connections, allow Crest on your trusted network.

## Chat and edit

Choose a project and an installed model at the top of the conversation. The
default `qwen3.5:4b` fits alongside other laptop apps; larger installed models can
be selected when memory permits.

Chat mode answers questions and generates code without writes. Select source
files with Add files when asking for project-specific help. Edit files mode
requires an explicit list of target files. You can add a new relative path, such
as `src/hello.py`, in the file picker. Only those files can be read or changed.
Original contents are backed up on the Mac before changes are applied. Changed
paths appear below the reply. Shell commands and tests are not run by this
bounded harness; review and test the changes on the laptop.

Conversations, selected files and pending task handles are saved in a protected
local phone file. Multi-turn context is sent as separate user/assistant messages.
Task retries keep the same request key, avoiding duplicate work after an uncertain
network response. Returning to the app reconnects to the existing task rather
than starting another one. Stop cancels on the laptop; edits already written
remain listed in the task report and have backups. New conversation clears the
current phone transcript once the task has finished.

## Phone API

This is an application API over HTTPS, alongside the stateless MCP endpoint.
Tasks use explicit durable handles; there are no connection-bound sessions.

| Method | Path | Scope |
| --- | --- | --- |
| POST | `/pair` | Exchange one-time QR code for a device credential |
| GET | `/v1/status` | Paired laptop availability |
| GET | `/v1/models` | Installed local models |
| GET | `/v1/projects` | Approved projects |
| GET | `/v1/projects/{id}/files` | Bounded source-file index; excludes secrets/builds/symlinks |
| POST | `/v1/tasks` | Start a scoped chat/review/edit job |
| GET | `/v1/tasks/{id}` | This device's job, while project access remains granted |
| DELETE | `/v1/tasks/{id}` | Cancel this device's job |

Task input: `projectId`, `prompt`, `files`, `mode`, `model`, UUID `requestKey`,
and optional `history` of up to eight `{role, content}` turns. The phone cannot
supply an arbitrary laptop project path. Jobs share the bounded local worker
with MCP clients, so only one model job runs at a time. The source and output
limits from [the local API reference](local-api.md) also apply here.

Desktop automation can manage the bridge using the existing loopback-only admin
credential: `GET /v1/mobile/status`, `POST /v1/mobile/enable` with `{enabled}`,
`POST /v1/mobile/pair`, and `POST /v1/mobile/projects` with `{path}`. Phone tokens
have no access to these administrative routes. Do not put pairing links or
device credentials in commits, logs, or chat messages.

## Validation

- `npm test` covers the existing API and phone HTTPS pairing, one-time codes,
  TLS usage, revocation, approved projects, device task ownership and file filters.
- `npx tsc --noEmit` and the Mac production build verify the desktop changes.
- The CrestPhone scheme contains pairing, request-encoding and task-decoding
  tests, plus an opt-in live harness test.
- Supply a fresh private `CREST_LIVE_PAIRING_URL` to the test runner for the live
  test. It rejects an incorrect certificate pin, pairs to the actual laptop,
  chats with Qwen, then creates a uniquely named Python file in Scratchpad.
  It never touches an existing source project. Without the variable, this live
  test is skipped while the deterministic tests still run.

Apple references: [manual trust validation](https://developer.apple.com/documentation/foundation/performing-manual-server-trust-authentication)
and [local-network privacy](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy).

## iPad workspace and source preview

On iPad, the workspace has a project/file explorer and a centered conversation.
Tap a filename to preview its source with line numbers; use the separate circle
control to add or remove that file from Qwen's context. The preview is a side
pane in wide windows and a sheet in narrower windows. Previewing never enables
edits. The composer explicitly selects Chat or Edit files, shows attached files,
and supports Command-Return to send and Command-N for a new conversation.

Paired clients can read a listed source file with
`POST /v1/projects/{projectId}/file` and JSON `{ "path": "src/example.ts" }`.
The response is `{ "path": "src/example.ts", "content": "..." }`. This read-only
operation requires the paired-device bearer token and an approved project. It
shares the source-list exclusions and the coding engine's 100 KB text-file limit;
secret files, symlinks, traversal, binary content and removed projects are rejected.
The Swift SDK exposes this as `preview(projectID:path:)`.
