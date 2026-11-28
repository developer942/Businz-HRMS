import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:uuid/uuid.dart';

import '../../../app/providers.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/widgets/businz_design_system.dart';
import '../../auth/application/auth_controller.dart';
import 'face_capture_screen.dart';

class AttendanceScreen extends ConsumerStatefulWidget {
  const AttendanceScreen({super.key});

  @override
  ConsumerState<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends ConsumerState<AttendanceScreen> {
  late Future<Map<String, dynamic>> _future;
  bool _submitting = false;
  String? _progress;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<Map<String, dynamic>> _load() async {
    final user = ref.read(authControllerProvider).value ??
        await ref.read(authControllerProvider.future);
    if (user == null) return const <String, dynamic>{};
    final response =
        await ref.read(hrmsRepositoryProvider).shiftStatus(user.employeeId);
    final data = response['data'];
    return data is Map ? Map<String, dynamic>.from(data) : response;
  }

  void _reload() => setState(() => _future = _load());

  Future<void> _punch(Map<String, dynamic> status) async {
    if (_submitting) return;
    final canOut = status['canCheckOut'] == true;
    final canIn = status['canCheckIn'] == true;
    if (!canIn && !canOut) return;

    final photo = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const FaceCaptureScreen()),
    );
    if (photo == null || !mounted) return;

