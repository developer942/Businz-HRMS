import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../app/providers.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/employee_filters.dart';
import '../../../core/widgets/adaptive_components.dart';
import '../../auth/application/auth_controller.dart';
import '../../shared/presentation/async_content.dart';

class AssetsScreen extends ConsumerStatefulWidget {
  const AssetsScreen({super.key});

  @override
  ConsumerState<AssetsScreen> createState() => _AssetsScreenState();
}

class _AssetsScreenState extends ConsumerState<AssetsScreen> {
  late Future<_AssetsBundle> _future;
  final _search = TextEditingController();
  String _status = 'All';

  @override
  void initState() {
    super.initState();
    _future = _load();
    _search.addListener(_refreshView);
  }

  Future<_AssetsBundle> _load() async {
    final user = ref.read(authControllerProvider).value;
    if (user == null) {
      return const _AssetsBundle(
        assets: [],
        employeeNames: {},
        codesById: {},
      );
    }
    final repo = ref.read(hrmsRepositoryProvider);
    final results = await Future.wait<dynamic>([
      repo.assets(),
      repo.employees().catchError((_) => <Map<String, dynamic>>[]),
    ]);
    final names = <String, String>{};
    final codesById = <String, String>{};
    for (final emp in results[1] as List<Map<String, dynamic>>) {
      final name = (emp['name'] ?? '').toString().trim();
      final id = (emp['id'] ?? '').toString().trim();
      final code =
          (emp['employeeId'] ?? emp['employee_id'] ?? '').toString().trim();
      if (id.isNotEmpty && code.isNotEmpty) {
        codesById[id.toLowerCase()] = code;
      }
      if (name.isEmpty) continue;
      if (id.isNotEmpty) names[id.toLowerCase()] = name;
      if (code.isNotEmpty) names[code.toLowerCase()] = name;
    }

    final rawAssets = results[0] as List<Map<String, dynamic>>;
    final canViewAll = user.canManageAssets || user.isManagement;
    final visibleAssets = canViewAll
        ? rawAssets
        : rawAssets.where((asset) {
            final assignedId =
                _text(asset, ['assigned_employee_id', 'assignedEmployeeId']);
            final embedded = asset['assigned_employee'] is Map
                ? Map<String, dynamic>.from(asset['assigned_employee'] as Map)
                : const <String, dynamic>{};
            final embeddedCode = _text(embedded, ['employee_id', 'employeeId']);
            final embeddedId = _text(embedded, ['id']);
            final mappedCode = codesById[assignedId.toLowerCase()] ?? '';
            final embeddedName = [
              _text(embedded, ['first_name', 'firstName']),
              _text(embedded, ['last_name', 'lastName']),
            ].where((p) => p.isNotEmpty).join(' ');
            return user.matchesIdentity(assignedId) ||
                user.matchesIdentity(embeddedCode) ||
                user.matchesIdentity(embeddedId) ||
                user.matchesIdentity(mappedCode) ||
                (embeddedName.isNotEmpty &&
                    embeddedName.toLowerCase() ==
                        user.name.trim().toLowerCase());
          }).toList(growable: false);

    return _AssetsBundle(
      assets: visibleAssets,
      employeeNames: names,
      codesById: codesById,
    );
  }

  void _refreshView() => setState(() {});

  void _reload() => setState(() => _future = _load());

  @override
  void dispose() {
    _search
      ..removeListener(_refreshView)
      ..dispose();
    super.dispose();
  }

