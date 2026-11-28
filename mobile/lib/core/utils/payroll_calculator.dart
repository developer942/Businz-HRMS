import 'package:intl/intl.dart';

/// Shared Calendar-Day Payroll Attendance & Salary Proration Calculator.
///
/// Mirrors Web HRMS (`frontend/src/services/attendanceCalculationEngine.ts` +
/// `frontend/src/services/policyEngine.ts` + `PayrollManagement.tsx`) so mobile
/// payroll cards and official payslips match Web payable days, LOP, CTC 40/35/20/5
/// component proration, and EPF/ESIC statutory deductions down to the rupee.
class PayrollCalculator {
  const PayrollCalculator._();

  /// Recalculates a payroll record from live attendance, leaves, holidays,
  /// policies, loans, and employee master data whenever the record is not
  /// locked as `Paid`.
  static Map<String, dynamic> recalculateRecord({
    required Map<String, dynamic> record,
    Map<String, dynamic>? employee,
    required List<Map<String, dynamic>> monthAttendance,
    required List<Map<String, dynamic>> approvedLeaves,
    required Set<String> holidayDates,
    required int month,
    required int year,
    Map<String, dynamic>? payrollConfig,
    List<Map<String, dynamic>>? attendancePolicies,
    List<Map<String, dynamic>>? loanRecords,
    DateTime? todayOverride,
  }) {
    final safeMonth = month.clamp(1, 12);
    final calendarDays = DateTime(year, safeMonth + 1, 0).day;
    final statusRaw = (record['status'] ?? 'Processed').toString().trim();
    final isLockedPaid = statusRaw.toLowerCase() == 'paid' ||
        record['isLocked'] == true ||
        record['locked'] == true;

    final empProfile = employee != null && employee['profile_data'] is Map
        ? Map<String, dynamic>.from(employee['profile_data'] as Map)
        : const <String, dynamic>{};
    final empSalaryRaw =
        empProfile['salaryDetails'] ?? empProfile['salary_details'];
    final empSalary = empSalaryRaw is Map
        ? Map<String, dynamic>.from(empSalaryRaw)
        : const <String, dynamic>{};
    final empBankRaw = empProfile['bankDetails'] ?? empProfile['bank_details'];
    final empBank = empBankRaw is Map
        ? Map<String, dynamic>.from(empBankRaw)
        : const <String, dynamic>{};

    String pickStr(List<dynamic> candidates) {
      for (final c in candidates) {
        if (c == null || c is Map || c is List) continue;
        final s = c.toString().trim();
        if (s.isNotEmpty) return s;
      }
      return '';
    }

    final joiningRaw = pickStr([
      employee?['joining_date'],
      employee?['joiningDate'],
      empProfile['joiningDate'],
      empProfile['joining_date'],
      empProfile['dateOfJoining'],
      record['joiningDate'],
      record['joining_date'],
    ]);
    final joiningIso = _normalizeIsoDate(joiningRaw);
    final exitIso = _normalizeIsoDate(
      employee?['exit_date'] ??
          employee?['exitDate'] ??
          empProfile['exitDate'] ??
          empProfile['relievingDate'] ??
          empProfile['lastWorkingDate'] ??
          empProfile['terminationDate'],
    );

    final embeddedBankName = pickStr([
      employee?['bank_name'],
      employee?['bankName'],
      empBank['bankName'],
      empBank['bank_name'],
      empProfile['bankName'],
      empProfile['bank_name'],
      record['bankName'],
    ]);
    final embeddedAccountNumber = pickStr([
      employee?['account_number'],
      employee?['accountNumber'],
      empBank['accountNumber'],
      empBank['account_number'],
      empProfile['accountNumber'],
      empProfile['account_number'],
      record['accountNumber'],
    ]);
    final embeddedIfsc = pickStr([
      employee?['ifsc_code'],
      employee?['ifscCode'],
      empBank['ifscCode'],
      empBank['ifsc_code'],
      empProfile['ifscCode'],
      empProfile['ifsc_code'],
      record['ifscCode'],
    ]);
    final embeddedPan = pickStr([
      employee?['pan_number'],
      employee?['panNumber'],
      empSalary['panNumber'],
      empSalary['pan_number'],
      empProfile['panNumber'],
      empProfile['pan_number'],
      record['panNumber'],
    ]);
    final embeddedUan = pickStr([
      employee?['uan_number'],
      employee?['uanNumber'],
      empSalary['uanNumber'],
      empSalary['uan_number'],
      empProfile['uanNumber'],
      empProfile['uan_number'],
      record['uanNumber'],
    ]);
    final embeddedEmpName = pickStr([
      record['employeeName'],
      employee?['name'],
      [employee?['first_name'], employee?['last_name']]
          .where((p) => p != null && p.toString().trim().isNotEmpty)
          .join(' '),
    ]);
    final embeddedDesignation = pickStr([
      employee?['designation'],
      empProfile['designation'],
      record['designation'],
    ]);
    final embeddedDepartment = pickStr([
      employee?['department'],
      record['department'],
      empProfile['department'],
    ]);

    final profileFields = <String, dynamic>{
      if (employee != null) '_hasEmbeddedProfile': true,
      if (embeddedEmpName.isNotEmpty) 'employeeName': embeddedEmpName,
      if (embeddedDesignation.isNotEmpty) 'designation': embeddedDesignation,
      if (embeddedDepartment.isNotEmpty) 'department': embeddedDepartment,
      if (joiningIso != null) 'joiningDate': joiningIso,
      if (embeddedBankName.isNotEmpty) 'bankName': embeddedBankName,
      if (embeddedAccountNumber.isNotEmpty)
        'accountNumber': embeddedAccountNumber,
      if (embeddedIfsc.isNotEmpty) 'ifscCode': embeddedIfsc,
      if (embeddedPan.isNotEmpty) 'panNumber': embeddedPan,
      if (embeddedUan.isNotEmpty) 'uanNumber': embeddedUan,
    };

    final withPf = _resolveWithPf(
      record: record,
      employee: employee,
      empProfile: empProfile,
      empSalary: empSalary,
      joiningIso: joiningIso,
      month: safeMonth,
      year: year,
    );

    // Resolve full monthly CTC matching Web HRMSContext.tsx:1661-1665 &
    // policyEngine.ts:1651 strictly before proration:
    //   1) Explicit employee monthlyCtc / gross_salary
    //   2) Employee basic_salary / 0.40 (Web stores 40% Basic in employees.basic_salary)
    //   3) Explicit monthlyCtc / ctc / monthlySalary on the payroll record
    //   4) Fallback to existingGross or existingBasic / 0.40
    final empExplicitCtc = _firstPositive([
      empSalary['monthlyCtc'],
      empSalary['monthly_ctc'],
      empProfile['monthlyCtc'],
      empProfile['monthly_ctc'],
      employee?['monthlyCtc'],
      employee?['monthly_ctc'],
      employee?['gross_salary'],
      empProfile['grossSalary'],
    ]);
    final empBasic = _firstPositive([
      employee?['basic_salary'],
      employee?['basicSalary'],
      empSalary['basicSalary'],
      empSalary['basic_salary'],
      empProfile['basicSalary'],
      empProfile['basic_salary'],
    ]);
    final recordExplicitCtc = _firstPositive([
      record['monthlyCtc'],
      record['ctc'],
      record['monthlySalary'],
    ]);
    final existingGross = _num(record['grossSalary'] ?? record['gross_salary']);
    final existingBasic = _num(record['basicSalary'] ?? record['basic_salary']);

    double monthlyCtc = empExplicitCtc;
    if (monthlyCtc <= 0 && empBasic > 0) {
      // In Web PostgreSQL `employees.basic_salary`, Basic is 40% of Monthly CTC
      // (HRMSContext.tsx:1664: `c > 0 ? c : (b > 0 ? Math.round(b / 0.4) : 0)`).
      // Guard: if a legacy row or caller stored full CTC directly in `basic_salary`
      // (at least 75% of existingGross or within 15% of explicit record CTC),
      // avoid inflating it 2.5x.
      final looksLikeFullCtc = (recordExplicitCtc > 0 &&
              (empBasic - recordExplicitCtc).abs() <=
                  recordExplicitCtc * 0.15) ||
          (existingGross > 0 && empBasic >= existingGross * 0.75);
      monthlyCtc =
          looksLikeFullCtc ? empBasic : (empBasic / 0.40).roundToDouble();
    }
    if (monthlyCtc <= 0 && recordExplicitCtc > 0) {
      monthlyCtc = recordExplicitCtc;
    }
    if (monthlyCtc <= 0) {
      if (existingGross > 0) {
        monthlyCtc = existingGross;
      } else if (existingBasic > 0) {
        monthlyCtc = (existingBasic / 0.40).roundToDouble();
      }
    }

    // If locked Paid or no live attendance exists for this month at all, enrich
    // breakdowns cleanly without altering locked payout numbers.
    if (isLockedPaid || (monthAttendance.isEmpty && approvedLeaves.isEmpty)) {
      return _attachFormattedBreakdowns(
        record: {...record, ...profileFields},
        calendarDays: calendarDays,
        monthlyCtc: monthlyCtc > 0 ? monthlyCtc : existingGross,
        withPf: withPf,
      );
    }

    final monthPad = safeMonth.toString().padLeft(2, '0');
    final monthStartStr = '$year-$monthPad-01';
    final monthEndStr =
        '$year-$monthPad-${calendarDays.toString().padLeft(2, '0')}';

    final empCode = (record['employeeId'] ??
            record['employee_id'] ??
            employee?['employeeId'] ??
            employee?['employee_id'] ??
            '')
        .toString()
        .trim()
        .toLowerCase();
    final empUuid =
        (employee?['id'] ?? record['employeeDbId'] ?? '').toString().trim().toLowerCase();
    final empName = (record['employeeName'] ??
            employee?['name'] ??
            '')
        .toString()
        .trim()
        .toLowerCase();

    bool matchesEmp(dynamic rawId, dynamic rawName) {
      final idNorm = (rawId ?? '').toString().trim().toLowerCase();
      final nameNorm = (rawName ?? '').toString().trim().toLowerCase();
      if (idNorm.isNotEmpty &&
          ((empCode.isNotEmpty && idNorm == empCode) ||
              (empUuid.isNotEmpty && idNorm == empUuid))) {
        return true;
      }
      if (nameNorm.isNotEmpty && empName.isNotEmpty && nameNorm == empName) {
        return true;
      }
      return false;
    }

    // Determine cutoff date (today IST / local or max attendance date in month)
    String maxMonthAttDate = '';
    final empAttByDate = <String, Map<String, dynamic>>{};
    for (final rec in monthAttendance) {
      final dIso =
          _normalizeIsoDate(rec['date'] ?? rec['shift_date'] ?? rec['shiftDate']);
      if (dIso == null ||
          dIso.compareTo(monthStartStr) < 0 ||
          dIso.compareTo(monthEndStr) > 0) {
        continue;
      }
      if (dIso.compareTo(maxMonthAttDate) > 0) {
        maxMonthAttDate = dIso;
      }
      if (!matchesEmp(
          rec['employee_id'] ?? rec['employeeId'], rec['employee_name'] ?? rec['employeeName'])) {
        continue;
      }
      final existing = empAttByDate[dIso];
      if (existing == null) {
        empAttByDate[dIso] = rec;
      } else {
        final hasOut = _hasCompletedOut(rec['check_out'] ?? rec['checkOut']);
        final existingOut =
            _hasCompletedOut(existing['check_out'] ?? existing['checkOut']);
        final isManual =
            (rec['method'] ?? '').toString().toLowerCase().contains('manual');
        final existingManual = (existing['method'] ?? '')
            .toString()
            .toLowerCase()
            .contains('manual');
        if ((isManual && !existingManual) || (hasOut && !existingOut)) {
          empAttByDate[dIso] = rec;
        }
      }
    }

    final now = todayOverride ?? DateTime.now();
    final todayIso = DateFormat('yyyy-MM-dd').format(now);
    String cutoffDate;
    if (todayIso.compareTo(monthStartStr) >= 0 &&
        todayIso.compareTo(monthEndStr) <= 0) {
      cutoffDate =
          maxMonthAttDate.isNotEmpty && maxMonthAttDate.compareTo(todayIso) > 0
              ? maxMonthAttDate
              : todayIso;
    } else if (todayIso.compareTo(monthStartStr) < 0) {
      cutoffDate = maxMonthAttDate.isNotEmpty ? maxMonthAttDate : todayIso;
    } else {
      cutoffDate = monthEndStr;
    }

    // Active employment window in month
    final activeStart =
        joiningIso != null && joiningIso.compareTo(monthStartStr) > 0
            ? joiningIso
            : monthStartStr;
    final activeEnd = exitIso != null && exitIso.compareTo(monthEndStr) < 0
        ? exitIso
        : monthEndStr;

    // Weekly off weekday (default Sunday = DateTime.sunday)
    final weeklyOffDays = _resolveWeeklyOffDays(
      employee?['weekly_off'] ??
          empProfile['weeklyOff'] ??
          (empProfile['shiftDetails'] is Map
              ? (empProfile['shiftDetails'] as Map)['weeklyOff']
              : null),
    );

    // Index approved leaves for this employee in this month
    final leaveByDate = <String, _LeaveDayInfo>{};
    for (final lr in approvedLeaves) {
      final st = (lr['status'] ?? '').toString().trim().toLowerCase();
      if (st != 'approved') continue;
      if (!matchesEmp(
          lr['employeeId'] ?? lr['employee_id'], lr['employeeName'] ?? lr['employee_name'])) {
        continue;
      }
      final sIso = _normalizeIsoDate(lr['startDate'] ?? lr['start_date']);
      final eIso =
          _normalizeIsoDate(lr['endDate'] ?? lr['end_date'] ?? sIso);
      if (sIso == null || eIso == null) continue;
      if (eIso.compareTo(monthStartStr) < 0 || sIso.compareTo(monthEndStr) > 0) {
        continue;
      }
      final lType = (lr['leaveType'] ?? lr['leave_type'] ?? '').toString();
      final isUnpaid = _isUnpaidLeave(lType);
      final isWfh = _isWfhOrOnDuty(lType);
      final daysCount = _num(lr['daysCount'] ?? lr['days_count']);
      final isHalf = lr['isHalfDay'] == true || (sIso == eIso && daysCount == 0.5);

      final startDt = DateTime.tryParse(sIso);
      final endDt = DateTime.tryParse(eIso);
      if (startDt == null || endDt == null) continue;
      var cur = startDt;
      while (!cur.isAfter(endDt)) {
        final dIso = DateFormat('yyyy-MM-dd').format(cur);
        if (dIso.compareTo(monthStartStr) >= 0 &&
            dIso.compareTo(monthEndStr) <= 0) {
          leaveByDate[dIso] = _LeaveDayInfo(
            isUnpaid: isUnpaid,
            isHalfDay: isHalf,
            isWfh: isWfh,
          );
        }
        cur = cur.add(const Duration(days: 1));
      }
    }

    int eligibleDays = 0;
    int scheduledWorkingDays = 0;
    double presentDays = 0;
    double paidWeekOffDays = 0;
    double paidHolidayDays = 0;
    double paidLeaveDays = 0;
    double lopDays = 0;

    for (var d = 1; d <= calendarDays; d++) {
      final dt = DateTime(year, safeMonth, d);
      final dIso = '$year-$monthPad-${d.toString().padLeft(2, '0')}';
      final isEligible = dIso.compareTo(activeStart) >= 0 &&
          dIso.compareTo(activeEnd) <= 0;
      if (!isEligible) continue;
      eligibleDays++;

      final isWeeklyOff = weeklyOffDays.contains(dt.weekday);
      final isRawHoliday = holidayDates.contains(dIso);
      final isEffectiveHoliday = isRawHoliday && !isWeeklyOff;
      final isWorkingDay = !isWeeklyOff && !isEffectiveHoliday;

      if (isWorkingDay) {
        scheduledWorkingDays++;
      }

      final leave = leaveByDate[dIso];
      final att = empAttByDate[dIso];
      final isFuture = dIso.compareTo(cutoffDate) > 0;

      if (!isWorkingDay) {
        if (isFuture && att == null && leave == null) {
          continue;
        }
        if (isWeeklyOff) {
          paidWeekOffDays += 1;
        } else if (isEffectiveHoliday) {
          paidHolidayDays += 1;
        }
        continue;
      }

      if (isFuture && att == null && leave == null) {
        continue;
      }

      if (leave != null) {
        if (leave.isWfh) {
          presentDays += 1;
        } else if (leave.isHalfDay) {
          if (leave.isUnpaid) {
            lopDays += 0.5;
          } else {
            paidLeaveDays += 0.5;
          }
          final attSt = (att?['status'] ?? '').toString().trim().toLowerCase();
          if (attSt == 'absent') {
            lopDays += 0.5;
          } else if (att != null) {
            presentDays += 0.5;
          } else {
            lopDays += 0.5;
          }
        } else {
          if (leave.isUnpaid) {
            lopDays += 1;
          } else {
            paidLeaveDays += 1;
          }
        }
        continue;
      }

      if (att != null) {
        final st = (att['status'] ?? '').toString().trim().toLowerCase();
        final workedHrs = _computeWorkedHours(att);
        final hasOut = _hasCompletedOut(att['check_out'] ?? att['checkOut']);
        final shiftHrs =
            _firstPositive([att['shiftWorkingHours'], att['shiftHours'], 9]);
        final isHalfByHours = hasOut &&
            (st == 'present' || st == 'late') &&
            workedHrs > 0 &&
            workedHrs < shiftHrs * 0.7;

        if (st == 'half day' ||
            st == 'half-day' ||
            st == 'hd' ||
            isHalfByHours) {
          presentDays += 0.5;
          lopDays += 0.5;
        } else if (st == 'present' ||
            st == 'late' ||
            st == 'work from home' ||
            st == 'wfh' ||
            st == 'on duty' ||
            st == 'field visit') {
          presentDays += 1;
        } else if (st == 'on leave' || st == 'leave') {
          if (_isUnpaidLeave((att['leaveType'] ?? att['reason'] ?? '').toString())) {
            lopDays += 1;
          } else {
            paidLeaveDays += 1;
          }
        } else if (st == 'absent') {
          lopDays += 1;
        } else {
          // Missing punch / pending defaults to 1 present matching Web autoConvertPendingToLop=false
          presentDays += 1;
        }
      } else {
        // Elapsed working day with no punch and no approved leave => LOP
        lopDays += 1;
      }
    }

    if (presentDays + paidLeaveDays <= 0) {
      paidWeekOffDays = 0;
      paidHolidayDays = 0;
    }

    presentDays = _round2(presentDays);
    paidWeekOffDays = _round2(paidWeekOffDays);
    paidHolidayDays = _round2(paidHolidayDays);
    paidLeaveDays = _round2(paidLeaveDays);
    lopDays = _round2(lopDays);

    final totalPaidDays = _round2(
      (presentDays + paidWeekOffDays + paidHolidayDays + paidLeaveDays)
          .clamp(0.0, eligibleDays.toDouble()),
    );

    // Prorate CTC 40% Basic / 35% HRA / 20% DA / 5% Conveyance with 1-rupee HRA reconciliation
    final fullBasic = (monthlyCtc * 0.40).roundToDouble();
    final fullHra = (monthlyCtc * 0.35).roundToDouble();
    final fullDa = (monthlyCtc * 0.20).roundToDouble();
    final fullConv = (monthlyCtc * 0.05).roundToDouble();
    final isFullMonth = totalPaidDays >= calendarDays && calendarDays > 0;

    double prorate(double v) {
      if (isFullMonth) return v.roundToDouble();
      if (calendarDays <= 0 || totalPaidDays <= 0) return 0;
      return ((v * totalPaidDays) / calendarDays).roundToDouble();
    }

    final targetFixedGross = isFullMonth
        ? monthlyCtc.roundToDouble()
        : (calendarDays > 0 && totalPaidDays > 0
            ? ((monthlyCtc * totalPaidDays) / calendarDays).roundToDouble()
            : 0.0);

    var payableBasic = prorate(fullBasic);
    var payableHra = prorate(fullHra);
    final payableDa = prorate(fullDa);
    final payableConv = prorate(fullConv);

    final sumFixed = payableBasic + payableHra + payableDa + payableConv;
    final residual = targetFixedGross - sumFixed;
    if (residual != 0 && targetFixedGross > 0) {
      if (payableHra + residual >= 0) {
        payableHra += residual;
      } else if (payableBasic + residual >= 0) {
        payableBasic += residual;
      }
    }

    final bonus = _num(record['bonus']);
    final attendanceBonus = _num(record['attendanceBonus']);
    final otAmount = _num(record['overtimeAmount'] ?? record['otVariableAmount']);
    final grossSalary = _round2(
      payableBasic +
          payableHra +
          payableDa +
          payableConv +
          bonus +
          attendanceBonus +
          otAmount,
    );

    // Statutory EPF (12% of Basic+DA+Conv) & ESIC (0.75% of Gross when regular gross <= limit)
    final pfPolicy = payrollConfig != null && payrollConfig['pfPolicy'] is Map
        ? Map<String, dynamic>.from(payrollConfig['pfPolicy'] as Map)
        : const <String, dynamic>{};
    final esicPolicy =
        payrollConfig != null && payrollConfig['esicPolicy'] is Map
            ? Map<String, dynamic>.from(payrollConfig['esicPolicy'] as Map)
            : const <String, dynamic>{};
    final pfActive = pfPolicy['active'] != false;
    final esicActive = esicPolicy['active'] != false;
    final pfRate = _firstPositive([pfPolicy['percentage'], 12.0]);
    final esicRate = _firstPositive([esicPolicy['percentage'], 0.75]);
    final esicLimit = _firstPositive([esicPolicy['grossSalaryLimit'], 21000.0]);
    final regularGrossExclOt =
        (grossSalary - otAmount).clamp(0.0, double.infinity);

    final pfBase = payableBasic + payableDa + payableConv;
    final epfDeduction = (withPf && pfActive && pfBase > 0)
        ? _round2(pfBase * (pfRate / 100.0))
        : 0.0;
    final esicCovered = withPf &&
        esicActive &&
        grossSalary > 0 &&
        (regularGrossExclOt <= esicLimit || grossSalary <= esicLimit);
    final esiDeduction =
        esicCovered ? _round2(grossSalary * (esicRate / 100.0)) : 0.0;

    // Professional Tax: mirror Web policyEngine.ts:2123-2148 strictly!
    // When `payrollConfig.components` configures active statutory deductions
    // (PF / ESIC / PT), Web uses ONLY the active PT component (if any) and does
    // NOT fall back to legacy `enableProfessionalTax` / `standardPtAmount`.
    final double pt = _resolveProfessionalTax(
      payrollConfig: payrollConfig,
      grossSalary: grossSalary,
    );

    // Late Attendance Deduction: recompute LIVE from active attendance policy
    // matching Web policyEngine.ts:535-702 (never carry over stale snapshot ₹120!).
    final lateEval = _evaluateLiveLateDeduction(
      empAttByDate: empAttByDate,
      attendancePolicies: attendancePolicies,
      employee: employee,
      empProfile: empProfile,
      fullBasic: fullBasic,
      calendarDays: calendarDays,
    );
    final lateDed = lateEval.deductionAmount;

    // Advance Salary / Loan EMI recovery: compute LIVE from active loans when provided
    // (mirroring Web policyEngine.ts:2171-2196).
    final preLoanDed = epfDeduction + esiDeduction + pt + lateDed;
    final availableForLoan =
        (grossSalary - preLoanDed).clamp(0.0, double.infinity);
    double advDed = 0;
    double loanDed = 0;
    if (loanRecords != null) {
      double scheduledLoan = 0;
      for (final adv in loanRecords) {
        final advEmp =
            (adv['employeeId'] ?? adv['employee_id'] ?? '').toString().trim().toLowerCase();
        if (advEmp.isEmpty || (advEmp != empCode && advEmp != empUuid)) {
          continue;
        }
        final advStatus = (adv['status'] ?? '').toString().trim().toLowerCase();
        if (advStatus != 'active' && advStatus != 'disbursed') continue;
        final balance = _num(adv['outstandingBalance']);
        if (balance <= 0) continue;
        double emi = _num(adv['monthlyDeduction']);
        final schedule = adv['repaymentSchedule'];
        if (schedule is List) {
          for (final inst in schedule) {
            if (inst is Map &&
                (inst['status'] ?? '').toString().trim().toLowerCase() ==
                    'pending') {
              emi = _firstPositive(
                  [inst['scheduledAmount'], inst['actualDeducted'], emi]);
              break;
            }
          }
        }
        if (emi > 0) {
          scheduledLoan += emi < balance ? emi : balance;
        }
      }
      advDed = _round2(
        scheduledLoan < availableForLoan ? scheduledLoan : availableForLoan,
      );
    } else {
      advDed = _num(record['advanceRecovery'] ?? record['advanceDeduction']);
      loanDed = _num(record['loanRecovery'] ?? record['loanDeduction']);
    }
    final otherDed = _num(record['otherDeductions']);

    final totalDeductions = _round2(
      epfDeduction + esiDeduction + pt + lateDed + advDed + loanDed + otherDed,
    );
    final netSalary = _round2(
      (grossSalary - totalDeductions).clamp(0.0, double.infinity),
    );

    final paidStr = _fmtDays(totalPaidDays);
    final earningsBreakdown = <Map<String, dynamic>>[
      if (payableBasic > 0)
        {
          'name': 'BASIC SALARY',
          'description': '40% of CTC | Paid $paidStr/$calendarDays days',
          'amount': payableBasic,
        },
      if (payableHra > 0)
        {
          'name': 'House Rent Allowance',
          'description': '35% of CTC | Paid $paidStr/$calendarDays days',
          'amount': payableHra,
        },
      if (payableDa > 0)
        {
          'name': 'Dearness Allowance',
          'description': '20% of CTC | Paid $paidStr/$calendarDays days',
          'amount': payableDa,
        },
      if (payableConv > 0)
        {
          'name': 'Conveyance',
          'description': '5% of CTC | Paid $paidStr/$calendarDays days',
          'amount': payableConv,
        },
      if (attendanceBonus > 0)
        {
          'name': 'Attendance Bonus',
          'description': 'Full attendance incentive',
          'amount': attendanceBonus,
        },
      if (otAmount > 0)
        {
          'name': 'Overtime Pay',
          'description': 'Approved overtime hours',
          'amount': otAmount,
        },
      if (bonus > 0)
        {
          'name': 'Bonus',
          'description': '',
          'amount': bonus,
        },
    ];

    final deductionsBreakdown = <Map<String, dynamic>>[
      {
        'name': 'EPF Employee Contribution',
        'description': withPf
            ? '12% of Basic + DA + Conveyance'
            : 'Exempt (< 6 Months)',
        'amount': epfDeduction,
      },
      {
        'name': 'ESIC Contribution',
        'description': !withPf
            ? 'Exempt (< 6 Months)'
            : esicCovered
                ? '0.75% of Gross Salary'
                : 'Exempt (Gross exceeds ₹${esicLimit.toInt()})',
        'amount': esiDeduction,
      },
      if (pt > 0)
        {'name': 'Professional Tax', 'description': '', 'amount': pt},
      if (lateDed > 0)
        {
          'name': 'Late Attendance Deduction',
          'description': lateEval.ruleApplied,
          'amount': lateDed,
        },
      if (advDed > 0)
        {
          'name': 'Advance Salary Recovery',
          'description': '',
          'amount': advDed,
        },
      if (loanDed > 0)
        {'name': 'Loan Recovery', 'description': '', 'amount': loanDed},
      if (otherDed > 0)
        {'name': 'Other Deductions', 'description': '', 'amount': otherDed},
    ];

    return {
      ...record,
      ...profileFields,
      'monthlySalary': monthlyCtc,
      'monthlyCtc': monthlyCtc,
      'basicSalary': payableBasic,
      'hra': payableHra,
      'da': payableDa,
      'conveyance': payableConv,
      'grossSalary': grossSalary,
      'pfAmount': epfDeduction,
      'epfDeduction': epfDeduction,
      'esicAmount': esiDeduction,
      'esiDeduction': esiDeduction,
      'professionalTax': pt,
      'lateAttendanceDeduction': lateDed,
      'advanceRecovery': advDed,
      'advanceDeduction': advDed,
      'loanRecovery': loanDed,
      'withPf': withPf,
      'totalDeductions': totalDeductions,
      'netSalary': netSalary,
      'calendarDays': calendarDays.toDouble(),
      'workingDays': scheduledWorkingDays.toDouble(),
      'presentDays': presentDays,
      'paidWeekOffDays': paidWeekOffDays,
      'paidHolidayDays': paidHolidayDays,
      'paidLeaveDays': paidLeaveDays,
      'lopDays': lopDays,
      'totalPaidDays': totalPaidDays,
      'earningsBreakdown': earningsBreakdown,
      'deductionsBreakdown': deductionsBreakdown,
    };
  }

