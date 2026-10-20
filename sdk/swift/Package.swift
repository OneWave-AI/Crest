// swift-tools-version: 5.9
import PackageDescription
let package = Package(name: "CrestSDK", platforms: [.iOS(.v17), .macOS(.v13)], products: [.library(name: "CrestSDK", targets: ["CrestSDK"])], targets: [.target(name: "CrestSDK"), .testTarget(name: "CrestSDKTests", dependencies: ["CrestSDK"])])
