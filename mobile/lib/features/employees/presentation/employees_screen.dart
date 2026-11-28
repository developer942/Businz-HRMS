import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/utils/employee_filters.dart';
import '../../shared/presentation/async_content.dart';

class EmployeesScreen extends ConsumerStatefulWidget {
  const EmployeesScreen({super.key});

  @override
  ConsumerState<EmployeesScreen> createState() => _EmployeesScreenState();
}

class _EmployeesScreenState extends ConsumerState<EmployeesScreen> {
  late Future<List<Map<String, dynamic>>> _future;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _future = ref.read(hrmsRepositoryProvider).employees();
  }

  void _reload() =>
      setState(() => _future = ref.read(hrmsRepositoryProvider).employees());

  Future<void> _open(Map<String, dynamic> summary) async {
    final id = _value(summary, ['id', 'employeeId', 'employee_id']);
    if (id.isEmpty) return;
    await showDialog<void>(
      context: context,
      builder: (context) => Dialog.fullscreen(
        child: FutureBuilder<Map<String, dynamic>>(
          future: ref.read(hrmsRepositoryProvider).employee(id),
          builder: (context, snapshot) => Scaffold(
            appBar: AppBar(
              title: const Text('Employee profile'),
              leading: IconButton(
                onPressed: () => Navigator.pop(context),
                icon: const Icon(Icons.close),
              ),
            ),
            body: snapshot.connectionState != ConnectionState.done
                ? const Center(child: CircularProgressIndicator())
                : snapshot.hasError
                    ? AppErrorView(
                        error: snapshot.error!,
                        onRetry: () => Navigator.pop(context),
                      )
                    : _EmployeeProfile(
                        employee: snapshot.data ?? summary,
                      ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: SearchBar(
            leading: const Icon(Icons.search_rounded),
            hintText: 'Search name, ID, department',
            onChanged: (value) => setState(() => _query = value.trim()),
          ),
        ),
        Expanded(
          child: FutureBuilder<List<Map<String, dynamic>>>(
            future: _future,
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) {
                return const Center(child: CircularProgressIndicator());
              }
              if (snapshot.hasError) {
                return AppErrorView(error: snapshot.error!, onRetry: _reload);
              }
              final query = _query.toLowerCase();
              final employees =
                  excludeCeoEmployees(snapshot.data ?? const []).where((employee) {
                if (query.isEmpty) return true;
                return [
                  _fullName(employee),
                  _value(employee, ['employeeId', 'employee_id']),
                  _value(employee, ['department', 'departmentName']),
                  _value(employee, ['designation', 'jobTitle']),
                ].any((value) => value.toLowerCase().contains(query));
              }).toList(growable: false);
              if (employees.isEmpty) {
                return EmptyState(
                  icon: Icons.person_search_outlined,
                  title: query.isEmpty ? 'No employees found' : 'No match',
                  message: query.isEmpty
                      ? 'Employees permitted by your data scope appear here.'
                      : 'Try a different name, ID, or department.',
                );
              }
              return RefreshIndicator(
                onRefresh: () async {
                  _reload();
                  await _future;
                },
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
                  itemCount: employees.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final employee = employees[index];
                    final name = _fullName(employee);
                    final department =
                        _value(employee, ['department', 'departmentName']);
                    final designation =
                        _value(employee, ['designation', 'jobTitle']);
                    final code =
                        _value(employee, ['employeeId', 'employee_id']);
                    return Card(
                      child: ListTile(
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 7),
                        leading: CircleAvatar(
                          child: Text(_initials(name)),
                        ),
                        title: Text(name.isEmpty ? code : name,
                            maxLines: 1, overflow: TextOverflow.ellipsis),
                        subtitle: Text(
                          [designation, department, code]
                              .where((value) => value.isNotEmpty)
                              .join(' · '),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        trailing: const Icon(Icons.chevron_right_rounded),
                        onTap: () => _open(employee),
                      ),
                    );
                  },
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _EmployeeProfile extends StatelessWidget {
  const _EmployeeProfile({required this.employee});
  final Map<String, dynamic> employee;

  @override
  Widget build(BuildContext context) {
    final name = _fullName(employee);
    final code = _value(employee, ['employeeId', 'employee_id']);
    final status = _value(employee, ['status', 'accountStatus'], 'Active');
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 40),
      children: [
        Center(
          child: CircleAvatar(
            radius: 42,
            child: Text(_initials(name),
                style: Theme.of(context).textTheme.headlineSmall),
          ),
        ),
        const SizedBox(height: 14),
        Text(name.isEmpty ? code : name,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 4),
        Text(code, textAlign: TextAlign.center),
        const SizedBox(height: 20),
        _ProfileSection(title: 'Work', rows: {
          'Status': status,
          'Department': _value(employee, ['department', 'departmentName']),
          'Designation': _value(employee, ['designation', 'jobTitle']),
          'Employment type':
              _value(employee, ['employmentType', 'employment_type']),
          'Work location': _value(employee, ['workLocation', 'work_location']),
          'Joining date': _value(employee, ['joiningDate', 'joining_date']),
          'Reporting manager':
              _value(employee, ['reportingManager', 'reporting_manager']),
        }),
        const SizedBox(height: 12),
        _ProfileSection(title: 'Contact', rows: {
          'Email': _value(employee, ['email']),
          'Phone': _value(employee, ['phone', 'phoneNumber', 'mobile']),
          'Emergency contact':
              _value(employee, ['emergencyContact', 'emergency_contact']),
        }),
      ],
    );
  }
}

class _ProfileSection extends StatelessWidget {
  const _ProfileSection({required this.title, required this.rows});
  final String title;
  final Map<String, String> rows;

  @override
  Widget build(BuildContext context) {
    final visible = rows.entries.where((row) => row.value.isNotEmpty).toList();
    if (visible.isEmpty) return const SizedBox.shrink();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 10),
            for (final row in visible)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: Text(row.key)),
                    const SizedBox(width: 16),
                    Flexible(
                      child: Text(row.value,
                          textAlign: TextAlign.end,
                          style: const TextStyle(fontWeight: FontWeight.w600)),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

String _fullName(Map<String, dynamic> item) {
  final direct = _value(item, ['name', 'fullName', 'full_name']);
  if (direct.isNotEmpty) return direct;
  return [
    _value(item, ['firstName', 'first_name']),
    _value(item, ['lastName', 'last_name']),
  ].where((value) => value.isNotEmpty).join(' ');
}

String _value(Map<String, dynamic> item, List<String> keys,
    [String fallback = '']) {
  for (final key in keys) {
    final value = item[key];
    if (value != null && value.toString().trim().isNotEmpty) {
      if (value is Map) {
        final nested = value['name'] ?? value['title'];
        if (nested != null) return nested.toString();
      }
      return value.toString();
    }
  }
  return fallback;
}

String _initials(String value) {
  final parts =
      value.trim().split(RegExp(r'\s+')).where((part) => part.isNotEmpty);
  return parts.take(2).map((part) => part.substring(0, 1).toUpperCase()).join();
}
