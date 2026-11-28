import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:latlong2/latlong.dart';

import '../../../app/providers.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/widgets/adaptive_components.dart';
import '../../auth/application/auth_controller.dart';
import '../../shared/presentation/async_content.dart';

class AttendanceLogScreen extends ConsumerStatefulWidget {
  const AttendanceLogScreen({super.key});

  @override
  ConsumerState<AttendanceLogScreen> createState() =>
      _AttendanceLogScreenState();
}

class _AttendanceLogScreenState extends ConsumerState<AttendanceLogScreen> {
  late Future<_AttendanceLogData> _future;
  String _search = '';
  String _statusFilter = 'All';

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_AttendanceLogData> _load() async {
    final user = ref.read(authControllerProvider).value!;
    final repo = ref.read(hrmsRepositoryProvider);
    final results = await Future.wait<dynamic>([
      repo.attendance(
        employeeId: user.isManagement ? null : user.employeeId,
      ),
      if (user.isManagement)
        repo.employees().catchError((_) => <Map<String, dynamic>>[])
      else
        Future.value(<Map<String, dynamic>>[]),
    ]);

    final names = <String, String>{};
    final codes = <String, String>{};
    for (final emp in results[1] as List<Map<String, dynamic>>) {
      final name = (emp['name'] ?? '').toString().trim();
      final code =
          (emp['employeeId'] ?? emp['employee_id'] ?? '').toString().trim();
      final id = (emp['id'] ?? '').toString().trim();
      if (name.isEmpty) continue;
      if (id.isNotEmpty) {
        names[id.toLowerCase()] = name;
        codes[id.toLowerCase()] = code;
      }
      if (code.isNotEmpty) {
        names[code.toLowerCase()] = name;
        codes[code.toLowerCase()] = code;
      }
    }

    return _AttendanceLogData(
      records: results[0] as List<Map<String, dynamic>>,
      names: names,
      codes: codes,
    );
  }

  void _reload() => setState(() => _future = _load());

  String _employeeName(
    Map<String, dynamic> record,
    Map<String, String> names,
  ) {
    final direct = _text(record, ['employeeName', 'employee_name'], '');
    if (direct.isNotEmpty) return direct;
    final key = _text(record, ['employeeId', 'employee_id'], '').toLowerCase();
    return names[key] ??
        _text(record, ['employeeId', 'employee_id'], 'Employee');
  }

