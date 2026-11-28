import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/utils/employee_filters.dart';
import '../../../core/utils/payroll_calculator.dart';

class HrmsRepository {
  HrmsRepository(this._api);

  final ApiClient _api;

  List<Map<String, dynamic>>? _employeeCache;
  DateTime? _employeeCacheAt;
  List<Map<String, dynamic>>? _payrollEmployeesCache;
  DateTime? _payrollEmployeesCacheAt;
  List<Map<String, dynamic>>? _departmentCache;
  DateTime? _departmentCacheAt;
  Map<String, dynamic>? _companyInfoCache;
  DateTime? _companyInfoCacheAt;
  List<Map<String, dynamic>>? _holidaysCache;
  DateTime? _holidaysCacheAt;
  Map<String, dynamic>? _settingsBundleCache;
  DateTime? _settingsBundleCacheAt;
  final Map<String, ({List<Map<String, dynamic>> rows, DateTime at})>
      _payrollRecordsCache = {};
  final Map<String, ({Map<String, dynamic> data, DateTime at})>
      _leaveBalanceCache = {};

  static const _cacheTtl = Duration(minutes: 2);
  static const _longCacheTtl = Duration(minutes: 10);
  static const _payrollCacheTtl = Duration(seconds: 60);
  static const _leaveBalanceCacheTtl = Duration(seconds: 45);

  // Tier-1 photo-free columns (includes optional OT/late duration columns).
  static const _attendancePayrollColumnsRich =
      'id,employee_id,date,shift_id,shift_date,check_in,check_out,working_hours,calculated_ot_hours,status,late_status,late_duration_minutes,method';
  // Tier-2 Web-verified columns (`frontend/src/services/supabaseDirectService.ts:1314`).
  static const _attendancePayrollColumnsWeb =
      'id,employee_id,date,shift_id,shift_date,check_in,check_out,working_hours,status,late_status,method';
  // Tier-3 minimal core columns present in every schema revision.
  static const _attendancePayrollColumnsCore =
      'id,employee_id,date,check_in,check_out,working_hours,status';

  /// Fetches photo-free `attendance_records` rows for `[fromIso, toIso]` with
  /// progressive column fallback so missing optional columns never silently
  /// zero out Payroll, Overtime, or Report attendance data.
  Future<List<Map<String, dynamic>>> fetchAttendanceRange({
    required String fromIso,
    required String toIso,
    bool descending = false,
    int limit = 4000,
  }) async {
    final dir = descending ? 'desc' : 'asc';
    final rangeFilter =
        'date=gte.$fromIso&date=lte.$toIso&order=date.$dir&limit=$limit';
    for (final cols in const [
      _attendancePayrollColumnsRich,
      _attendancePayrollColumnsWeb,
      _attendancePayrollColumnsCore,
    ]) {
      try {
        return await gatewayList(
          'attendance_records',
          query: 'select=$cols&$rangeFilter',
        );
      } catch (_) {
        // Retry with the narrower verified column list if an optional column
        // (such as calculated_ot_hours) is absent on this PostgreSQL instance.
      }
    }
    return const <Map<String, dynamic>>[];
  }

  void invalidatePayrollCache() {
    _payrollRecordsCache.clear();
    _settingsBundleCache = null;
    _settingsBundleCacheAt = null;
    _payrollEmployeesCache = null;
    _payrollEmployeesCacheAt = null;
  }

  void invalidateCache() {
    _employeeCache = null;
    _employeeCacheAt = null;
    _departmentCache = null;
    _departmentCacheAt = null;
    _companyInfoCache = null;
    _companyInfoCacheAt = null;
    _holidaysCache = null;
    _holidaysCacheAt = null;
    _leaveBalanceCache.clear();
    invalidatePayrollCache();
  }

  // ---------------------------------------------------------------------------
  // RBAC & Settings
  // ---------------------------------------------------------------------------

  Future<Map<String, dynamic>> permissions() => _api.get('/rbac');

  Future<Map<String, dynamic>> companyInfo() async {
    if (_companyInfoCache != null &&
        _companyInfoCacheAt != null &&
        DateTime.now().difference(_companyInfoCacheAt!) < _longCacheTtl) {
      return _companyInfoCache!;
    }
    final rows = await gatewayList(
      'company_settings',
      query: 'select=setting_key,setting_val&setting_key=eq.company_info&limit=1',
    ).catchError((_) => <Map<String, dynamic>>[]);
    if (rows.isNotEmpty && rows.first['setting_val'] is Map) {
      final info = Map<String, dynamic>.from(rows.first['setting_val'] as Map);
      _companyInfoCache = info;
      _companyInfoCacheAt = DateTime.now();
      return info;
    }
    return const <String, dynamic>{};
  }

  Future<List<Map<String, dynamic>>> departments(
      {bool forceRefresh = false}) async {
    if (!forceRefresh &&
        _departmentCache != null &&
        _departmentCacheAt != null &&
        DateTime.now().difference(_departmentCacheAt!) < _cacheTtl) {
      return _departmentCache!;
    }
    try {
      final rows = await _list('/departments');
      _departmentCache = rows;
      _departmentCacheAt = DateTime.now();
      return rows;
    } catch (_) {
      final rows = await gatewayList(
        'departments',
        query: 'select=*&order=name.asc&limit=100',
      ).catchError((_) => <Map<String, dynamic>>[]);
      _departmentCache = rows;
      _departmentCacheAt = DateTime.now();
      return rows;
    }
  }

  // ---------------------------------------------------------------------------
  // Attendance & Corrections
  // ---------------------------------------------------------------------------

  Future<Map<String, dynamic>> attendanceSummary() =>
      _api.get('/attendance/summary');

  Future<Map<String, dynamic>> shiftStatus(String employeeId) =>
      _api.get('/attendance/shift-status', query: {'employeeId': employeeId});

  Future<List<Map<String, dynamic>>> attendance({
    String? employeeId,
    String? date,
  }) =>
      _list('/attendance', query: {
        if (employeeId != null && employeeId.isNotEmpty)
          'employeeId': employeeId,
        if (date != null && date.isNotEmpty) 'date': date,
      });

  /// Fetches raw `attendance_records` rows via the PII-safe Data Gateway so
  /// PostgreSQL columns like `calculated_ot_hours` are always available on the
  /// mobile dashboard even when `/attendance` omits them.
  Future<List<Map<String, dynamic>>> attendanceRecordsForOvertime() =>
      gatewayList(
        'attendance_records',
        query:
            'select=id,employee_id,date,shift_date,status,working_hours,calculated_ot_hours&order=date.desc&limit=100',
      ).catchError((_) => <Map<String, dynamic>>[]);

  /// Fetches explicit overtime entries (`GET /api/v1/overtime`).
  Future<List<Map<String, dynamic>>> overtimeRecords() =>
      _list('/overtime').catchError((_) => <Map<String, dynamic>>[]);

  Future<Map<String, dynamic>> punch(Map<String, dynamic> payload) =>
      _api.post('/attendance/punch', body: payload);

  Future<Map<String, dynamic>> verifyFace(
          String employeeId, String photoBase64) =>
      _api.post('/attendance/verify-face', body: {
        'employeeId': employeeId,
        'facePhotoBase64': photoBase64,
      });

  Future<Map<String, dynamic>> correctAttendance(
          Map<String, dynamic> payload) =>
      _api.post('/attendance/correct', body: payload);

  // ---------------------------------------------------------------------------
  // Leaves & Holidays
  // ---------------------------------------------------------------------------

  Future<List<Map<String, dynamic>>> leaves({String? employeeId}) =>
      _list('/leaves', query: {
        if (employeeId != null && employeeId.isNotEmpty)
          'employeeId': employeeId,
      });

  Future<Map<String, dynamic>> leaveBalances(String employeeId) async {
    final cacheKey = employeeId.trim().toLowerCase();
    final cached = _leaveBalanceCache[cacheKey];
    if (cached != null &&
        DateTime.now().difference(cached.at) < _leaveBalanceCacheTtl) {
      return cached.data;
    }
    try {
      final raw = await _api.get('/leaves/balances/$employeeId');
      final data = raw['data'] is Map
          ? Map<String, dynamic>.from(raw['data'] as Map)
          : Map<String, dynamic>.from(raw);
      // Updated backend returns rich Web-parity `categories` & `totalPaidRemaining`.
      if (data['categories'] is List &&
          (data['categories'] as List).isNotEmpty) {
        _leaveBalanceCache[cacheKey] = (data: data, at: DateTime.now());
        return data;
      }
    } catch (_) {
      // Fall through to Web policy-based calculation below.
    }
    final computed = await computeWebLeaveBalancesFromGateway(employeeId);
    _leaveBalanceCache[cacheKey] = (data: computed, at: DateTime.now());
    return computed;
  }

