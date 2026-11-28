import Flutter
import UIKit
import UniformTypeIdentifiers

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate, UIDocumentPickerDelegate {
  private var pendingPickerResult: FlutterResult?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    let channel = FlutterMethodChannel(
      name: "com.businz.hrms/document_picker",
      binaryMessenger: engineBridge.applicationRegistrar.messenger()
    )
    channel.setMethodCallHandler { [weak self] call, result in
      if call.method == "pickDocument" {
        self?.openDocumentPicker(args: call.arguments as? [String: Any], result: result)
      } else if call.method == "shareFile" || call.method == "saveToDownloads" || call.method == "openFile" {
        self?.shareExportFile(args: call.arguments as? [String: Any], result: result)
      } else {
        result(FlutterMethodNotImplemented)
      }
    }
  }

  private func shareExportFile(args: [String: Any]?, result: @escaping FlutterResult) {
    guard let typedData = args?["bytes"] as? FlutterStandardTypedData else {
      result(FlutterError(code: "INVALID_ARGS", message: "Missing file bytes to share.", details: nil))
      return
    }
    let rawName = (args?["fileName"] as? String) ?? "report.xls"
    let safeName = rawName.replacingOccurrences(of: "[^a-zA-Z0-9._-]", with: "_", options: .regularExpression)
    let outUrl = FileManager.default.temporaryDirectory.appendingPathComponent(safeName)
    do {
      try typedData.data.write(to: outUrl, options: .atomic)
      guard let root = window?.rootViewController else {
        result(FlutterError(code: "NO_VIEW", message: "No active view controller.", details: nil))
        return
      }
      let activity = UIActivityViewController(activityItems: [outUrl], applicationActivities: nil)
      if let pop = activity.popoverPresentationController {
        pop.sourceView = root.view
        pop.sourceRect = CGRect(x: root.view.bounds.midX, y: root.view.bounds.midY, width: 1, height: 1)
      }
      root.present(activity, animated: true)
      result(outUrl.path)
    } catch {
      result(FlutterError(code: "SHARE_ERROR", message: error.localizedDescription, details: nil))
    }
  }

  private func openDocumentPicker(args: [String: Any]?, result: @escaping FlutterResult) {
    if pendingPickerResult != nil {
      result(FlutterError(code: "ALREADY_ACTIVE", message: "A file picker is already open.", details: nil))
      return
    }
    let mimeTypes = (args?["mimeTypes"] as? [String]) ?? ["*/*"]
    var contentTypes: [UTType] = []
    for mime in mimeTypes {
      if mime == "image/*" {
        contentTypes.append(.image)
      } else if mime == "video/*" {
        contentTypes.append(.movie)
      } else if mime == "application/pdf" {
        contentTypes.append(.pdf)
      } else if let ut = UTType(mimeType: mime) {
        contentTypes.append(ut)
      }
    }
    if contentTypes.isEmpty {
      contentTypes = [.data, .pdf, .image, .movie]
    }
    guard let root = window?.rootViewController else {
      result(FlutterError(code: "NO_VIEW", message: "No active view controller.", details: nil))
      return
    }
    pendingPickerResult = result
    let picker = UIDocumentPickerViewController(forOpeningContentTypes: contentTypes, asCopy: true)
    picker.delegate = self
    picker.allowsMultipleSelection = false
    root.present(picker, animated: true)
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    let result = pendingPickerResult
    pendingPickerResult = nil
    guard let url = urls.first else {
      result?(nil)
      return
    }
    let fileSize = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
    result?([
      "path": url.path,
      "name": url.lastPathComponent,
      "size": fileSize,
    ])
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    let result = pendingPickerResult
    pendingPickerResult = nil
    result?(nil)
  }
}
