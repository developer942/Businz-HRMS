import 'dart:convert';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:intl/intl.dart';
import 'package:uuid/uuid.dart';

import '../../../app/providers.dart';
import '../../../core/theme/app_tokens.dart';
import '../../auth/application/auth_controller.dart';

/// Direct full-screen Front Camera Face Attendance screen.
/// When [autoPunch] is true (default), tapping Face Attendance opens the camera
/// immediately, loads today's shift state & GPS in parallel, captures the photo
/// on shutter tap, submits verified Punch In / Punch Out, and shows a crisp
/// "Successfully Punched In / Out" confirmation before returning to Home.
class FaceCaptureScreen extends ConsumerStatefulWidget {
  const FaceCaptureScreen({super.key, this.autoPunch = false});

  final bool autoPunch;

  @override
  ConsumerState<FaceCaptureScreen> createState() => _FaceCaptureScreenState();
}

class _FaceCaptureScreenState extends ConsumerState<FaceCaptureScreen>
    with WidgetsBindingObserver {
  CameraController? _controller;
  bool _capturing = false;
  String? _statusStep;
  String? _error;

  // Auto-punch shift status & pre-warmed GPS
  Map<String, dynamic>? _shiftStatus;
  bool _loadingShift = false;
  Position? _prewarmedPosition;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initialize();
    if (widget.autoPunch) {
      _loadShiftAndPrewarmGps();
    }
  }

  Future<void> _loadShiftAndPrewarmGps() async {
    setState(() => _loadingShift = true);
    try {
      final user = ref.read(authControllerProvider).value ??
          await ref.read(authControllerProvider.future);
      if (user != null) {
        final raw =
            await ref.read(hrmsRepositoryProvider).shiftStatus(user.employeeId);
        final data = raw['data'] is Map
            ? Map<String, dynamic>.from(raw['data'] as Map)
            : Map<String, dynamic>.from(raw);
        if (mounted) {
          setState(() => _shiftStatus = data);
        }
      }
    } catch (_) {
      // If status fails to preload, we re-fetch on capture tap.
    } finally {
      if (mounted) setState(() => _loadingShift = false);
    }

    // Pre-warm GPS silently in background so punch is near-instant on tap
    try {
      if (await Geolocator.isLocationServiceEnabled()) {
        final perm = await Geolocator.checkPermission();
        if (perm == LocationPermission.always ||
            perm == LocationPermission.whileInUse) {
          final pos = await Geolocator.getCurrentPosition(
            locationSettings: const LocationSettings(
              accuracy: LocationAccuracy.high,
              timeLimit: Duration(seconds: 12),
            ),
          );
          if (mounted) _prewarmedPosition = pos;
        }
      }
    } catch (_) {
      // GPS will be requested interactively when capturing if needed.
    }
  }

  Future<void> _initialize() async {
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        throw CameraException('NO_CAMERA', 'No camera was found.');
      }
      final selected = cameras.firstWhere(
        (camera) => camera.lensDirection == CameraLensDirection.front,
        orElse: () => cameras.first,
      );
      final controller = CameraController(
        selected,
        ResolutionPreset.medium,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );
      await controller.initialize();
      if (!mounted) {
        await controller.dispose();
        return;
      }
      setState(() => _controller = controller);
    } on CameraException catch (error) {
      if (mounted) setState(() => _error = _friendly(error));
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) return;
    if (state == AppLifecycleState.inactive) {
      controller.dispose();
      _controller = null;
    } else if (state == AppLifecycleState.resumed) {
      _initialize();
    }
  }

  Future<Position> _resolvePosition() async {
    if (_prewarmedPosition != null) {
      final age = DateTime.now()
          .difference(_prewarmedPosition!.timestamp)
          .inSeconds
          .abs();
      if (age <= 45) return _prewarmedPosition!;
    }
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw Exception('Turn on device location services to record attendance.');
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied) {
      throw Exception('Location permission is required for attendance.');
    }
    if (permission == LocationPermission.deniedForever) {
      throw Exception(
          'Location access is blocked. Enable it from device settings.');
    }
    return Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        timeLimit: Duration(seconds: 25),
      ),
    );
  }

  Future<void> _capture() async {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized || _capturing) {
      return;
    }
    setState(() {
      _capturing = true;
      _statusStep = 'Capturing photo…';
    });
    try {
      final file = await controller.takePicture();
      final bytes = await file.readAsBytes();
      final photoBase64 = base64Encode(bytes);

      if (!widget.autoPunch) {
        if (mounted) Navigator.pop(context, photoBase64);
        return;
      }

      final user = ref.read(authControllerProvider).value ??
          await ref.read(authControllerProvider.future);
      if (user == null) {
        throw Exception('Please sign in again to record attendance.');
      }

      final repo = ref.read(hrmsRepositoryProvider);
      var status = _shiftStatus;
      if (status == null) {
        if (mounted) setState(() => _statusStep = 'Checking shift status…');
        final raw = await repo.shiftStatus(user.employeeId);
        status = raw['data'] is Map
            ? Map<String, dynamic>.from(raw['data'] as Map)
            : Map<String, dynamic>.from(raw);
        if (mounted) _shiftStatus = status;
      }

      final canOut = status['canCheckOut'] == true;
      final canIn = status['canCheckIn'] == true;
      if (!canIn && !canOut) {
        final msg = (status['message'] ?? '').toString().trim();
        throw Exception(
          msg.isNotEmpty
              ? msg
              : 'Today\'s attendance shift is already completed.',
        );
      }

      if (mounted) setState(() => _statusStep = 'Getting verified GPS…');
      final location = await _resolvePosition();

      if (mounted) setState(() => _statusStep = 'Verifying face…');
      await repo.verifyFace(user.employeeId, photoBase64);

      if (mounted) {
        setState(() => _statusStep =
            canOut ? 'Recording Punch Out…' : 'Recording Punch In…');
      }
      final result = await repo.punch({
        'employeeId': user.employeeId,
        'type': canOut ? 'OUT' : 'IN',
        'method': 'Face Recognition',
        'locationLat': location.latitude,
        'locationLng': location.longitude,
        'accuracyMeters': location.accuracy,
        'locationTimestamp': location.timestamp.toUtc().toIso8601String(),
        'locationAddress': 'Device GPS',
        'photoBase64': photoBase64,
        'idempotencyKey': const Uuid().v4(),
        'gpsReadingAgeMs':
            DateTime.now().difference(location.timestamp).inMilliseconds.abs(),
        'gpsSampleCount': 1,
        'browserDeviceCategory': 'Flutter Mobile',
        if (status['shiftDate'] != null) 'shiftDate': status['shiftDate'],
        if (status['assignedShift'] is Map &&
            status['assignedShift']['id'] != null)
          'shiftId': status['assignedShift']['id'],
      });

      if (!mounted) return;
      final data = result['data'];
      final record =
          data is Map ? Map<String, dynamic>.from(data) : <String, dynamic>{};
      final rawTime = canOut
          ? record['checkOut'] ?? record['check_out']
          : record['checkIn'] ?? record['check_in'];
      final formattedTime = rawTime == null
          ? DateFormat('hh:mm a').format(DateTime.now())
          : _formatTime(rawTime.toString());

      ref.read(attendanceSyncTickProvider.notifier).state++;
      ref.read(homeRefreshTickProvider.notifier).state++;

      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (ctx) => AlertDialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppTokens.radiusDialog),
          ),
          icon: Container(
            width: 64,
            height: 64,
            decoration: const BoxDecoration(
              color: AppTokens.successBg,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.check_circle_rounded,
              color: AppTokens.brandEmerald,
              size: 42,
            ),
          ),
          title: Text(
            canOut ? 'Successfully Punched Out' : 'Successfully Punched In',
            textAlign: TextAlign.center,
            style: const TextStyle(fontWeight: FontWeight.w800),
          ),
          content: Text(
            'Verified at $formattedTime',
            textAlign: TextAlign.center,
          ),
          actionsAlignment: MainAxisAlignment.center,
          actions: [
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Done'),
              ),
            ),
          ],
        ),
      );
      if (mounted) Navigator.pop(context, true);
    } on CameraException catch (error) {
      if (mounted) setState(() => _error = _friendly(error));
    } catch (error) {
      if (mounted) {
        final message = error.toString().replaceFirst('Exception: ', '');
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(message),
            backgroundColor: Theme.of(context).colorScheme.error,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _capturing = false;
          _statusStep = null;
        });
      }
    }
  }

  static String _formatTime(String value) {
    final parsed = DateTime.tryParse(value);
    return parsed == null
        ? value
        : DateFormat('hh:mm a').format(parsed.toLocal());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    final canOut = _shiftStatus?['canCheckOut'] == true;
    final canIn = _shiftStatus?['canCheckIn'] == true;
    final isCompleted = widget.autoPunch &&
        _shiftStatus != null &&
        !canIn &&
        !canOut;
    final actionBadge = !widget.autoPunch
        ? 'Face Verification'
        : _loadingShift
            ? 'Face Attendance'
            : canOut
                ? 'Punch Out'
                : isCompleted
                    ? 'Shift Completed'
                    : 'Punch In';

    return Scaffold(
      backgroundColor: Colors.black,
      body: _error != null
          ? _CameraError(
              message: _error!,
              onRetry: () {
                setState(() => _error = null);
                _initialize();
              },
            )
          : controller == null || !controller.value.isInitialized
              ? const Center(
                  child: CircularProgressIndicator(color: Colors.white),
                )
              : Stack(
                  fit: StackFit.expand,
                  children: [
                    ClipRect(
                      child: _FullScreenPreview(controller: controller),
                    ),
                    const DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            Color(0x99000000),
                            Colors.transparent,
                            Colors.transparent,
                            Color(0xC8000000),
                          ],
                          stops: [0, .22, .64, 1],
                        ),
                      ),
                    ),
                    // Subtle Neo-Bento Face Alignment Oval Guide
                    IgnorePointer(
                      child: Center(
                        child: Container(
                          width: 248,
                          height: 304,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(140),
                            border: Border.all(
                              color: (canOut
                                      ? AppTokens.brandPrimary
                                      : AppTokens.brandEmerald)
                                  .withValues(alpha: 0.85),
                              width: 2.5,
                            ),
                          ),
                        ),
                      ),
                    ),
                    SafeArea(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(16, 10, 16, 28),
                        child: Column(
                          children: [
                            Row(
                              children: [
                                IconButton.filledTonal(
                                  onPressed: _capturing
                                      ? null
                                      : () => Navigator.pop(context),
                                  style: IconButton.styleFrom(
                                    backgroundColor: const Color(0x73000000),
                                    foregroundColor: Colors.white,
                                  ),
                                  icon: const Icon(Icons.close_rounded),
                                  tooltip: 'Close camera',
                                ),
                                Expanded(
                                  child: Text(
                                    actionBadge,
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 18,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 48),
                              ],
                            ),
                            const Spacer(),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 8,
                              ),
                              decoration: BoxDecoration(
                                color: const Color(0x88000000),
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text(
                                _capturing
                                    ? (_statusStep ?? 'Verifying…')
                                    : isCompleted
                                        ? 'Today\'s shift is already completed'
                                        : widget.autoPunch
                                            ? (canOut
                                                ? 'Tap button to Punch Out'
                                                : 'Tap button to Punch In')
                                            : 'Align your face inside the oval & tap capture',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                            const SizedBox(height: 18),
                            if (isCompleted)
                              FilledButton(
                                onPressed: () => Navigator.pop(context),
                                child: const Text('Back to Home'),
                              )
                            else
                              Semantics(
                                button: true,
                                label: canOut
                                    ? 'Capture & Punch Out'
                                    : 'Capture & Punch In',
                                child: InkWell(
                                  onTap: _capturing ? null : _capture,
                                  customBorder: const CircleBorder(),
                                  child: Container(
                                    width: 82,
                                    height: 82,
                                    padding: const EdgeInsets.all(5),
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      border: Border.all(
                                        color: Colors.white,
                                        width: 3.5,
                                      ),
                                    ),
                                    child: DecoratedBox(
                                      decoration: BoxDecoration(
                                        shape: BoxShape.circle,
                                        gradient: _capturing
                                            ? null
                                            : LinearGradient(
                                                colors: canOut
                                                    ? const [
                                                        AppTokens.brandOcean,
                                                        AppTokens.brandPrimary,
                                                      ]
                                                    : const [
                                                        AppTokens.brandEmerald,
                                                        AppTokens.brandPrimary,
                                                      ],
                                              ),
                                        color:
                                            _capturing ? Colors.white54 : null,
                                      ),
                                      child: _capturing
                                          ? const Padding(
                                              padding: EdgeInsets.all(18),
                                              child: CircularProgressIndicator(
                                                strokeWidth: 3,
                                                color: Colors.white,
                                              ),
                                            )
                                          : const Icon(
                                              Icons.camera_alt_rounded,
                                              color: Colors.white,
                                              size: 32,
                                            ),
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
    );
  }

  static String _friendly(CameraException error) {
    if (error.code.toLowerCase().contains('denied')) {
      return 'Camera access is required for face attendance. Enable it in device settings.';
    }
    return error.description ?? 'The camera could not be opened.';
  }
}

class _FullScreenPreview extends StatelessWidget {
  const _FullScreenPreview({required this.controller});

  final CameraController controller;

  @override
  Widget build(BuildContext context) {
    final screen = MediaQuery.sizeOf(context);
    var scale = screen.aspectRatio * controller.value.aspectRatio;
    if (scale < 1) scale = 1 / scale;
    return Transform.scale(
      scale: scale,
      child: Center(child: CameraPreview(controller)),
    );
  }
}

class _CameraError extends StatelessWidget {
  const _CameraError({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.camera_alt_outlined,
                  color: Colors.white,
                  size: 42,
                ),
                const SizedBox(height: 16),
                Text(
                  message,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white),
                ),
                const SizedBox(height: 20),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextButton(
                      onPressed: () => Navigator.pop(context),
                      style: TextButton.styleFrom(
                        foregroundColor: Colors.white70,
                      ),
                      child: const Text('Close'),
                    ),
                    const SizedBox(width: 12),
                    OutlinedButton(
                      onPressed: onRetry,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: const BorderSide(color: Colors.white54),
                      ),
                      child: const Text('Try again'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      );
}