  /// Computes exact Web HRMS Leave Balance summary from `company_settings.master_leave_policies_data`,
  /// `leave_requests`, and employee attendance (mirrors Web `leaveQuotaService.ts`) so mobile
  /// never displays legacy hardcoded 12/10/15 = 37 balances.
  Future<Map<String, dynamic>> computeWebLeaveBalancesFromGateway(
      String employeeId) async {
    final results = await Future.wait<dynamic>([
      gatewayList(
        'company_settings',
        query:
            'select=setting_key,setting_val&setting_key=eq.master_leave_policies_data&limit=1',
      ).catchError((_) => <Map<String, dynamic>>[]),
      leaves(employeeId: employeeId)
          .catchError((_) => <Map<String, dynamic>>[]),
      attendance(employeeId: employeeId)
          .catchError((_) => <Map<String, dynamic>>[]),
      holidays().catchError((_) => <Map<String, dynamic>>[]),
    ]);

    final settingRows = results[0] as List<Map<String, dynamic>>;
    final empLeaves = results[1] as List<Map<String, dynamic>>;
    final empAttendance = results[2] as List<Map<String, dynamic>>;
    final holidayList = results[3] as List<Map<String, dynamic>>;

    final categories = <Map<String, dynamic>>[];
    final seenNames = <String>{};

    if (settingRows.isNotEmpty && settingRows.first['setting_val'] is List) {
      for (final rawPolicy in settingRows.first['setting_val'] as List) {
        if (rawPolicy is! Map) continue;
        final status =
            (rawPolicy['status'] ?? 'Active').toString().toLowerCase();
        if (status != 'active') continue;
        final types = rawPolicy['leaveTypes'];
        if (types is! List) continue;
        for (final t in types) {
          if (t is! Map) continue;
          final name = (t['name'] ?? '').toString().trim();
          final key = name.toLowerCase();
          if (name.isEmpty || !seenNames.add(key)) continue;
          final isPaid = t['isPaid'] != false;
          final quota =
              num.tryParse('${t['quotaPerYear'] ?? (isPaid ? 1 : 12)}') ??
                  (isPaid ? 1 : 12);
          final codeMatch = RegExp(r'\(([^)]+)\)').firstMatch(name);
          final code = codeMatch?.group(1)?.trim() ??
              name.substring(0, name.length.clamp(0, 3)).toUpperCase();
          categories.add({
            'id': '${rawPolicy['id']}-${t['id'] ?? key}',
            'name': name,
            'code': code,
            'isPaid': isPaid,
            'annualQuota': quota.toDouble(),
            'usedDays': 0.0,
            'pendingDays': 0.0,
            'remainingDays': isPaid ? quota.toDouble() : 999.0,
            'policyName': (rawPolicy['policyName'] ?? name).toString(),
          });
        }
      }
    }

    if (categories.isEmpty) {
      categories.addAll([
        {
          'id': 'def-el',
          'name': 'Earned Leave (EL)',
          'code': 'EL',
          'isPaid': true,
          'annualQuota': 1.0,
          'usedDays': 0.0,
          'pendingDays': 0.0,
          'remainingDays': 1.0,
          'policyName': 'Earned Leave',
        },
        {
          'id': 'def-sl',
          'name': 'Sick Leave (SL)',
          'code': 'SL',
          'isPaid': true,
          'annualQuota': 1.0,
          'usedDays': 0.0,
          'pendingDays': 0.0,
          'remainingDays': 1.0,
          'policyName': 'Sick Leave',
        },
      ]);
    }
    if (!categories.any((c) => c['isPaid'] == false)) {
      categories.add({
        'id': 'def-lwp',
        'name': 'Unpaid Leave (LWP)',
        'code': 'LWP',
        'isPaid': false,
        'annualQuota': 12.0,
        'usedDays': 0.0,
        'pendingDays': 0.0,
        'remainingDays': 999.0,
        'policyName': 'Unpaid Leave Policy',
      });
    }

    bool isWfh(String s) {
      final l = s.toLowerCase();
      return l.contains('work from home') ||
          l == 'wfh' ||
          l.contains('wfh') ||
          l.contains('field visit');
    }

    bool isUnpaid(String s) {
      final l = s.toLowerCase();
      return l.contains('unpaid') ||
          l.contains('lwp') ||
          l.contains('loss of pay') ||
          l == 'lop';
    }

    bool matchesType(String reqType, String polName) {
      final r = reqType.toLowerCase();
      final p = polName.toLowerCase();
      if (r == p) return true;
      if (isUnpaid(r) || isUnpaid(p)) return isUnpaid(r) && isUnpaid(p);
      if (r.contains('sick') || r.contains('(sl)')) {
        return p.contains('sick') || p.contains('(sl)');
      }
      if (r.contains('earn') || r.contains('(el)') || r.contains('paid')) {
        return p.contains('earn') || p.contains('(el)') || p.contains('paid');
      }
      if (r.contains('casual') || r.contains('(cl)')) {
        return p.contains('casual') || p.contains('(cl)');
      }
      return false;
    }

    final paidCats = categories.where((c) => c['isPaid'] == true).toList();
    final unpaidCat = categories.firstWhere((c) => c['isPaid'] == false);
    final primaryPaid = paidCats.isNotEmpty
        ? paidCats.firstWhere(
            (c) => !c['name'].toString().toLowerCase().contains('sick'),
            orElse: () => paidCats.first,
          )
        : null;

    for (final leave in empLeaves) {
      final type = (leave['leaveType'] ?? leave['leave_type'] ?? '').toString();
      if (isWfh(type)) continue;
      final status = (leave['status'] ?? '').toString().toLowerCase();
      final days =
          (num.tryParse('${leave['daysCount'] ?? leave['days_count'] ?? 1}') ??
                  1)
              .toDouble()
              .clamp(0.5, 365.0);
      if (status == 'approved') {
        if (isUnpaid(type) || primaryPaid == null) {
          unpaidCat['usedDays'] = (unpaidCat['usedDays'] as double) + days;
        } else {
          final target = paidCats.firstWhere(
            (c) => matchesType(type, c['name'].toString()),
            orElse: () => primaryPaid,
          );
          final avail = ((target['annualQuota'] as double) -
                  (target['usedDays'] as double))
              .clamp(0.0, 999.0);
          final actualPaid = days <= avail ? days : avail;
          final overflow = (days - actualPaid).clamp(0.0, 999.0);
          target['usedDays'] = (target['usedDays'] as double) + actualPaid;
          target['remainingDays'] = ((target['annualQuota'] as double) -
                  (target['usedDays'] as double))
              .clamp(0.0, 999.0);
          if (overflow > 0) {
            unpaidCat['usedDays'] =
                (unpaidCat['usedDays'] as double) + overflow;
          }
        }
      } else if (status == 'pending') {
        if (isUnpaid(type)) {
          unpaidCat['pendingDays'] =
              (unpaidCat['pendingDays'] as double) + days;
        } else if (primaryPaid != null) {
          final target = paidCats.firstWhere(
            (c) => matchesType(type, c['name'].toString()),
            orElse: () => primaryPaid,
          );
          target['pendingDays'] = (target['pendingDays'] as double) + days;
        }
      }
    }

    final totalAnnualQuota =
        paidCats.fold<double>(0, (s, c) => s + (c['annualQuota'] as double));
    final totalPaidUsed =
        paidCats.fold<double>(0, (s, c) => s + (c['usedDays'] as double));
    final totalPaidPending =
        paidCats.fold<double>(0, (s, c) => s + (c['pendingDays'] as double));
    final totalPaidRemaining =
        (totalAnnualQuota - totalPaidUsed).clamp(0.0, 999.0);
    final approvedUnpaidDays = unpaidCat['usedDays'] as double;

    // Count Absent / Rejected Leave LOP days in current month
    double rejectedAbsent = 0;
    double uninformedAbsent = 0;
    final now = DateTime.now();
    final todayStr =
        '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
    final holidayDates = holidayList
        .map((h) => (h['date'] ?? '').toString().split('T').first)
        .where((s) => s.length == 10)
        .toSet();
    final attByDate = <String, Map<String, dynamic>>{};
    for (final a in empAttendance) {
      final d = (a['date'] ?? a['shiftDate'] ?? a['shift_date'] ?? '')
          .toString()
          .split('T')
          .first;
      if (d.length == 10) attByDate.putIfAbsent(d, () => a);
    }
    for (final leave in empLeaves) {
      if ((leave['status'] ?? '').toString().toLowerCase() != 'rejected') {
        continue;
      }
      final s = (leave['startDate'] ?? leave['start_date'] ?? '')
          .toString()
          .split('T')
          .first;
      if (s.length == 10 &&
          s.compareTo(todayStr) < 0 &&
          !holidayDates.contains(s)) {
        final att = attByDate[s];
        final st = (att?['status'] ?? '').toString().toLowerCase();
        final present = att != null &&
            st != 'absent' &&
            (att['checkIn'] != null ||
                att['check_in'] != null ||
                st == 'present');
        if (!present) rejectedAbsent += 1;
      }
    }
    for (final entry in attByDate.entries) {
      if (entry.key.startsWith(todayStr.substring(0, 7)) &&
          entry.key.compareTo(todayStr) < 0 &&
          (entry.value['status'] ?? '').toString().toLowerCase() == 'absent') {
        final wasRejected = empLeaves.any((l) =>
            (l['status'] ?? '').toString().toLowerCase() == 'rejected' &&
            (l['startDate'] ?? l['start_date'] ?? '')
                .toString()
                .startsWith(entry.key));
        if (!wasRejected) uninformedAbsent += 1;
      }
    }

    final totalUnpaidUsed =
        approvedUnpaidDays + rejectedAbsent + uninformedAbsent;
    unpaidCat['usedDays'] = totalUnpaidUsed;

    return {
      'employeeId': employeeId,
      'year': now.year,
      'totalAnnualQuota': totalAnnualQuota,
      'totalPaidUsed': totalPaidUsed,
      'totalPaidPending': totalPaidPending,
      'totalPaidRemaining': totalPaidRemaining,
      'totalUnpaidUsed': totalUnpaidUsed,
      'approvedUnpaidDays': approvedUnpaidDays,
      'rejectedLeaveAbsentDays': rejectedAbsent,
      'uninformedAbsentDays': uninformedAbsent,
      'categories': categories,
    };
  }

  Future<Map<String, dynamic>> createLeave(Map<String, dynamic> payload) async {
    final res = await _api.post('/leaves', body: payload);
    _leaveBalanceCache.clear();
    return res;
  }

  Future<Map<String, dynamic>> decideLeave(
    String id,
    String decision, {
    String? comment,
  }) async {
    final res = await _api.patch('/leaves/$id/decision', body: {
      'decision': decision,
      if (comment != null && comment.trim().isNotEmpty)
        'comment': comment.trim(),
    });
    _leaveBalanceCache.clear();
    return res;
  }

  Future<List<Map<String, dynamic>>> holidays() async {
    if (_holidaysCache != null &&
        _holidaysCacheAt != null &&
        DateTime.now().difference(_holidaysCacheAt!) < _longCacheTtl) {
      return _holidaysCache!;
    }
    final rows = await gatewayList(
      'company_settings',
      query:
          'select=setting_key,setting_val&setting_key=eq.holiday_policies_data&limit=1',
    ).catchError((_) => <Map<String, dynamic>>[]);
    if (rows.isNotEmpty) {
      final val = rows.first['setting_val'];
      final extracted = _flattenHolidays(val);
      if (extracted.isNotEmpty) {
        _holidaysCache = extracted;
        _holidaysCacheAt = DateTime.now();
        return extracted;
      }
    }
    final legacy = await gatewayList(
      'company_settings',
      query:
          'select=setting_key,setting_val&setting_key=eq.holiday_calendar&limit=1',
    ).catchError((_) => <Map<String, dynamic>>[]);
    if (legacy.isNotEmpty) {
      final extracted = _flattenHolidays(legacy.first['setting_val']);
      _holidaysCache = extracted;
      _holidaysCacheAt = DateTime.now();
      return extracted;
    }
    return const [];
  }

