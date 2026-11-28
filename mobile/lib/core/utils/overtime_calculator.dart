import 'package:intl/intl.dart';

import 'employee_filters.dart';

/// Resolved Overtime Policy eligibility mirroring Web
/// `frontend/src/services/attendanceCalculationEngine.ts` (`resolveEmployeeOtEligibility`).
class OvertimeEligibility {
  const OvertimeEligibility({
    required this.isEligible,
    required this.source,
    required this.reason,
    required this.resolvedDepartment,
    required this.wageBase,
    required this.divisorMode,
    required this.defaultMultiplier,
    required this.otHourlyRate,
    required this.standardShiftHours,
    required this.maxDailyOt,
    required this.maxMonthlyOt,
  });

  final bool isEligible;
  final String source;
  final String reason;
  final String resolvedDepartment;
  final String wageBase;
  final String divisorMode;
  final String defaultMultiplier;
  final double otHourlyRate;
  final double standardShiftHours;
  final double maxDailyOt;
  final double maxMonthlyOt;
}

/// Calculated OT amount mirroring Web `calculateEnterpriseOvertimeRateAndAmount`.
class OvertimeAmountResult {
  const OvertimeAmountResult({
    required this.wageBaseMode,
    required this.baseHourlyRate,
    required this.effectiveHourlyRate,
    required this.multiplierFactor,
    required this.overtimeAmount,
    required this.formulaDescription,
  });

  final String wageBaseMode;
  final double baseHourlyRate;
  final double effectiveHourlyRate;
  final double multiplierFactor;
  final double overtimeAmount;
  final String formulaDescription;
}

/// Single daily OT record ready for UI presentation.
///
/// STRICT WEB POLICY RULE:
/// - When `showAmount == true` (active Web OT Policy applies to this employee),
///   `amount` and `hourlyRate` carry the exact calculated ₹ payout.
/// - When `showAmount == false` (no Web OT Policy applies), `amount` and
///   `hourlyRate` are strictly `null` so the UI displays ONLY OT hours.
class DailyOvertimeEntry {
  const DailyOvertimeEntry({
    required this.dateIso,
    required this.employeeId,
    required this.employeeName,
    required this.department,
    required this.designation,
    required this.checkIn,
    required this.checkOut,
    required this.workingHours,
    required this.otHours,
    required this.status,
    required this.showAmount,
    this.amount,
    this.hourlyRate,
    this.multiplierLabel,
    this.policySource,
    this.formulaDescription,
  });

  final String dateIso;
  final String employeeId;
  final String employeeName;
  final String department;
  final String designation;
  final String checkIn;
  final String checkOut;
  final double workingHours;
  final double otHours;
  final String status;
  final bool showAmount;
  final double? amount;
  final double? hourlyRate;
  final String? multiplierLabel;
  final String? policySource;
  final String? formulaDescription;
}

class OvertimeCalculator {
  const OvertimeCalculator._();

  /// Mirrors Web `isDefaultOtEligibleDepartment` (`attendanceCalculationEngine.ts:105`).
  /// Only FLOOR, Dispatch Loading, and Production Floor are eligible by default;
  /// all other departments remain hours-only unless enabled by policy/exception.
  static bool isDefaultOtEligibleDepartment(String? department) {
    if (department == null) return false;
    final norm =
        department.trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ');
    return norm == 'floor' ||
        norm == 'dispatch loading' ||
        norm == 'production floor';
  }

