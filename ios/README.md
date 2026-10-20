# Crest iPhone harness

Open `CrestPhone.xcodeproj`, choose the **CrestPhone** scheme and an iPhone or
simulator. For a real device, sign in under Xcode → Settings → Accounts and select
your team under the app target's Signing & Capabilities. The target requires
iOS 17+. No paid model key is needed.

In Mac Crest 2.6.0+, enable iPhone access under Settings → API & MCP, approve
project folders and scan the one-time pairing QR from the phone.

See [pairing, usage, security and API documentation](../docs/iphone-harness.md).

To regenerate the Xcode project: `xcodegen generate --spec project.yml`.
Build and run with Xcode; run the CrestPhone scheme tests with ⌘U. The live
laptop test is opt-in via `CREST_LIVE_PAIRING_URL` in the test runner environment.