  Future<void> _open(
    Map<String, dynamic> record,
    String empName,
    bool canCorrect,
  ) async {
    final updated = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => _AttendanceDetail(
        record: record,
        employeeName: empName,
        canCorrect: canCorrect,
      ),
    );
    if (updated == true) _reload();
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authControllerProvider).value!;
    final showEmployee = user.isManagement;

    return FutureBuilder<_AttendanceLogData>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const AppSkeletonList(itemCount: 6, height: 92);
        }
        if (snapshot.hasError) {
          return AppErrorView(error: snapshot.error!, onRetry: _reload);
        }
        final data = snapshot.data!;
        final all = data.records;
        final filtered = all.where((record) {
          final status = _text(record, ['status'], 'Unknown').toLowerCase();
          final matchesStatus = switch (_statusFilter) {
            'All' => true,
            'Present' => status.contains('present'),
            'Late' => status.contains('late'),
            'Missed Out' => status.contains('miss') || status == 'mu',
            'Absent' => status.contains('absent') || status.contains('leave'),
            _ => true,
          };
          if (!matchesStatus) return false;
          if (_search.trim().isEmpty) return true;
          final q = _search.trim().toLowerCase();
          final name = _employeeName(record, data.names).toLowerCase();
          final code =
              _text(record, ['employeeId', 'employee_id'], '').toLowerCase();
          final date = _date(record).toLowerCase();
          return name.contains(q) || code.contains(q) || date.contains(q);
        }).toList(growable: false);

        return RefreshIndicator(
          onRefresh: () async {
            _reload();
            await _future;
          },
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 40),
            children: [
              if (showEmployee) ...[
                TextField(
                  onChanged: (value) => setState(() => _search = value),
                  decoration: const InputDecoration(
                    hintText: 'Search employee name, ID, or date…',
                    prefixIcon: Icon(Icons.search_rounded),
                  ),
                ),
                const SizedBox(height: 10),
              ],
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: ['All', 'Present', 'Late', 'Missed Out', 'Absent']
                      .map((st) => Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: FilterChip(
                              selected: _statusFilter == st,
                              label: Text(st),
                              onSelected: (_) =>
                                  setState(() => _statusFilter = st),
                            ),
                          ))
                      .toList(),
                ),
              ),
              const SizedBox(height: 12),
              if (filtered.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(top: 32),
                  child: EmptyState(
                    icon: Icons.fact_check_outlined,
                    title: 'No matching attendance logs',
                    message:
                        'Server-confirmed punch records matching your filter will appear here.',
                  ),
                )
              else
                ...filtered.map((record) {
                  final date = _date(record);
                  final status = _text(record, ['status'], 'Unknown');
                  final checkIn =
                      _formatPunch(_text(record, ['checkIn', 'check_in'], '—'));
                  final checkOut = _formatPunch(
                      _text(record, ['checkOut', 'check_out'], '—'));
                  final address = _text(
                      record, ['locationAddress', 'location_address'], '');
                  final empName = _employeeName(record, data.names);
                  final empCode = data.codes[
                          _text(record, ['employeeId', 'employee_id'], '')
                              .toLowerCase()] ??
                      _text(record, ['employeeId', 'employee_id'], '');

                  return Card(
                    margin: const EdgeInsets.only(bottom: 10),
                    clipBehavior: Clip.antiAlias,
                    child: InkWell(
                      onTap: () =>
                          _open(record, empName, user.canCorrectAttendance),
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                if (showEmployee) ...[
                                  CircleAvatar(
                                    radius: 17,
                                    backgroundColor: Theme.of(context)
                                        .colorScheme
                                        .primaryContainer,
                                    child: Text(
                                      initialsOf(empName),
                                      style: TextStyle(
                                        fontSize: 11.5,
                                        fontWeight: FontWeight.w800,
                                        color: Theme.of(context)
                                            .colorScheme
                                            .onPrimaryContainer,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                ],
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        showEmployee ? empName : date,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                          fontSize: 15,
                                          fontWeight: FontWeight.w800,
                                        ),
                                      ),
                                      if (showEmployee)
                                        Text(
                                          '$date${empCode.isEmpty ? '' : ' · $empCode'}',
                                          style: Theme.of(context)
                                              .textTheme
                                              .bodySmall,
                                        ),
                                    ],
                                  ),
                                ),
                                StatusPill(status),
                              ],
                            ),
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                Expanded(
                                    child: _PunchTime(
                                        label: 'Punch In', value: checkIn)),
                                Expanded(
                                    child: _PunchTime(
                                        label: 'Punch Out', value: checkOut)),
                              ],
                            ),
                            if (address.isNotEmpty) ...[
                              const SizedBox(height: 8),
                              Row(
                                children: [
                                  Icon(
                                    Icons.location_on_outlined,
                                    size: 15,
                                    color: Theme.of(context)
                                        .colorScheme
                                        .onSurfaceVariant,
                                  ),
                                  const SizedBox(width: 5),
                                  Expanded(
                                    child: Text(
                                      address,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style:
                                          Theme.of(context).textTheme.bodySmall,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  );
                }),
            ],
          ),
        );
      },
    );
  }
}

class _AttendanceLogData {
  const _AttendanceLogData({
    required this.records,
    required this.names,
    required this.codes,
  });
  final List<Map<String, dynamic>> records;
  final Map<String, String> names;
  final Map<String, String> codes;
}

class _AttendanceDetail extends ConsumerStatefulWidget {
  const _AttendanceDetail({
    required this.record,
    required this.employeeName,
    required this.canCorrect,
  });

  final Map<String, dynamic> record;
  final String employeeName;
  final bool canCorrect;

  @override
  ConsumerState<_AttendanceDetail> createState() => _AttendanceDetailState();
}