  static Map<String, dynamic> _attachFormattedBreakdowns({
    required Map<String, dynamic> record,
    required int calendarDays,
    required double monthlyCtc,
    required bool withPf,
  }) {
    final cal = _num(record['calendarDays'] ?? record['calendarDaysInMonth']);
    final effectiveCal = cal > 0 ? cal.toInt() : calendarDays;
    final paid = _num(record['totalPaidDays'] ?? record['paidDays']);
    final paidStr = _fmtDays(paid > 0 ? paid : effectiveCal.toDouble());
    final basic = _num(record['basicSalary'] ?? record['basic_salary']);
    final hra = _num(record['hra']);
    final da = _num(record['da']);
    final conv = _num(record['conveyance']);
    final pf = _num(record['pfAmount'] ?? record['epfDeduction']);
    final esi = _num(record['esicAmount'] ?? record['esiDeduction']);
    final gross = _num(record['grossSalary'] ?? record['gross_salary']);

    final existingEarnings = record['earningsBreakdown'];
    final earningsBreakdown =
        (existingEarnings is List && existingEarnings.isNotEmpty)
            ? existingEarnings
            : <Map<String, dynamic>>[
                if (basic > 0)
                  {
                    'name': 'BASIC SALARY',
                    'description':
                        '40% of CTC | Paid $paidStr/$effectiveCal days',
                    'amount': basic,
                  },
                if (hra > 0)
                  {
                    'name': 'House Rent Allowance',
                    'description':
                        '35% of CTC | Paid $paidStr/$effectiveCal days',
                    'amount': hra,
                  },
                if (da > 0)
                  {
                    'name': 'Dearness Allowance',
                    'description':
                        '20% of CTC | Paid $paidStr/$effectiveCal days',
                    'amount': da,
                  },
                if (conv > 0)
                  {
                    'name': 'Conveyance',
                    'description':
                        '5% of CTC | Paid $paidStr/$effectiveCal days',
                    'amount': conv,
                  },
              ];

    final existingDeds = record['deductionsBreakdown'];
    final deductionsBreakdown =
        (existingDeds is List && existingDeds.isNotEmpty)
            ? existingDeds
            : <Map<String, dynamic>>[
                {
                  'name': 'EPF Employee Contribution',
                  'description': !withPf && pf == 0
                      ? 'Exempt (< 6 Months)'
                      : '12% of Basic + DA + Conveyance',
                  'amount': pf,
                },
                {
                  'name': 'ESIC Contribution',
                  'description': !withPf && esi == 0
                      ? 'Exempt (< 6 Months)'
                      : (esi > 0
                          ? '0.75% of Gross Salary'
                          : (gross > 21000
                              ? 'Exempt (Gross exceeds ₹21,000)'
                              : 'Exempt (< 6 Months)')),
                  'amount': esi,
                },
              ];

    return {
      ...record,
      'monthlySalary': monthlyCtc,
      'monthlyCtc': monthlyCtc,
      'withPf': withPf,
      'earningsBreakdown': earningsBreakdown,
      'deductionsBreakdown': deductionsBreakdown,
    };
  }

