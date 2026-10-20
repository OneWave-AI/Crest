# Crest for iPhone and iPad

Open `CrestPhone.xcodeproj`, choose the **CrestPhone** scheme and an iPhone, iPad, or
simulator. For a real device, sign in under Xcode → Settings → Accounts and select
your team under the app target's Signing & Capabilities. The target requires
iOS 17+. No paid model key is needed.

In Mac Crest 2.6.0+, enable iPhone access under Settings → API & MCP, approve
project folders and scan the one-time pairing QR from the phone.

See [pairing, usage, security and API documentation](../docs/iphone-harness.md).

To regenerate the Xcode project: `xcodegen generate --spec project.yml`.
Build and run with Xcode; run the CrestPhone scheme tests with ⌘U. The live
laptop test is opt-in via `CREST_LIVE_PAIRING_URL` in the test runner environment.

The iPad workspace uses a resizable project/file sidebar beside chat. Select a
project, choose up to 20 source files, then chat or explicitly switch to Edit
files. In narrow Split View windows the app uses the compact iPhone layout.
The app supports all iPad orientations and hardware keyboard text entry.

Networking and public API models come from the local [CrestSDK](../sdk/swift/README.md)
Swift package. Credentials stay in the app's device-only Keychain. The checked-in
Xcode project resolves that package without third-party dependencies.