class _AttendanceDetailState extends ConsumerState<_AttendanceDetail> {
  Future<void> _openCorrectionSheet() async {
    final record = widget.record;
    var status = _normalizeStatus(_text(record, ['status'], 'Present'));
    TimeOfDay? checkIn = _parseTime(_text(record, ['checkIn', 'check_in'], ''));
    TimeOfDay? checkOut =
        _parseTime(_text(record, ['checkOut', 'check_out'], ''));
    var saving = false;

    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setModalState) => Padding(
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
                Text('Correct Attendance',
                    style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 4),
                Text(
                  '${widget.employeeName} · ${_date(record)}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  initialValue: status,
                  decoration:
                      const InputDecoration(labelText: 'Attendance Status'),
                  items: const [
                    'Present',
                    'Half Day',
                    'Paid Leave',
                    'Absent',
                    'Work From Home',
                    'On Duty',
                    'Missed Punch-Out',
                  ]
                      .map((s) => DropdownMenuItem(value: s, child: Text(s)))
                      .toList(),
                  onChanged: (v) {
                    if (v != null) setModalState(() => status = v);
                  },
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () async {
                          final picked = await showTimePicker(
                            context: context,
                            initialTime:
                                checkIn ?? const TimeOfDay(hour: 9, minute: 30),
                          );
                          if (picked != null) {
                            setModalState(() => checkIn = picked);
                          }
                        },
                        icon: const Icon(Icons.login_rounded, size: 18),
                        label: Text(checkIn == null
                            ? 'Check-In'
                            : checkIn!.format(context)),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () async {
                          final picked = await showTimePicker(
                            context: context,
                            initialTime: checkOut ??
                                const TimeOfDay(hour: 18, minute: 30),
                          );
                          if (picked != null) {
                            setModalState(() => checkOut = picked);
                          }
                        },
                        icon: const Icon(Icons.logout_rounded, size: 18),
                        label: Text(checkOut == null
                            ? 'Check-Out'
                            : checkOut!.format(context)),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                FilledButton.icon(
                  onPressed: saving
                      ? null
                      : () async {
                          setModalState(() => saving = true);
                          try {
                            final rawDate = _text(record,
                                ['shiftDate', 'date', 'shift_date'], '');
                            final isoDate = rawDate.length >= 10
                                ? rawDate.substring(0, 10)
                                : DateFormat('yyyy-MM-dd')
                                    .format(DateTime.now());
                            String? fmtTime(TimeOfDay? t) {
                              if (t == null) return null;
                              final hh = t.hour.toString().padLeft(2, '0');
                              final mm = t.minute.toString().padLeft(2, '0');
                              return '$hh:$mm';
                            }

                            await ref
                                .read(hrmsRepositoryProvider)
                                .correctAttendance({
                              'employeeId': _text(
                                  record, ['employeeId', 'employee_id'], ''),
                              'date': isoDate,
                              'status': status,
                              if (checkIn != null) 'checkIn': fmtTime(checkIn),
                              if (checkOut != null)
                                'checkOut': fmtTime(checkOut),
                              'correctionReason': 'Manual Attendance Update',
                            });
                            if (!context.mounted) return;
                            Navigator.pop(context, true);
                          } catch (error) {
                            if (!context.mounted) return;
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(error.toString()),
                                backgroundColor:
                                    Theme.of(context).colorScheme.error,
                              ),
                            );
                          } finally {
                            if (context.mounted) {
                              setModalState(() => saving = false);
                            }
                          }
                        },
                  icon: const Icon(Icons.save_outlined),
                  label: Text(saving ? 'Saving…' : 'Save Attendance'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    if (saved == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Attendance record updated.')),
      );
      Navigator.pop(context, true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final record = widget.record;
    final lat = _number(record, ['locationLat', 'location_lat']);
    final lng = _number(record, ['locationLng', 'location_lng']);
    final address = _text(record, ['locationAddress', 'location_address'], '');
    final photo = _text(record, ['checkInPhoto', 'check_in_photo'], '');

    return FractionallySizedBox(
      heightFactor: .93,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 40),
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.employeeName,
                      style: Theme.of(context)
                          .textTheme
                          .titleLarge
                          ?.copyWith(fontWeight: FontWeight.w800),
                    ),
                    Text(_date(record),
                        style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
              ),
              StatusPill(_text(record, ['status'], 'Unknown')),
            ],
          ),
          const SizedBox(height: 16),
          if (widget.canCorrect) ...[
            SizedBox(
              width: double.infinity,
              child: FilledButton.tonalIcon(
                onPressed: _openCorrectionSheet,
                icon: const Icon(Icons.edit_calendar_outlined),
                label: const Text('Correct Attendance Time & Status'),
              ),
            ),
            const SizedBox(height: 14),
          ],
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  DetailKeyValueRow(
                      label: 'Punch In',
                      value: _formatPunch(
                          _text(record, ['checkIn', 'check_in'], '—'))),
                  DetailKeyValueRow(
                      label: 'Punch Out',
                      value: _formatPunch(
                          _text(record, ['checkOut', 'check_out'], '—'))),
                  DetailKeyValueRow(
                      label: 'Working Hours',
                      value: '${_text(record, [
                            'workingHours',
                            'working_hours'
                          ], '0')} hrs'),
                  DetailKeyValueRow(
                      label: 'Method', value: _text(record, ['method'], '')),
                  DetailKeyValueRow(
                      label: 'Late Status',
                      value: _text(record, ['lateStatus', 'late_status'], '')),
                  DetailKeyValueRow(
                      label: 'Overtime',
                      value: '${_text(record, [
                            'calculatedOtHours',
                            'calculated_ot_hours'
                          ], '0')} hrs'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text('GPS Proof', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          if (lat != null && lng != null) ...[
            ClipRRect(
              borderRadius: BorderRadius.circular(AppTokens.radiusCard),
              child: SizedBox(
                height: 210,
                child: FlutterMap(
                  options: MapOptions(
                    initialCenter: LatLng(lat, lng),
                    initialZoom: 16,
                    interactionOptions: const InteractionOptions(
                      flags: InteractiveFlag.pinchZoom | InteractiveFlag.drag,
                    ),
                  ),
                  children: [
                    TileLayer(
                      urlTemplate:
                          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                      userAgentPackageName: 'com.businz.hrms',
                    ),
                    MarkerLayer(markers: [
                      Marker(
                        point: LatLng(lat, lng),
                        width: 44,
                        height: 44,
                        child: const Icon(Icons.location_pin,
                            size: 42, color: AppTokens.danger),
                      ),
                    ]),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              address.isEmpty
                  ? '${lat.toStringAsFixed(6)}, ${lng.toStringAsFixed(6)}'
                  : address,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ] else
            const Card(
              child: Padding(
                padding: EdgeInsets.all(14),
                child: Text('No GPS coordinates recorded for this entry.'),
              ),
            ),
          if (photo.isNotEmpty) ...[
            const SizedBox(height: 18),
            Text('Captured Photo',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(AppTokens.radiusCard),
              child: _AttendancePhoto(value: photo),
            ),
          ],
        ],
      ),
    );
  }

  static String _normalizeStatus(String raw) {
    final low = raw.toLowerCase();
    if (low.contains('half')) return 'Half Day';
    if (low.contains('paid')) return 'Paid Leave';
    if (low.contains('absent')) return 'Absent';
    if (low.contains('work from') || low == 'wfh') return 'Work From Home';
    if (low.contains('duty') || low.contains('field')) return 'On Duty';
    if (low.contains('miss') || low == 'mu') return 'Missed Punch-Out';
    return 'Present';
  }

  static TimeOfDay? _parseTime(String raw) {
    final parsed = DateTime.tryParse(raw);
    if (parsed != null) {
      final local = parsed.toLocal();
      return TimeOfDay(hour: local.hour, minute: local.minute);
    }
    final match = RegExp(r'(\d{1,2}):(\d{2})\s*(AM|PM)?', caseSensitive: false)
        .firstMatch(raw);
    if (match == null) return null;
    var h = int.tryParse(match.group(1)!) ?? 9;
    final m = int.tryParse(match.group(2)!) ?? 0;
    final mer = match.group(3)?.toUpperCase();
    if (mer == 'PM' && h < 12) h += 12;
    if (mer == 'AM' && h == 12) h = 0;
    return TimeOfDay(hour: h.clamp(0, 23), minute: m.clamp(0, 59));
  }
}