  static List<Map<String, dynamic>> _flattenHolidays(dynamic raw) {
    final result = <Map<String, dynamic>>[];
    if (raw is List) {
      for (final item in raw) {
        if (item is! Map) continue;
        final map = Map<String, dynamic>.from(item);
        final nested = map['holidays'];
        if (nested is List) {
          final policyName =
              (map['name'] ?? map['policyName'] ?? 'Company').toString();
          for (final h in nested) {
            if (h is Map) {
              result.add({
                ...Map<String, dynamic>.from(h),
                'policyName': policyName,
              });
            }
          }
        } else {
          result.add(map);
        }
      }
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Employees
  // ---------------------------------------------------------------------------

  Future<List<Map<String, dynamic>>> employees({
    bool activeOnly = false,
    bool forceRefresh = false,
  }) async {
    if (!forceRefresh &&
        _employeeCache != null &&
        _employeeCacheAt != null &&
        DateTime.now().difference(_employeeCacheAt!) < _cacheTtl) {
      return _filterEmployees(_employeeCache!, activeOnly: activeOnly);
    }

    List<Map<String, dynamic>> rows;
    try {
      rows = await _list('/employees');
    } catch (_) {
      // Standard Employee roles lack direct /api/v1/employees permission, but
      // the backend data gateway returns a PII-sanitized directory for task
      // assignment and colleague pickers.
      try {
        rows = await gatewayList(
          'employees',
          query:
              'select=id,employee_id,first_name,last_name,designation,status,account_status,phone,avatar_url,departments!employees_department_id_fkey(name)&order=first_name.asc&limit=500',
        );
      } catch (_) {
        rows = await gatewayList(
          'employees',
          query:
              'select=id,employee_id,first_name,last_name,designation,status,account_status,phone,avatar_url&order=first_name.asc&limit=500',
        );
      }
    }
    final normalized = rows.map((row) {
      final profile = row['profile_data'] is Map
          ? Map<String, dynamic>.from(row['profile_data'] as Map)
          : const <String, dynamic>{};
      final embeddedDept = row['departments'] is Map
          ? Map<String, dynamic>.from(row['departments'] as Map)
          : row['department'] is Map
              ? Map<String, dynamic>.from(row['department'] as Map)
              : const <String, dynamic>{};
      String first(List<String> keys) {
        for (final source in [row, profile]) {
          for (final key in keys) {
            final value = source[key];
            if (value != null &&
                value is! Map &&
                value.toString().trim().isNotEmpty) {
              return value.toString().trim();
            }
          }
        }
        return '';
      }

      final firstName = first(['firstName', 'first_name']);
      final lastName = first(['lastName', 'last_name']);
      final directName = first(['name', 'fullName', 'full_name']);
      final fullName = directName.isNotEmpty
          ? directName
          : [firstName, lastName].where((value) => value.isNotEmpty).join(' ');
      final deptName =
          first(['department', 'departmentName', 'department_name']);
      final resolvedDept = deptName.isNotEmpty
          ? deptName
          : (embeddedDept['name']?.toString().trim() ?? '');
      return <String, dynamic>{
        ...row,
        'id': first(['id']),
        'employeeId': first(['employeeId', 'employee_id', 'employeeCode']),
        'employee_id': first(['employeeId', 'employee_id', 'employeeCode']),
        'name': fullName,
        'firstName': firstName,
        'lastName': lastName,
        'department': resolvedDept,
        'designation': first(['designation', 'jobTitle', 'job_title']),
        'phone': first(['phone', 'phone_number', 'mobile', 'contactNumber', 'contact_number']),
        'avatarUrl': first(['avatarUrl', 'avatar_url', 'avatar']),
        'status': first(['status', 'accountStatus', 'account_status']),
      };
    }).toList(growable: false);

    _employeeCache = normalized;
    _employeeCacheAt = DateTime.now();
    return _filterEmployees(normalized, activeOnly: activeOnly);
  }

  static List<Map<String, dynamic>> _filterEmployees(
    List<Map<String, dynamic>> list, {
    required bool activeOnly,
  }) {
    if (!activeOnly) return list;
    return list.where((employee) {
      final status = employee['status']?.toString().trim().toLowerCase() ?? '';
      return status.isEmpty || status == 'active';
    }).toList(growable: false);
  }

  Future<Map<String, dynamic>> employee(String id) async {
    final response = await _api.get('/employees/$id');
    final data = response['data'];
    return data is Map ? Map<String, dynamic>.from(data) : response;
  }

  // ---------------------------------------------------------------------------
  // Shifts & Shift Requests
  // ---------------------------------------------------------------------------

  Future<List<Map<String, dynamic>>> shifts() => _list('/shifts');

  Future<List<Map<String, dynamic>>> shiftAssignmentSummary() =>
      _list('/shifts/assignment-summary')
          .catchError((_) => <Map<String, dynamic>>[]);

  Future<Map<String, dynamic>> createShift(Map<String, dynamic> payload) =>
      _api.post('/shifts', body: payload);

  Future<Map<String, dynamic>> assignEmployeesToShift(
    String shiftId,
    List<String> employeeIds,
  ) =>
      _api.put('/shifts/$shiftId/assignments', body: {
        'employeeIds': employeeIds,
      });

  Future<Map<String, dynamic>> createShiftRequest(
          Map<String, dynamic> payload) =>
      _api.post('/shifts/requests', body: payload);

  Future<List<Map<String, dynamic>>> shiftRequests() async {
    final results = <Map<String, dynamic>>[];
    final seen = <String>{};

    void addAll(List<Map<String, dynamic>> list) {
      for (final item in list) {
        final key = (item['id'] ??
                '${item['employeeId'] ?? item['employee_id']}_${item['requestedDate'] ?? item['requested_date']}_${item['requestedShift'] ?? item['requested_shift']}')
            .toString();
        if (seen.add(key)) results.add(item);
      }
    }

    final fetched = await Future.wait<List<Map<String, dynamic>>>([
      gatewayList(
        'shift_requests',
        query: 'select=*&order=created_at.desc&limit=100',
      ).catchError((_) => <Map<String, dynamic>>[]),
      gatewayList(
        'company_settings',
        query:
            'select=setting_key,setting_val&setting_key=in.(shift_requests_data,shift_requests_vps_data)&limit=2',
      ).catchError((_) => <Map<String, dynamic>>[]),
    ]);
    addAll(fetched[0]);
    for (final row in fetched[1]) {
      if (row['setting_val'] is List) {
        addAll((row['setting_val'] as List)
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList());
      }
    }
    return results;
  }

  Future<void> decideShiftRequest({
    required String requestId,
    required String status,
    String? rejectionReason,
    required String decidedBy,
  }) async {
    // 1. Update relational shift_requests table if record exists there.
    await _gatewayMutation(
      'shift_requests?id=eq.${Uri.encodeQueryComponent(requestId)}',
      'PATCH',
      {
        'status': status,
        if (rejectionReason != null && rejectionReason.isNotEmpty)
          'rejection_reason': rejectionReason,
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      },
    ).catchError((_) => <String, dynamic>{});

    // 2. Sync company_settings.shift_requests_data used by Web ShiftManagement.
    final rows = await gatewayList(
      'company_settings',
      query: 'select=*&setting_key=eq.shift_requests_data&limit=1',
    ).catchError((_) => <Map<String, dynamic>>[]);
    if (rows.isNotEmpty && rows.first['setting_val'] is List) {
      final list = (rows.first['setting_val'] as List)
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
      var changed = false;
      for (final item in list) {
        if (item['id']?.toString() == requestId) {
          item['status'] = status;
          item['approvedBy'] = decidedBy;
          item['approvedAt'] = DateTime.now().toUtc().toIso8601String();
          if (rejectionReason != null && rejectionReason.isNotEmpty) {
            item['rejectionReason'] = rejectionReason;
          }
          changed = true;
        }
      }
      if (changed) {
        await _gatewayMutation(
          'company_settings?setting_key=eq.shift_requests_data',
          'PATCH',
          {'setting_val': list},
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Payroll & Payslips (Web Authoritative payroll_records_data + API Merge)
  // ---------------------------------------------------------------------------

  static const _monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  static ({int month, int year}) _parsePayrollPeriod(Map<String, dynamic> raw) {
    var m =
        int.tryParse('${raw['payrollMonth'] ?? raw['payroll_month'] ?? ''}');
    var y = int.tryParse(
        '${raw['payrollYear'] ?? raw['payroll_year'] ?? raw['year'] ?? ''}');
    if ((m == null || m < 1 || m > 12) && raw['month'] is String) {
      final parts = raw['month'].toString().trim().split(RegExp(r'\s+'));
      if (parts.isNotEmpty) {
        final idx = _monthNames.indexWhere(
            (name) => name.toLowerCase().startsWith(parts.first.toLowerCase()));
        if (idx >= 0) m = idx + 1;
      }
      if (parts.length > 1 && (y == null || y < 2000)) {
        y = int.tryParse(parts[1]);
      }
    }
    if (m == null || m < 1 || m > 12) {
      final parsed =
          DateTime.tryParse('${raw['payroll_month'] ?? raw['month'] ?? ''}');
      if (parsed != null) {
        m = parsed.month;
        if (y == null || y < 2000) y = parsed.year;
      }
    }
    final now = DateTime.now();
    return (
      month: (m != null && m >= 1 && m <= 12) ? m : now.month,
      year: (y != null && y >= 2000) ? y : now.year
    );
  }

  Future<Map<String, dynamic>> _companySettingsBundle(
      {bool forceRefresh = false}) async {
    if (!forceRefresh &&
        _settingsBundleCache != null &&
        _settingsBundleCacheAt != null &&
        DateTime.now().difference(_settingsBundleCacheAt!) < _payrollCacheTtl) {
      return _settingsBundleCache!;
    }

    const keys = [
      'payroll_records_data',
      'employee_profiles_data',
      'company_info',
      'holiday_policies_data',
      'holiday_calendar',
      'master_attendance_policies_data',
      'payroll_settings_config',
      'loan_records_data',
      'overtime_policy_data',
      'department_ot_policies_data',
      'employee_ot_policies_data',
      'overtime_requests_data',
    ];

    final bundle = <String, dynamic>{};
    final rows = await gatewayList(
      'company_settings',
      query:
          'select=setting_key,setting_val&setting_key=in.(${keys.join(',')})&limit=20',
    ).catchError((_) => <Map<String, dynamic>>[]);

    for (final row in rows) {
      final k = (row['setting_key'] ?? '').toString().trim();
      if (k.isNotEmpty && row.containsKey('setting_val')) {
        bundle[k] = row['setting_val'];
      }
    }

    // Fallback for environments/tests that only match individual `eq.` filters.
    if (bundle.isEmpty) {
      final individual = await Future.wait<List<Map<String, dynamic>>>([
        for (final key in keys)
          gatewayList(
            'company_settings',
            query: 'select=setting_key,setting_val&setting_key=eq.$key&limit=1',
          ).catchError((_) => <Map<String, dynamic>>[]),
      ]);
      for (var i = 0; i < keys.length; i++) {
        if (individual[i].isNotEmpty) {
          bundle[keys[i]] = individual[i].first['setting_val'];
        }
      }
    }

    // Hydrate standalone caches so Payslip & Leave screens avoid duplicate calls.
    if (bundle['company_info'] is Map) {
      _companyInfoCache =
          Map<String, dynamic>.from(bundle['company_info'] as Map);
      _companyInfoCacheAt = DateTime.now();
    }
    final extractedHolidays = _flattenHolidays(bundle['holiday_policies_data']);
    if (extractedHolidays.isNotEmpty) {
      _holidaysCache = extractedHolidays;
      _holidaysCacheAt = DateTime.now();
    } else {
      final legacyHolidays = _flattenHolidays(bundle['holiday_calendar']);
      if (legacyHolidays.isNotEmpty) {
        _holidaysCache = legacyHolidays;
        _holidaysCacheAt = DateTime.now();
      }
    }

    _settingsBundleCache = bundle;
    _settingsBundleCacheAt = DateTime.now();
    return bundle;
  }

  /// Fetches employee master records including unredacted `profile_data`,
  /// `basic_salary`, `joining_date`, `bank_name`, `account_number`, `ifsc_code`,
  /// `company_id`, `phone`, and `status` via the Data Gateway (photo-free),
  /// merged with Web `company_settings.employee_profiles_data` overrides
  /// (`salaryDetails.monthlyCtc`, `withPf`, `salaryScheme`, `bankDetails`,
  /// `panNumber`, `exitDate`) matching Web `HRMSContext.tsx:14113`.
  Future<List<Map<String, dynamic>>> _payrollEmployees({
    bool forceRefresh = false,
    Map<String, dynamic>? profilesOverlay,
  }) async {
    final canUseCache = !forceRefresh &&
        _payrollEmployeesCache != null &&
        _payrollEmployeesCacheAt != null &&
        DateTime.now().difference(_payrollEmployeesCacheAt!) < _cacheTtl;

    List<Map<String, dynamic>> baseNormalized;
    if (canUseCache) {
      baseNormalized = _payrollEmployeesCache!;
    } else {
      List<Map<String, dynamic>> rows = const [];
      // Strictly verified public.employees columns (NOTE: exit_date lives inside
      // profile_data / employee_profiles_data, NOT as a top-level SQL column).
      for (final q in const [
        'select=id,employee_id,first_name,last_name,designation,status,account_status,phone,basic_salary,joining_date,bank_name,account_number,ifsc_code,company_id,department_id,profile_data,departments!employees_department_id_fkey(name)&limit=500',
        'select=id,employee_id,first_name,last_name,designation,status,account_status,phone,basic_salary,joining_date,bank_name,account_number,ifsc_code,company_id,department_id,profile_data&limit=500',
        'select=*,departments!employees_department_id_fkey(name)&limit=500',
        'select=*&limit=500',
      ]) {
        try {
          rows = await gatewayList('employees', query: q);
          if (rows.isNotEmpty) break;
        } catch (_) {
          // Try narrower/fallback projection.
        }
      }

      if (rows.isEmpty) {
        rows = await employees(forceRefresh: forceRefresh)
            .catchError((_) => <Map<String, dynamic>>[]);
      }

      baseNormalized = rows.map((row) {
        final profile = row['profile_data'] is Map
            ? Map<String, dynamic>.from(row['profile_data'] as Map)
            : const <String, dynamic>{};
        final embeddedDept = row['departments'] is Map
            ? Map<String, dynamic>.from(row['departments'] as Map)
            : row['department'] is Map
                ? Map<String, dynamic>.from(row['department'] as Map)
                : const <String, dynamic>{};

        String pick(List<String> keys) {
          for (final src in [row, profile]) {
            for (final k in keys) {
              final v = src[k];
              if (v != null && v is! Map && v.toString().trim().isNotEmpty) {
                return v.toString().trim();
              }
            }
          }
          return '';
        }

        final firstName = pick(['firstName', 'first_name']);
        final lastName = pick(['lastName', 'last_name']);
        final fullName = pick(['name', 'fullName', 'full_name']).isNotEmpty
            ? pick(['name', 'fullName', 'full_name'])
            : [firstName, lastName].where((p) => p.isNotEmpty).join(' ');
        final dept = pick(['department', 'departmentName', 'department_name'])
                .isNotEmpty
            ? pick(['department', 'departmentName', 'department_name'])
            : (embeddedDept['name']?.toString().trim() ?? '');

        final profileStatus = (profile['status'] ?? '').toString().trim();
        final rowStatus =
            (row['status'] ?? row['account_status'] ?? '').toString().trim();
        final resolvedStatus =
            profileStatus.isNotEmpty ? profileStatus : rowStatus;

        return <String, dynamic>{
          ...row,
          'id': pick(['id']),
          'employeeId': pick(['employeeId', 'employee_id', 'employeeCode']),
          'employee_id': pick(['employeeId', 'employee_id', 'employeeCode']),
          'name': fullName,
          'firstName': firstName,
          'lastName': lastName,
          'department': dept,
          'designation': pick(['designation', 'jobTitle', 'job_title']),
          'phone': pick([
            'phone',
            'phone_number',
            'mobile',
            'contactNumber',
            'contact_number',
          ]),
          'status': resolvedStatus,
        };
      }).toList(growable: false);

      _payrollEmployeesCache = baseNormalized;
      _payrollEmployeesCacheAt = DateTime.now();
    }

    if (profilesOverlay == null || profilesOverlay.isEmpty) {
      return baseNormalized;
    }

    // Index `employee_profiles_data` case-insensitively by key, employeeId, and id.
    final extById = <String, Map<String, dynamic>>{};
    profilesOverlay.forEach((key, val) {
      if (val is! Map) return;
      final m = Map<String, dynamic>.from(val);
      final kNorm = key.trim().toLowerCase();
      if (kNorm.isNotEmpty) extById[kNorm] = m;
      final eCode =
          (m['employeeId'] ?? m['employee_id'] ?? '').toString().trim().toLowerCase();
      if (eCode.isNotEmpty) extById[eCode] = m;
      final eUuid = (m['id'] ?? '').toString().trim().toLowerCase();
      if (eUuid.isNotEmpty) extById[eUuid] = m;
    });

    return baseNormalized.map((emp) {
      final code =
          (emp['employeeId'] ?? emp['employee_id'] ?? '').toString().trim().toLowerCase();
      final uuid = (emp['id'] ?? '').toString().trim().toLowerCase();
      final ext = extById[code] ?? extById[uuid];
      if (ext == null) return emp;

      final existingProfile = emp['profile_data'] is Map
          ? Map<String, dynamic>.from(emp['profile_data'] as Map)
          : <String, dynamic>{};
      final extSalary =
          ext['salaryDetails'] is Map ? Map<String, dynamic>.from(ext['salaryDetails'] as Map) : null;
      final existingSalary = existingProfile['salaryDetails'] is Map
          ? Map<String, dynamic>.from(existingProfile['salaryDetails'] as Map)
          : <String, dynamic>{};
      final mergedSalary = <String, dynamic>{
        ...existingSalary,
        if (extSalary != null) ...extSalary,
      };
      final extBank =
          ext['bankDetails'] is Map ? Map<String, dynamic>.from(ext['bankDetails'] as Map) : null;
      final existingBank = existingProfile['bankDetails'] is Map
          ? Map<String, dynamic>.from(existingProfile['bankDetails'] as Map)
          : <String, dynamic>{};
      final mergedBank = <String, dynamic>{
        ...existingBank,
        if (extBank != null) ...extBank,
      };

      final mergedProfile = <String, dynamic>{
        ...existingProfile,
        ...ext,
        if (mergedSalary.isNotEmpty) 'salaryDetails': mergedSalary,
        if (mergedBank.isNotEmpty) 'bankDetails': mergedBank,
      };

      final extStatus = (ext['status'] ?? '').toString().trim();
      final extJoin =
          (ext['joiningDate'] ?? ext['dateOfJoining'] ?? '').toString().trim();
      return <String, dynamic>{
        ...emp,
        'profile_data': mergedProfile,
        if (ext.containsKey('withPf')) 'withPf': ext['withPf'],
        if (extJoin.isNotEmpty && '${emp['joining_date'] ?? ''}'.trim().isEmpty)
          'joining_date': extJoin,
        if (extStatus.isNotEmpty) 'status': extStatus,
      };
    }).toList(growable: false);
  }

  static bool _isInactiveEmployee(Map<String, dynamic> emp) {
    final profile = emp['profile_data'] is Map
        ? Map<String, dynamic>.from(emp['profile_data'] as Map)
        : const <String, dynamic>{};
    final st = (profile['status'] ?? emp['status'] ?? emp['account_status'] ?? '')
        .toString()
        .trim()
        .toLowerCase();
    return st.isNotEmpty && st != 'active';
  }

  static bool _isSecondaryCompanyRecord(
      Map<String, dynamic> rec, Map<String, dynamic>? emp) {
    final recCid =
        (rec['company_id'] ?? rec['companyId'] ?? '').toString().trim().toLowerCase();
    if (recCid == 'company-b') return true;
    final empCid =
        (emp?['company_id'] ?? emp?['companyId'] ?? '').toString().trim().toLowerCase();
    if (empCid == 'company-b') return true;
    final code = (rec['employeeId'] ?? rec['employee_id'] ?? '')
        .toString()
        .trim()
        .toUpperCase();
    if (code.startsWith('EMP-B')) return true;
    return false;
  }

  List<Map<String, dynamic>> _normalizeSettingsPayrollList(
    dynamic settingVal, {
    int? month,
    int? year,
    String? employeeId,
  }) {
    if (settingVal is! List) return const [];

    final normalized = <Map<String, dynamic>>[];
    for (final item in settingVal) {
      if (item is! Map) continue;
      final raw = Map<String, dynamic>.from(item);
      final empCode =
          (raw['employeeId'] ?? raw['employee_id'] ?? '').toString().trim();
      if (empCode.isEmpty ||
          empCode.toUpperCase() == 'VRM-001' ||
          empCode.toUpperCase() == 'EMP-000') {
        continue;
      }
      final period = _parsePayrollPeriod(raw);
      if (month != null && period.month != month) continue;
      if (year != null && period.year != year) continue;
      if (employeeId != null && employeeId.isNotEmpty) {
        if (empCode.toLowerCase() != employeeId.trim().toLowerCase()) continue;
      }

      double numVal(List<String> keys, [double fallback = 0]) {
        for (final k in keys) {
          final parsed = double.tryParse('${raw[k] ?? ''}');
          if (parsed != null) return parsed;
        }
        return fallback;
      }

      final basic = numVal(['basicSalary', 'basic_salary']);
      final hra = numVal(['hra']);
      final da = numVal(['da']);
      final conveyance = numVal(['conveyance']);
      final bonus = numVal(['bonus']);
      final ot = numVal(['overtimeAmount', 'otVariableAmount']);
      final gross = numVal(['grossSalary', 'gross_salary'],
          basic + hra + da + conveyance + bonus + ot);
      final net = numVal(['netSalary', 'net_salary']);
      final pf = numVal(['pfAmount', 'epfDeduction']);
      final esic = numVal(['esicAmount', 'esiDeduction']);
      // IMPORTANT: NEVER map Web `taxDeduction` to `professionalTax`!
      // On Web HRMSContext.tsx:14681, `taxDeduction` stores total statutory
      // deductions (EPF + ESIC + PT), so reading it as PT double-counted EPF/ESIC.
      final pt = numVal(['professionalTax']);
      final lopAmt = numVal(['lopAmount', 'leaveDeduction']);
      final lateDed = numVal(['lateAttendanceDeduction']);
      final advDed = numVal(['advanceRecovery', 'advanceDeduction']);
      final loanDed = numVal(['loanRecovery', 'loanDeduction']);
      final otherDed = numVal(['otherDeductions']);
      final totalDed = numVal(
        ['totalDeductions', 'total_deductions'],
        (gross - net).clamp(0, double.infinity),
      );
      final calDays = numVal(
        ['calendarDays', 'calendarDaysInMonth'],
        DateTime(period.year, period.month + 1, 0).day.toDouble(),
      );
      final lopDays = numVal(['lopDays', 'unpaidLeaves']);
      final paidDays = numVal(
          ['totalPaidDays', 'paidDays'], (calDays - lopDays).clamp(0, calDays));

      // IMPORTANT: Only preserve explicit monthlyCtc/monthlySalary/ctc if present
      // on the raw record — NEVER default monthlySalary to prorated `gross`!
      final explicitCtc = numVal(['monthlyCtc', 'monthlySalary', 'ctc'], 0);

      normalized.add({
        ...raw,
        'source': 'web_settings',
        'employeeId': empCode,
        'employeeName': (raw['employeeName'] ?? empCode).toString().trim(),
        'designation': (raw['designation'] ?? '').toString().trim(),
        'department': (raw['department'] ?? '').toString().trim(),
        'payrollMonth': period.month,
        'payrollYear': period.year,
        if (explicitCtc > 0) 'monthlySalary': explicitCtc,
        if (explicitCtc > 0) 'monthlyCtc': explicitCtc,
        'basicSalary': basic,
        'hra': hra,
        'da': da,
        'conveyance': conveyance,
        'bonus': bonus,
        'overtimeAmount': ot,
        'grossSalary': gross,
        'pfAmount': pf,
        'esicAmount': esic,
        'professionalTax': pt,
        'lopAmount': lopAmt,
        'lateAttendanceDeduction': lateDed,
        'advanceRecovery': advDed,
        'loanRecovery': loanDed,
        'otherDeductions': otherDed,
        'totalDeductions': totalDed,
        'netSalary': net,
        'calendarDays': calDays,
        'workingDays': numVal(['workingDays', 'scheduledWorkingDays'], 26),
        'presentDays': numVal(['presentDays']),
        'paidWeekOffDays': numVal(['paidWeekOffDays']),
        'paidHolidayDays': numVal(['paidHolidayDays']),
        'paidLeaveDays': numVal(['paidLeaveDays', 'paidLeaves']),
        'lopDays': lopDays,
        'totalPaidDays': paidDays,
        'status': (raw['status'] ?? 'Processed').toString(),
      });
    }
    return normalized;
  }

  Future<List<Map<String, dynamic>>> payrollRecords({
    int? month,
    int? year,
    String? employeeId,
  }) async {
    final targetMonth = (month ?? DateTime.now().month).clamp(1, 12);
    final targetYear = year ?? DateTime.now().year;
    final cacheKey =
        '$targetMonth|$targetYear|${(employeeId ?? '').trim().toLowerCase()}';
    final cached = _payrollRecordsCache[cacheKey];
    if (cached != null &&
        DateTime.now().difference(cached.at) < _payrollCacheTtl) {
      return cached.rows;
    }

    final calDays = DateTime(targetYear, targetMonth + 1, 0).day;
    final monthPad = targetMonth.toString().padLeft(2, '0');
    final monthStart = '$targetYear-$monthPad-01';
    final monthEnd =
        '$targetYear-$monthPad-${calDays.toString().padLeft(2, '0')}';

    // Single parallel round-trip:
    // 1) Batched company_settings (payroll_records_data, employee_profiles_data,
    //    company_info, holidays, master_attendance_policies_data,
    //    payroll_settings_config, loan_records_data)
    // 2) Full photo-free employee master directory
    // 3) Photo-free attendance_records for the target month (verified columns + fallback)
    // 4) Leaves for the target employee/company
    final results = await Future.wait<dynamic>([
      _companySettingsBundle().catchError((_) => <String, dynamic>{}),
      _payrollEmployees().catchError((_) => <Map<String, dynamic>>[]),
      fetchAttendanceRange(
        fromIso: monthStart,
        toIso: monthEnd,
        descending: false,
        limit: 4000,
      ).catchError((_) => <Map<String, dynamic>>[]),
      leaves(employeeId: employeeId)
          .catchError((_) => <Map<String, dynamic>>[]),
    ]);

    final settingsBundle = results[0] as Map<String, dynamic>;
    final profilesOverlay = settingsBundle['employee_profiles_data'] is Map
        ? Map<String, dynamic>.from(
            settingsBundle['employee_profiles_data'] as Map)
        : null;
    // Merge Web `employee_profiles_data` overrides (withPf, salaryDetails, bankDetails,
    // panNumber, exitDate) onto employees — 0 extra HTTP calls because base list is cached!
    final allEmployees = profilesOverlay != null && profilesOverlay.isNotEmpty
        ? await _payrollEmployees(profilesOverlay: profilesOverlay)
            .catchError((_) => results[1] as List<Map<String, dynamic>>)
        : results[1] as List<Map<String, dynamic>>;
    var monthAttendance = results[2] as List<Map<String, dynamic>>;
    if (monthAttendance.isEmpty &&
        employeeId != null &&
        employeeId.trim().isNotEmpty) {
      monthAttendance = await attendance(employeeId: employeeId)
          .catchError((_) => <Map<String, dynamic>>[]);
    }
    final allLeaves = results[3] as List<Map<String, dynamic>>;

    final settingsRecords = _normalizeSettingsPayrollList(
      settingsBundle['payroll_records_data'],
      month: month,
      year: year,
      employeeId: employeeId,
    );

    final payrollConfig = settingsBundle['payroll_settings_config'] is Map
        ? Map<String, dynamic>.from(
            settingsBundle['payroll_settings_config'] as Map)
        : null;
    final attendancePolicies =
        settingsBundle['master_attendance_policies_data'] is List
            ? (settingsBundle['master_attendance_policies_data'] as List)
                .whereType<Map>()
                .map((e) => Map<String, dynamic>.from(e))
                .toList(growable: false)
            : const <Map<String, dynamic>>[];
    final loanList = settingsBundle['loan_records_data'] is List
        ? (settingsBundle['loan_records_data'] as List)
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList(growable: false)
        : const <Map<String, dynamic>>[];

    final allHolidays = _holidaysCache ??
        _flattenHolidays(settingsBundle['holiday_policies_data']);
    final holidayDates = <String>{};
    for (final h in allHolidays) {
      final raw = (h['date'] ?? h['holiday_date'] ?? '').toString().trim();
      if (raw.length >= 10) holidayDates.add(raw.substring(0, 10));
    }

    final empById = <String, Map<String, dynamic>>{};
    for (final emp in allEmployees) {
      final code = (emp['employeeId'] ?? emp['employee_id'] ?? '')
          .toString()
          .trim()
          .toLowerCase();
      final uuid = (emp['id'] ?? '').toString().trim().toLowerCase();
      if (code.isNotEmpty) empById[code] = emp;
      if (uuid.isNotEmpty) empById[uuid] = emp;
    }

    // Use Web authoritative `payroll_records_data` when available for this period;
    // only hit `/payroll/records` or `payroll_records` table as fallback so
    // deleted/archived DB rows never re-appear and inflate employee counts.
    List<Map<String, dynamic>> rawSourceRecords = settingsRecords;
    if (rawSourceRecords.isEmpty) {
      rawSourceRecords = await _list('/payroll/records', query: {
        if (month != null) 'month': month,
        if (year != null) 'year': year,
        if (employeeId != null && employeeId.isNotEmpty)
          'employeeId': employeeId,
      }).catchError((_) => <Map<String, dynamic>>[]);
    }
    if (rawSourceRecords.isEmpty) {
      rawSourceRecords = await _payrollRecordsFromGateway(
        month: month,
        year: year,
        employeeId: employeeId,
      );
    }

    // Strict deduplication per (employeeId, year, month) matching Web PayrollManagement.tsx:278-290.
    final deduped = <String, Map<String, dynamic>>{};
    for (final rec in rawSourceRecords) {
      if (isCeoEmployeeRecord(rec)) continue;
      final code = (rec['employeeId'] ?? rec['employee_id'] ?? '')
          .toString()
          .trim()
          .toUpperCase();
      if (code.isEmpty || code == 'VRM-001' || code == 'EMP-000') continue;
      final p = _parsePayrollPeriod(rec);
      final key = '${code}_${p.year}_${p.month}';
      final existing = deduped[key];
      if (existing == null) {
        deduped[key] = rec;
      } else {
        final nextNet =
            double.tryParse('${rec['netSalary'] ?? rec['net_salary'] ?? 0}') ??
                0;
        final prevNet = double.tryParse(
                '${existing['netSalary'] ?? existing['net_salary'] ?? 0}') ??
            0;
        if ((nextNet > 0 && prevNet == 0) ||
            '${rec['id'] ?? ''}'.compareTo('${existing['id'] ?? ''}') > 0) {
          deduped[key] = rec;
        }
      }
    }

    final isCompanyWideView = employeeId == null || employeeId.trim().isEmpty;

    final recalculated = deduped.values
        .where((rec) => !isCeoEmployeeRecord(rec))
        .map((rec) {
          final p = _parsePayrollPeriod(rec);
          final code = (rec['employeeId'] ?? rec['employee_id'] ?? '')
              .toString()
              .trim()
              .toLowerCase();
          final emp = empById[code];

          // Match Web PayrollManagement.tsx:253-266 + HRMSContext.tsx:14534-14561:
          // Exclude secondary-company rows, CEO/Owner, deleted employees, and Inactive staff.
          if (_isSecondaryCompanyRecord(rec, emp)) return null;
          if (emp != null) {
            if (isCeoEmployeeRecord(emp)) return null;
            if (_isInactiveEmployee(emp)) return null;
          } else if (isCompanyWideView && allEmployees.isNotEmpty) {
            return null;
          }

          final recMonth = month ?? p.month;
          final recYear = year ?? p.year;
          final useLiveMonthData =
              recMonth == targetMonth && recYear == targetYear;
          return PayrollCalculator.recalculateRecord(
            record: rec,
            employee: emp,
            monthAttendance: useLiveMonthData ? monthAttendance : const [],
            approvedLeaves: useLiveMonthData ? allLeaves : const [],
            holidayDates: holidayDates,
            month: recMonth,
            year: recYear,
            payrollConfig: payrollConfig,
            attendancePolicies: attendancePolicies,
            loanRecords: loanList,
          );
        })
        .whereType<Map<String, dynamic>>()
        .toList();

    recalculated.sort((a, b) => (a['employeeId'] ?? '')
        .toString()
        .compareTo((b['employeeId'] ?? '').toString()));
    _payrollRecordsCache[cacheKey] = (rows: recalculated, at: DateTime.now());
    return recalculated;
  }

  Future<List<Map<String, dynamic>>> _payrollRecordsFromGateway({
    int? month,
    int? year,
    String? employeeId,
  }) async {
    final rows = await gatewayList(
      'payroll_records',
      query:
          'select=*,employee:employees(id,employee_id,first_name,last_name,designation)&order=payroll_month.desc&limit=200',
    ).catchError((_) => <Map<String, dynamic>>[]);

    final normalized = <Map<String, dynamic>>[];
    for (final row in rows) {
      final emp = row['employee'] is Map
          ? Map<String, dynamic>.from(row['employee'] as Map)
          : const <String, dynamic>{};
      final empCode = (emp['employee_id'] ??
              row['employee_code'] ??
              row['employee_id'] ??
              '')
          .toString()
          .trim();
      if (empCode.toUpperCase() == 'VRM-001' ||
          empCode.toUpperCase() == 'EMP-000') {
        continue;
      }
      final empName = [emp['first_name'], emp['last_name']]
          .where((p) => p != null && p.toString().trim().isNotEmpty)
          .join(' ')
          .trim();

      int? recMonth;
      int? recYear;
      final rawMonth = row['payroll_month']?.toString() ?? '';
      final parsedDate = DateTime.tryParse(rawMonth);
      if (parsedDate != null) {
        recMonth = parsedDate.month;
        recYear = parsedDate.year;
      } else {
        recMonth = int.tryParse(rawMonth);
        recYear = int.tryParse('${row['payroll_year'] ?? ''}');
      }

      if (month != null && recMonth != null && recMonth != month) continue;
      if (year != null && recYear != null && recYear != year) continue;
      if (employeeId != null && employeeId.isNotEmpty) {
        final target = employeeId.trim().toLowerCase();
        final matches = empCode.toLowerCase() == target ||
            (row['employee_id']?.toString().toLowerCase() == target) ||
            (emp['id']?.toString().toLowerCase() == target);
        if (!matches) continue;
      }

      final basic = double.tryParse('${row['basic_salary'] ?? 0}') ?? 0;
      final allowances = double.tryParse('${row['allowances'] ?? 0}') ?? 0;
      final bonus = double.tryParse('${row['bonus'] ?? 0}') ?? 0;
      final otAmt = double.tryParse('${row['ot_variable_amount'] ?? 0}') ?? 0;
      final gross = double.tryParse('${row['gross_salary'] ?? ''}') ??
          (basic + allowances + bonus + otAmt);
      final taxDed = double.tryParse('${row['tax_deduction'] ?? 0}') ?? 0;
      final leaveDed = double.tryParse('${row['leave_deduction'] ?? 0}') ?? 0;
      final pf =
          double.tryParse('${row['employer_pf_contribution'] ?? 0}') ?? 0;
      final esic =
          double.tryParse('${row['employer_esic_contribution'] ?? 0}') ?? 0;
      final totalDed = double.tryParse('${row['total_deductions'] ?? ''}') ??
          (taxDed + leaveDed);

      normalized.add({
        ...row,
        'employeeId': empCode,
        'employeeName': empName.isNotEmpty ? empName : empCode,
        'designation': emp['designation'] ?? '',
        'payrollMonth': recMonth ?? month ?? DateTime.now().month,
        'payrollYear': recYear ?? year ?? DateTime.now().year,
        'basicSalary': basic,
        'hra': allowances,
        'bonus': bonus,
        'overtimeAmount': otAmt,
        'grossSalary': gross,
        'pfAmount': pf,
        'esicAmount': esic,
        'professionalTax': taxDed,
        'lopAmount': leaveDed,
        'totalDeductions': totalDed,
        'netSalary': double.tryParse('${row['net_salary'] ?? 0}') ?? 0,
        'workingDays': row['working_days'] ?? 26,
        'presentDays': row['present_days'] ?? 0,
        'paidLeaveDays': row['paid_leaves'] ?? 0,
        'lopDays': row['unpaid_leaves'] ?? 0,
      });
    }
    return normalized;
  }

  Future<Map<String, dynamic>> payslip(
    String employeeId, {
    required int month,
    required int year,
    Map<String, dynamic>? fallbackRecord,
  }) async {
    // 1. Prefer the live-recalculated Web-parity record so mobile payslips
    //    always match Web HRMS exact payable days, prorated CTC, and EPF/ESIC.
    Map<String, dynamic>? webRecord;
    if (fallbackRecord != null &&
        (fallbackRecord['source'] == 'web_settings' ||
            (fallbackRecord['earningsBreakdown'] is List &&
                (fallbackRecord['earningsBreakdown'] as List).isNotEmpty))) {
      webRecord = fallbackRecord;
    } else {
      final matches = await payrollRecords(
        month: month,
        year: year,
        employeeId: employeeId,
      ).catchError((_) => <Map<String, dynamic>>[]);
      if (matches.isNotEmpty) webRecord = matches.first;
    }

    if (webRecord != null) {
      return _buildOfficialPayslipPayload(
        employeeId: employeeId,
        month: month,
        year: year,
        record: webRecord,
      );
    }

    try {
      final response = await _api.get(
        '/payroll/employees/$employeeId/payslips',
        query: {'month': month, 'year': year},
      );
      final data = response['data'];
      if (data is Map) return Map<String, dynamic>.from(data);
      return response;
    } catch (_) {
      if (fallbackRecord != null) {
        return _buildOfficialPayslipPayload(
          employeeId: employeeId,
          month: month,
          year: year,
          record: fallbackRecord,
        );
      }
      rethrow;
    }
  }

  Future<Map<String, dynamic>> _buildOfficialPayslipPayload({
    required String employeeId,
    required int month,
    required int year,
    required Map<String, dynamic> record,
  }) async {
    // Fast path: when Payroll already embedded employee master details (DOJ,
    // Bank Account, PAN, CTC) and companyInfo is cached, avoid any extra HTTP
    // calls so Official Payslip opens instantaneously (< 16 ms).
    final hasEmbeddedProfile = record['_hasEmbeddedProfile'] == true ||
        ('${record['joiningDate'] ?? ''}'.trim().isNotEmpty &&
            '${record['accountNumber'] ?? ''}'.trim().isNotEmpty);

    Map<String, dynamic> company;
    Map<String, dynamic> empDetail = const <String, dynamic>{};

    if (hasEmbeddedProfile) {
      company = await companyInfo().catchError((_) => <String, dynamic>{});
    } else {
      final results = await Future.wait<dynamic>([
        companyInfo().catchError((_) => <String, dynamic>{}),
        employee(employeeId).catchError((_) => <String, dynamic>{}),
      ]);
      company = results[0] as Map<String, dynamic>;
      empDetail = results[1] as Map<String, dynamic>;
    }

    final empProfile = empDetail['profile_data'] is Map
        ? Map<String, dynamic>.from(empDetail['profile_data'] as Map)
        : const <String, dynamic>{};
    final empBankRaw = empProfile['bankDetails'] ?? empProfile['bank_details'];
    final empBank = empBankRaw is Map
        ? Map<String, dynamic>.from(empBankRaw)
        : const <String, dynamic>{};
    final empSalaryRaw =
        empProfile['salaryDetails'] ?? empProfile['salary_details'];
    final empSalary = empSalaryRaw is Map
        ? Map<String, dynamic>.from(empSalaryRaw)
        : const <String, dynamic>{};

    String pickEmp(List<String> keys, [String fallback = '']) {
      for (final src in [record, empDetail, empBank, empSalary, empProfile]) {
        for (final k in keys) {
          final v = src[k];
          if (v != null && v is! Map && v.toString().trim().isNotEmpty) {
            return v.toString().trim();
          }
        }
      }
      return fallback;
    }

    final safeMonth = month.clamp(1, 12);
    final calDays = num.tryParse(
          '${record['calendarDays'] ?? record['calendarDaysInMonth'] ?? ''}',
        ) ??
        DateTime(year, safeMonth + 1, 0).day;
    final paidDays = num.tryParse(
          '${record['totalPaidDays'] ?? record['paidDays'] ?? record['presentDays'] ?? 0}',
        ) ??
        0;
    final monthlyCtc = num.tryParse(
          '${record['monthlyCtc'] ?? record['monthlySalary'] ?? record['ctc'] ?? empSalary['monthlyCtc'] ?? empProfile['monthlyCtc'] ?? record['grossSalary'] ?? 0}',
        ) ??
        0;

    return {
      'company': {
        'companyName': company['companyName'] ?? 'BUSINZ',
        'legalName': company['legalCompanyName'] ??
            company['legalEntity'] ??
            company['companyName'] ??
            'VRM STRUCTURES INDIA PRIVATE LIMITED',
        'logoUrl': company['logoUrl'] ?? '',
        'address': company['registeredAddress'] ?? company['address'] ?? '',
        'registeredAddress':
            company['registeredAddress'] ?? company['address'] ?? '',
        'branchAddress': company['branchAddress'] ?? '',
        'phone': company['officialPhone'] ?? company['contactPhone'] ?? '',
        'email': company['officialEmail'] ?? company['contactEmail'] ?? '',
        'website': company['website'] ?? '',
        'gst': company['gstNumber'] ?? company['taxIdGst'] ?? '',
        'pan': company['panNumber'] ?? '',
        'registrationNumber':
            company['registrationNumber'] ?? company['cinNumber'] ?? '',
      },
      'employee': {
        'employeeId': pickEmp(['employeeId', 'employee_id'], employeeId),
        'firstName':
            pickEmp(['firstName', 'first_name', 'employeeName'], employeeId),
        'lastName': pickEmp(['lastName', 'last_name']),
        'fullName': pickEmp(['employeeName', 'name']),
        'designation': pickEmp(['designation']),
        'department': pickEmp(['department', 'departmentName']),
        'joiningDate':
            pickEmp(['joiningDate', 'joining_date', 'dateOfJoining']),
        'monthlyCtc': monthlyCtc,
        'bankName': pickEmp(['bankName', 'bank_name']),
        'accountNumber': pickEmp(['accountNumber', 'account_number']),
        'ifscCode': pickEmp(['ifscCode', 'ifsc_code']),
        'panNumber': pickEmp(['panNumber', 'pan_number']),
        'uanNumber': pickEmp(['uanNumber', 'uan_number']),
      },
      'payroll': {
        'month': safeMonth,
        'year': year,
        'monthName': _monthNames[safeMonth - 1],
        'calendarDays': calDays,
        'workingDays': record['workingDays'] ?? record['working_days'] ?? 0,
        'presentDays': record['presentDays'] ?? record['present_days'] ?? 0,
        'paidWeekOffDays': record['paidWeekOffDays'] ?? 0,
        'paidHolidayDays': record['paidHolidayDays'] ?? 0,
        'paidLeaveDays': record['paidLeaveDays'] ??
            record['paidLeaves'] ??
            record['paid_leaves'] ??
            0,
        'lopDays': record['lopDays'] ??
            record['unpaidLeaves'] ??
            record['unpaid_leaves'] ??
            0,
        'totalPaidDays': paidDays,
        'status': record['status'] ?? 'Processed',
      },
      'earnings': {
        'basicSalary': record['basicSalary'] ?? record['basic_salary'] ?? 0,
        'hra': record['hra'] ?? record['allowances'] ?? 0,
        'da': record['da'] ?? 0,
        'conveyance': record['conveyance'] ?? 0,
        'attendanceBonus': record['attendanceBonus'] ?? 0,
        'bonus': record['bonus'] ?? 0,
        'overtimeAmount':
            record['overtimeAmount'] ?? record['ot_variable_amount'] ?? 0,
        'incentive': record['incentive'] ?? 0,
        'otherEarnings': record['otherEarnings'] ?? 0,
        'grossSalary': record['grossSalary'] ?? 0,
      },
      'deductions': {
        'pf': record['pfAmount'] ?? record['epfDeduction'] ?? 0,
        'esic': record['esicAmount'] ?? record['esiDeduction'] ?? 0,
        'professionalTax':
            record['professionalTax'] ?? record['tax_deduction'] ?? 0,
        'lopAmount': record['lopAmount'] ?? record['leave_deduction'] ?? 0,
        'lateAttendanceDeduction': record['lateAttendanceDeduction'] ?? 0,
        'advanceRecovery':
            record['advanceRecovery'] ?? record['advanceDeduction'] ?? 0,
        'loanRecovery': record['loanRecovery'] ?? 0,
        'otherDeductions': record['otherDeductions'] ?? 0,
        'totalDeductions': record['totalDeductions'] ?? 0,
      },
      'earningsBreakdown': record['earningsBreakdown'] is List
          ? record['earningsBreakdown']
          : const [],
      'deductionsBreakdown': record['deductionsBreakdown'] is List
          ? record['deductionsBreakdown']
          : const [],
      'netSalary': record['netSalary'] ?? record['net_salary'] ?? 0,
    };
  }

  Future<List<Map<String, dynamic>>> payrollRuns() =>
      _list('/payroll/runs').catchError((_) => <Map<String, dynamic>>[]);

  /// Fetches live daily OT data + Web OT policies (`overtime_policy_data`,
  /// `department_ot_policies_data`, `employee_ot_policies_data`, `payroll_settings_config`)
  /// using photo-free attendance queries and cached company settings.
  Future<
      ({
        List<Map<String, dynamic>> employees,
        List<Map<String, dynamic>> attendanceRecords,
        List<Map<String, dynamic>> overtimeRecords,
        List<Map<String, dynamic>> departmentOtPolicies,
        List<Map<String, dynamic>> employeeOtPolicies,
        Map<String, dynamic>? overtimePolicy,
        Map<String, dynamic>? payrollConfig,
      })> overtimeBundle({
    required int month,
    required int year,
    String? employeeId,
  }) async {
    final safeMonth = month.clamp(1, 12);
    final calDays = DateTime(year, safeMonth + 1, 0).day;
    final monthPad = safeMonth.toString().padLeft(2, '0');
    final monthStart = '$year-$monthPad-01';
    final monthEnd = '$year-$monthPad-${calDays.toString().padLeft(2, '0')}';

    final results = await Future.wait<dynamic>([
      _companySettingsBundle().catchError((_) => <String, dynamic>{}),
      _payrollEmployees().catchError((_) => <Map<String, dynamic>>[]),
      fetchAttendanceRange(
        fromIso: monthStart,
        toIso: monthEnd,
        descending: true,
        limit: 4000,
      ).catchError((_) => <Map<String, dynamic>>[]),
      overtimeRecords().catchError((_) => <Map<String, dynamic>>[]),
      if (employeeId != null && employeeId.trim().isNotEmpty)
        attendance(employeeId: employeeId)
            .catchError((_) => <Map<String, dynamic>>[])
      else
        Future.value(<Map<String, dynamic>>[]),
    ]);

    final settingsBundle = results[0] as Map<String, dynamic>;
    final profilesOverlay = settingsBundle['employee_profiles_data'] is Map
        ? Map<String, dynamic>.from(
            settingsBundle['employee_profiles_data'] as Map)
        : null;
    final allEmployees = profilesOverlay != null && profilesOverlay.isNotEmpty
        ? await _payrollEmployees(profilesOverlay: profilesOverlay)
            .catchError((_) => results[1] as List<Map<String, dynamic>>)
        : results[1] as List<Map<String, dynamic>>;
    final gatewayAtt = results[2] as List<Map<String, dynamic>>;
    final apiOt = results[3] as List<Map<String, dynamic>>;
    final fallbackSelfAtt = results[4] as List<Map<String, dynamic>>;

    final settingsOtRequests = settingsBundle['overtime_requests_data'] is List
        ? (settingsBundle['overtime_requests_data'] as List)
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList(growable: false)
        : const <Map<String, dynamic>>[];

    final deptOtPolicies =
        settingsBundle['department_ot_policies_data'] is List
            ? (settingsBundle['department_ot_policies_data'] as List)
                .whereType<Map>()
                .map((e) => Map<String, dynamic>.from(e))
                .toList(growable: false)
            : const <Map<String, dynamic>>[];

    final empOtPolicies = settingsBundle['employee_ot_policies_data'] is List
        ? (settingsBundle['employee_ot_policies_data'] as List)
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList(growable: false)
        : const <Map<String, dynamic>>[];

    final otPolicy = settingsBundle['overtime_policy_data'] is Map
        ? Map<String, dynamic>.from(
            settingsBundle['overtime_policy_data'] as Map)
        : null;
    final payrollConfig = settingsBundle['payroll_settings_config'] is Map
        ? Map<String, dynamic>.from(
            settingsBundle['payroll_settings_config'] as Map)
        : null;

    return (
      employees: allEmployees,
      attendanceRecords:
          gatewayAtt.isNotEmpty ? gatewayAtt : fallbackSelfAtt,
      overtimeRecords: <Map<String, dynamic>>[
        ...apiOt,
        ...settingsOtRequests,
      ],
      departmentOtPolicies: deptOtPolicies,
      employeeOtPolicies: empOtPolicies,
      overtimePolicy: otPolicy,
      payrollConfig: payrollConfig,
    );
  }

  /// Fetches active employees with phone numbers for WhatsApp CRM campaign
  /// recipient selection (works cleanly across all authorized roles).
  Future<List<Map<String, dynamic>>> campaignEmployees() async {
    final raw = await _payrollEmployees()
        .catchError((_) => <Map<String, dynamic>>[]);
    return raw.where((e) => !_isInactiveEmployee(e)).toList(growable: false);
  }

  // ---------------------------------------------------------------------------
  // Finance & Claims (Field Allowance + Expenses + Advance Salary)
  // ---------------------------------------------------------------------------

  Future<List<Map<String, dynamic>>> fieldAllowanceRequests() =>
      _list('/field-allowance/requests');

  Future<List<Map<String, dynamic>>> fieldAllowanceDistributions() =>
      _list('/field-allowance/distributions')
          .catchError((_) => <Map<String, dynamic>>[]);

  Future<Map<String, dynamic>> fieldAllowanceDetail(String id) async {
    final response = await _api.get('/field-allowance/requests/$id');
    final data = response['data'];
    return data is Map ? Map<String, dynamic>.from(data) : response;
  }

  Future<Map<String, dynamic>> createFieldAllowance(
          Map<String, dynamic> payload) =>
      _api.post('/field-allowance/requests', body: payload);

  Future<Map<String, dynamic>> decideFieldAllowance(
          String id, Map<String, dynamic> payload) =>
      _api.post('/field-allowance/requests/$id/decision', body: payload);

  Future<Map<String, dynamic>> distributeFieldAllowance(
          String id, Map<String, dynamic> payload) =>
      _api.post('/field-allowance/requests/$id/distributions', body: payload);

  Future<Map<String, dynamic>> addFieldAllowanceDailyReport(
          String id, Map<String, dynamic> payload) =>
      _api.post('/field-allowance/requests/$id/daily-reports', body: payload);

  Future<Map<String, dynamic>> completeFieldAllowance(String id) =>
      _api.post('/field-allowance/requests/$id/complete');

  Future<Map<String, dynamic>> submitFieldAllowanceBalance(
          String id, Map<String, dynamic> payload) =>
      _api.post('/field-allowance/requests/$id/submit-balance', body: payload);

  Future<Map<String, dynamic>> confirmFieldAllowanceBalance(
          String id, Map<String, dynamic> payload) =>
      _api.post('/field-allowance/requests/$id/confirm-balance', body: payload);

  Future<List<Map<String, dynamic>>> expenses() async {
    // Web stores live expense claims authoritatively in public.expenses (/api/v1/expenses)
    // and explicitly excludes the legacy company_settings.expenses_data blob so deleted
    // expenses never reappear on mobile.
    return _list('/expenses').catchError((_) => <Map<String, dynamic>>[]);
  }

  Future<Map<String, dynamic>> createExpense(Map<String, dynamic> payload) =>
      _api.post('/expenses', body: payload);

  Future<Map<String, dynamic>> approveExpense(String id) =>
      _api.post('/expenses/$id/approve');

  Future<Map<String, dynamic>> rejectExpense(String id, String reason) =>
      _api.post('/expenses/$id/reject', body: {'rejectionReason': reason});

  Future<Map<String, dynamic>> disburseExpense(
          String id, Map<String, dynamic> payload) =>
      _api.post('/expenses/$id/disburse', body: payload);

  Future<List<Map<String, dynamic>>> loanRecords() async {
    final rows = await gatewayList(
      'company_settings',
      query: 'select=*&setting_key=eq.loan_records_data&limit=1',
    ).catchError((_) => <Map<String, dynamic>>[]);
    if (rows.isNotEmpty && rows.first['setting_val'] is List) {
      return (rows.first['setting_val'] as List)
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList(growable: false);
    }
    return const [];
  }

  Future<void> _saveLoanRecords(List<Map<String, dynamic>> records) async {
    final existing = await gatewayList(
      'company_settings',
      query: 'select=id,setting_key&setting_key=eq.loan_records_data&limit=1',
    ).catchError((_) => <Map<String, dynamic>>[]);
    if (existing.isNotEmpty) {
      await _gatewayMutation(
        'company_settings?setting_key=eq.loan_records_data',
        'PATCH',
        {'setting_val': records},
      );
    } else {
      await _gatewayMutation('company_settings', 'POST', {
        'setting_key': 'loan_records_data',
        'setting_val': records,
      });
    }
  }

  Future<void> submitLoanRequest(Map<String, dynamic> record) async {
    final current = List<Map<String, dynamic>>.from(await loanRecords());
    current.insert(0, record);
    await _saveLoanRecords(current);
  }

  Future<void> reviewLoanRequest({
    required String id,
    required String status,
    required String reviewedBy,
    num? approvedAmount,
    String? rejectionReason,
  }) async {
    final current = List<Map<String, dynamic>>.from(await loanRecords());
    final now = DateTime.now().toUtc().toIso8601String();
    for (final item in current) {
      if (item['id']?.toString() == id) {
        final prevStatus = (item['status'] ?? 'Pending').toString();
        item['status'] = status;
        if (approvedAmount != null) {
          item['approvedAmount'] = approvedAmount;
          item['outstandingBalance'] = approvedAmount;
        }
        item['ceoApproval'] = {
          'approvedBy': reviewedBy,
          'approvedAt': now,
          'status': status,
          'decision': status,
          if (rejectionReason != null && rejectionReason.isNotEmpty)
            'remarks': rejectionReason,
        };
        if (rejectionReason != null && rejectionReason.isNotEmpty) {
          item['rejectionReason'] = rejectionReason;
        }
        final logs = item['auditLogs'] is List
            ? List<dynamic>.from(item['auditLogs'] as List)
            : <dynamic>[];
        logs.add({
          'id': 'LOG-${DateTime.now().millisecondsSinceEpoch}',
          'loanId': id,
          'action': 'Request $status',
          'performedBy': reviewedBy,
          'performedByRole': 'Approver',
          'timestamp': now,
          'previousValue': 'Status: $prevStatus',
          'newValue': 'Status: $status',
        });
        item['auditLogs'] = logs;
        break;
      }
    }
    await _saveLoanRecords(current);
  }

  Future<void> disburseLoanRequest({
    required String id,
    required num amount,
    required String paymentMode,
    required String transactionRef,
    required String disbursedBy,
    String? notes,
    String? paymentProofUrl,
  }) async {
    final current = List<Map<String, dynamic>>.from(await loanRecords());
    final now = DateTime.now().toUtc().toIso8601String();
    for (final item in current) {
      if (item['id']?.toString() == id) {
        item['status'] = 'Active';
        item['disbursedAmount'] = amount;
        item['outstandingBalance'] = amount;
        item['disbursementDetails'] = {
          'disbursedAt': now,
          'paymentMode': paymentMode,
          'transactionRef': transactionRef,
          'disbursedBy': disbursedBy,
          if (notes != null && notes.isNotEmpty) 'notes': notes,
          if (paymentProofUrl != null && paymentProofUrl.isNotEmpty)
            'paymentProofUrl': paymentProofUrl,
        };
        break;
      }
    }
    await _saveLoanRecords(current);
  }

  Future<void> markPayrollRecordPaid({
    required String id,
    required String paymentMode,
    required String transactionRef,
    required String paidBy,
    String? employeeId,
    int? month,
    int? year,
  }) async {
    final todayStr = DateTime.now().toUtc().toIso8601String().split('T').first;
    await _gatewayMutation(
      'payroll_records?id=eq.${Uri.encodeQueryComponent(id)}',
      'PATCH',
      {
        'status': 'Paid',
        'payment_date': todayStr,
        'payment_mode': paymentMode,
        'transaction_ref': transactionRef,
        'paid_by': paidBy,
      },
    ).catchError((_) => <String, dynamic>{});

    // Also synchronize Web company_settings.payroll_records_data
    final rows = await gatewayList(
      'company_settings',
      query:
          'select=id,setting_val&setting_key=eq.payroll_records_data&limit=1',
    ).catchError((_) => <Map<String, dynamic>>[]);
    if (rows.isNotEmpty && rows.first['setting_val'] is List) {
      final list = (rows.first['setting_val'] as List)
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
      var changed = false;
      for (final item in list) {
        final period = _parsePayrollPeriod(item);
        final matchesId = id.isNotEmpty && item['id']?.toString() == id;
        final matchesEmpPeriod = employeeId != null &&
            month != null &&
            year != null &&
            (item['employeeId']?.toString().toLowerCase() ==
                employeeId.toLowerCase()) &&
            period.month == month &&
            period.year == year;
        if (matchesId || matchesEmpPeriod) {
          item['status'] = 'Paid';
          item['paymentDate'] = todayStr;
          item['paymentMode'] = paymentMode;
          item['transactionRef'] = transactionRef;
          item['paidBy'] = paidBy;
          changed = true;
        }
      }
      if (changed) {
        await _gatewayMutation(
          'company_settings?setting_key=eq.payroll_records_data',
          'PATCH',
          {'setting_val': list},
        );
      }
    }
    invalidatePayrollCache();
  }

  // ---------------------------------------------------------------------------
  // Petty Cash
  // ---------------------------------------------------------------------------

  Future<List<Map<String, dynamic>>> pettyCashRequests() =>
      _list('/petty-cash/requests');

  Future<Map<String, dynamic>> requestPettyCash(Map<String, dynamic> payload) =>
      _api.post('/petty-cash/requests', body: payload);

  Future<Map<String, dynamic>> decidePettyCash(
          String id, Map<String, dynamic> payload) =>
      _api.post('/petty-cash/requests/$id/approve', body: payload);

  Future<Map<String, dynamic>> disbursePettyCash(
          String id, Map<String, dynamic> payload) =>
      _api.post('/petty-cash/requests/$id/disburse', body: payload);

  Future<List<Map<String, dynamic>>> pettyCashDisbursements() =>
      _list('/petty-cash/disbursements');

  Future<List<Map<String, dynamic>>> pettyCashExpenses() =>
      _list('/petty-cash/expenses');

  Future<List<Map<String, dynamic>>> pettyCashLedger() =>
      _list('/petty-cash/ledger', query: {'limit': 100});

  Future<List<Map<String, dynamic>>> pettyCashCategories() =>
      _list('/petty-cash/categories');

  Future<Map<String, dynamic>> activePettyCashCustodian() async {
    final response = await _api.get('/petty-cash/custodian/active');
    final data = response['data'];
    return data is Map ? Map<String, dynamic>.from(data) : <String, dynamic>{};
  }

  Future<Map<String, dynamic>> assignPettyCashCustodian(
          Map<String, dynamic> payload) =>
      _api.post('/petty-cash/custodian/assign', body: payload);

  Future<Map<String, dynamic>> recordPettyCashExpense(
          Map<String, dynamic> payload) =>
      _api.post('/petty-cash/expenses', body: payload);

  Future<Map<String, dynamic>> confirmPettyCashReceipt(
          Map<String, dynamic> payload) =>
      _api.post('/petty-cash/receipts/confirm', body: payload);

  // ---------------------------------------------------------------------------
  // Field Tracking
  // ---------------------------------------------------------------------------

  Future<List<Map<String, dynamic>>> trackingAssignments() =>
      _list('/tracking/assignments');

  Future<Map<String, dynamic>> createTrackingAssignment(
          Map<String, dynamic> payload) =>
      _api.post('/tracking/assignments', body: payload);

  Future<List<Map<String, dynamic>>> trackingTrips() =>
      _list('/tracking/trips');

  Future<List<Map<String, dynamic>>> trackingAlerts() =>
      _list('/tracking/alerts').catchError((_) => <Map<String, dynamic>>[]);

  Future<Map<String, dynamic>> resolveTrackingAlert(String id) =>
      _api.put('/tracking/alerts/$id/resolve');

  Future<Map<String, dynamic>> trackingOverview() async {
    final res = await _api
        .get('/tracking/overview')
        .catchError((_) => <String, dynamic>{});
    final data = res['data'];
    return data is Map ? Map<String, dynamic>.from(data) : res;
  }

  Future<Map<String, dynamic>> startTrip(Map<String, dynamic> payload) =>
      _api.post('/tracking/trips/start', body: payload);

  Future<Map<String, dynamic>> sendTrackingPoints(
          List<Map<String, dynamic>> points) =>
      _api.post('/tracking/points', body: points);

  Future<Map<String, dynamic>> endTrip(
          String tripId, Map<String, dynamic> payload) =>
      _api.post('/tracking/trips/$tripId/end', body: payload);

  // ---------------------------------------------------------------------------
  // Tasks
  // ---------------------------------------------------------------------------

  Future<List<Map<String, dynamic>>> tasks() async {
    final rows = await gatewayList(
      'enterprise_tasks',
      query: 'select=*&order=created_at.desc&limit=250',
    );
    return rows.map((row) {
      final nested = row['task_data'];
      final task = nested is Map
          ? <String, dynamic>{...Map<String, dynamic>.from(nested), ...row}
          : <String, dynamic>{...row};
      task['id'] = row['id'] ?? task['id'];
      task['taskNumber'] = row['task_number'] ?? task['taskNumber'];
      task['title'] = row['title'] ?? task['title'];
      task['overallStatus'] =
          row['overall_status'] ?? task['overallStatus'] ?? 'OPEN';
      task['overallProgress'] =
          row['overall_progress'] ?? task['overallProgress'] ?? 0;
      task['dueDate'] = row['due_date'] ?? task['dueDate'];
      task['responsiblePersonId'] =
          row['responsible_person_id'] ?? task['responsiblePersonId'];
      return task;
    }).toList(growable: false);
  }

  Future<Map<String, dynamic>> createTask(Map<String, dynamic> payload) =>
      _api.post('/data-gateway/proxy', body: {
        'path': '/enterprise_tasks',
        'method': 'POST',
        'prefer': 'return=representation',
        'body': payload,
      });

  Future<Map<String, dynamic>> updateTask(
    String taskId, {
    required String status,
    required num progress,
    required Map<String, dynamic> taskData,
    Map<String, dynamic>? extraFields,
  }) =>
      _gatewayMutation(
        'enterprise_tasks?id=eq.${Uri.encodeQueryComponent(taskId)}',
        'PATCH',
        {
          if (extraFields != null) ...extraFields,
          'overall_status': status,
          'overall_progress': progress.clamp(0, 100),
          'task_data': taskData,
          'updated_at': DateTime.now().toUtc().toIso8601String(),
        },
      );

  Future<Map<String, dynamic>> deleteTask(String taskId) => _gatewayMutation(
        'enterprise_tasks?id=eq.${Uri.encodeQueryComponent(taskId)}',
        'DELETE',
        null,
      );

  // ---------------------------------------------------------------------------
  // Notifications
  // ---------------------------------------------------------------------------

  Future<Map<String, dynamic>> notificationFeed({
    int limit = 50,
    int offset = 0,
  }) =>
      _api.get('/notifications', query: {'limit': limit, 'offset': offset});

  Future<Map<String, dynamic>> markNotificationRead(String id) =>
      _api.patch('/notifications/$id/read');

  Future<Map<String, dynamic>> markAllNotificationsRead() =>
      _api.patch('/notifications/read-all');

  // ---------------------------------------------------------------------------
  // WhatsApp CRM & Customers / OCR Scanner
  // ---------------------------------------------------------------------------

  Future<List<Map<String, dynamic>>> crmConversations({String? search}) =>
      _list('/crm/conversations', query: {
        'limit': 50,
        if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
      });

  Future<List<Map<String, dynamic>>> crmMessages(String conversationId) =>
      _list('/crm/conversations/$conversationId/messages',
          query: {'limit': 100});

  Future<Map<String, dynamic>> sendCrmMessage(
          String conversationId, String text) =>
      _api.post('/crm/conversations/$conversationId/messages',
          body: {'text': text});

  Future<Map<String, dynamic>> sendCrmTemplate(Map<String, dynamic> payload) =>
      _api.post('/crm/messages/template', body: payload);

  Future<Map<String, dynamic>> markCrmConversationRead(String id) =>
      _api.post('/crm/conversations/$id/read');

  Future<Map<String, dynamic>> startCrmConversation(String contactId) async {
    final response =
        await _api.post('/crm/conversations', body: {'contactId': contactId});
    final data = response['data'];
    return data is Map ? Map<String, dynamic>.from(data) : response;
  }

  Future<List<Map<String, dynamic>>> crmContacts({
    String? search,
    String? category,
    int limit = 300,
  }) =>
      _list('/crm/contacts', query: {
        'limit': limit,
        if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
        if (category != null && category.trim().isNotEmpty && category != 'ALL')
          'category': category.trim(),
      });

  Future<Map<String, dynamic>> recordCrmConsent(
    String contactId, {
    String consentStatus = 'Opted In',
    String source = 'Mobile CRM Broadcast',
  }) =>
      _api.post(
        '/crm/contacts/${Uri.encodeComponent(contactId)}/consent',
        body: {
          'consentStatus': consentStatus,
          'source': source,
        },
      );

  Future<List<Map<String, dynamic>>> crmTemplates() => _list('/crm/templates');

  Future<Map<String, dynamic>> syncCrmTemplates() =>
      _api.post('/crm/templates/sync');

  Future<Map<String, dynamic>> saveCrmTemplateDraft(
          Map<String, dynamic> payload) =>
      _api.post(
        '/crm/templates/draft',
        body: payload,
        timeout: const Duration(seconds: 90),
      );

  Future<Map<String, dynamic>> submitCrmTemplate(String id) => _api.post(
        '/crm/templates/${Uri.encodeComponent(id)}/submit',
        timeout: const Duration(seconds: 90),
      );

  Future<List<Map<String, dynamic>>> crmBroadcasts() =>
      _list('/crm/broadcasts');

  Future<Map<String, dynamic>> crmBroadcastDetail(String id) =>
      _api.get('/crm/broadcasts/${Uri.encodeComponent(id)}');

  Future<Map<String, dynamic>> createCrmBroadcast(
          Map<String, dynamic> payload) =>
      _api.post('/crm/broadcasts', body: payload);

  Future<Map<String, dynamic>> updateCrmBroadcastStatus(
    String id,
    String status,
  ) =>
      _api.patch('/crm/broadcasts/${Uri.encodeComponent(id)}/status',
          body: {'status': status}).catchError((_) => <String, dynamic>{});

  Future<List<Map<String, dynamic>>> customers({String? search}) async {
    final response = await _api.get('/customers', query: {
      'page': 1,
      'pageSize': 100,
      if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
    });
    final data = response['data'];
    if (data is Map && data['customers'] is List) {
      return (data['customers'] as List)
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList(growable: false);
    }
    return const [];
  }

  Future<Map<String, dynamic>> scanContactCard(
    String imageBase64,
    String mimeType,
  ) async {
    final response = await _api.post('/customers/ocr-scan', body: {
      'imageBase64': imageBase64,
      'mimeType': mimeType,
    });
    final data = response['data'];
    return data is Map ? Map<String, dynamic>.from(data) : response;
  }

  Future<Map<String, dynamic>> checkCustomerDuplicate(String phone) =>
      _api.get('/customers/check-duplicate', query: {'contactNumber': phone});

  Future<Map<String, dynamic>> saveCustomer(Map<String, dynamic> payload) =>
      _api.post('/customers', body: payload);

  // ---------------------------------------------------------------------------
  // Assets (Data Gateway primary + Web PostgREST /rest/v1/assets fallback on 403)
  // ---------------------------------------------------------------------------

  Future<List<Map<String, dynamic>>> assets() async {
    try {
      return await gatewayList(
        'assets',
        query:
            'select=*,assigned_employee:employees!assets_assigned_employee_id_fkey(id,employee_id,first_name,last_name)&order=created_at.desc&limit=500',
      );
    } catch (firstErr) {
      try {
        return await gatewayList(
          'assets',
          query: 'select=*&order=created_at.desc&limit=500',
        );
      } catch (secondErr) {
        if (_isForbiddenError(firstErr) || _isForbiddenError(secondErr)) {
          final raw = await _api.directRest(
            'GET',
            '/assets?select=*&order=created_at.desc&limit=500',
          );
          if (raw is List) {
            return raw
                .whereType<Map>()
                .map((e) => Map<String, dynamic>.from(e))
                .toList(growable: false);
          }
          return const <Map<String, dynamic>>[];
        }
        rethrow;
      }
    }
  }

  Future<Map<String, dynamic>> createAsset(Map<String, dynamic> payload) async {
    final normalized = _normalizeAssetPayload(payload);
    try {
      return await _gatewayMutation('assets', 'POST', normalized);
    } catch (err) {
      if (!_isForbiddenError(err)) rethrow;
      final res = await _api.directRest(
        'POST',
        '/assets',
        body: normalized,
        prefer: 'return=representation',
      );
      if (res is List && res.isNotEmpty && res.first is Map) {
        return Map<String, dynamic>.from(res.first as Map);
      }
      if (res is Map) return Map<String, dynamic>.from(res);
      return const {'success': true};
    }
  }

  Future<Map<String, dynamic>> updateAsset(
    String id,
    Map<String, dynamic> updates,
  ) async {
    final normalized = _normalizeAssetPayload(updates, isPatch: true);
    final resource = 'assets?id=eq.${Uri.encodeQueryComponent(id)}';
    try {
      return await _gatewayMutation(resource, 'PATCH', normalized);
    } catch (err) {
      if (!_isForbiddenError(err)) rethrow;
      final res = await _api.directRest(
        'PATCH',
        '/$resource',
        body: normalized,
        prefer: 'return=representation',
      );
      if (res is List && res.isNotEmpty && res.first is Map) {
        return Map<String, dynamic>.from(res.first as Map);
      }
      if (res is Map) return Map<String, dynamic>.from(res);
      return const {'success': true};
    }
  }

  Future<Map<String, dynamic>> deleteAsset(String id) async {
    final resource = 'assets?id=eq.${Uri.encodeQueryComponent(id)}';
    try {
      return await _gatewayMutation(resource, 'DELETE', null);
    } catch (err) {
      if (!_isForbiddenError(err)) rethrow;
      await _api.directRest('DELETE', '/$resource');
      return const {'success': true};
    }
  }

  static bool _isForbiddenError(Object error) {
    if (error is ApiException) {
      if (error.statusCode == 403 || error.code == 'FORBIDDEN') return true;
    }
    final msg = error.toString().toLowerCase();
    return msg.contains('403') ||
        msg.contains('not permitted') ||
        msg.contains('cannot view asset') ||
        msg.contains('cannot create asset') ||
        msg.contains('cannot edit asset') ||
        msg.contains('cannot delete asset');
  }

  static Map<String, dynamic> _normalizeAssetPayload(
    Map<String, dynamic> raw, {
    bool isPatch = false,
  }) {
    final out = Map<String, dynamic>.from(raw);
    const nullableCols = [
      'warranty_expiry',
      'purchase_date',
      'assigned_date',
      'assigned_employee_id',
      'serial_number',
      'notes',
    ];
    for (final col in nullableCols) {
      if (out.containsKey(col) &&
          out[col] is String &&
          (out[col] as String).trim().isEmpty) {
        out[col] = null;
      }
    }
    if (out['status'] != null) {
      final s = out['status'].toString().toLowerCase();
      if (s.contains('assign') || s.contains('in use') || s.contains('use')) {
        out['status'] = 'Assigned';
      } else if (s.contains('maint')) {
        out['status'] = 'Under Maintenance';
      } else if (s.contains('retir')) {
        out['status'] = 'Retired';
      } else {
        out['status'] = 'Available';
      }
    }
    if (out['condition'] != null) {
      final c = out['condition'].toString().toLowerCase();
      if (c.contains('new')) {
        out['condition'] = 'New';
      } else if (c.contains('fair')) {
        out['condition'] = 'Fair';
      } else if (c.contains('repair') || c.contains('poor') || c.contains('damag')) {
        out['condition'] = 'Needs Repair';
      } else {
        out['condition'] = 'Good';
      }
    }
    if (isPatch) {
      out['updated_at'] = DateTime.now().toUtc().toIso8601String();
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Compatibility Data Gateway & Helpers
  // ---------------------------------------------------------------------------

  Future<List<Map<String, dynamic>>> gatewayList(
    String table, {
    String query = 'select=*&order=created_at.desc&limit=100',
  }) async {
    final response = await _api.post('/data-gateway/proxy', body: {
      'path': '/$table?$query',
      'method': 'GET',
    });
    return _extractList(response);
  }

  Future<Map<String, dynamic>> _gatewayMutation(
    String resource,
    String method,
    Map<String, dynamic>? payload,
  ) =>
      _api.post('/data-gateway/proxy', body: {
        'path': '/$resource',
        'method': method,
        'prefer': 'return=representation',
        if (payload != null) 'body': payload,
      });

  Future<List<Map<String, dynamic>>> _list(
    String path, {
    Map<String, dynamic>? query,
  }) async =>
      _extractList(await _api.get(path, query: query));

  static List<Map<String, dynamic>> _extractList(
      Map<String, dynamic> response) {
    dynamic data = response['data'] ?? response;
    if (data is Map) {
      for (final key in [
        'items',
        'records',
        'employees',
        'leaves',
        'expenses',
        'requests',
        'runs',
        'assignments',
        'trips',
        'departments',
        'alerts',
        'data',
      ]) {
        if (data[key] is List) {
          data = data[key];
          break;
        }
      }
    }
    if (data is! List) return const [];
    return data
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList(growable: false);
  }
}