  static bool _resolveWithPf({
    required Map<String, dynamic> record,
    required Map<String, dynamic>? employee,
    required Map<String, dynamic> empProfile,
    required Map<String, dynamic> empSalary,
    required String? joiningIso,
    required int month,
    required int year,
  }) {
    final scheme = (empSalary['salaryScheme'] ??
            empSalary['salary_scheme'] ??
            empProfile['salaryScheme'] ??
            empProfile['salary_scheme'] ??
            employee?['salaryScheme'] ??
            employee?['salary_scheme'] ??
            '')
        .toString()
        .trim()
        .toUpperCase();
    if (scheme == 'WITH_PF') return true;
    if (scheme == 'WITHOUT_PF') return false;

    for (final flag in [
      empSalary['withPf'],
      empSalary['with_pf'],
      empProfile['withPf'],
      empProfile['with_pf'],
      employee?['withPf'],
      employee?['with_pf'],
    ]) {
      if (flag is bool) return flag;
      if (flag is String) {
        final l = flag.trim().toLowerCase();
        if (l == 'true') return true;
        if (l == 'false') return false;
      }
    }

    // Check tenure (< 6 months probation exemption) BEFORE trusting an older
    // payroll snapshot's stale `record['withPf']` flag.
    if (joiningIso != null) {
      final joinDt = DateTime.tryParse(joiningIso);
      if (joinDt != null) {
        final periodEnd = DateTime(year, month + 1, 0);
        final monthsTenure = (periodEnd.year - joinDt.year) * 12 +
            (periodEnd.month - joinDt.month);
        if (monthsTenure < 6) return false;
      }
    }

    final recFlag = record['withPf'];
    if (recFlag is bool) return recFlag;
    if (recFlag is String) {
      final l = recFlag.trim().toLowerCase();
      if (l == 'true') return true;
      if (l == 'false') return false;
    }

    // If stored payroll snapshot already explicitly had PF == 0 on a non-zero
    // salary, preserve exemption.
    final storedPf = _num(record['pfAmount'] ?? record['epfDeduction']);
    final storedGross = _num(record['grossSalary'] ?? record['gross_salary']);
    if (storedGross > 0 && storedPf == 0) {
      return false;
    }
    return true;
  }