  /// Evaluates exact Web OT eligibility priority:
  /// 1. CEO / Owner -> Blocked
  /// 2. Employee Individual Exception `Block OT` -> Blocked
  /// 3. Statutory Entitlement -> Eligible
  /// 4. Employee Individual Exception `Allow OT` -> Eligible
  /// 5. Department OT Policy (`otAllowed`) -> Eligible / Blocked
  /// 6. Fallback Default -> Only FLOOR / Dispatch Loading / Production Floor
  static OvertimeEligibility resolveEligibility({
    required Map<String, dynamic> employee,
    List<Map<String, dynamic>> departmentOtPolicies = const [],
    List<Map<String, dynamic>> employeeOtPolicies = const [],
    Map<String, dynamic>? overtimePolicy,
    String? dateIso,
  }) {
    final empCode = (employee['employeeId'] ??
            employee['employee_id'] ??
            employee['id'] ??
            '')
        .toString()
        .trim();
    final empUuid = (employee['id'] ?? '').toString().trim();
    final profile = employee['profile_data'] is Map
        ? Map<String, dynamic>.from(employee['profile_data'] as Map)
        : const <String, dynamic>{};

    final deptRaw = (employee['department'] ??
            profile['department'] ??
            employee['departmentName'] ??
            'General')
        .toString()
        .trim();
    final resolvedDept = deptRaw.isEmpty ? 'General' : deptRaw;

    final companyId =
        (employee['company_id'] ?? employee['companyId'] ?? '').toString().trim();

    bool matchesScope(Map<String, dynamic> policy) {
      final pCid =
          (policy['companyId'] ?? policy['company_id'] ?? '').toString().trim();
      if (companyId.isNotEmpty &&
          pCid.isNotEmpty &&
          pCid.toLowerCase() != companyId.toLowerCase()) {
        return false;
      }
      return _isPolicyEffectiveOnDate(policy, dateIso);
    }

    // Matching employee-specific OT policy (latest effectiveFrom wins)
    final matchedEmpPolicies = employeeOtPolicies.where((p) {
      final pid = (p['employeeId'] ?? p['employee_id'] ?? '').toString().trim();
      if (pid.isEmpty) return false;
      final matchesId =
          (empCode.isNotEmpty && pid.toLowerCase() == empCode.toLowerCase()) ||
              (empUuid.isNotEmpty && pid.toLowerCase() == empUuid.toLowerCase());
      return matchesId && matchesScope(p);
    }).toList()
      ..sort((a, b) => '${b['effectiveFrom'] ?? ''}'
          .compareTo('${a['effectiveFrom'] ?? ''}'));
    final empPolicy =
        matchedEmpPolicies.isNotEmpty ? matchedEmpPolicies.first : null;

    // Matching department OT policy (latest effectiveFrom wins)
    final matchedDeptPolicies = departmentOtPolicies.where((p) {
      final dName =
          (p['department'] ?? p['departmentName'] ?? '').toString().trim();
      if (dName.isEmpty) return false;
      return dName.toLowerCase() == resolvedDept.toLowerCase() &&
          matchesScope(p);
    }).toList()
      ..sort((a, b) => '${b['effectiveFrom'] ?? ''}'
          .compareTo('${a['effectiveFrom'] ?? ''}'));
    final deptPolicy =
        matchedDeptPolicies.isNotEmpty ? matchedDeptPolicies.first : null;

    final regMult = _num(overtimePolicy?['regularMultiplier']);
    final policyMultFallback = (overtimePolicy?['defaultMultiplier'] ?? '')
            .toString()
            .trim()
            .isNotEmpty
        ? overtimePolicy!['defaultMultiplier'].toString().trim()
        : (regMult == 2.0
            ? '2x Salary'
            : regMult == 1.5
                ? '1.5x Salary'
                : '1x Salary');

    final baseShiftHours = _firstPositive([
      overtimePolicy?['defaultDailyPaidHours'],
      deptPolicy?['standardShiftHours'],
      9.0,
    ]);
    final baseHourlyRate = _firstPositive([
      empPolicy?['customHourlyRate'],
      deptPolicy?['otHourlyRate'],
      overtimePolicy?['fixedRatePerHour'],
      100.0,
    ]);
    final baseWageBase = _firstNonEmpty([
      empPolicy?['customWageBase'],
      overtimePolicy?['wageBase'],
      deptPolicy?['wageBase'],
      'FIXED_HOURLY',
    ]).toUpperCase();
    final baseDivisorMode = _firstNonEmpty([
      overtimePolicy?['divisorMode'],
      deptPolicy?['divisorMode'],
      'COMPANY_DIVISOR',
    ]).toUpperCase();
    final baseMultiplier = _firstNonEmpty([
      empPolicy?['customMultiplier'],
      overtimePolicy?['defaultMultiplier'],
      deptPolicy?['defaultMultiplier'],
      policyMultFallback,
    ]);

    OvertimeEligibility out(
      bool eligible,
      String source,
      String reason, {
      double maxD = 0,
      double maxM = 0,
    }) =>
        OvertimeEligibility(
          isEligible: eligible,
          source: source,
          reason: reason,
          resolvedDepartment: resolvedDept,
          wageBase: baseWageBase,
          divisorMode: baseDivisorMode,
          defaultMultiplier: baseMultiplier,
          otHourlyRate: baseHourlyRate,
          standardShiftHours: baseShiftHours,
          maxDailyOt: maxD,
          maxMonthlyOt: maxM,
        );

    if (isCeoEmployeeRecord(employee)) {
      return out(
        false,
        'Blocked',
        'CEO / Company Owner is exempt from overtime eligibility',
      );
    }

    final effectiveException = _firstNonEmpty([
      empPolicy?['individualException'],
      empPolicy?['individualOtException'],
    ]);

    // 1. Explicit Individual Block
    if (empPolicy != null && effectiveException.toLowerCase() == 'block ot') {
      return out(
        false,
        'Blocked',
        'Overtime blocked by Individual Employee Exception',
      );
    }

    // 2. Statutory Entitlement
    final statEntitled = empPolicy?['statutoryEntitlement'] == true ||
        employee['statutoryOtEntitled'] == true ||
        profile['statutoryOtEntitled'] == true;
    if (statEntitled) {
      return out(
        true,
        'Statutory Entitlement',
        'Eligible under Statutory Entitlement ($resolvedDept)',
        maxD: _firstPositive([
          empPolicy?['maxOtDaily'],
          empPolicy?['customDailyMaxOt'],
          deptPolicy?['maxOtHoursDaily'],
          4.0,
        ]),
        maxM: _firstPositive([
          empPolicy?['maxOtMonthly'],
          empPolicy?['customMonthlyMaxOt'],
          deptPolicy?['maxOtHoursMonthly'],
          60.0,
        ]),
      );
    }

    // 3. Explicit Individual Allow Exception
    if (empPolicy != null &&
        (effectiveException.toLowerCase() == 'allow ot' ||
            empPolicy['allowIndividualException'] == true)) {
      return out(
        true,
        'Individual Exception',
        'Overtime granted by Individual Employee Exception',
        maxD: _firstPositive([
          empPolicy['maxOtDaily'],
          empPolicy['customDailyMaxOt'],
          4.0,
        ]),
        maxM: _firstPositive([
          empPolicy['maxOtMonthly'],
          empPolicy['customMonthlyMaxOt'],
          60.0,
        ]),
      );
    }

    // 4. Department OT Policy
    if (deptPolicy != null) {
      final defaultForDept = isDefaultOtEligibleDepartment(resolvedDept);
      final allowed = _parseBool(deptPolicy['otAllowed'], defaultForDept);
      if (!allowed) {
        return out(
          false,
          'Department Policy',
          'Department ($resolvedDept) is not enabled for OT payout',
        );
      }
      return out(
        true,
        'Department Policy',
        'Eligible under $resolvedDept Department OT Policy',
        maxD: _firstPositive([deptPolicy['maxOtHoursDaily'], 4.0]),
        maxM: _firstPositive([deptPolicy['maxOtHoursMonthly'], 60.0]),
      );
    }

    // 5. Fallback Default
    if (isDefaultOtEligibleDepartment(resolvedDept)) {
      return out(
        true,
        'Department Policy',
        'Eligible under $resolvedDept Default OT Policy',
        maxD: 4.0,
        maxM: 60.0,
      );
    }

    return out(
      false,
      'Default',
      'No OT payout policy configured for $resolvedDept',
    );
  }

