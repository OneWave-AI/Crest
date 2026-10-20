# Crest SDK for Swift

A dependency-free Swift package for iOS 17+ and macOS 13+. It connects native apps
to Crest's paired-device HTTPS API and runs coding tasks on the laptop through
Ollama. There is no paid model API or cloud fallback.

Add `sdk/swift` as a local package in Xcode, or use this repository's package path
in a checkout. The package product and import are both `CrestSDK`. The companion
app in `ios/` consumes this exact package.

```swift
import CrestSDK

let link = try PairingLink(scannedPairingURL)
let pairingClient = CrestClient(url: link.url, fingerprint: link.fingerprint)
let device = try await pairingClient.pair(code: link.code, name: "My iPad")
let credential = PairedLaptop(
    url: link.url, fingerprint: link.fingerprint, token: device.token,
    deviceId: device.deviceId, laptopName: device.laptopName
)
// Store credential in Keychain; never log or embed it in source control.
let client = CrestClient(credential)
let projects = try await client.projects()
if let project = projects.first {
    let files = try await client.files(projectID: project.id)
    let request = CodingRequest(
        projectId: project.id, prompt: "Review the selected code",
        files: Array(files.prefix(3))
    )
    let task = try await client.start(request)
    let current = try await client.job(task.id)
    print(current.status)
}
```

`status()`, `models()`, `projects()`, `files(projectID:)`, `start(_:)`, `job(_:)`,
and `cancel(_:)` are asynchronous and throw typed `HarnessError` API failures or
Foundation transport/decoding errors. A task may be `running`, `completed`,
`failed`, or `cancelled`; poll `job` at roughly two-second intervals while running.
Cancelling a Swift polling task cancels its request, not the laptop job. Call
`cancel` to stop laptop work. `changedFiles` is the authoritative write result.

Keep the same `CodingRequest` and its generated `requestKey` across retries after
network uncertainty. Persist the request before starting it and the returned task
ID afterward. An optional `history` contains prior user/assistant turns. Review
is the default; edits require `mode: "edit"` and explicit allowed file paths.

Pairing links are one-use and expire after five minutes. The SDK accepts only
private HTTPS laptop endpoints, pins the exact certificate from the QR, checks
certificate validity and hostname, rejects redirects, uses ephemeral sessions,
and validates task/project identifiers before constructing paths. Device tokens
are revocable from Mac Crest. Keychain storage and UI are owned by the app; the
SDK never writes credentials to disk. The laptop enforces approved project roots,
file boundaries, authentication, and idempotency.

This SDK targets the phone/tablet bridge on port 19432. Desktop loopback REST and
MCP clients use the separate API on 19431; see [API docs](../../docs/local-api.md).
For remote use, connect both devices to a private VPN. Do not port-forward Crest.

Run package tests: `swift test --package-path sdk/swift` from the repository root.