  static Set<int> _resolveWeeklyOffDays(dynamic raw) {
    final days = <int>{};
    final parts = <String>[];
    if (raw is List) {
      for (final item in raw) {
        parts.add(item.toString().toLowerCase());
      }
    } else if (raw != null && raw.toString().trim().isNotEmpty) {
      parts.addAll(raw.toString().toLowerCase().split(RegExp(r'[,;/|]+')));
    }
    for (final p in parts) {
      final t = p.trim();
      if (t.contains('sun')) days.add(DateTime.sunday);
      if (t.contains('mon')) days.add(DateTime.monday);
      if (t.contains('tue')) days.add(DateTime.tuesday);
      if (t.contains('wed')) days.add(DateTime.wednesday);
      if (t.contains('thu')) days.add(DateTime.thursday);
      if (t.contains('fri')) days.add(DateTime.friday);
      if (t.contains('sat')) days.add(DateTime.saturday);
    }
    return days.isEmpty ? {DateTime.sunday} : days;
  }

  static bool _isUnpaidLeave(String type) {
    final l = type.toLowerCase();
    return l.contains('unpaid') || l.contains('lop') || l.contains('loss of pay');
  }

  static bool _isWfhOrOnDuty(String type) {
    final l = type.toLowerCase();
    return l.contains('work from home') ||
        l == 'wfh' ||
        l.contains('on duty') ||
        l.contains('field visit');
  }