  /// Calculates OT payout mirroring Web `calculateEnterpriseOvertimeRateAndAmount`.
  static OvertimeAmountResult calculateAmount({
    required Map<String, dynamic> employee,
    required OvertimeEligibility eligibility,
    required double otHours,
    required int month,
    required int year,
    Map<String, dynamic>? payrollConfig,
    Map<String, dynamic>? overtimePolicy,
    String? rateTypeOverride,
    double? fixedHourlyRateOverride,
    double? explicitOtAmount,
  }) {
    final safeMonth = month.clamp(1, 12);
    final calDays = DateTime(year, safeMonth + 1, 0).day;
    final safeHours = otHours > 0 ? otHours : 0.0;

    final divisor = _resolveDivisor(
      calendarDays: calDays,
      divisorMode: eligibility.divisorMode != 'COMPANY_DIVISOR'
          ? eligibility.divisorMode
          : _firstNonEmpty([overtimePolicy?['divisorMode'], 'COMPANY_DIVISOR'])
              .toUpperCase(),
      payrollConfig: payrollConfig,
    );
    final dailyPaidHours = eligibility.standardShiftHours > 0
        ? eligibility.standardShiftHours
        : _firstPositive([overtimePolicy?['defaultDailyPaidHours'], 9.0]);

    final wageBaseMode = eligibility.wageBase.isNotEmpty
        ? eligibility.wageBase
        : _firstNonEmpty([overtimePolicy?['wageBase'], 'FIXED_HOURLY'])
            .toUpperCase();

    final rawMult = _firstNonEmpty([
      rateTypeOverride,
      eligibility.defaultMultiplier,
      overtimePolicy?['defaultMultiplier'],
      overtimePolicy?['regularMultiplier'],
      overtimePolicy?['rateMethod'],
      '1x Salary',
    ]);
    final multiplierFactor = _parseMultiplier(rawMult);

    final profile = employee['profile_data'] is Map
        ? Map<String, dynamic>.from(employee['profile_data'] as Map)
        : const <String, dynamic>{};
    final salRaw = profile['salaryDetails'] ?? profile['salary_details'];
    final sal = salRaw is Map
        ? Map<String, dynamic>.from(salRaw)
        : const <String, dynamic>{};

    final empBasic = _firstPositive([
      sal['basicSalary'],
      sal['basic_salary'],
      employee['basic_salary'],
      employee['basicSalary'],
      profile['basicSalary'],
    ]);
    final empCtcExplicit = _firstPositive([
      sal['monthlyCtc'],
      sal['monthly_ctc'],
      profile['monthlyCtc'],
      profile['monthly_ctc'],
      employee['monthlyCtc'],
      employee['monthly_ctc'],
      employee['gross_salary'],
      profile['grossSalary'],
    ]);
    final empCtc = empCtcExplicit > 0
        ? empCtcExplicit
        : (empBasic > 0 ? (empBasic / 0.40).roundToDouble() : 0.0);
    final empGross = _firstPositive([
      employee['grossSalary'],
      employee['gross_salary'],
      empCtc,
    ]);
    final resolvedBasic =
        empBasic > 0 ? empBasic : (empCtc > 0 ? (empCtc * 0.40).roundToDouble() : 0.0);

    final fixedHourlyRate = _firstPositive([
      fixedHourlyRateOverride,
      eligibility.otHourlyRate,
      overtimePolicy?['fixedRatePerHour'],
      100.0,
    ]);

    double wageBaseAmount;
    double rawBaseHourlyRate;

    if (wageBaseMode == 'BASIC' && resolvedBasic > 0) {
      wageBaseAmount = resolvedBasic;
      rawBaseHourlyRate = (resolvedBasic / divisor) / dailyPaidHours;
    } else if (wageBaseMode == 'GROSS' && empGross > 0) {
      wageBaseAmount = empGross;
      rawBaseHourlyRate = (empGross / divisor) / dailyPaidHours;
    } else if (wageBaseMode == 'CTC' && empCtc > 0) {
      wageBaseAmount = empCtc;
      rawBaseHourlyRate = (empCtc / divisor) / dailyPaidHours;
    } else {
      wageBaseAmount = fixedHourlyRate > 0 ? fixedHourlyRate : 100.0;
      rawBaseHourlyRate = wageBaseAmount;
    }

    final baseHourlyRate = _round2(rawBaseHourlyRate);
    final effectiveHourlyRate = _round2(rawBaseHourlyRate * multiplierFactor);
    final computedAmount =
        _round2(rawBaseHourlyRate * safeHours * multiplierFactor);

    final finalAmount = (wageBaseMode == 'FIXED_HOURLY' &&
            explicitOtAmount != null &&
            explicitOtAmount > 0)
        ? _round2(explicitOtAmount)
        : computedAmount;

    final multStr = multiplierFactor == multiplierFactor.roundToDouble()
        ? '${multiplierFactor.toInt()}x'
        : '${multiplierFactor}x';
    final formulaDesc = wageBaseMode == 'FIXED_HOURLY'
        ? '${safeHours.toStringAsFixed(1)}h × ₹${baseHourlyRate.toStringAsFixed(2)}/hr × $multStr'
        : '$wageBaseMode ÷ ${divisor.toInt()}d ÷ ${dailyPaidHours.toInt()}h × $multStr';

    return OvertimeAmountResult(
      wageBaseMode: wageBaseMode,
      baseHourlyRate: baseHourlyRate,
      effectiveHourlyRate: effectiveHourlyRate,
      multiplierFactor: multiplierFactor,
      overtimeAmount: finalAmount,
      formulaDescription: formulaDesc,
    );
  }

