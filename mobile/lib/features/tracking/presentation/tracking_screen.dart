import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:intl/intl.dart';
import 'package:latlong2/latlong.dart';
import 'package:uuid/uuid.dart';

import '../../../app/providers.dart';
import '../../../core/models/app_user.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/employee_filters.dart';
import '../../../core/widgets/adaptive_components.dart';
import '../../auth/application/auth_controller.dart';
import '../../shared/presentation/async_content.dart';

/// Strict state & ownership guard: prevents showing "Start authorized tracking"
/// on Completed, Archived, Cancelled, or another employee's field duty.
bool canStartTrackingAssignment(Map<String, dynamic> assignment, AppUser user) {
  if (user.isCeo) return false;
  final status = (assignment['status'] ?? '').toString().trim().toLowerCase();
  const blocked = {
    'completed',
    'archived',
    'cancelled',
    'canceled',
    'closed',
    'auto closed',
    'auto_closed',
    'expired',
  };
  if (blocked.contains(status)) return false;

  final ownerId = assignment['employeeId'] ?? assignment['employee_id'];
  if (ownerId != null && ownerId.toString().trim().isNotEmpty) {
    return user.matchesIdentity(ownerId);
  }
  return true;
}

enum _TrackingTab { duties, history, alerts }

class TrackingScreen extends ConsumerStatefulWidget {
  const TrackingScreen({super.key});

  @override
  ConsumerState<TrackingScreen> createState() => _TrackingScreenState();
}

class _TrackingScreenState extends ConsumerState<TrackingScreen> {
  static const _queueKeyPrefix = 'businz_pending_tracking_points';
  late Future<_TrackingBundle> _future;
  _TrackingTab _tab = _TrackingTab.duties;
  StreamSubscription<Position>? _subscription;
  String? _tripId;
  String? _assignmentId;
  Position? _lastPosition;
  Map<String, dynamic>? _activeTrip;
  int _pointsSent = 0;
  bool _working = false;
  String? _error;

  String get _queueKey {
    final employeeId = ref.read(authControllerProvider).value?.employeeId;
    return '${_queueKeyPrefix}_${employeeId ?? 'unknown'}';
  }

  @override
  void initState() {
    super.initState();
    _future = _load();
    _flushSavedQueue();
    _restoreActiveSession();
  }

  Future<_TrackingBundle> _load() async {
    final user = ref.read(authControllerProvider).value!;
    final repo = ref.read(hrmsRepositoryProvider);
    final results = await Future.wait<dynamic>([
      repo.trackingAssignments().catchError((_) => <Map<String, dynamic>>[]),
      repo.trackingTrips().catchError((_) => <Map<String, dynamic>>[]),
      if (user.isManagement)
        repo.trackingAlerts()
      else
        Future.value(<Map<String, dynamic>>[]),
      if (user.isManagement)
        repo
            .employees(activeOnly: true)
            .catchError((_) => <Map<String, dynamic>>[])
      else
        Future.value(<Map<String, dynamic>>[]),
    ]);

    return _TrackingBundle(
      assignments: results[0] as List<Map<String, dynamic>>,
      trips: results[1] as List<Map<String, dynamic>>,
      alerts: results[2] as List<Map<String, dynamic>>,
      employees: results[3] as List<Map<String, dynamic>>,
    );
  }

  void _reload() => setState(() => _future = _load());

  Future<void> _restoreActiveSession() async {
    try {
      final user = ref.read(authControllerProvider).value;
      if (user == null || user.isCeo) return;
      final bundle = await _future;
      Map<String, dynamic>? active;
      for (final trip in bundle.trips) {
        final isMine = user.matchesIdentity(trip['employeeId']) ||
            user.matchesIdentity(trip['employee_id']);
        if (isMine &&
            (trip['status'] ?? '').toString().trim().toLowerCase() ==
                'active') {
          active = trip;
          break;
        }
      }
      if (active == null || !mounted) return;
      setState(() {
        _activeTrip = active;
        _tripId = (active!['id'] ?? '').toString();
        _assignmentId =
            (active['assignmentId'] ?? active['assignment_id'] ?? '')
                .toString();
      });
      final permission = await Geolocator.checkPermission();
      if (await Geolocator.isLocationServiceEnabled() &&
          permission != LocationPermission.denied &&
          permission != LocationPermission.deniedForever) {
        _listenForPositions();
      }
    } catch (_) {
      // Do not create another session when server restoration is unavailable.
    }
  }