    setState(() {
      _submitting = true;
      _progress = 'Getting verified GPS…';
    });
    try {
      final location = await _position();
      if (!mounted) return;
      setState(() => _progress = 'Verifying face & shift…');
      final user = ref.read(authControllerProvider).value!;
      await ref.read(hrmsRepositoryProvider).verifyFace(user.employeeId, photo);
      final result = await ref.read(hrmsRepositoryProvider).punch({
        'employeeId': user.employeeId,
        'type': canOut ? 'OUT' : 'IN',
        'method': 'Face Recognition',
        'locationLat': location.latitude,
        'locationLng': location.longitude,
        'accuracyMeters': location.accuracy,
        'locationTimestamp': location.timestamp.toUtc().toIso8601String(),
        'locationAddress': 'Device GPS',
        'photoBase64': photo,
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
      final time = canOut
          ? record['checkOut'] ?? record['check_out']
          : record['checkIn'] ?? record['check_in'];
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          icon: const Icon(
            Icons.check_circle_rounded,
            color: AppTokens.brandEmerald,
            size: 48,
          ),
          title: Text(canOut ? 'Punch Out Confirmed' : 'Punch In Confirmed'),
          content: Text(
            time == null
                ? 'Your attendance was confirmed by the server.'
                : 'Server timestamp: ${_formatTime(time.toString())}',
            textAlign: TextAlign.center,
          ),
          actions: [
            FilledButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Done'),
            ),
          ],
        ),
      );
      _reload();
      ref.read(attendanceSyncTickProvider.notifier).state++;
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(error.toString()),
            backgroundColor: Theme.of(context).colorScheme.error,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _submitting = false;
          _progress = null;
        });
      }
    }
  }

  Future<Position> _position() async {
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

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authControllerProvider).value;
    if (user == null) {
      return const BusinzLoadingSkeleton(itemCount: 3, height: 120);
    }
    final scheme = Theme.of(context).colorScheme;

    return FutureBuilder<Map<String, dynamic>>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const BusinzLoadingSkeleton(itemCount: 3, height: 120);
        }
        if (snapshot.hasError) {
          return BusinzErrorState(error: snapshot.error!, onRetry: _reload);
        }

        final status = snapshot.data ?? const <String, dynamic>{};
        final canOut = status['canCheckOut'] == true;
        final canIn = status['canCheckIn'] == true;
        final stateCode = (status['state'] ?? '').toString().trim().toUpperCase();
        final record = status['todayRecord'] is Map
            ? Map<String, dynamic>.from(status['todayRecord'] as Map)
            : status['activeAttendance'] is Map
                ? Map<String, dynamic>.from(status['activeAttendance'] as Map)
                : <String, dynamic>{};

        final checkInRaw =
            record['checkIn'] ?? record['check_in'] ?? status['checkInTime'];
        final checkOutRaw =
            record['checkOut'] ?? record['check_out'] ?? status['checkOutTime'];
        final checkIn = checkInRaw == null || checkInRaw.toString().trim().isEmpty
            ? null
            : _formatTime(checkInRaw.toString());
        final checkOut =
            checkOutRaw == null || checkOutRaw.toString().trim().isEmpty
                ? null
                : _formatTime(checkOutRaw.toString());

        final shiftName = _nested(
          status,
          'assignedShift',
          ['shiftName', 'name'],
          (status['shiftName'] ?? 'Assigned Shift').toString(),
        );
        final shiftStart = (status['shiftStartDisplay'] ??
                _nested(status, 'assignedShift', ['startTime'], ''))
            .toString()
            .trim();
        final shiftEnd = (status['shiftEndDisplay'] ??
                _nested(status, 'assignedShift', ['endTime'], ''))
            .toString()
            .trim();
        final shiftTiming = shiftStart.isNotEmpty && shiftEnd.isNotEmpty
            ? '$shiftStart – $shiftEnd'
            : 'Shift timing not configured';

        final isCompleted = (!canIn && !canOut) &&
            ((checkIn != null && checkOut != null) ||
                stateCode == 'WAITING_FOR_NEXT_SHIFT');

        final workingHoursDisplay = _computeWorkingHours(record, checkInRaw);
        final overtimeDisplay = _computeOvertime(record);
        final backendMessage = status['message']?.toString().trim() ?? '';

        final statusLabel = canOut
            ? 'On Duty · Checked In${checkIn != null ? ' at $checkIn' : ''}'
            : isCompleted
                ? 'Shift Completed${checkOut != null ? ' at $checkOut' : ''}'
                : canIn
                    ? 'Not Punched In'
                    : (backendMessage.isNotEmpty
                        ? backendMessage
                        : 'Attendance Unavailable');

        final statusDotColor = canOut
            ? AppTokens.brandPrimary
            : isCompleted
                ? AppTokens.brandEmerald
                : canIn
                    ? AppTokens.brandEmerald
                    : AppTokens.warning;

        return RefreshIndicator(
          onRefresh: () async {
            _reload();
            await _future;
          },
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 48),
            children: [
              // Reference Date Pill
              Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 18,
                    vertical: 11,
                  ),
                  decoration: BoxDecoration(
                    color: scheme.surface,
                    borderRadius: BorderRadius.circular(AppTokens.radiusPill),
                    border: Border.all(color: scheme.outlineVariant),
                    boxShadow: AppTokens.cardShadow(context),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.calendar_today_rounded,
                        size: 16,
                        color: scheme.primary,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'Today, ${DateFormat('EEE dd MMM yyyy').format(DateTime.now())}',
                        style: Theme.of(context).textTheme.labelLarge?.copyWith(
                              fontWeight: FontWeight.w700,
                              fontSize: 13.5,
                            ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),

              // Iconic Glowing Circular Face Attendance Ring (States A / B / C)
              Center(
                child: _CircularPunchRing(
                  canIn: canIn,
                  canOut: canOut,
                  isCompleted: isCompleted,
                  submitting: _submitting,
                  progressText: _progress,
                  checkInDisplay: checkIn,
                  unavailableMessage: backendMessage,
                  onTap: _submitting || (!canIn && !canOut)
                      ? null
                      : () => _punch(status),
                ),
              ),
              const SizedBox(height: 26),

              // Reference "Your Shift" Neo-Bento Card
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: scheme.surface,
                  borderRadius: BorderRadius.circular(AppTokens.radiusCard),
                  border: Border.all(color: scheme.outlineVariant),
                  boxShadow: AppTokens.cardShadow(context),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: AppTokens.pastelFor(
                          context,
                          AppTokens.pastelLavender,
                        ),
                        borderRadius: BorderRadius.circular(13),
                      ),
                      child: const Icon(
                        Icons.event_note_rounded,
                        color: AppTokens.cobaltAccent,
                        size: 22,
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Your Shift · $shiftName',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context)
                                .textTheme
                                .bodySmall
                                ?.copyWith(fontWeight: FontWeight.w600),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            shiftTiming,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context)
                                .textTheme
                                .titleMedium
                                ?.copyWith(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 15.5,
                                ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),

              // Reference 2-Column Bento Row (Working Hours & Overtime / Punches)
              Row(
                children: [
                  Expanded(
                    child: _AttendanceMetricCard(
                      icon: Icons.access_time_rounded,
                      iconBg: AppTokens.pastelFor(context, AppTokens.pastelMint),
                      iconColor: AppTokens.brandPrimary,
                      label: 'Working Hours',
                      value: workingHoursDisplay,
                      footnote: checkIn != null ? 'In: $checkIn' : 'Not started',
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _AttendanceMetricCard(
                      icon: Icons.timer_outlined,
                      iconBg:
                          AppTokens.pastelFor(context, AppTokens.pastelLavender),
                      iconColor: AppTokens.cobaltAccent,
                      label: 'Overtime',
                      value: overtimeDisplay,
                      footnote:
                          checkOut != null ? 'Out: $checkOut' : 'Pending out',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // Reference "Today's Status" Card with Live Status Dot
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: scheme.surface,
                  borderRadius: BorderRadius.circular(AppTokens.radiusCard),
                  border: Border.all(color: scheme.outlineVariant),
                  boxShadow: AppTokens.cardShadow(context),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      "Today's Status",
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w800,
                          ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Container(
                          width: 10,
                          height: 10,
                          decoration: BoxDecoration(
                            color: statusDotColor,
                            shape: BoxShape.circle,
                            boxShadow: [
                              BoxShadow(
                                color: statusDotColor.withValues(alpha: 0.45),
                                blurRadius: 6,
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            statusLabel,
                            style: TextStyle(
                              fontSize: 13.5,
                              fontWeight: FontWeight.w700,
                              color: statusDotColor,
                            ),
                          ),
                        ),
                      ],
                    ),
                    if (backendMessage.isNotEmpty && (canIn || canOut)) ...[
                      const SizedBox(height: 6),
                      Text(
                        backendMessage,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 12),

              // History / Report Navigation Card
              Container(
                decoration: BoxDecoration(
                  color: scheme.surface,
                  borderRadius: BorderRadius.circular(AppTokens.radiusCard),
                  border: Border.all(color: scheme.outlineVariant),
                  boxShadow: AppTokens.cardShadow(context),
                ),
                child: Material(
                  type: MaterialType.transparency,
                  borderRadius: BorderRadius.circular(AppTokens.radiusCard),
                  clipBehavior: Clip.antiAlias,
                  child: ListTile(
                    contentPadding:
                        const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                    leading: Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        color:
                            AppTokens.pastelFor(context, AppTokens.pastelBlue),
                        borderRadius: BorderRadius.circular(13),
                      ),
                      child: const Icon(
                        Icons.history_rounded,
                        color: AppTokens.brandPrimary,
                      ),
                    ),
                    title: Text(
                      user.isManagement
                          ? 'Attendance Report & Corrections'
                          : 'View My Attendance History',
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 14,
                      ),
                    ),
                    subtitle: Text(
                      'Past punches, verified photos & GPS log',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: () => GoRouter.maybeOf(context)
                        ?.push('/module/attendance_log'),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  static String _computeWorkingHours(
      Map<String, dynamic> record, dynamic checkInRaw) {
    final direct = record['workingHours'] ?? record['working_hours'];
    if (direct != null) {
      final parsed = double.tryParse(direct.toString());
      if (parsed != null && parsed > 0) {
        return '${parsed.toStringAsFixed(1)} h';
      }
    }
    if (checkInRaw != null) {
      final parsed = DateTime.tryParse(checkInRaw.toString());
      if (parsed != null) {
        final diff = DateTime.now().difference(parsed.toLocal());
        if (!diff.isNegative && diff.inMinutes > 0) {
          final h = diff.inHours;
          final m = diff.inMinutes % 60;
          return '${h}h ${m.toString().padLeft(2, '0')}m';
        }
      }
    }
    return '--';
  }

  static String _computeOvertime(Map<String, dynamic> record) {
    final raw = record['overtimeHours'] ?? record['overtime_hours'];
    if (raw != null) {
      final parsed = double.tryParse(raw.toString());
      if (parsed != null && parsed > 0) {
        return '${parsed.toStringAsFixed(1)} h';
      }
    }
    return '--';
  }

  static String _nested(Map<String, dynamic> map, String parent,
      List<String> keys, String fallback) {
    final value = map[parent];
    if (value is Map) {
      for (final key in keys) {
        if (value[key] != null && value[key].toString().trim().isNotEmpty) {
          return value[key].toString();
        }
      }
    }
    return fallback;
  }

  static String _formatTime(String value) {
    final parsed = DateTime.tryParse(value);
    return parsed == null
        ? value
        : DateFormat('hh:mm a').format(parsed.toLocal());
  }
}

class _CircularPunchRing extends StatelessWidget {
  const _CircularPunchRing({
    required this.canIn,
    required this.canOut,
    required this.isCompleted,
    required this.submitting,
    required this.progressText,
    required this.checkInDisplay,
    required this.unavailableMessage,
    required this.onTap,
  });

  final bool canIn;
  final bool canOut;
  final bool isCompleted;
  final bool submitting;
  final String? progressText;
  final String? checkInDisplay;
  final String unavailableMessage;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final enabled = onTap != null && !submitting;

    final List<Color> ringColors;
    final Color glowColor;
    final IconData centerIcon;
    final String primaryTitle;
    final String secondarySubtitle;

    if (submitting) {
      ringColors = const [AppTokens.brandPrimary, AppTokens.brandOcean];
      glowColor = AppTokens.brandPrimary;
      centerIcon = Icons.face_retouching_natural_rounded;
      primaryTitle = 'Verifying…';
      secondarySubtitle = progressText ?? 'Checking face & GPS';
    } else if (canOut) {
      // State B: Ready to Punch Out
      ringColors = const [
        AppTokens.brandPrimary,
        AppTokens.brandSecondary,
        AppTokens.brandOcean,
      ];
      glowColor = AppTokens.brandPrimary;
      centerIcon = Icons.face_retouching_natural_rounded;
      primaryTitle = 'Punch Out';
      secondarySubtitle = checkInDisplay != null
          ? 'In $checkInDisplay · Tap to finish'
          : 'Tap to end your shift';
    } else if (canIn) {
      // State A: Ready to Punch In (exact vibrant emerald-teal reference ring)
      ringColors = const [
        Color(0xFF4ADE80),
        AppTokens.brandEmerald,
        AppTokens.brandPrimary,
      ];
      glowColor = AppTokens.brandEmerald;
      centerIcon = Icons.face_retouching_natural_rounded;
      primaryTitle = 'Punch In';
      secondarySubtitle = 'Tap to start your work';
    } else if (isCompleted) {
      // State C1: Shift Complete
      ringColors = const [AppTokens.brandEmerald, AppTokens.brandPrimary];
      glowColor = AppTokens.brandEmerald;
      centerIcon = Icons.verified_rounded;
      primaryTitle = 'Shift Complete';
      secondarySubtitle = 'Attendance recorded for today';
    } else {
      // State C2: Backend Policy Unavailable
      ringColors = const [Color(0xFFCBD5E1), Color(0xFF94A3B8)];
      glowColor = const Color(0xFF94A3B8);
      centerIcon = Icons.info_outline_rounded;
      primaryTitle = 'Unavailable';
      secondarySubtitle = unavailableMessage.isNotEmpty
          ? unavailableMessage
          : 'Outside attendance window';
    }

    return Semantics(
      button: enabled,
      label: '$primaryTitle — $secondarySubtitle',
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          width: 214,
          height: 214,
          padding: const EdgeInsets.all(11),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: SweepGradient(
              colors: [...ringColors, ringColors.first],
            ),
            boxShadow: [
              BoxShadow(
                color: glowColor.withValues(alpha: enabled ? 0.28 : 0.14),
                blurRadius: 28,
                spreadRadius: 2,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Container(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: scheme.surface,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.04),
                  blurRadius: 8,
                ),
              ],
            ),
            padding: const EdgeInsets.symmetric(horizontal: 18),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (submitting)
                  SizedBox.square(
                    dimension: 36,
                    child: CircularProgressIndicator(
                      strokeWidth: 3,
                      color: glowColor,
                    ),
                  )
                else
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: glowColor.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(15),
                    ),
                    child: Icon(centerIcon, size: 28, color: glowColor),
                  ),
                const SizedBox(height: 12),
                Text(
                  primaryTitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontSize: 21,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.4,
                      ),
                ),
                const SizedBox(height: 4),
                Text(
                  secondarySubtitle,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        fontSize: 12,
                        height: 1.25,
                      ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _AttendanceMetricCard extends StatelessWidget {
  const _AttendanceMetricCard({
    required this.icon,
    required this.iconBg,
    required this.iconColor,
    required this.label,
    required this.value,
    required this.footnote,
  });

  final IconData icon;
  final Color iconBg;
  final Color iconColor;
  final String label;
  final String value;
  final String footnote;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(AppTokens.radiusCard),
        border: Border.all(color: scheme.outlineVariant),
        boxShadow: AppTokens.cardShadow(context),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: iconBg,
              borderRadius: BorderRadius.circular(11),
            ),
            child: Icon(icon, size: 19, color: iconColor),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 4),
                Text(
                  value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTokens.kpiStyle(context, size: 18),
                ),
                const SizedBox(height: 2),
                Text(
                  footnote,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        fontSize: 10.5,
                      ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