  /// Builds daily OT entries for a given `(month, year)` merging both
  /// `attendance_records` and `overtime_requests` / `/overtime`, applying the
  /// strict Web OT Policy rule: amount is ONLY attached for eligible employees.
  static List<DailyOvertimeEntry> buildDailyEntries({
    required int month,
    required int year,
    required List<Map<String, dynamic>> employees,
    required List<Map<String, dynamic>> attendanceRecords,
    required List<Map<String, dynamic>> overtimeRecords,
    List<Map<String, dynamic>> departmentOtPolicies = const [],
    List<Map<String, dynamic>> employeeOtPolicies = const [],
    Map<String, dynamic>? overtimePolicy,
    Map<String, dynamic>? payrollConfig,
    String? filterEmployeeId,
    Map<String, dynamic>? fallbackCurrentEmployee,
  }) {
    final safeMonth = month.clamp(1, 12);
    final monthPrefix = '$year-${safeMonth.toString().padLeft(2, '0')}';

    final empById = <String, Map<String, dynamic>>{};
    for (final emp in employees) {
      if (isCeoEmployeeRecord(emp)) continue;
      final code = (emp['employeeId'] ?? emp['employee_id'] ?? '')
          .toString()
          .trim()
          .toLowerCase();
      final uuid = (emp['id'] ?? '').toString().trim().toLowerCase();
      if (code.isNotEmpty) empById[code] = emp;
      if (uuid.isNotEmpty) empById[uuid] = emp;
    }
    if (fallbackCurrentEmployee != null &&
        !isCeoEmployeeRecord(fallbackCurrentEmployee)) {
      final code = (fallbackCurrentEmployee['employeeId'] ??
              fallbackCurrentEmployee['employee_id'] ??
              '')
          .toString()
          .trim()
          .toLowerCase();
      final uuid =
          (fallbackCurrentEmployee['id'] ?? '').toString().trim().toLowerCase();
      if (code.isNotEmpty && !empById.containsKey(code)) {
        empById[code] = fallbackCurrentEmployee;
      }
      if (uuid.isNotEmpty && !empById.containsKey(uuid)) {
        empById[uuid] = fallbackCurrentEmployee;
      }
    }

    final filterNorm = (filterEmployeeId ?? '').trim().toLowerCase();
    final filterEmp = filterNorm.isNotEmpty ? empById[filterNorm] : null;
    final filterCode = (filterEmp?['employeeId'] ??
            filterEmp?['employee_id'] ??
            filterNorm)
        .toString()
        .trim()
        .toLowerCase();
    final filterUuid = (filterEmp?['id'] ?? '').toString().trim().toLowerCase();

    bool matchesFilter(String rawEmpId, Map<String, dynamic>? resolvedEmp) {
      if (filterNorm.isEmpty) return true;
      final norm = rawEmpId.trim().toLowerCase();
      if (norm.isEmpty) return false;
      if (norm == filterNorm || norm == filterCode) return true;
      if (filterUuid.isNotEmpty && norm == filterUuid) return true;
      if (resolvedEmp != null) {
        final rCode =
            (resolvedEmp['employeeId'] ?? resolvedEmp['employee_id'] ?? '')
                .toString()
                .trim()
                .toLowerCase();
        final rUuid =
            (resolvedEmp['id'] ?? '').toString().trim().toLowerCase();
        if (rCode == filterCode ||
            (filterUuid.isNotEmpty && rUuid == filterUuid)) {
          return true;
        }
      }
      return false;
    }

    final merged = <String, _MutableDailyOt>{};

    // 1. Attendance records with OT hours
    for (final att in attendanceRecords) {
      final dIso =
          _normalizeIsoDate(att['date'] ?? att['shift_date'] ?? att['shiftDate']);
      if (dIso == null || !dIso.startsWith(monthPrefix)) continue;

      final otHrs = _firstPositive([
        att['approvedOtHours'],
        att['approved_ot_hours'],
        att['calculated_ot_hours'],
        att['calculatedOtHours'],
        att['overtime_hours'],
        att['overtimeHours'],
        att['ot_hours'],
        att['otHours'],
      ]);
      if (otHrs <= 0) continue;

      final rawEmp = (att['employee_id'] ?? att['employeeId'] ?? '')
          .toString()
          .trim();
      final emp = empById[rawEmp.toLowerCase()] ??
          (filterNorm.isNotEmpty ? filterEmp : null);
      if (emp != null && isCeoEmployeeRecord(emp)) continue;
      if (!matchesFilter(rawEmp, emp)) continue;

      final canonicalCode = (emp?['employeeId'] ??
              emp?['employee_id'] ??
              (rawEmp.isNotEmpty ? rawEmp : filterCode))
          .toString()
          .trim();
      if (canonicalCode.isEmpty) continue;
      final key = '${canonicalCode.toLowerCase()}|$dIso';

      final existing = merged[key];
      final checkIn = (att['check_in'] ?? att['checkIn'] ?? '').toString().trim();
      final checkOut =
          (att['check_out'] ?? att['checkOut'] ?? '').toString().trim();
      final workHrs = _num(att['working_hours'] ?? att['workingHours']);
      final attOtStatus =
          (att['otApprovalStatus'] ?? att['ot_approval_status'] ?? '')
              .toString()
              .trim();

      if (existing == null) {
        merged[key] = _MutableDailyOt(
          dateIso: dIso,
          employeeId: canonicalCode,
          employee: emp ??
              {
                'employeeId': canonicalCode,
                'name': (att['employee_name'] ??
                        att['employeeName'] ??
                        canonicalCode)
                    .toString(),
                'department': (att['department'] ?? '').toString(),
              },
          checkIn: checkIn,
          checkOut: checkOut,
          workingHours: workHrs,
          otHours: otHrs,
          status: attOtStatus.isNotEmpty ? attOtStatus : 'Logged',
        );
      } else {
        if (otHrs > existing.otHours) existing.otHours = otHrs;
        if (existing.checkIn.isEmpty && checkIn.isNotEmpty) {
          existing.checkIn = checkIn;
        }
        if (existing.checkOut.isEmpty && checkOut.isNotEmpty) {
          existing.checkOut = checkOut;
        }
        if (workHrs > existing.workingHours) existing.workingHours = workHrs;
      }
    }

    // 2. Explicit overtime records / requests (/api/v1/overtime & overtime_requests_data)
    for (final ot in overtimeRecords) {
      final st = (ot['status'] ?? 'Pending').toString().trim();
      if (st.toLowerCase() == 'rejected') continue;
      final dIso =
          _normalizeIsoDate(ot['date'] ?? ot['overtimeDate'] ?? ot['ot_date']);
      if (dIso == null || !dIso.startsWith(monthPrefix)) continue;

      final hrs = _firstPositive([
        if (st.toLowerCase() == 'approved' ||
            st.toLowerCase() == 'partially approved' ||
            st.toLowerCase() == 'paid')
          ot['approvedOtHours'],
        if (st.toLowerCase() == 'approved' ||
            st.toLowerCase() == 'partially approved' ||
            st.toLowerCase() == 'paid')
          ot['approved_ot_hours'],
        ot['hours'],
        ot['otHours'],
        ot['ot_hours'],
        ot['requestedOtHours'],
      ]);
      if (hrs <= 0) continue;

      final rawEmp =
          (ot['employeeId'] ?? ot['employee_id'] ?? '').toString().trim();
      final emp = empById[rawEmp.toLowerCase()] ??
          (filterNorm.isNotEmpty ? filterEmp : null);
      if (emp != null && isCeoEmployeeRecord(emp)) continue;
      if (!matchesFilter(rawEmp, emp)) continue;

      final canonicalCode = (emp?['employeeId'] ??
              emp?['employee_id'] ??
              (rawEmp.isNotEmpty ? rawEmp : filterCode))
          .toString()
          .trim();
      if (canonicalCode.isEmpty) continue;
      final key = '${canonicalCode.toLowerCase()}|$dIso';

      final rateType =
          (ot['rateType'] ?? ot['multiplier'] ?? '').toString().trim();
      final hourlyOverride = _num(ot['hourlyRate'] ?? ot['hourly_rate']);
      final explicitAmt = _num(ot['otAmount'] ?? ot['ot_amount'] ?? ot['amount']);

      final existing = merged[key];
      if (existing == null) {
        merged[key] = _MutableDailyOt(
          dateIso: dIso,
          employeeId: canonicalCode,
          employee: emp ??
              {
                'employeeId': canonicalCode,
                'name': (ot['employeeName'] ??
                        ot['employee_name'] ??
                        canonicalCode)
                    .toString(),
                'department': (ot['department'] ?? '').toString(),
              },
          checkIn: (ot['checkIn'] ?? '').toString().trim(),
          checkOut: (ot['checkOut'] ?? '').toString().trim(),
          workingHours: _num(ot['workingHours']),
          otHours: hrs,
          status: st.isNotEmpty ? st : 'Pending',
          rateTypeOverride: rateType.isNotEmpty ? rateType : null,
          hourlyRateOverride:
              hourlyOverride > 0 && hourlyOverride != 100 ? hourlyOverride : null,
          explicitOtAmount: explicitAmt > 0 ? explicitAmt : null,
        );
      } else {
        if (hrs > existing.otHours) existing.otHours = hrs;
        if (st.isNotEmpty) existing.status = st;
        if (rateType.isNotEmpty) existing.rateTypeOverride = rateType;
        if (hourlyOverride > 0 && hourlyOverride != 100) {
          existing.hourlyRateOverride = hourlyOverride;
        }
        if (explicitAmt > 0) existing.explicitOtAmount = explicitAmt;
      }
    }

    // 3. Resolve exact Web OT eligibility & amount per entry
    final entries = <DailyOvertimeEntry>[];
    for (final item in merged.values) {
      final emp = item.employee;
      final elig = resolveEligibility(
        employee: emp,
        departmentOtPolicies: departmentOtPolicies,
        employeeOtPolicies: employeeOtPolicies,
        overtimePolicy: overtimePolicy,
        dateIso: item.dateIso,
      );

      OvertimeAmountResult? calc;
      if (elig.isEligible) {
        calc = calculateAmount(
          employee: emp,
          eligibility: elig,
          otHours: item.otHours,
          month: safeMonth,
          year: year,
          payrollConfig: payrollConfig,
          overtimePolicy: overtimePolicy,
          rateTypeOverride: item.rateTypeOverride,
          fixedHourlyRateOverride: item.hourlyRateOverride,
          explicitOtAmount: item.explicitOtAmount,
        );
      }

      final empName = _firstNonEmpty([
        emp['name'],
        [emp['firstName'] ?? emp['first_name'], emp['lastName'] ?? emp['last_name']]
            .where((p) => p != null && p.toString().trim().isNotEmpty)
            .join(' '),
        item.employeeId,
      ]);

      entries.add(
        DailyOvertimeEntry(
          dateIso: item.dateIso,
          employeeId: item.employeeId,
          employeeName: empName,
          department: elig.resolvedDepartment == 'General'
              ? (emp['department'] ?? '').toString().trim()
              : elig.resolvedDepartment,
          designation: (emp['designation'] ?? '').toString().trim(),
          checkIn: item.checkIn,
          checkOut: item.checkOut,
          workingHours: _round2(item.workingHours),
          otHours: _round2(item.otHours),
          status: item.status,
          showAmount: elig.isEligible,
          amount: elig.isEligible ? calc?.overtimeAmount : null,
          hourlyRate: elig.isEligible ? calc?.effectiveHourlyRate : null,
          multiplierLabel: elig.isEligible
              ? (item.rateTypeOverride ?? elig.defaultMultiplier)
              : null,
          policySource: elig.isEligible ? elig.source : null,
          formulaDescription: elig.isEligible ? calc?.formulaDescription : null,
        ),
      );
    }

    entries.sort((a, b) {
      final cmp = b.dateIso.compareTo(a.dateIso);
      if (cmp != 0) return cmp;
      return a.employeeId.compareTo(b.employeeId);
    });
    return entries;
  }