  static bool _hasCompletedOut(dynamic raw) {
    final s = (raw ?? '').toString().trim().toLowerCase();
    return s.isNotEmpty &&
        s != '--:--' &&
        !s.contains('progress') &&
        !s.contains('missed') &&
        !s.contains('none');
  }

  static double _computeWorkedHours(Map<String, dynamic> att) {
    final rawIn = (att['check_in'] ?? att['checkIn'] ?? '').toString().trim();
    final rawOut = (att['check_out'] ?? att['checkOut'] ?? '').toString().trim();
    if (rawIn.isNotEmpty && _hasCompletedOut(rawOut)) {
      final inMins = _parseTimeMinutes(rawIn);
      final outMins = _parseTimeMinutes(rawOut);
      if (inMins != null && outMins != null) {
        var diff = outMins - inMins;
        if (diff < 0) diff += 24 * 60;
        if (diff > 0) return diff / 60.0;
      }
    }
    final direct = _num(att['working_hours'] ?? att['workingHours']);
    return direct > 0 ? direct : 0;
  }

  static int? _parseTimeMinutes(String raw) {
    final dt = DateTime.tryParse(raw);
    if (dt != null) {
      final local = dt.toLocal();
      return local.hour * 60 + local.minute;
    }
    final m = RegExp(r'(\d{1,2}):(\d{2})(?:\s*(AM|PM))?', caseSensitive: false)
        .firstMatch(raw);
    if (m == null) return null;
    var h = int.tryParse(m.group(1)!) ?? 0;
    final min = int.tryParse(m.group(2)!) ?? 0;
    final ap = (m.group(3) ?? '').toUpperCase();
    if (ap == 'PM' && h < 12) h += 12;
    if (ap == 'AM' && h == 12) h = 0;
    return h * 60 + min;
  }

