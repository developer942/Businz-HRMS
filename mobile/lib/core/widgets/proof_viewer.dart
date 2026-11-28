import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../config/app_config.dart';
import '../theme/app_tokens.dart';
import '../utils/file_share_helper.dart';

/// Describes a bill, receipt, or payment proof attachment that can be previewed.
class ProofAttachment {
  const ProofAttachment({
    required this.title,
    required this.url,
    this.subtitle,
  });

  final String title;
  final String url;
  final String? subtitle;
}

/// Resolves relative server URLs (e.g. `/uploads/...`) into absolute HTTPS URLs,
/// while preserving `data:` URIs and full `http(s)://` URLs.
String resolveProofUrl(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return '';
  final lower = trimmed.toLowerCase();
  if (lower.startsWith('data:') ||
      lower.startsWith('http://') ||
      lower.startsWith('https://')) {
    return trimmed;
  }
  final origin = AppConfig.apiOrigin.replaceFirst(RegExp(r'/$'), '');
  final path = trimmed.startsWith('/') ? trimmed : '/$trimmed';
  return '$origin$path';
}

/// Returns true when the proof URL or data URI represents a PDF document.
bool isPdfProof(String raw) {
  final lower = raw.trim().toLowerCase();
  return lower.contains('application/pdf') ||
      lower.endsWith('.pdf') ||
      lower.contains('.pdf?');
}

/// Decodes a `data:image/...;base64,...` URI into raw bytes, or returns null.
Uint8List? tryDecodeDataUriBytes(String raw) {
  final trimmed = raw.trim();
  if (!trimmed.toLowerCase().startsWith('data:')) return null;
  final commaIndex = trimmed.indexOf(',');
  if (commaIndex < 0 || commaIndex >= trimmed.length - 1) return null;
  final payload = trimmed.substring(commaIndex + 1).replaceAll(RegExp(r'\s+'), '');
  try {
    return base64Decode(payload);
  } catch (_) {
    return null;
  }
}

/// Compact pill button that opens a single proof attachment in the full-screen viewer.
class ProofAttachmentChip extends ConsumerWidget {
  const ProofAttachmentChip({
    super.key,
    required this.title,
    required this.url,
    this.subtitle,
    this.label = 'View Proof',
    this.compact = false,
  });

  final String title;
  final String url;
  final String? subtitle;
  final String label;
  final bool compact;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final trimmed = url.trim();
    if (trimmed.isEmpty) return const SizedBox.shrink();
    final pdf = isPdfProof(trimmed);

