import 'dart:convert';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;

import '../config/app_config.dart';

/// Resolved attachment binary payload ready to save, open, or share natively.
class ResolvedAttachment {
  const ResolvedAttachment({
    required this.fileName,
    required this.bytes,
    required this.mimeType,
  });

  final String fileName;
  final Uint8List bytes;
  final String mimeType;
}

/// Thrown when an attachment cannot be downloaded (for example, a legacy Web
/// placeholder `#` or expired browser `blob:` URL, or HTTP failure).
class AttachmentUnavailableException implements Exception {
  const AttachmentUnavailableException(this.message);
  final String message;

  @override
  String toString() => message;
}

/// Shares, opens, and saves export/attachment files via the native Android
/// `MediaStore` / `FileProvider` and iOS `UIActivityViewController`
/// MethodChannel without requiring external AGP-incompatible plugins.
class FileShareHelper {
  const FileShareHelper._();

  static const _channel = MethodChannel('com.businz.hrms/document_picker');

  static Future<String?> shareBytes({
    required String fileName,
    required Uint8List bytes,
    required String mimeType,
  }) =>
      _channel.invokeMethod<String>('shareFile', {
        'fileName': fileName,
        'mimeType': mimeType,
        'bytes': bytes,
      });

  /// Saves [bytes] directly to the device's Downloads folder on Android
  /// (MediaStore Downloads on API 29+, no storage permission needed) or opens
  /// the native Save/Share sheet on iOS. Falls back to [shareBytes] if needed.
  static Future<String?> saveToDownloads({
    required String fileName,
    required Uint8List bytes,
    required String mimeType,
  }) async {
    try {
      return await _channel.invokeMethod<String>('saveToDownloads', {
        'fileName': fileName,
        'mimeType': mimeType,
        'bytes': bytes,
      });
    } on MissingPluginException {
      return shareBytes(fileName: fileName, bytes: bytes, mimeType: mimeType);
    }
  }

  /// Opens [bytes] in an installed viewer app (Gallery, PDF reader, Office)
  /// via `Intent.ACTION_VIEW`, falling back to the system share sheet.
  static Future<String?> openBytes({
    required String fileName,
    required Uint8List bytes,
    required String mimeType,
  }) async {
    try {
      return await _channel.invokeMethod<String>('openFile', {
        'fileName': fileName,
        'mimeType': mimeType,
        'bytes': bytes,
      });
    } on MissingPluginException {
      return shareBytes(fileName: fileName, bytes: bytes, mimeType: mimeType);
    }
  }

  /// Picks a document (PDF, Office, image, etc.) using the native OS file
  /// picker. Returns `{path, name, size}` or `null` when cancelled.
  static Future<Map<String, dynamic>?> pickDocument({
    List<String> mimeTypes = const [
      'application/pdf',
      'image/*',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'text/plain',
    ],
  }) async {
    final result = await _channel.invokeMapMethod<String, dynamic>(
      'pickDocument',
      {'mimeTypes': mimeTypes},
    );
    return result == null ? null : Map<String, dynamic>.from(result);
  }

  /// Returns true when [rawUrl] is an empty, `#`, or browser-only `blob:`
  /// placeholder that cannot be downloaded on mobile.
  static bool isUnavailablePlaceholderUrl(String rawUrl) {
    final trimmed = rawUrl.trim().toLowerCase();
    return trimmed.isEmpty ||
        trimmed == '#' ||
        trimmed == 'about:blank' ||
        trimmed.startsWith('blob:');
  }