  static String? _normalizeIsoDate(dynamic raw) {
    final s = (raw ?? '').toString().trim();
    if (s.isEmpty) return null;
    if (s.length >= 10 && RegExp(r'^\d{4}-\d{2}-\d{2}').hasMatch(s)) {
      return s.substring(0, 10);
    }
    final dmy = RegExp(r'^(\d{2})/(\d{2})/(\d{4})$').firstMatch(s);
    if (dmy != null) {
      return '${dmy.group(3)}-${dmy.group(2)}-${dmy.group(1)}';
    }
    final parsed = DateTime.tryParse(s);
    if (parsed != null) return DateFormat('yyyy-MM-dd').format(parsed);
    return null;
  }

  static double _num(dynamic value) {
    if (value is num) return value.toDouble();
    return double.tryParse('${value ?? ''}') ?? 0;
  }

  static double _firstPositive(List<dynamic> candidates) {
    for (final c in candidates) {
      final v = _num(c);
      if (v > 0) return v;
    }
    return 0;
  }

  static double _round2(double v) => (v * 100).roundToDouble() / 100;

  /// Mirrors Web `policyEngine.ts:975-1003` + `2123-2148`:
  /// - If `payrollConfig.components` has active statutory deduction components
  ///   (PF / ESIC / PT), Professional Tax applies ONLY if an active PT component
  ///   is configured in `components` (ignoring legacy `enableProfessionalTax`).
  /// - Otherwise falls back to `enableProfessionalTax == true` && `ptPolicy.enabled != false`.
  static double _resolveProfessionalTax({
    required Map<String, dynamic>? payrollConfig,
    required double grossSalary,
  }) {
    if (payrollConfig == null || grossSalary <= 0) return 0.0;

    final rawComponents = payrollConfig['components'];
    if (rawComponents is List && rawComponents.isNotEmpty) {
      bool hasConfiguredStatutory = false;
      Map<String, dynamic>? activePtComponent;

      for (final item in rawComponents) {
        if (item is! Map) continue;
        final comp = Map<String, dynamic>.from(item);
        if (comp['active'] != true) continue;
        if ((comp['type'] ?? '').toString().trim().toUpperCase() !=
            'DEDUCTION') {
          continue;
        }
        final code = (comp['code'] ?? '').toString().trim().toUpperCase();
        final name = (comp['name'] ?? '').toString().trim().toLowerCase();
        final combined = '$code $name';

        final isPf = const [
              'PF',
              'EPF',
              'ERF',
              'PF_EMPLOYEE',
              'EMPLOYEE_PF',
            ].contains(code) ||
            combined.contains('provident fund') ||
            combined.contains('employee pf') ||
            combined.contains(' epf ');
        final isEsic = const ['ESIC', 'ESI'].contains(code) ||
            combined.contains('state insurance') ||
            combined.contains('esic') ||
            combined.contains('esi contribution');
        final isPt = const ['PT', 'PROFESSIONAL_TAX'].contains(code) ||
            combined.contains('professional tax');

        if (isPf || isEsic || isPt) {
          hasConfiguredStatutory = true;
        }
        if (isPt) {
          activePtComponent = comp;
        }
      }

      if (hasConfiguredStatutory) {
        if (activePtComponent == null) return 0.0;
        final method = (activePtComponent['calculationMethod'] ?? '')
            .toString()
            .trim()
            .toUpperCase();
        final val = _num(activePtComponent['defaultValue']);
        if (method == 'PERCENTAGE' && val > 0) {
          return _round2(grossSalary * (val / 100.0));
        }
        return val > 0 ? _round2(val) : 0.0;
      }
    }

    final ptEnabled = payrollConfig['enableProfessionalTax'] == true &&
        (payrollConfig['ptPolicy'] is! Map ||
            (payrollConfig['ptPolicy'] as Map)['enabled'] != false);
    if (!ptEnabled) return 0.0;
    return _firstPositive([payrollConfig['standardPtAmount'], 200.0]);
  }