class _AttendancePhoto extends StatelessWidget {
  const _AttendancePhoto({required this.value});
  final String value;

  @override
  Widget build(BuildContext context) {
    final bytes = _decodePhoto(value);
    if (bytes != null) {
      return Image.memory(bytes,
          height: 240, width: double.infinity, fit: BoxFit.cover);
    }
    if (value.startsWith('https://')) {
      return Image.network(
        value,
        height: 240,
        width: double.infinity,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => const SizedBox(
          height: 110,
          child: Center(child: Text('Attendance photo unavailable.')),
        ),
      );
    }
    return const SizedBox(
      height: 110,
      child: Center(child: Text('Unsupported photo format.')),
    );
  }

  static Uint8List? _decodePhoto(String value) {
    try {
      final encoded = value.startsWith('data:')
          ? value.substring(value.indexOf(',') + 1)
          : value;
      if (encoded.length < 40) return null;
      return base64Decode(encoded);
    } catch (_) {
      return null;
    }
  }
}

class _PunchTime extends StatelessWidget {
  const _PunchTime({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: Theme.of(context).textTheme.labelSmall),
          const SizedBox(height: 2),
          Text(
            value,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w800,
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          ),
        ],
      );
}

String _formatPunch(String raw) {
  if (raw == '—' || raw.isEmpty) return '—';
  final parsed = DateTime.tryParse(raw);
  return parsed == null ? raw : DateFormat('hh:mm a').format(parsed.toLocal());
}

String _date(Map<String, dynamic> record) {
  final raw = _text(record, ['shiftDate', 'date', 'shift_date'], '');
  final parsed = DateTime.tryParse(raw);
  return parsed == null ? raw : DateFormat('dd MMM yyyy').format(parsed);
}

String _text(Map<String, dynamic> source, List<String> keys, String fallback) {
  for (final key in keys) {
    final value = source[key];
    if (value != null && value.toString().trim().isNotEmpty) {
      return value.toString().trim();
    }
  }
  return fallback;
}

double? _number(Map<String, dynamic> source, List<String> keys) {
  for (final key in keys) {
    final value = source[key];
    if (value is num) return value.toDouble();
    final parsed = double.tryParse(value?.toString() ?? '');
    if (parsed != null) return parsed;
  }
  return null;
}