  /// Infers a clean MIME type from [explicitMime] or [fileName] extension.
  static String detectMimeType(String fileName, {String? explicitMime}) {
    final cleanExplicit =
        (explicitMime ?? '').split(';').first.trim().toLowerCase();
    if (cleanExplicit.contains('/') &&
        cleanExplicit != 'application/octet-stream' &&
        cleanExplicit != '*/*') {
      return cleanExplicit;
    }
    final cleanName = fileName.split('?').first.trim().toLowerCase();
    if (cleanName.endsWith('.png')) return 'image/png';
    if (cleanName.endsWith('.jpg') || cleanName.endsWith('.jpeg')) {
      return 'image/jpeg';
    }
    if (cleanName.endsWith('.webp')) return 'image/webp';
    if (cleanName.endsWith('.gif')) return 'image/gif';
    if (cleanName.endsWith('.bmp')) return 'image/bmp';
    if (cleanName.endsWith('.pdf')) return 'application/pdf';
    if (cleanName.endsWith('.xls')) return 'application/vnd.ms-excel';
    if (cleanName.endsWith('.xlsx')) {
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    if (cleanName.endsWith('.csv')) return 'text/csv';
    if (cleanName.endsWith('.doc')) return 'application/msword';
    if (cleanName.endsWith('.docx')) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    if (cleanName.endsWith('.ppt')) return 'application/vnd.ms-powerpoint';
    if (cleanName.endsWith('.pptx')) {
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    }
    if (cleanName.endsWith('.txt') || cleanName.endsWith('.log')) {
      return 'text/plain';
    }
    if (cleanName.endsWith('.json')) return 'application/json';
    if (cleanName.endsWith('.zip')) return 'application/zip';
    if (cleanName.endsWith('.mp4')) return 'video/mp4';
    return 'application/octet-stream';
  }

  /// Ensures [fileName] ends with an appropriate extension for [mimeType].
  static String ensureFileExtension(String fileName, String mimeType) {
    final trimmed = fileName.trim().isEmpty ? 'attachment' : fileName.trim();
    final dotIdx = trimmed.lastIndexOf('.');
    if (dotIdx > 0 && dotIdx < trimmed.length - 1) {
      final ext = trimmed.substring(dotIdx + 1);
      if (ext.length <= 5 && RegExp(r'^[a-zA-Z0-9]+$').hasMatch(ext)) {
        return trimmed;
      }
    }
    const extByMime = <String, String>{
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'application/pdf': '.pdf',
      'application/vnd.ms-excel': '.xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
          '.xlsx',
      'text/csv': '.csv',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
          '.docx',
      'text/plain': '.txt',
      'application/json': '.json',
      'application/zip': '.zip',
      'video/mp4': '.mp4',
    };
    final ext = extByMime[mimeType.toLowerCase()];
    return ext != null ? '$trimmed$ext' : trimmed;
  }

  /// Returns true when the attachment appears to be an image based on MIME,
  /// data URI prefix, or file extension.
  static bool isImageAttachment({
    required String fileName,
    String? mimeType,
    String? rawUrl,
  }) {
    final lowerUrl = (rawUrl ?? '').trim().toLowerCase();
    if (lowerUrl.startsWith('data:image/')) return true;
    final lowerMime = (mimeType ?? '').trim().toLowerCase();
    if (lowerMime.startsWith('image/')) return true;
    final cleanName = fileName.split('?').first.trim().toLowerCase();
    return cleanName.endsWith('.png') ||
        cleanName.endsWith('.jpg') ||
        cleanName.endsWith('.jpeg') ||
        cleanName.endsWith('.webp') ||
        cleanName.endsWith('.gif') ||
        cleanName.endsWith('.bmp');
  }

  /// Decodes a `data:` URI or downloads a remote/relative server URL into raw
  /// bytes ready to save to Downloads, open, or share.
  static Future<ResolvedAttachment> resolveAttachmentBytes({
    required String fileName,
    required String rawUrl,
    String? mimeType,
    String? baseOrigin,
    String? authToken,
    http.Client? client,
  }) async {
    final trimmed = rawUrl.trim();
    if (trimmed.isEmpty || trimmed == '#' || trimmed.toLowerCase() == 'about:blank') {
      throw const AttachmentUnavailableException(
        'This file was not saved to the server (legacy upload size limit). Please re-upload it to download.',
      );
    }
    if (trimmed.toLowerCase().startsWith('blob:')) {
      throw const AttachmentUnavailableException(
        'This file was attached as a temporary browser link on Web. Please re-upload it to download on mobile.',
      );
    }

    if (trimmed.toLowerCase().startsWith('data:')) {
      final commaIndex = trimmed.indexOf(',');
      if (commaIndex < 0 || commaIndex >= trimmed.length - 1) {
        throw const AttachmentUnavailableException(
          'Attachment data is incomplete and cannot be downloaded.',
        );
      }
      final meta = trimmed.substring(5, commaIndex);
      final metaParts = meta.split(';');
      final dataMime =
          metaParts.isNotEmpty && metaParts.first.contains('/')
              ? metaParts.first.trim().toLowerCase()
              : null;
      final isBase64 = metaParts.any((p) => p.trim().toLowerCase() == 'base64');
      final payload = trimmed.substring(commaIndex + 1);
      late final Uint8List bytes;
      try {
        if (isBase64) {
          bytes = base64Decode(payload.replaceAll(RegExp(r'\s+'), ''));
        } else {
          bytes = Uint8List.fromList(utf8.encode(Uri.decodeFull(payload)));
        }
      } catch (_) {
        throw const AttachmentUnavailableException(
          'Attachment file content is corrupted and cannot be decoded.',
        );
      }
      if (bytes.isEmpty) {
        throw const AttachmentUnavailableException(
          'Attachment file is empty.',
        );
      }
      final resolvedMime = detectMimeType(
        fileName,
        explicitMime: dataMime ?? mimeType,
      );
      return ResolvedAttachment(
        fileName: ensureFileExtension(fileName, resolvedMime),
        bytes: bytes,
        mimeType: resolvedMime,
      );
    }

    final origin =
        (baseOrigin ?? AppConfig.apiOrigin).replaceFirst(RegExp(r'/$'), '');
    final lower = trimmed.toLowerCase();
    final resolvedUrl =
        (lower.startsWith('http://') || lower.startsWith('https://'))
            ? trimmed
            : '$origin${trimmed.startsWith('/') ? trimmed : '/$trimmed'}';
    final uri = Uri.tryParse(resolvedUrl);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      throw const AttachmentUnavailableException(
        'Attachment link is invalid.',
      );
    }

    final originUri = Uri.tryParse(origin);
    final sameOrigin =
        originUri != null && uri.host.toLowerCase() == originUri.host.toLowerCase();
    final headers = <String, String>{
      if (sameOrigin && authToken != null && authToken.isNotEmpty)
        'Authorization': 'Bearer $authToken',
    };

    final localClient = client == null ? http.Client() : null;
    final activeClient = client ?? localClient!;
    try {
      final response = await activeClient
          .get(uri, headers: headers.isEmpty ? null : headers)
          .timeout(AppConfig.requestTimeout);
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw AttachmentUnavailableException(
          'Unable to download attachment (HTTP ${response.statusCode}).',
        );
      }
      if (response.bodyBytes.isEmpty) {
        throw const AttachmentUnavailableException(
          'Downloaded attachment was empty.',
        );
      }
      final headerMime = response.headers['content-type'];
      final resolvedMime = detectMimeType(
        fileName,
        explicitMime: (mimeType != null && mimeType.trim().isNotEmpty)
            ? mimeType
            : headerMime,
      );
      return ResolvedAttachment(
        fileName: ensureFileExtension(fileName, resolvedMime),
        bytes: response.bodyBytes,
        mimeType: resolvedMime,
      );
    } on AttachmentUnavailableException {
      rethrow;
    } catch (_) {
      throw const AttachmentUnavailableException(
        'Unable to download attachment. Check your internet connection and try again.',
      );
    } finally {
      localClient?.close();
    }
  }

  /// Builds a clean Excel-compatible SpreadsheetML 2003 XML (`.xls`) document
  /// that opens natively in Microsoft Excel, Google Sheets, WPS Office, and
  /// Apple Numbers with styled title banner, bold teal column headers, and
  /// typed text/number cells.
  static Uint8List buildExcelSpreadsheetXml({
    required String sheetName,
    required String title,
    required String subtitle,
    required List<String> headers,
    required List<List<String>> rows,
  }) {
    final safeSheet = sheetName
        .replaceAll(RegExp(r'[:\\/?*\[\]]'), ' ')
        .trim()
        .padRight(1, 'R');
    final trimmedSheet =
        safeSheet.length > 31 ? safeSheet.substring(0, 31) : safeSheet;

    final buf = StringBuffer()
      ..writeln('<?xml version="1.0" encoding="UTF-8"?>')
      ..writeln('<?mso-application progid="Excel.Sheet"?>')
      ..writeln(
        '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"'
        ' xmlns:o="urn:schemas-microsoft-com:office:office"'
        ' xmlns:x="urn:schemas-microsoft-com:office:excel"'
        ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
      )
      ..writeln('<Styles>')
      ..writeln(
        '<Style ss:ID="Title">'
        '<Font ss:Bold="1" ss:Size="13" ss:Color="#0E7490"/>'
        '</Style>',
      )
      ..writeln(
        '<Style ss:ID="Sub">'
        '<Font ss:Size="10" ss:Color="#64748B"/>'
        '</Style>',
      )
      ..writeln(
        '<Style ss:ID="Header">'
        '<Font ss:Bold="1" ss:Size="10" ss:Color="#FFFFFF"/>'
        '<Interior ss:Color="#0E7490" ss:Pattern="Solid"/>'
        '<Borders>'
        '<Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>'
        '</Borders>'
        '</Style>',
      )
      ..writeln(
        '<Style ss:ID="Cell">'
        '<Font ss:Size="10" ss:Color="#1E293B"/>'
        '<Borders>'
        '<Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>'
        '</Borders>'
        '</Style>',
      )
      ..writeln(
        '<Style ss:ID="CellAlt">'
        '<Font ss:Size="10" ss:Color="#1E293B"/>'
        '<Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>'
        '<Borders>'
        '<Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>'
        '</Borders>'
        '</Style>',
      )
      ..writeln('</Styles>')
      ..writeln('<Worksheet ss:Name="${_xmlEscape(trimmedSheet)}">')
      ..writeln('<Table>');

    for (var c = 0; c < headers.length; c++) {
      final width = c == 1 ? 140 : 100;
      buf.writeln('<Column ss:AutoFitWidth="1" ss:Width="$width"/>');
    }

    // Title + subtitle rows
    buf
      ..writeln('<Row ss:Height="24">')
      ..writeln(
        '<Cell ss:StyleID="Title"><Data ss:Type="String">${_xmlEscape(title)}</Data></Cell>',
      )
      ..writeln('</Row>')
      ..writeln('<Row ss:Height="18">')
      ..writeln(
        '<Cell ss:StyleID="Sub"><Data ss:Type="String">${_xmlEscape(subtitle)}</Data></Cell>',
      )
      ..writeln('</Row>')
      ..writeln('<Row ss:Height="8"/>');

    // Column headers
    buf.writeln('<Row ss:Height="22">');
    for (final h in headers) {
      buf.writeln(
        '<Cell ss:StyleID="Header"><Data ss:Type="String">${_xmlEscape(h)}</Data></Cell>',
      );
    }
    buf.writeln('</Row>');

    // Data rows
    for (var i = 0; i < rows.length; i++) {
      final row = rows[i];
      final style = i.isEven ? 'Cell' : 'CellAlt';
      buf.writeln('<Row ss:Height="20">');
      for (final cell in row) {
        buf.writeln(
          '<Cell ss:StyleID="$style"><Data ss:Type="String">${_xmlEscape(cell)}</Data></Cell>',
        );
      }
      buf.writeln('</Row>');
    }

    buf
      ..writeln('</Table>')
      ..writeln('</Worksheet>')
      ..writeln('</Workbook>');

    return Uint8List.fromList(utf8.encode(buf.toString()));
  }

  static String _xmlEscape(String input) => input
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;');
}