  static ({double deductionAmount, String ruleApplied})
      _evaluateLiveLateDeduction({
    required Map<String, Map<String, dynamic>> empAttByDate,
    required List<Map<String, dynamic>>? attendancePolicies,
    required Map<String, dynamic>? employee,
    required Map<String, dynamic> empProfile,
    required double fullBasic,
    required int calendarDays,
  }) {
    if (attendancePolicies == null || attendancePolicies.isEmpty) {
      return (deductionAmount: 0.0, ruleApplied: '');
    }
    final activePolicies = attendancePolicies
        .where((p) =>
            (p['status'] ?? '').toString().trim().toLowerCase() == 'active')
        .toList();
    if (activePolicies.isEmpty) {
      return (deductionAmount: 0.0, ruleApplied: '');
    }

    final empCode = (employee?['employeeId'] ?? employee?['employee_id'] ?? '')
        .toString()
        .trim()
        .toLowerCase();
    final empDept =
        (employee?['department'] ?? empProfile['department'] ?? '')
            .toString()
            .trim()
            .toLowerCase();

    bool policyMatches(Map<String, dynamic> policy) {
      final scope =
          (policy['applicableTo'] ?? policy['applicability'] ?? 'ALL')
              .toString()
              .trim()
              .toUpperCase();
      if (scope == 'ALL' || scope == 'ALL_EMPLOYEES' || scope.isEmpty) {
        return true;
      }
      if (scope == 'DEPARTMENT' || scope == 'DEPARTMENTS') {
        final depts = policy['targetDepartments'] ?? policy['departments'];
        if (depts is List && depts.isNotEmpty) {
          return depts
              .any((d) => d.toString().trim().toLowerCase() == empDept);
        }
      }
      if (scope == 'EMPLOYEE' || scope == 'EMPLOYEES' || scope == 'SPECIFIC') {
        final emps = policy['targetEmployees'] ?? policy['employeeIds'];
        if (emps is List && emps.isNotEmpty) {
          return emps
              .any((e) => e.toString().trim().toLowerCase() == empCode);
        }
      }
      return true;
    }

    final policy = activePolicies.firstWhere(
      policyMatches,
      orElse: () => const <String, dynamic>{},
    );
    if (policy.isEmpty) {
      return (deductionAmount: 0.0, ruleApplied: '');
    }

    final graceMins = _num(policy['graceTimeMinutes']).toInt() > 0
        ? _num(policy['graceTimeMinutes']).toInt()
        : 10;
    final policyStart = (policy['startTime'] ?? '09:30').toString();
    final startMins = _parseTimeMinutes(policyStart) ?? (9 * 60 + 30);

    int lateCount = 0;
    for (final rec in empAttByDate.values) {
      final st = (rec['status'] ?? '').toString().trim().toLowerCase();
      if (st == 'absent' ||
          st == 'holiday' ||
          st == 'week off' ||
          st == 'on leave') {
        continue;
      }
      final rawIn = (rec['check_in'] ?? rec['checkIn'] ?? '').toString().trim();
      bool isLate = false;
      if (rawIn.isNotEmpty && rawIn != '--:--') {
        final inMins = _parseTimeMinutes(rawIn);
        if (inMins != null) {
          isLate = inMins > (startMins + graceMins);
        }
      } else {
        final lateSt =
            (rec['late_status'] ?? rec['lateStatus'] ?? '').toString().trim().toLowerCase();
        isLate = st == 'late' ||
            (lateSt.isNotEmpty && lateSt != 'on time' && lateSt != 'n/a');
      }
      if (isLate) lateCount++;
    }

    if (lateCount == 0) {
      return (deductionAmount: 0.0, ruleApplied: '');
    }

    final allowedCount = policy['allowedLateCount'] != null
        ? _num(policy['allowedLateCount']).toInt()
        : 3;
    final halfDayEnabled =
        (policy['halfDayRuleEnabled'] ?? policy['halfDayTriggerEnabled']) ==
            true;
    final lopEnabled =
        (policy['lopRuleEnabled'] ?? policy['lopTriggerEnabled']) == true;

    if (!halfDayEnabled && !lopEnabled) {
      return (deductionAmount: 0.0, ruleApplied: '');
    }

    final halfDayThreshold = policy['halfDayThresholdCount'] != null
        ? _num(policy['halfDayThresholdCount']).toInt()
        : 4;
    final lopThreshold = policy['lopThresholdCount'] != null
        ? _num(policy['lopThresholdCount']).toInt()
        : 6;

    int halfDays = 0;
    int lopDays = 0;
    for (var k = 1; k <= lateCount; k++) {
      if (k <= allowedCount) continue;
      if (lopEnabled && k >= lopThreshold) {
        lopDays++;
      } else if (halfDayEnabled && k >= halfDayThreshold) {
        halfDays++;
      }
    }
    if (halfDays == 0 && lopDays == 0) {
      return (deductionAmount: 0.0, ruleApplied: '');
    }

    final dailySalary =
        calendarDays > 0 ? fullBasic / calendarDays : fullBasic / 30.0;
    final ded = _round2(lopDays * dailySalary + halfDays * dailySalary * 0.5);
    return (
      deductionAmount: ded,
      ruleApplied: '$allowedCount Free ($lateCount late entries)',
    );
  }

  static String _fmtDays(double value) => value == value.roundToDouble()
      ? '${value.toInt()}'
      : value.toStringAsFixed(1);
}

class _LeaveDayInfo {
  const _LeaveDayInfo({
    required this.isUnpaid,
    required this.isHalfDay,
    required this.isWfh,
  });

  final bool isUnpaid;
  final bool isHalfDay;
  final bool isWfh;
}