  Future<void> _create() async {
    final payload = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => const _AssetForm(),
    );
    if (payload == null) return;
    await _perform(
      () => ref.read(hrmsRepositoryProvider).createAsset(payload),
      'Asset created',
    );
  }

  Future<void> _edit(Map<String, dynamic> asset) async {
    final payload = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => _AssetForm(asset: asset),
    );
    final id = _text(asset, ['id']);
    if (payload == null || id.isEmpty) return;
    await _perform(
      () => ref.read(hrmsRepositoryProvider).updateAsset(id, payload),
      'Asset updated',
    );
  }

  Future<void> _assign(Map<String, dynamic> asset) async {
    final id = _text(asset, ['id']);
    if (id.isEmpty) return;
    try {
      final employees = excludeCeoEmployees(
        await ref.read(hrmsRepositoryProvider).employees(),
      );
      if (!mounted) return;
      final employee = await showModalBottomSheet<Map<String, dynamic>>(
        context: context,
        useSafeArea: true,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (_) => _EmployeePicker(employees: employees),
      );
      if (employee == null) return;
      final employeeUuid = _text(employee, ['id']);
      if (employeeUuid.isEmpty) {
        throw StateError('This employee has no database identifier.');
      }
      await _perform(
        () => ref.read(hrmsRepositoryProvider).updateAsset(id, {
          'assigned_employee_id': employeeUuid,
          'status': 'Assigned',
          'assigned_date': DateFormat('yyyy-MM-dd').format(DateTime.now()),
        }),
        'Asset assigned',
      );
    } catch (error) {
      if (mounted) _showError(error);
    }
  }

  Future<void> _return(Map<String, dynamic> asset) async {
    final id = _text(asset, ['id']);
    if (id.isEmpty) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Confirm asset return'),
        content: const Text(
          'This removes the employee assignment and marks the asset as available.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Confirm return'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await _perform(
      () => ref.read(hrmsRepositoryProvider).updateAsset(id, {
        'assigned_employee_id': null,
        'assigned_date': null,
        'status': 'Available',
      }),
      'Asset returned',
    );
  }

  Future<void> _delete(Map<String, dynamic> asset) async {
    final id = _text(asset, ['id']);
    if (id.isEmpty) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete asset?'),
        content: Text(
          'Delete ${_text(asset, [
                'name'
              ], 'this asset')} from the inventory? This cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
            ),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await _perform(
      () => ref.read(hrmsRepositoryProvider).deleteAsset(id),
      'Asset deleted',
    );
  }

  Future<void> _perform(
    Future<Object> Function() action,
    String success,
  ) async {
    try {
      await action();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$success.')),
      );
      _reload();
    } catch (error) {
      if (mounted) _showError(error);
    }
  }

  void _showError(Object error) => ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(error.toString()),
          backgroundColor: Theme.of(context).colorScheme.error,
        ),
      );

  static String _resolveAssignee(
    Map<String, dynamic> asset,
    _AssetsBundle bundle,
  ) {
    final embedded = asset['assigned_employee'] is Map
        ? Map<String, dynamic>.from(asset['assigned_employee'] as Map)
        : const <String, dynamic>{};
    if (embedded.isNotEmpty) {
      final fullName = [
        _text(embedded, ['first_name', 'firstName']),
        _text(embedded, ['last_name', 'lastName']),
      ].where((p) => p.isNotEmpty).join(' ');
      final code = _text(embedded, ['employee_id', 'employeeId']);
      if (fullName.isNotEmpty && code.isNotEmpty) return '$fullName ($code)';
      if (fullName.isNotEmpty) return fullName;
      if (code.isNotEmpty) return code;
    }
    final assignedId = _text(
      asset,
      ['assigned_employee_id', 'assignedEmployeeId'],
    ).toLowerCase();
    if (assignedId.isEmpty) return '';
    final name = bundle.employeeNames[assignedId] ?? '';
    final code = bundle.codesById[assignedId] ?? '';
    if (name.isNotEmpty && code.isNotEmpty) return '$name ($code)';
    if (name.isNotEmpty) return name;
    return code;
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authControllerProvider).value;
    if (user == null) {
      return const Center(child: CircularProgressIndicator());
    }
    final permissions = ref.watch(permissionProvider).value;
    final canManageAll = user.canManageAssets || user.isManagement;
    final canCreate =
        user.canManageAssets || permissions?.can('assets', 'create') == true;
    final canEdit =
        user.canManageAssets || permissions?.can('assets', 'edit') == true;
    final canDelete =
        user.canManageAssets || permissions?.can('assets', 'delete') == true;

    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: canCreate
          ? FloatingActionButton.extended(
              onPressed: _create,
              icon: const Icon(Icons.add_rounded),
              label: const Text('Add Asset'),
            )
          : null,
      body: FutureBuilder<_AssetsBundle>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const AppSkeletonList(itemCount: 5, height: 96);
          }
          if (snapshot.hasError) {
            return AppErrorView(error: snapshot.error!, onRetry: _reload);
          }
          final bundle = snapshot.data!;
          final all = bundle.assets;
          final query = _search.text.trim().toLowerCase();
          final items = all.where((asset) {
            final status = _text(asset, ['status'], 'Available');
            if (_status != 'All' &&
                status.toLowerCase() != _status.toLowerCase()) {
              return false;
            }
            if (query.isEmpty) return true;
            final assignedName = _resolveAssignee(asset, bundle);
            return [
              _text(asset, ['name']),
              _text(asset, ['asset_tag', 'assetTag']),
              _text(asset, ['serial_number', 'serialNumber']),
              _text(asset, ['category']),
              assignedName,
            ].any((value) => value.toLowerCase().contains(query));
          }).toList(growable: false);

          return RefreshIndicator(
            onRefresh: () async {
              _reload();
              await _future;
            },
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
                    child: Column(
                      children: [
                        _AssetSummary(
                          items: all,
                          isCompanyWide: canManageAll,
                        ),
                        const SizedBox(height: 14),
                        SearchBar(
                          controller: _search,
                          hintText: canManageAll
                              ? 'Search asset, tag, serial, category, or assignee'
                              : 'Search my assigned assets…',
                          leading: const Icon(Icons.search_rounded),
                          trailing: _search.text.isEmpty
                              ? null
                              : [
                                  IconButton(
                                    onPressed: _search.clear,
                                    icon: const Icon(Icons.close_rounded),
                                  ),
                                ],
                        ),
                        if (canManageAll) ...[
                          const SizedBox(height: 10),
                          SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            child: Row(
                              children: [
                                'All',
                                'Assigned',
                                'Available',
                                'Under Maintenance',
                                'Retired',
                              ]
                                  .map(
                                    (value) => Padding(
                                      padding: const EdgeInsets.only(right: 8),
                                      child: FilterChip(
                                        selected: _status == value,
                                        label: Text(value),
                                        onSelected: (_) =>
                                            setState(() => _status = value),
                                      ),
                                    ),
                                  )
                                  .toList(),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
                if (items.isEmpty)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: EmptyState(
                      icon: Icons.devices_other_outlined,
                      title: canManageAll
                          ? 'No assets found'
                          : 'No assets assigned to you',
                      message: canManageAll
                          ? 'Company inventory assets matching this filter will appear here.'
                          : 'Assets assigned to ${user.name} (${user.employeeId}) by HR will appear here.',
                    ),
                  )
                else
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 104),
                    sliver: SliverList.separated(
                      itemCount: items.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (context, index) {
                        final asset = items[index];
                        final assigneeName = _resolveAssignee(asset, bundle);
                        return _AssetCard(
                          asset: asset,
                          assigneeName: assigneeName,
                          onTap: () => showModalBottomSheet<void>(
                            context: context,
                            isScrollControlled: true,
                            useSafeArea: true,
                            showDragHandle: true,
                            builder: (_) => _AssetDetails(
                              asset: asset,
                              assigneeName: assigneeName,
                              canEdit: canEdit,
                              canDelete: canDelete,
                              onEdit: () => _edit(asset),
                              onAssign: () => _assign(asset),
                              onReturn: () => _return(asset),
                              onDelete: () => _delete(asset),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _AssetsBundle {
  const _AssetsBundle({
    required this.assets,
    required this.employeeNames,
    required this.codesById,
  });
  final List<Map<String, dynamic>> assets;
  final Map<String, String> employeeNames;
  final Map<String, String> codesById;
}

class _AssetSummary extends StatelessWidget {
  const _AssetSummary({
    required this.items,
    required this.isCompanyWide,
  });
  final List<Map<String, dynamic>> items;
  final bool isCompanyWide;

  @override
  Widget build(BuildContext context) {
    final assigned = items
        .where((a) => _text(a, ['status']).toLowerCase() == 'assigned')
        .length;
    final available = items
        .where((a) => _text(a, ['status']).toLowerCase() == 'available')
        .length;
    final totalValue = items.fold<double>(
      0,
      (sum, a) => sum + (double.tryParse('${a['purchase_cost'] ?? 0}') ?? 0),
    );

    if (!isCompanyWide) {
      return Row(
        children: [
          _SummaryValue(
            label: 'Assigned to Me',
            value: '${items.length}',
            accent: AppTokens.brand,
          ),
          const SizedBox(width: 8),
          _SummaryValue(
            label: 'Total Value',
            value: formatInr(totalValue),
            accent: AppTokens.success,
          ),
        ],
      );
    }

    return Column(
      children: [
        Row(
          children: [
            _SummaryValue(
              label: 'Total Assets',
              value: '${items.length}',
              accent: AppTokens.brand,
            ),
            const SizedBox(width: 8),
            _SummaryValue(
              label: 'Assigned',
              value: '$assigned',
              accent: AppTokens.info,
            ),
            const SizedBox(width: 8),
            _SummaryValue(
              label: 'Available',
              value: '$available',
              accent: AppTokens.success,
            ),
          ],
        ),
        if (totalValue > 0) ...[
          const SizedBox(height: 8),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface,
              border: Border.all(
                  color: Theme.of(context).colorScheme.outlineVariant),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Total Inventory Value',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                Text(
                  formatInr(totalValue),
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _SummaryValue extends StatelessWidget {
  const _SummaryValue({
    required this.label,
    required this.value,
    this.accent,
  });
  final String label;
  final String value;
  final Color? accent;

  @override
  Widget build(BuildContext context) => Expanded(
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            border:
                Border.all(color: Theme.of(context).colorScheme.outlineVariant),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              children: [
                Text(
                  value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: accent,
                      ),
                ),
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
        ),
      );
}

class _AssetCard extends StatelessWidget {
  const _AssetCard({
    required this.asset,
    required this.onTap,
    this.assigneeName = '',
  });
  final Map<String, dynamic> asset;
  final String assigneeName;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final name = _text(asset, ['name'], 'Asset');
    final tag = _text(asset, ['asset_tag', 'assetTag'], 'No asset tag');
    final category = _text(asset, ['category'], 'Uncategorized');
    final status = _text(asset, ['status'], 'Available');
    final serial = _text(asset, ['serial_number', 'serialNumber']);
    final condition = _text(asset, ['condition']);
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                backgroundColor: Theme.of(context).colorScheme.primaryContainer,
                child: Icon(
                  _assetIcon(category),
                  size: 20,
                  color: Theme.of(context).colorScheme.onPrimaryContainer,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(name,
                              style: const TextStyle(
                                  fontSize: 15.5, fontWeight: FontWeight.w800)),
                        ),
                        const SizedBox(width: 8),
                        StatusPill(status),
                      ],
                    ),
                    const SizedBox(height: 5),
                    Text('$tag · $category',
                        style: Theme.of(context).textTheme.bodySmall),
                    if (assigneeName.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(
                        'Assigned to $assigneeName',
                        style: TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                          color: Theme.of(context).colorScheme.primary,
                        ),
                      ),
                    ],
                    if (serial.isNotEmpty || condition.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(
                        [
                          if (serial.isNotEmpty) 'S/N: $serial',
                          if (condition.isNotEmpty) condition,
                        ].join(' · '),
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AssetDetails extends StatelessWidget {
  const _AssetDetails({
    required this.asset,
    required this.canEdit,
    required this.canDelete,
    required this.onEdit,
    required this.onAssign,
    required this.onReturn,
    required this.onDelete,
    this.assigneeName = '',
  });

  final Map<String, dynamic> asset;
  final String assigneeName;
  final bool canEdit;
  final bool canDelete;
  final VoidCallback onEdit;
  final VoidCallback onAssign;
  final VoidCallback onReturn;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final assigned = _text(asset, ['status']).toLowerCase() == 'assigned';
    final cost = double.tryParse('${asset['purchase_cost'] ?? 0}') ?? 0;
    return FractionallySizedBox(
      heightFactor: .86,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
        children: [
          Text(_text(asset, ['name'], 'Asset'),
              style: Theme.of(context)
                  .textTheme
                  .headlineSmall
                  ?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          Row(children: [
            Text(_text(asset, ['asset_tag', 'assetTag'], 'No tag')),
            const Spacer(),
            StatusPill(_text(asset, ['status'], 'Available')),
          ]),
          const SizedBox(height: 20),
          if (assigneeName.isNotEmpty) _DetailRow('Assigned to', assigneeName),
          _DetailRow('Category', _text(asset, ['category'], 'Not available')),
          _DetailRow('Serial number',
              _text(asset, ['serial_number', 'serialNumber'], 'Not available')),
          _DetailRow('Condition', _text(asset, ['condition'], 'Not available')),
          _DetailRow('Ownership', _text(asset, ['ownership'], 'Owned')),
          _DetailRow('Purchase date',
              _text(asset, ['purchase_date', 'purchaseDate'], 'Not available')),
          _DetailRow(
            'Purchase cost',
            NumberFormat.currency(locale: 'en_IN', symbol: '₹').format(cost),
          ),
          _DetailRow(
              'Warranty expiry',
              _text(asset, ['warranty_expiry', 'warrantyExpiry'],
                  'Not available')),
          _DetailRow('Assigned date',
              _text(asset, ['assigned_date', 'assignedDate'], 'Not assigned')),
          _DetailRow('Notes', _text(asset, ['notes'], 'No notes')),
          if (canEdit) ...[
            const SizedBox(height: 18),
            FilledButton.icon(
              onPressed: () {
                Navigator.pop(context);
                assigned ? onReturn() : onAssign();
              },
              icon: Icon(assigned
                  ? Icons.assignment_return_outlined
                  : Icons.person_add_alt_1_outlined),
              label: Text(assigned ? 'Record return' : 'Assign employee'),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () {
                Navigator.pop(context);
                onEdit();
              },
              icon: const Icon(Icons.edit_outlined),
              label: const Text('Edit asset details'),
            ),
          ],
          if (canDelete) ...[
            const SizedBox(height: 8),
            TextButton.icon(
              onPressed: () {
                Navigator.pop(context);
                onDelete();
              },
              icon: const Icon(Icons.delete_outline_rounded),
              label: const Text('Delete asset'),
            ),
          ],
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 120,
              child: Text(label,
                  style: TextStyle(
                      color: Theme.of(context).colorScheme.onSurfaceVariant)),
            ),
            Expanded(
              child: Text(value,
                  style: const TextStyle(fontWeight: FontWeight.w600)),
            ),
          ],
        ),
      );
}

class _AssetForm extends StatefulWidget {
  const _AssetForm({this.asset});
  final Map<String, dynamic>? asset;

  @override
  State<_AssetForm> createState() => _AssetFormState();
}

class _AssetFormState extends State<_AssetForm> {
  final _key = GlobalKey<FormState>();
  late final TextEditingController _tag;
  late final TextEditingController _name;
  late final TextEditingController _serial;
  late final TextEditingController _cost;
  late final TextEditingController _purchaseDate;
  late final TextEditingController _warranty;
  late final TextEditingController _notes;
  late String _category;
  late String _condition;
  late String _ownership;
  late String _status;

  static const _defaultCategories = [
    'Laptops & Computers',
    'Mobile Devices',
    'Monitors & Displays',
    'Peripherals & Accessories',
    'Office Furniture',
    'IT Equipment',
    'Networking',
    'Vehicle',
    'Tools',
    'Other',
  ];

  static const _defaultConditions = [
    'New',
    'Good',
    'Fair',
    'Needs Repair',
  ];

  static const _defaultOwnerships = ['Owned', 'Rental', 'Leased'];

  static const _defaultStatuses = [
    'Available',
    'Assigned',
    'Under Maintenance',
    'Retired',
  ];

  @override
  void initState() {
    super.initState();
    final asset = widget.asset ?? const <String, dynamic>{};
    _tag = TextEditingController(text: _text(asset, ['asset_tag', 'assetTag']));
    _name = TextEditingController(text: _text(asset, ['name']));
    _serial = TextEditingController(
        text: _text(asset, ['serial_number', 'serialNumber']));
    _cost = TextEditingController(text: '${asset['purchase_cost'] ?? ''}');
    _purchaseDate = TextEditingController(
        text: _text(asset, ['purchase_date', 'purchaseDate']));
    _warranty = TextEditingController(
        text: _text(asset, ['warranty_expiry', 'warrantyExpiry']));
    _notes = TextEditingController(text: _text(asset, ['notes']));
    _category = _text(asset, ['category'], 'Laptops & Computers');
    _condition = _text(asset, ['condition'], 'Good');
    _ownership = _text(asset, ['ownership'], 'Owned');
    _status = _text(asset, ['status'], 'Available');
  }

  List<String> _optionsWith(List<String> base, String current) =>
      base.contains(current) ? base : [current, ...base];

  @override
  void dispose() {
    for (final controller in [
      _tag,
      _name,
      _serial,
      _cost,
      _purchaseDate,
      _warranty,
      _notes,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _pickDate(TextEditingController controller) async {
    final selected = await showDatePicker(
      context: context,
      firstDate: DateTime(1990),
      lastDate: DateTime(2100),
      initialDate: DateTime.tryParse(controller.text) ?? DateTime.now(),
    );
    if (selected != null) {
      controller.text = DateFormat('yyyy-MM-dd').format(selected);
    }
  }

  void _submit() {
    if (!(_key.currentState?.validate() ?? false)) return;
    Navigator.pop(context, <String, dynamic>{
      'asset_tag': _tag.text.trim(),
      'name': _name.text.trim(),
      'category': _category,
      'serial_number': _serial.text.trim().isEmpty ? null : _serial.text.trim(),
      'purchase_date':
          _purchaseDate.text.trim().isEmpty ? null : _purchaseDate.text.trim(),
      'purchase_cost': double.tryParse(_cost.text) ?? 0,
      'warranty_expiry':
          _warranty.text.trim().isEmpty ? null : _warranty.text.trim(),
      'status': _status,
      'condition': _condition,
      'ownership': _ownership,
      'notes': _notes.text.trim().isEmpty ? null : _notes.text.trim(),
    });
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          4,
          20,
          MediaQuery.viewInsetsOf(context).bottom + 24,
        ),
        child: SingleChildScrollView(
          child: Form(
            key: _key,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(widget.asset == null ? 'Add asset' : 'Edit asset',
                    style: Theme.of(context)
                        .textTheme
                        .headlineSmall
                        ?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 18),
                TextFormField(
                  controller: _tag,
                  decoration: const InputDecoration(labelText: 'Asset tag'),
                  validator: _required,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _name,
                  decoration: const InputDecoration(labelText: 'Asset name'),
                  validator: _required,
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: _category,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Category'),
                  items: _optionsWith(_defaultCategories, _category)
                      .map((v) => DropdownMenuItem(value: v, child: Text(v)))
                      .toList(),
                  onChanged: (value) => setState(() => _category = value!),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _serial,
                  decoration: const InputDecoration(labelText: 'Serial number'),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _cost,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(
                    labelText: 'Purchase cost',
                    prefixText: '₹ ',
                  ),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _purchaseDate,
                  readOnly: true,
                  onTap: () => _pickDate(_purchaseDate),
                  decoration: const InputDecoration(
                    labelText: 'Purchase date',
                    suffixIcon: Icon(Icons.calendar_today_outlined),
                  ),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _warranty,
                  readOnly: true,
                  onTap: () => _pickDate(_warranty),
                  decoration: const InputDecoration(
                    labelText: 'Warranty expiry',
                    suffixIcon: Icon(Icons.calendar_today_outlined),
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        initialValue: _condition,
                        isExpanded: true,
                        decoration:
                            const InputDecoration(labelText: 'Condition'),
                        items: _optionsWith(_defaultConditions, _condition)
                            .map((v) =>
                                DropdownMenuItem(value: v, child: Text(v)))
                            .toList(),
                        onChanged: (value) =>
                            setState(() => _condition = value!),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        initialValue: _ownership,
                        isExpanded: true,
                        decoration:
                            const InputDecoration(labelText: 'Ownership'),
                        items: _optionsWith(_defaultOwnerships, _ownership)
                            .map((v) =>
                                DropdownMenuItem(value: v, child: Text(v)))
                            .toList(),
                        onChanged: (value) =>
                            setState(() => _ownership = value!),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: _status,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Status'),
                  items: _optionsWith(_defaultStatuses, _status)
                      .map((v) => DropdownMenuItem(value: v, child: Text(v)))
                      .toList(),
                  onChanged: (value) => setState(() => _status = value!),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _notes,
                  minLines: 2,
                  maxLines: 4,
                  decoration: const InputDecoration(labelText: 'Notes'),
                ),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: _submit,
                  child: Text(
                      widget.asset == null ? 'Create asset' : 'Save changes'),
                ),
              ],
            ),
          ),
        ),
      );

  static String? _required(String? value) =>
      value == null || value.trim().isEmpty ? 'Required' : null;
}

class _EmployeePicker extends StatefulWidget {
  const _EmployeePicker({required this.employees});
  final List<Map<String, dynamic>> employees;

  @override
  State<_EmployeePicker> createState() => _EmployeePickerState();
}

class _EmployeePickerState extends State<_EmployeePicker> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final employees = widget.employees.where((employee) {
      final haystack = [
        _employeeName(employee),
        _text(employee, ['employee_id', 'employeeId']),
        _text(employee, ['department']),
      ].join(' ').toLowerCase();
      return haystack.contains(_query.toLowerCase());
    }).toList(growable: false);
    return FractionallySizedBox(
      heightFactor: .82,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Assign employee',
                    style: Theme.of(context)
                        .textTheme
                        .headlineSmall
                        ?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 14),
                SearchBar(
                  hintText: 'Search name, ID or department',
                  leading: const Icon(Icons.search_rounded),
                  onChanged: (value) => setState(() => _query = value),
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 24),
              itemCount: employees.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (context, index) {
                final employee = employees[index];
                return ListTile(
                  leading:
                      const CircleAvatar(child: Icon(Icons.person_outline)),
                  title: Text(_employeeName(employee)),
                  subtitle: Text([
                    _text(employee, ['employee_id', 'employeeId']),
                    _text(employee, ['department']),
                  ].where((value) => value.isNotEmpty).join(' • ')),
                  onTap: () => Navigator.pop(context, employee),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

String _employeeName(Map<String, dynamic> employee) {
  final direct = _text(employee, ['name', 'full_name', 'fullName']);
  if (direct.isNotEmpty) return direct;
  final name = [
    _text(employee, ['first_name', 'firstName']),
    _text(employee, ['last_name', 'lastName']),
  ].where((value) => value.isNotEmpty).join(' ');
  return name.isEmpty ? 'Employee' : name;
}

String _text(
  Map<String, dynamic> data,
  List<String> keys, [
  String fallback = '',
]) {
  for (final key in keys) {
    final value = data[key];
    if (value != null && value.toString().trim().isNotEmpty) {
      return value.toString().trim();
    }
  }
  return fallback;
}

IconData _assetIcon(String category) {
  final value = category.toLowerCase();
  if (value.contains('laptop') ||
      value.contains('desktop') ||
      value.contains('computer')) {
    return Icons.computer_rounded;
  }
  if (value.contains('monitor') || value.contains('display')) {
    return Icons.desktop_windows_rounded;
  }
  if (value.contains('mobile') || value.contains('phone')) {
    return Icons.smartphone_rounded;
  }
  if (value.contains('furniture')) return Icons.chair_outlined;
  if (value.contains('peripheral') || value.contains('accessor')) {
    return Icons.keyboard_outlined;
  }
  if (value.contains('vehicle')) return Icons.directions_car_outlined;
  if (value.contains('tool')) return Icons.handyman_outlined;
  return Icons.devices_other_outlined;
}