    return Material(
      color: AppTokens.brandTint,
      borderRadius: BorderRadius.circular(AppTokens.radiusPill),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppTokens.radiusPill),
        onTap: () => showProofViewerDialog(
          context,
          ref: ref,
          proofs: [ProofAttachment(title: title, url: trimmed, subtitle: subtitle)],
        ),
        child: Padding(
          padding: EdgeInsets.symmetric(
            horizontal: compact ? 10 : 12,
            vertical: compact ? 6 : 8,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                pdf ? Icons.picture_as_pdf_outlined : Icons.receipt_long_rounded,
                size: compact ? 14 : 16,
                color: AppTokens.brandPrimary,
              ),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  fontSize: compact ? 11.5 : 12.5,
                  fontWeight: FontWeight.w700,
                  color: AppTokens.brandPrimary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Opens a full-screen interactive proof/receipt viewer supporting base64 data URIs,
/// authenticated server paths, external HTTPS URLs, and multi-proof galleries.
Future<void> showProofViewerDialog(
  BuildContext context, {
  required WidgetRef ref,
  required List<ProofAttachment> proofs,
  int initialIndex = 0,
}) async {
  final validProofs = proofs
      .where((p) => p.url.trim().isNotEmpty)
      .toList(growable: false);
  if (validProofs.isEmpty) return;

  String? token;
  try {
    token = await ref.read(apiClientProvider).readAccessToken();
  } catch (_) {
    token = null;
  }
  if (!context.mounted) return;

  await showDialog<void>(
    context: context,
    barrierColor: Colors.black87,
    builder: (context) => _ProofGalleryDialog(
      proofs: validProofs,
      initialIndex: initialIndex.clamp(0, validProofs.length - 1),
      authToken: token,
    ),
  );
}

class _ProofGalleryDialog extends StatefulWidget {
  const _ProofGalleryDialog({
    required this.proofs,
    required this.initialIndex,
    this.authToken,
  });

  final List<ProofAttachment> proofs;
  final int initialIndex;
  final String? authToken;

  @override
  State<_ProofGalleryDialog> createState() => _ProofGalleryDialogState();
}

class _ProofGalleryDialogState extends State<_ProofGalleryDialog> {
  late int _index;
  bool _downloading = false;

  @override
  void initState() {
    super.initState();
    _index = widget.initialIndex;
  }

  Future<void> _downloadCurrent(ProofAttachment current) async {
    if (_downloading) return;
    setState(() => _downloading = true);
    try {
      final resolved = await FileShareHelper.resolveAttachmentBytes(
        fileName: current.title,
        rawUrl: current.url,
        authToken: widget.authToken,
      );
      await FileShareHelper.saveToDownloads(
        fileName: resolved.fileName,
        bytes: resolved.bytes,
        mimeType: resolved.mimeType,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text('Saved ${resolved.fileName} to Downloads'),
            action: SnackBarAction(
              label: 'Open',
              onPressed: () {
                FileShareHelper.openBytes(
                  fileName: resolved.fileName,
                  bytes: resolved.bytes,
                  mimeType: resolved.mimeType,
                );
              },
            ),
          ),
        );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(error.toString())));
    } finally {
      if (mounted) setState(() => _downloading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final current = widget.proofs[_index];
    final resolvedUrl = resolveProofUrl(current.url);
    final isPdf = isPdfProof(resolvedUrl);
    final dataBytes = isPdf ? null : tryDecodeDataUriBytes(resolvedUrl);
    final headers = <String, String>{
      if (widget.authToken != null && widget.authToken!.isNotEmpty)
        'Authorization': 'Bearer ${widget.authToken}',
    };

    return Dialog.fullscreen(
      backgroundColor: const Color(0xFF0B131E),
      child: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
              child: Row(
                children: [
                  Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(
                      isPdf
                          ? Icons.picture_as_pdf_rounded
                          : Icons.receipt_long_rounded,
                      color: Colors.white,
                      size: 20,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          current.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        if (current.subtitle != null &&
                            current.subtitle!.trim().isNotEmpty)
                          Text(
                            current.subtitle!,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.72),
                              fontSize: 12,
                            ),
                          ),
                      ],
                    ),
                  ),
                  if (widget.proofs.length > 1)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        '${_index + 1} / ${widget.proofs.length}',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  const SizedBox(width: 4),
                  if (!FileShareHelper.isUnavailablePlaceholderUrl(current.url))
                    IconButton(
                      tooltip: 'Download',
                      onPressed:
                          _downloading ? null : () => _downloadCurrent(current),
                      icon: _downloading
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Icon(
                              Icons.download_rounded,
                              color: Colors.white,
                            ),
                    ),
                  IconButton(
                    tooltip: 'Close',
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close_rounded, color: Colors.white),
                  ),
                ],
              ),
            ),
            Expanded(
              child: Center(
                child: isPdf
                    ? _PdfProofPlaceholder(
                        title: current.title,
                        subtitle: current.subtitle,
                        url: resolvedUrl,
                        downloading: _downloading,
                        onDownload: () => _downloadCurrent(current),
                      )
                    : InteractiveViewer(
                        minScale: 0.8,
                        maxScale: 5.0,
                        child: dataBytes != null
                            ? Image.memory(
                                dataBytes,
                                fit: BoxFit.contain,
                                errorBuilder: (_, __, ___) =>
                                    const _ProofLoadError(),
                              )
                            : resolvedUrl.toLowerCase().startsWith('data:')
                                ? const _ProofLoadError()
                                : Image.network(
                                    resolvedUrl,
                                    headers: headers.isEmpty ? null : headers,
                                    fit: BoxFit.contain,
                                    loadingBuilder: (context, child, progress) {
                                      if (progress == null) return child;
                                      return const Center(
                                        child: CircularProgressIndicator(
                                          color: Colors.white,
                                        ),
                                      );
                                    },
                                    errorBuilder: (_, __, ___) =>
                                        const _ProofLoadError(),
                                  ),
                      ),
              ),
            ),
            if (widget.proofs.length > 1)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    FilledButton.tonalIcon(
                      onPressed: _index > 0
                          ? () => setState(() => _index--)
                          : null,
                      icon: const Icon(Icons.chevron_left_rounded),
                      label: const Text('Previous'),
                    ),
                    FilledButton.tonalIcon(
                      onPressed: _index < widget.proofs.length - 1
                          ? () => setState(() => _index++)
                          : null,
                      icon: const Icon(Icons.chevron_right_rounded),
                      label: const Text('Next'),
                    ),
                  ],
                ),
              )
            else
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                child: Text(
                  isPdf
                      ? 'PDF attachment verified'
                      : 'Pinch to zoom · Drag to inspect receipt details',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.65),
                    fontSize: 12,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _PdfProofPlaceholder extends StatelessWidget {
  const _PdfProofPlaceholder({
    required this.title,
    required this.url,
    this.subtitle,
    this.downloading = false,
    this.onDownload,
  });

  final String title;
  final String url;
  final String? subtitle;
  final bool downloading;
  final VoidCallback? onDownload;

  @override
  Widget build(BuildContext context) {
    final bytes = tryDecodeDataUriBytes(url);
    final sizeKb = bytes != null ? (bytes.length / 1024).toStringAsFixed(1) : null;
    return Container(
      margin: const EdgeInsets.all(24),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.16)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.picture_as_pdf_rounded,
            size: 56,
            color: Color(0xFF38BDF8),
          ),
          const SizedBox(height: 14),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
          if (subtitle != null && subtitle!.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              subtitle!,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.72),
                fontSize: 13,
              ),
            ),
          ],
          const SizedBox(height: 10),
          Text(
            sizeKb != null
                ? 'PDF document ready ($sizeKb KB).'
                : 'PDF document ready to download.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.75),
              fontSize: 12.5,
            ),
          ),
          if (onDownload != null) ...[
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: downloading ? null : onDownload,
              style: FilledButton.styleFrom(
                backgroundColor: AppTokens.brandPrimary,
                foregroundColor: Colors.white,
              ),
              icon: downloading
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.download_rounded, size: 18),
              label: Text(downloading ? 'Downloading…' : 'Download PDF'),
            ),
          ],
        ],
      ),
    );
  }
}

class _ProofLoadError extends StatelessWidget {
  const _ProofLoadError();

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(24),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.broken_image_outlined,
            size: 48,
            color: Colors.white.withValues(alpha: 0.75),
          ),
          const SizedBox(height: 12),
          const Text(
            'Unable to render receipt preview',
            style: TextStyle(
              color: Colors.white,
              fontSize: 15,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'The attached file may be unavailable or in an unsupported image format.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.7),
              fontSize: 12.5,
            ),
          ),
        ],
      ),
    );
  }
}