  static bool _isPolicyEffectiveOnDate(
      Map<String, dynamic> policy, String? dateIso) {
    final status = (policy['status'] ?? '').toString().trim().toLowerCase();
    if (status == 'inactive' || status == 'disabled' || status == 'archived') {
      return false;
    }
    if (dateIso == null || dateIso.isEmpty) return true;
    final from = _normalizeIsoDate(policy['effectiveFrom']);
    final to = _normalizeIsoDate(policy['effectiveTo']);
    if (from != null && dateIso.compareTo(from) < 0) return false;
    if (to != null && dateIso.compareTo(to) > 0) return false;
    return true;
  }

  static double _resolveDivisor({
    required int calendarDays,
    required String divisorMode,
    Map<String, dynamic>? payrollConfig,
  }) {
    if (divisorMode == 'CALENDAR_DAYS' || divisorMode == 'ACTUAL_DAYS') {
      return calendarDays.toDouble();
    }
    if (divisorMode == 'FIXED_30') return 30.0;
    if (divisorMode == 'FIXED_26') return 26.0;
    final cfgMode =
        (payrollConfig?['salaryDivisorMode'] ?? '').toString().trim().toUpperCase();
    if (cfgMode == 'CALENDAR_DAYS' || cfgMode == 'ACTUAL_DAYS') {
      return calendarDays.toDouble();
    }
    if (cfgMode == 'FIXED_30') return 30.0;
    final std = _num(payrollConfig?['standardWorkingDaysPerMonth']);
    if (std > 0) return std;
    return calendarDays.toDouble();
  }