  Future<Position> _getPosition() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw Exception(
          'Turn on location services before starting field tracking.');
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      throw Exception(
          'Location permission is required for an authorized tracking session.');
    }
    return Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        timeLimit: Duration(seconds: 25),
      ),
    );
  }

  Future<void> _start(Map<String, dynamic> assignment) async {
    final user = ref.read(authControllerProvider).value!;
    if (!canStartTrackingAssignment(assignment, user)) return;
    if (_working || _tripId != null) return;
    final id = (assignment['id'] ?? assignment['assignmentId']).toString();
    setState(() {
      _working = true;
      _error = null;
    });
    try {
      final position = await _getPosition();
      final response = await ref.read(hrmsRepositoryProvider).startTrip({
        'assignmentId': id,
        'employeeId': user.employeeId,
        'startLat': position.latitude,
        'startLng': position.longitude,
        'startAddress': 'Device GPS',
      });
      final raw = response['data'];
      final trip = raw is Map ? Map<String, dynamic>.from(raw) : response;
      final tripId = (trip['id'] ?? trip['tripId'] ?? '').toString();
      if (tripId.isEmpty) {
        throw Exception('The server did not return a tracking session ID.');
      }
      setState(() {
        _tripId = tripId;
        _assignmentId = id;
        _lastPosition = position;
        _activeTrip = trip;
      });
      _listenForPositions();
      await _recordPoint(position);
    } catch (error) {
      if (mounted) {
        setState(() => _error = error.toString());
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.toString())));
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  LocationSettings _trackingSettings() {
    if (defaultTargetPlatform == TargetPlatform.android) {
      return AndroidSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 20,
        intervalDuration: const Duration(seconds: 15),
        foregroundNotificationConfig: const ForegroundNotificationConfig(
          notificationTitle: 'BUSINZ field tracking',
          notificationText: 'An authorized field tracking session is active.',
          enableWakeLock: true,
        ),
      );
    }
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      return AppleSettings(
        accuracy: LocationAccuracy.high,
        activityType: ActivityType.automotiveNavigation,
        distanceFilter: 20,
        pauseLocationUpdatesAutomatically: false,
        showBackgroundLocationIndicator: true,
      );
    }
    return const LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 20,
    );
  }

  void _listenForPositions() {
    if (_subscription != null || _tripId == null) return;
    _subscription = Geolocator.getPositionStream(
      locationSettings: _trackingSettings(),
    ).listen(_recordPoint, onError: (Object error) {
      if (mounted) setState(() => _error = error.toString());
    });
  }

  Future<void> _recordPoint(Position position) async {
    final tripId = _tripId;
    final assignmentId = _assignmentId;
    if (tripId == null || assignmentId == null) return;
    _lastPosition = position;
    final user = ref.read(authControllerProvider).value!;
    final point = <String, dynamic>{
      'id': const Uuid().v4(),
      'tripId': tripId,
      'assignmentId': assignmentId,
      'employeeId': user.employeeId,
      'recordedAt': position.timestamp.toUtc().toIso8601String(),
      'latitude': position.latitude,
      'longitude': position.longitude,
      'accuracy': position.accuracy,
      'speed': position.speed < 0 ? 0 : position.speed,
      'heading': position.heading,
      'altitude': position.altitude,
      'source': 'flutter_mobile',
      'syncedOffline': false,
      'uploadStatus': 'pending',
    };
    try {
      await ref.read(hrmsRepositoryProvider).sendTrackingPoints([point]);
      if (mounted) setState(() => _pointsSent++);
    } catch (_) {
      await _savePoint(point);
      if (mounted) {
        setState(() => _error =
            'Network interrupted. Location queued securely for retry.');
      }
    }
  }

  Future<void> _savePoint(Map<String, dynamic> point) async {
    final store = ref.read(secureStoreProvider);
    final raw = await store.readProtectedValue(_queueKey);
    final current = raw == null || raw.isEmpty
        ? <String>[]
        : List<String>.from(jsonDecode(raw) as List);
    current.add(jsonEncode(point));
    if (current.length > 500) current.removeRange(0, current.length - 500);
    await store.writeProtectedValue(_queueKey, jsonEncode(current));
  }

  Future<void> _flushSavedQueue() async {
    final store = ref.read(secureStoreProvider);
    final raw = await store.readProtectedValue(_queueKey);
    final stored = raw == null || raw.isEmpty
        ? const <String>[]
        : List<String>.from(jsonDecode(raw) as List);
    if (stored.isEmpty) return;
    final points = stored
        .map((raw) => Map<String, dynamic>.from(jsonDecode(raw) as Map))
        .toList();
    try {
      await ref.read(hrmsRepositoryProvider).sendTrackingPoints(points);
      await store.deleteProtectedValue(_queueKey);
      if (mounted) setState(() => _pointsSent += points.length);
    } catch (_) {
      // Retain queue until network returns.
    }
  }

  Future<void> _end() async {
    final tripId = _tripId;
    if (tripId == null || _working) return;
    setState(() {
      _working = true;
      _error = null;
    });
    try {
      await _subscription?.cancel();
      _subscription = null;
      final position = await _getPosition();
      await _recordPoint(position);
      await _flushSavedQueue();
      await ref.read(hrmsRepositoryProvider).endTrip(tripId, {
        'endLat': position.latitude,
        'endLng': position.longitude,
        'endAddress': 'Device GPS',
      });
      if (mounted) {
        setState(() {
          _tripId = null;
          _assignmentId = null;
          _lastPosition = null;
          _activeTrip = null;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text('Field tracking session ended successfully.')),
        );
        _reload();
      }
    } catch (error) {
      if (mounted) {
        setState(() => _error = error.toString());
        _listenForPositions();
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _openAssignDutySheet(
      List<Map<String, dynamic>> employees) async {
    final assignable = excludeCeoEmployees(employees);
    if (assignable.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No eligible employees available.')),
        );
      }
      return;
    }
    var selectedEmp = assignable.first;
    final siteCtrl = TextEditingController();
    final addressCtrl = TextEditingController();
    final purposeCtrl = TextEditingController();
    var durationMode = 'single'; // single | 3days | week | custom
    final today = DateTime.now();
    var startDate = DateTime(today.year, today.month, today.day);
    var endDate = startDate;
    var saving = false;

    DateTime computeEndDate(DateTime start, String mode, DateTime customEnd) {
      switch (mode) {
        case '3days':
          return start.add(const Duration(days: 2));
        case 'week':
          return start.add(const Duration(days: 6));
        case 'custom':
          return customEnd.isBefore(start) ? start : customEnd;
        default:
          return start;
      }
    }

    String scheduleTypeFor(String mode) {
      switch (mode) {
        case 'week':
          return 'Weekly';
        case '3days':
        case 'custom':
          return 'Date Range';
        default:
          return 'One Day';
      }
    }

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) {
          final effectiveEnd = computeEndDate(startDate, durationMode, endDate);
          final totalDays = effectiveEnd.difference(startDate).inDays + 1;
          return Padding(
            padding: EdgeInsets.fromLTRB(
              20,
              8,
              20,
              MediaQuery.viewInsetsOf(context).bottom + 24,
            ),
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Assign Field Duty',
                      style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 14),
                  DropdownButtonFormField<Map<String, dynamic>>(
                    initialValue: selectedEmp,
                    decoration: const InputDecoration(labelText: 'Employee'),
                    items: assignable
                        .map((e) => DropdownMenuItem(
                              value: e,
                              child: Text(
                                '${e['name']} (${e['employeeId'] ?? e['employee_id'] ?? ''})',
                                overflow: TextOverflow.ellipsis,
                              ),
                            ))
                        .toList(),
                    onChanged: (v) {
                      if (v != null) setSheetState(() => selectedEmp = v);
                    },
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: siteCtrl,
                    decoration: const InputDecoration(
                        labelText: 'Customer / Site Name'),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: addressCtrl,
                    decoration:
                        const InputDecoration(labelText: 'Site Address'),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: purposeCtrl,
                    decoration:
                        const InputDecoration(labelText: 'Visit Purpose'),
                  ),
                  const SizedBox(height: 14),
                  Text(
                    'Duty Duration',
                    style: Theme.of(context)
                        .textTheme
                        .labelLarge
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final option in const [
                        ('single', 'Single Day'),
                        ('3days', '3 Days'),
                        ('week', '1 Week'),
                        ('custom', 'Custom'),
                      ])
                        ChoiceChip(
                          selected: durationMode == option.$1,
                          label: Text(option.$2),
                          onSelected: (_) => setSheetState(() {
                            durationMode = option.$1;
                            endDate = computeEndDate(
                                startDate, durationMode, endDate);
                          }),
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () async {
                            final picked = await showDatePicker(
                              context: context,
                              firstDate: DateTime(
                                  today.year, today.month, today.day),
                              lastDate:
                                  today.add(const Duration(days: 180)),
                              initialDate: startDate,
                            );
                            if (picked != null) {
                              setSheetState(() {
                                startDate = picked;
                                endDate = computeEndDate(
                                    startDate, durationMode, endDate);
                              });
                            }
                          },
                          icon: const Icon(Icons.calendar_today_outlined,
                              size: 16),
                          label: Text(
                            durationMode == 'single'
                                ? DateFormat('dd MMM yyyy').format(startDate)
                                : 'From: ${DateFormat('dd MMM').format(startDate)}',
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ),
                      if (durationMode == 'custom') ...[
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () async {
                              final picked = await showDatePicker(
                                context: context,
                                firstDate: startDate,
                                lastDate:
                                    startDate.add(const Duration(days: 180)),
                                initialDate: effectiveEnd,
                              );
                              if (picked != null) {
                                setSheetState(() => endDate = picked);
                              }
                            },
                            icon: const Icon(Icons.event_outlined, size: 16),
                            label: Text(
                              'To: ${DateFormat('dd MMM').format(effectiveEnd)}',
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: Theme.of(context)
                          .colorScheme
                          .primaryContainer
                          .withValues(alpha: 0.45),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      totalDays == 1
                          ? 'Schedule: ${DateFormat('dd MMM yyyy').format(startDate)} (1 day)'
                          : 'Schedule: ${DateFormat('dd MMM yyyy').format(startDate)} → ${DateFormat('dd MMM yyyy').format(effectiveEnd)} ($totalDays days)',
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                        color: Theme.of(context).colorScheme.primary,
                      ),
                    ),
                  ),
                  const SizedBox(height: 18),
                  FilledButton(
                    onPressed: saving
                        ? null
                        : () async {
                            if (siteCtrl.text.trim().isEmpty) return;
                            setSheetState(() => saving = true);
                            final startIso =
                                DateFormat('yyyy-MM-dd').format(startDate);
                            final endIso =
                                DateFormat('yyyy-MM-dd').format(effectiveEnd);
                            try {
                              await ref
                                  .read(hrmsRepositoryProvider)
                                  .createTrackingAssignment({
                                'employeeId': selectedEmp['employeeId'] ??
                                    selectedEmp['employee_id'] ??
                                    selectedEmp['id'],
                                'employeeName': selectedEmp['name'],
                                'customerSiteName': siteCtrl.text.trim(),
                                'siteAddress': addressCtrl.text.trim().isEmpty
                                    ? siteCtrl.text.trim()
                                    : addressCtrl.text.trim(),
                                'purpose': purposeCtrl.text.trim().isEmpty
                                    ? 'Authorized Site Visit'
                                    : purposeCtrl.text.trim(),
                                'scheduleType': scheduleTypeFor(durationMode),
                                'startDate': startIso,
                                'endDate': endIso,
                                'scheduledDate': startIso,
                                'date': startIso,
                                'status': 'Scheduled',
                              });
                              if (!context.mounted) return;
                              Navigator.pop(context);
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text(
                                    totalDays == 1
                                        ? 'Field duty assigned for $startIso.'
                                        : 'Field duty assigned ($totalDays days: $startIso to $endIso).',
                                  ),
                                ),
                              );
                              _reload();
                            } catch (err) {
                              if (!context.mounted) return;
                              ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(content: Text(err.toString())));
                            } finally {
                              if (context.mounted) {
                                setSheetState(() => saving = false);
                              }
                            }
                          },
                    child: Text(saving ? 'Assigning…' : 'Assign Field Duty'),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
    siteCtrl.dispose();
    addressCtrl.dispose();
    purposeCtrl.dispose();
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_tripId != null) return _activeSession(context);
    final user = ref.watch(authControllerProvider).value!;

    return FutureBuilder<_TrackingBundle>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const AppSkeletonList(itemCount: 5, height: 96);
        }
        if (snapshot.hasError) {
          return AppErrorView(error: snapshot.error!, onRetry: _reload);
        }
        final bundle = snapshot.data!;
        final activeTrips = bundle.trips
            .where(
                (t) => (t['status'] ?? '').toString().toLowerCase() == 'active')
            .length;
        final totalKm = bundle.trips.fold<double>(
          0,
          (sum, t) =>
              sum +
              (double.tryParse('${t['totalKm'] ?? t['total_km'] ?? 0}') ?? 0),
        );
        final openAlerts = bundle.alerts
            .where((a) => a['resolved'] != true && a['is_resolved'] != true)
            .length;

        final tabs = user.isManagement
            ? const [
                _TrackingTab.duties,
                _TrackingTab.history,
                _TrackingTab.alerts
              ]
            : const [_TrackingTab.duties, _TrackingTab.history];

        return Scaffold(
          backgroundColor: Colors.transparent,
          floatingActionButton: user.isManagement && _tab == _TrackingTab.duties
              ? FloatingActionButton.extended(
                  onPressed: () => _openAssignDutySheet(bundle.employees),
                  icon: const Icon(Icons.add_location_alt_outlined),
                  label: const Text('Assign Duty'),
                )
              : null,
          body: RefreshIndicator(
            onRefresh: () async {
              _reload();
              await _future;
            },
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 100),
              children: [
                Row(
                  children: [
                    Expanded(
                      child: CompactKpiCard(
                        label: 'Active Trips',
                        value: '$activeTrips',
                        subtitle: '${bundle.assignments.length} duties',
                        icon: Icons.my_location_rounded,
                        accentColor: AppTokens.success,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: CompactKpiCard(
                        label: 'Distance Logged',
                        value: '${totalKm.toStringAsFixed(1)} km',
                        subtitle: '${bundle.trips.length} sessions',
                        icon: Icons.route_outlined,
                        accentColor: AppTokens.brand,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                AdaptiveSegmentedControl<_TrackingTab>(
                  values: tabs,
                  selected: tabs.contains(_tab) ? _tab : _TrackingTab.duties,
                  labelBuilder: (t) => switch (t) {
                    _TrackingTab.duties =>
                      'Duties (${bundle.assignments.length})',
                    _TrackingTab.history => 'History (${bundle.trips.length})',
                    _TrackingTab.alerts => 'Alerts ($openAlerts)',
                  },
                  onChanged: (t) => setState(() => _tab = t),
                ),
                const SizedBox(height: 14),
                if (_tab == _TrackingTab.duties) ...[
                  if (bundle.assignments.isEmpty)
                    const EmptyState(
                      icon: Icons.location_off_outlined,
                      title: 'No field duties assigned',
                      message:
                          'Authorized field duties and site visits appear here.',
                    )
                  else
                    ...bundle.assignments.map((item) => _AssignmentCard(
                          item: item,
                          canStart: canStartTrackingAssignment(item, user),
                          working: _working,
                          onStart: () => _start(item),
                        )),
                ] else if (_tab == _TrackingTab.history) ...[
                  if (bundle.trips.isEmpty)
                    const EmptyState(
                      icon: Icons.route_outlined,
                      title: 'No travel history yet',
                      message:
                          'Server-confirmed travel sessions with GPS routes appear here.',
                    )
                  else
                    ...bundle.trips.map((trip) => _TripCard(
                          trip: trip,
                          onTap: () => _showTrip(trip),
                        )),
                ] else ...[
                  if (bundle.alerts.isEmpty)
                    const EmptyState(
                      icon: Icons.verified_outlined,
                      title: 'No GPS alerts',
                      message: 'All field sessions are operating cleanly.',
                    )
                  else
                    ...bundle.alerts.map((alert) {
                      final resolved = alert['resolved'] == true ||
                          alert['is_resolved'] == true;
                      return Card(
                        margin: const EdgeInsets.only(bottom: 10),
                        child: ListTile(
                          leading: Icon(
                            resolved
                                ? Icons.check_circle_outline
                                : Icons.warning_amber_rounded,
                            color: resolved
                                ? AppTokens.success
                                : AppTokens.warning,
                          ),
                          title: Text(
                            (alert['alert_type'] ??
                                    alert['type'] ??
                                    'GPS Alert')
                                .toString(),
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          subtitle: Text(
                              (alert['message'] ?? alert['employee_name'] ?? '')
                                  .toString()),
                          trailing: resolved
                              ? const StatusPill('Resolved')
                              : TextButton(
                                  onPressed: () async {
                                    await ref
                                        .read(hrmsRepositoryProvider)
                                        .resolveTrackingAlert(
                                            alert['id'].toString());
                                    _reload();
                                  },
                                  child: const Text('Resolve'),
                                ),
                        ),
                      );
                    }),
                ],
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _activeSession(BuildContext context) => ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  Container(
                    width: 58,
                    height: 58,
                    decoration: BoxDecoration(
                      color: AppTokens.success.withValues(alpha: 0.12),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.my_location_rounded,
                        size: 32, color: AppTokens.success),
                  ),
                  const SizedBox(height: 14),
                  Text('Live Field Tracking Active',
                      style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 6),
                  Text(
                    'GPS coordinates are recorded only for this authorized duty.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(height: 18),
                  DetailKeyValueRow(
                      label: 'Points Synced', value: '$_pointsSent'),
                  DetailKeyValueRow(
                    label: 'Server Distance',
                    value:
                        '${(double.tryParse('${_activeTrip?['totalKm'] ?? _activeTrip?['total_km'] ?? 0}') ?? 0).toStringAsFixed(2)} km',
                  ),
                  DetailKeyValueRow(
                    label: 'GPS Accuracy',
                    value: _lastPosition == null
                        ? 'Waiting…'
                        : '${_lastPosition!.accuracy.toStringAsFixed(0)} m',
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 10),
                    Text(_error!,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                            color: Theme.of(context).colorScheme.error)),
                  ],
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      style: FilledButton.styleFrom(
                        backgroundColor: AppTokens.danger,
                      ),
                      onPressed: _working ? null : _end,
                      icon: const Icon(Icons.stop_rounded),
                      label: Text(_working
                          ? 'Ending Session…'
                          : 'End Tracking Session'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      );

  Future<void> _showTrip(Map<String, dynamic> trip) =>
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        showDragHandle: true,
        builder: (_) => _TripDetails(trip: trip),
      );
}

class _TrackingBundle {
  const _TrackingBundle({
    required this.assignments,
    required this.trips,
    required this.alerts,
    required this.employees,
  });
  final List<Map<String, dynamic>> assignments;
  final List<Map<String, dynamic>> trips;
  final List<Map<String, dynamic>> alerts;
  final List<Map<String, dynamic>> employees;
}

class _AssignmentCard extends StatelessWidget {
  const _AssignmentCard({
    required this.item,
    required this.canStart,
    required this.working,
    required this.onStart,
  });

  final Map<String, dynamic> item;
  final bool canStart;
  final bool working;
  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) {
    final title = (item['customerSiteName'] ??
            item['customer_site_name'] ??
            item['siteAddress'] ??
            'Field Duty')
        .toString();
    final employee =
        (item['employeeName'] ?? item['employee_name'] ?? '').toString();
    final status = (item['status'] ?? 'Scheduled').toString();
    final date = formatDisplayDate(
        (item['date'] ?? item['scheduled_date'] ?? item['created_at'])
            ?.toString());

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title,
                          style: const TextStyle(
                              fontSize: 15, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 2),
                      Text(
                        [if (employee.isNotEmpty) employee, date].join(' · '),
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
                StatusPill(status),
              ],
            ),
            if (canStart) ...[
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: working ? null : onStart,
                  icon: const Icon(Icons.play_arrow_rounded),
                  label: const Text('Start Authorized Tracking'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _TripCard extends StatelessWidget {
  const _TripCard({required this.trip, required this.onTap});
  final Map<String, dynamic> trip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final site = (trip['customerSiteName'] ??
            trip['customer_site_name'] ??
            trip['endAddress'] ??
            'Field Trip')
        .toString();
    final emp =
        (trip['employeeName'] ?? trip['employee_name'] ?? '').toString();
    final km =
        double.tryParse('${trip['totalKm'] ?? trip['total_km'] ?? 0}') ?? 0;
    final status = (trip['status'] ?? 'Completed').toString();
    final started = formatDisplayDateTime(
        (trip['tripStartTime'] ?? trip['trip_start_time'])?.toString());

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        leading: CircleAvatar(
          backgroundColor: Theme.of(context).colorScheme.primaryContainer,
          child: Icon(Icons.route_outlined,
              color: Theme.of(context).colorScheme.onPrimaryContainer),
        ),
        title: Text(
          emp.isNotEmpty ? '$emp · $site' : site,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
        subtitle: Text('$started · ${km.toStringAsFixed(2)} km'),
        trailing: StatusPill(status),
        onTap: onTap,
      ),
    );
  }
}

class _TripDetails extends StatefulWidget {
  const _TripDetails({required this.trip});
  final Map<String, dynamic> trip;

  @override
  State<_TripDetails> createState() => _TripDetailsState();
}

class _TripDetailsState extends State<_TripDetails> {
  final _mapController = MapController();

  @override
  Widget build(BuildContext context) {
    final trip = widget.trip;
    final rawPoints = trip['locationPoints'] ?? trip['location_points'];
    final points = rawPoints is List
        ? rawPoints
            .whereType<Map>()
            .map((point) {
              final data = Map<String, dynamic>.from(point);
              final lat = double.tryParse('${data['latitude'] ?? data['lat']}');
              final lng =
                  double.tryParse('${data['longitude'] ?? data['lng']}');
              return lat == null || lng == null ? null : LatLng(lat, lng);
            })
            .whereType<LatLng>()
            .toList(growable: false)
        : const <LatLng>[];
    final km =
        double.tryParse('${trip['totalKm'] ?? trip['total_km'] ?? 0}') ?? 0;
    final status = (trip['status'] ?? 'Completed').toString();
    final site = (trip['customerSiteName'] ??
            trip['customer_site_name'] ??
            trip['endAddress'] ??
            'Route Details')
        .toString();
    final quality = points.length >= 4
        ? 'Verified GPS'
        : points.isNotEmpty
            ? 'Low GPS Sample'
            : 'No GPS';

    // Deduplicate overlapping start/end markers when only 1 point or <25m apart.
    final sameStartEnd = points.length >= 2 &&
        const Distance().as(LengthUnit.Meter, points.first, points.last) < 25;

    return FractionallySizedBox(
      heightFactor: .9,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
        children: [
          Row(
            children: [
              Expanded(
                child:
                    Text(site, style: Theme.of(context).textTheme.titleLarge),
              ),
              StatusPill(status),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            '${km.toStringAsFixed(2)} km · ${points.length} GPS points · $quality',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 14),
          if (points.isNotEmpty)
            Stack(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(18),
                  child: SizedBox(
                    height: 360,
                    child: FlutterMap(
                      mapController: _mapController,
                      options: MapOptions(
                        initialCenter: points.last,
                        initialZoom: 15,
                      ),
                      children: [
                        TileLayer(
                          urlTemplate:
                              'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                          userAgentPackageName: 'com.businz.hrms',
                        ),
                        if (points.length > 1)
                          PolylineLayer(
                            polylines: [
                              Polyline(
                                points: points,
                                strokeWidth: 5,
                                color: AppTokens.info,
                              ),
                            ],
                          ),
                        MarkerLayer(
                          markers: [
                            Marker(
                              point: points.first,
                              width: 34,
                              height: 34,
                              child: _MapPinBadge(
                                label: sameStartEnd ? 'V' : 'A',
                                color: sameStartEnd
                                    ? AppTokens.solarAccent
                                    : AppTokens.success,
                              ),
                            ),
                            if (!sameStartEnd && points.length > 1)
                              Marker(
                                point: points.last,
                                width: 34,
                                height: 34,
                                child: const _MapPinBadge(
                                  label: 'B',
                                  color: AppTokens.danger,
                                ),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                // Clean 4-button Apple/Google Maps floating control bar
                Positioned(
                  right: 10,
                  top: 10,
                  child: Column(
                    children: [
                      _MapControlButton(
                        icon: Icons.add_rounded,
                        onTap: () => _mapController.move(
                          _mapController.camera.center,
                          (_mapController.camera.zoom + 1).clamp(3, 19),
                        ),
                      ),
                      const SizedBox(height: 6),
                      _MapControlButton(
                        icon: Icons.remove_rounded,
                        onTap: () => _mapController.move(
                          _mapController.camera.center,
                          (_mapController.camera.zoom - 1).clamp(3, 19),
                        ),
                      ),
                      const SizedBox(height: 6),
                      _MapControlButton(
                        icon: Icons.my_location_rounded,
                        onTap: () => _mapController.move(points.last, 15.5),
                      ),
                      const SizedBox(height: 6),
                      _MapControlButton(
                        icon: Icons.fit_screen_rounded,
                        onTap: () {
                          if (points.length > 1) {
                            _mapController.fitCamera(
                              CameraFit.coordinates(
                                coordinates: points,
                                padding: const EdgeInsets.all(42),
                              ),
                            );
                          } else {
                            _mapController.move(points.first, 16);
                          }
                        },
                      ),
                    ],
                  ),
                ),
              ],
            )
          else
            const EmptyState(
              icon: Icons.map_outlined,
              title: 'Route points unavailable',
              message: 'No GPS coordinates were captured for this session.',
            ),
        ],
      ),
    );
  }
}

class _MapPinBadge extends StatelessWidget {
  const _MapPinBadge({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 2.5),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.2),
              blurRadius: 6,
            ),
          ],
        ),
        alignment: Alignment.center,
        child: Text(
          label,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 12,
            fontWeight: FontWeight.w900,
          ),
        ),
      );
}

class _MapControlButton extends StatelessWidget {
  const _MapControlButton({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: Theme.of(context).colorScheme.surface,
        elevation: 2,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: onTap,
          child: SizedBox(
            width: 36,
            height: 36,
            child: Icon(icon, size: 19),
          ),
        ),
      );
}