  static double _parseMultiplier(String raw) {
    final clean = raw.trim().toLowerCase();
    final direct = double.tryParse(clean);
    if (direct != null && direct > 0) return direct;
    if (clean.contains('2x') || clean.startsWith('2')) return 2.0;
    if (clean.contains('1.5')) return 1.5;
    final m = RegExp(r'(\d+(?:\.\d+)?)x').firstMatch(clean);
    if (m != null) {
      final v = double.tryParse(m.group(1)!);
      if (v != null && v > 0) return v;
    }
    return 1.0;
  }

  static bool _parseBool(dynamic value, bool fallback) {
    if (value is bool) return value;
    if (value is String) {
      final l = value.trim().toLowerCase();
      if (const {'yes', 'true', '1', 'on', 'enabled'}.contains(l)) return true;
      if (const {'no', 'false', '0', 'off', 'disabled'}.contains(l)) {
        return false;
      }
    }
    return fallback;
  }

  static String? _normalizeIsoDate(dynamic raw) {
    final s = (raw ?? '').toString().trim();
    if (s.isEmpty) return null;
    if (s.length >= 10 && RegExp(r'^\d{4}-\d{2}-\d{2}').hasMatch(s)) {
      return s.substring(0, 10);
    }
    final dmy = RegExp(r'^(\d{1,2})[/-](\d{1,2})[/-](\d{4})').firstMatch(s);
    if (dmy != null) {
      return '${dmy.group(3)}-${dmy.group(2)!.padLeft(2, '0')}-${dmy.group(1)!.padLeft(2, '0')}';
    }
    final dt = DateTime.tryParse(s);
    if (dt != null) return DateFormat('yyyy-MM-dd').format(dt);
    return null;
  }

  static double _num(dynamic v) {
    if (v is num) return v.toDouble();
    return double.tryParse('${v ?? ''}') ?? 0.0;
  }

  static double _firstPositive(List<dynamic> candidates) {
    for (final c in candidates) {
      final v = _num(c);
      if (v > 0) return v;
    }
    return 0.0;
  }

  static String _firstNonEmpty(List<dynamic> candidates) {
    for (final c in candidates) {
      if (c == null || c is Map || c is List) continue;
      final s = c.toString().trim();
      if (s.isNotEmpty) return s;
    }
    return '';
  }

  static double _round2(double v) => (v * 100).roundToDouble() / 100;
}

class _MutableDailyOt {
  _MutableDailyOt({
    required this.dateIso,
    required this.employeeId,
    required this.employee,
    required this.checkIn,
    required this.checkOut,
    required this.workingHours,
    required this.otHours,
    required this.status,
    this.rateTypeOverride,
    this.hourlyRateOverride,
    this.explicitOtAmount,
  });

  final String dateIso;
  final String employeeId;
  final Map<String, dynamic> employee;
  String checkIn;
  String checkOut;
  double workingHours;
  double otHours;
  String status;
  String? rateTypeOverride;
  double? hourlyRateOverride;
  double? explicitOtAmount;
}
