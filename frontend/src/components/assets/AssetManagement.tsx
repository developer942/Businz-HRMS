import React, { useState } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { AssetItem } from '../../types/hrms';
import { toNum, formatCurrency } from '../../utils/numbers';
import { DateInput } from '../common/DateInput';
import { 
  Laptop, 
  Plus, 
  Search, 
  Filter, 
  CheckCircle2, 
  Clock, 
  Wrench, 
  XCircle, 
  UserCheck, 
  ShieldCheck, 
  X, 
  Building2,
  Calendar,
  IndianRupee,
  Tag,
  PackageCheck,
  User,
  Eye,
  Edit2
} from 'lucide-react';
import { StandardFloatingActionBar } from '../common/StandardFloatingActionBar';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { ExportDropdown } from '../common/ExportDropdown';
import { downloadCSV, downloadExcel, downloadPDF, ExportColumn } from '../../utils/exportUtils';

export const AssetManagement: React.FC = () => {
  const { assets, addAsset, updateAsset, assignAsset, deleteAsset, employees, currentUser, hasPermission } = useHRMS();

  const getTodayDateString = () => new Date().toISOString().split('T')[0];

  const getWarrantyDefaultDate = (purchaseDate: string) => {
    const baseDate = purchaseDate ? new Date(purchaseDate) : new Date();
    baseDate.setFullYear(baseDate.getFullYear() + 1);
    return baseDate.toISOString().split('T')[0];
  };

  const isHRorAdmin = 
    currentUser.role === 'Super Admin' || 
    currentUser.role === 'Admin' || 
    currentUser.role === 'CEO' || 
    currentUser.role === 'HR Admin' || 
    currentUser.role === 'HR Manager' || 
    currentUser.role === 'HR' || 
    currentUser.role === 'Management' || 
    currentUser.role === 'ERP Administrator' ||
    (currentUser.department && (currentUser.department.toLowerCase() === 'hr' || currentUser.department.toLowerCase() === 'human resources')) || 
    (currentUser.designation && currentUser.designation.toLowerCase().includes('hr')) ||
    currentUser.designation === 'CEO' ||
    (currentUser.designation && currentUser.designation.toLowerCase().includes('ceo')) ||
    (typeof hasPermission === 'function' && (hasPermission('assets', 'create') || hasPermission('assets', 'edit')));

  const canManageAssets = isHRorAdmin;
  const isEmployeeRole = (currentUser.role === 'Employee' || currentUser.role === 'Assignee') && !isHRorAdmin;

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [ownershipFilter, setOwnershipFilter] = useState<string>('All');
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState<boolean>(false);

  const activeFilterCount = (categoryFilter !== 'All' ? 1 : 0) + (statusFilter !== 'All' ? 1 : 0) + (ownershipFilter !== 'All' ? 1 : 0);

  // Strict User Scoping: In employee view, strictly match assigned assets
  const isAssetAssignedToUser = (asset: AssetItem): boolean => {
    const currentIds = [
      (currentUser.employeeId || '').trim().toLowerCase(),
      (currentUser.id || '').trim().toLowerCase()
    ].filter(Boolean);
    const userName = (currentUser.name || '').trim().toLowerCase();

    const targetEmp = employees.find(e => 
      (e.id && (e.id === asset.assignedEmployeeId || e.id === asset.assignedEmployeeDbId)) ||
      (e.employeeId && (e.employeeId === asset.assignedEmployeeId || e.employeeId === asset.assignedEmployeeDbId))
    );

    const assetEmpIds = [
      (asset.assignedEmployeeId || '').trim().toLowerCase(),
      (asset.assignedEmployeeDbId || '').trim().toLowerCase(),
      (targetEmp?.employeeId || '').trim().toLowerCase(),
      (targetEmp?.id || '').trim().toLowerCase()
    ].filter(Boolean);

    const assetEmpName = (
      (targetEmp ? `${targetEmp.firstName} ${targetEmp.lastName}`.trim() : '') ||
      asset.assignedEmployeeName || ''
    ).trim().toLowerCase();

    // Check ID match
    if (currentIds.some(cId => assetEmpIds.includes(cId))) return true;

    // Direct Name match
    if (userName && assetEmpName) {
      if (assetEmpName === userName) return true;
      if (assetEmpName.includes(userName) || userName.includes(assetEmpName)) return true;
    }

    return false;
  };

  const scopedAssets = isEmployeeRole 
    ? assets.filter(isAssetAssignedToUser)
    : assets;

  // Multi-row selection state
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);

  const handleToggleAsset = (id: string) => {
    setSelectedAssetIds(prev => 
      prev.includes(id) ? prev.filter(aId => aId !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (filteredAssets.length > 0 && filteredAssets.every(a => selectedAssetIds.includes(a.id))) {
      setSelectedAssetIds(prev => prev.filter(id => !filteredAssets.some(a => a.id === id)));
    } else {
      const pageIds = filteredAssets.map(a => a.id);
      setSelectedAssetIds(prev => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState<AssetItem | null>(null);
  const [showViewModal, setShowViewModal] = useState<AssetItem | null>(null);
  const [showEditModal, setShowEditModal] = useState<AssetItem | null>(null);

  // Add Asset Form
  const [addForm, setAddForm] = useState<{
    assetTag: string;
    name: string;
    category: AssetItem['category'];
    serialNumber: string;
    purchaseDate: string;
    purchaseCost: number | string;
    warrantyExpiry: string;
    condition: AssetItem['condition'];
    ownership: 'Owned' | 'Rental';
    notes: string;
  }>({
    assetTag: '',
    name: '',
    category: 'Laptops & Computers',
    serialNumber: '',
    purchaseDate: getTodayDateString(),
    purchaseCost: '',
    warrantyExpiry: getWarrantyDefaultDate(getTodayDateString()),
    condition: 'New',
    ownership: 'Owned',
    notes: ''
  });
  const [addFormError, setAddFormError] = useState<string | null>(null);

  // Edit Asset Form
  const [editForm, setEditForm] = useState<{
    assetTag: string;
    name: string;
    category: AssetItem['category'];
    serialNumber: string;
    purchaseDate: string;
    purchaseCost: number | string;
    warrantyExpiry: string;
    condition: AssetItem['condition'];
    status: AssetItem['status'];
    ownership: 'Owned' | 'Rental';
    notes: string;
    assignedEmployeeId: string;
  }>({
    assetTag: '',
    name: '',
    category: 'Laptops & Computers',
    serialNumber: '',
    purchaseDate: getTodayDateString(),
    purchaseCost: '',
    warrantyExpiry: '',
    condition: 'Good',
    status: 'Available',
    ownership: 'Owned',
    notes: '',
    assignedEmployeeId: ''
  });
  const [editFormError, setEditFormError] = useState<string | null>(null);

  // Assign Asset Form
  const [assignEmployeeId, setAssignEmployeeId] = useState<string>(employees[0]?.employeeId || '');

  const categories = [
    'All',
    'Laptops & Computers',
    'Mobile Devices',
    'Monitors & Displays',
    'Office Furniture',
    'Peripherals & Accessories'
  ];

  const statuses = ['All', 'Assigned', 'Available', 'Under Maintenance'];

  const filteredAssets = scopedAssets.filter(a => {
    const matchesCategory = categoryFilter === 'All' || a.category === categoryFilter;
    const matchesStatus = statusFilter === 'All' || a.status === statusFilter;
    const resolvedOwnership = a.ownership || (String(a.notes || '').toLowerCase().includes('rent') ? 'Rental' : 'Owned');
    const matchesOwnership = ownershipFilter === 'All' || resolvedOwnership === ownershipFilter;

    const assignedEmp = employees.find(e => 
      (e.id && (e.id === a.assignedEmployeeId || e.id === a.assignedEmployeeDbId)) ||
      (e.employeeId && (e.employeeId === a.assignedEmployeeId || e.employeeId === a.assignedEmployeeDbId))
    );
    const empName = (assignedEmp ? `${assignedEmp.firstName} ${assignedEmp.lastName}`.trim() : '') || a.assignedEmployeeName || '';
    const empCode = assignedEmp?.employeeId || (a.assignedEmployeeId && a.assignedEmployeeId.length < 30 ? a.assignedEmployeeId : '');
    const empDept = assignedEmp?.department || a.assignedDepartment || '';

    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || 
      (a.name || '').toLowerCase().includes(q) ||
      (a.assetTag || '').toLowerCase().includes(q) ||
      (a.serialNumber || '').toLowerCase().includes(q) ||
      empName.toLowerCase().includes(q) ||
      empCode.toLowerCase().includes(q) ||
      empDept.toLowerCase().includes(q);

    return matchesCategory && matchesStatus && matchesOwnership && matchesSearch;
  });

  const totalCost = assets.reduce((sum, a) => sum + toNum(a.purchaseCost), 0);
  const ownedCount = assets.filter(a => (a.ownership || 'Owned') === 'Owned' && !String(a.notes || '').toLowerCase().includes('rent')).length;
  const rentalCount = assets.filter(a => a.ownership === 'Rental' || String(a.notes || '').toLowerCase().includes('rent')).length;
  const assignedCount = assets.filter(a => a.status === 'Assigned').length;
  const availableCount = assets.filter(a => a.status === 'Available').length;
  const maintenanceCount = assets.filter(a => a.status === 'Under Maintenance').length;

  const userTotalCost = scopedAssets.reduce((sum, a) => sum + toNum(a.purchaseCost), 0);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.name || !addForm.assetTag) return;
    if (addForm.purchaseDate && addForm.warrantyExpiry && addForm.warrantyExpiry < addForm.purchaseDate) {
      setAddFormError('Warranty expiry date must be after the purchase date.');
      return;
    }

    addAsset({
      assetTag: addForm.assetTag,
      name: addForm.name,
      category: addForm.category,
      // Store exactly what HR entered. Never invent a serial number (previously a random SN-###### was saved).
      serialNumber: addForm.serialNumber.trim(),
      purchaseDate: addForm.purchaseDate,
      purchaseCost: addForm.purchaseCost === '' ? 0 : Number(addForm.purchaseCost) || 0,
      warrantyExpiry: addForm.warrantyExpiry,
      status: 'Available',
      condition: addForm.condition,
      ownership: addForm.ownership || 'Owned',
      notes: addForm.notes
    });

    setShowAddModal(false);
    setAddFormError(null);
    setAddForm({
      assetTag: '',
      name: '',
      category: 'Laptops & Computers',
      serialNumber: '',
      purchaseDate: getTodayDateString(),
      purchaseCost: '',
      warrantyExpiry: getWarrantyDefaultDate(getTodayDateString()),
      condition: 'New',
      ownership: 'Owned',
      notes: ''
    });
  };

  const handleAssignSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!showAssignModal) return;

    if (!assignEmployeeId) {
      assignAsset(showAssignModal.id, '', '', '');
      setShowAssignModal(null);
      return;
    }

    const emp = employees.find(e => e.employeeId === assignEmployeeId || e.id === assignEmployeeId);
    if (!emp) return;

    assignAsset(
      showAssignModal.id,
      emp.employeeId || emp.id,
      `${emp.firstName} ${emp.lastName}`.trim(),
      emp.department
    );

    setShowAssignModal(null);
  };

  const handleOpenEdit = (target: AssetItem) => {
    const emp = employees.find(e => 
      (e.id && (e.id === target.assignedEmployeeId || e.id === target.assignedEmployeeDbId)) ||
      (e.employeeId && (e.employeeId === target.assignedEmployeeId || e.employeeId === target.assignedEmployeeDbId))
    );
    setEditForm({
      assetTag: target.assetTag,
      name: target.name,
      category: target.category,
      serialNumber: target.serialNumber || '',
      purchaseDate: target.purchaseDate || getTodayDateString(),
      purchaseCost: target.purchaseCost !== undefined && target.purchaseCost !== null ? target.purchaseCost : '',
      warrantyExpiry: target.warrantyExpiry || '',
      condition: target.condition || 'Good',
      status: target.status || 'Available',
      ownership: (target.ownership || (String(target.notes || '').toLowerCase().includes('rent') ? 'Rental' : 'Owned')) as 'Owned' | 'Rental',
      notes: target.notes || '',
      assignedEmployeeId: emp?.employeeId || (target.assignedEmployeeId && target.assignedEmployeeId.length < 30 ? target.assignedEmployeeId : '') || ''
    });
    setEditFormError(null);
    setShowEditModal(target);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditModal) return;
    if (!editForm.name || !editForm.assetTag) {
      setEditFormError('Asset tag and device name are required.');
      return;
    }
    if (editForm.purchaseDate && editForm.warrantyExpiry && editForm.warrantyExpiry < editForm.purchaseDate) {
      setEditFormError('Warranty expiry date must be after purchase date.');
      return;
    }

    let status = editForm.status;
    let assignedEmployeeId = '';
    let assignedEmployeeDbId = '';
    let assignedEmployeeName = '';
    let assignedDepartment = '';
    let assignedEmployeeAvatar: string | undefined = undefined;

    if (status === 'Available') {
      // User explicitly set status to Available -> clear employee assignment
      assignedEmployeeId = '';
      assignedEmployeeDbId = '';
      assignedEmployeeName = '';
      assignedDepartment = '';
      assignedEmployeeAvatar = undefined;
    } else if (editForm.assignedEmployeeId) {
      const emp = employees.find(e => e.employeeId === editForm.assignedEmployeeId || e.id === editForm.assignedEmployeeId);
      if (emp) {
        assignedEmployeeId = emp.employeeId || emp.id;
        assignedEmployeeDbId = emp.id;
        assignedEmployeeName = `${emp.firstName} ${emp.lastName}`.trim();
        assignedDepartment = emp.department || '';
        assignedEmployeeAvatar = emp.avatar;
      }
    } else {
      // No employee chosen
      if (status === 'Assigned') status = 'Available';
    }

    updateAsset(showEditModal.id, {
      assetTag: editForm.assetTag.trim(),
      name: editForm.name.trim(),
      category: editForm.category,
      serialNumber: editForm.serialNumber !== undefined ? editForm.serialNumber.trim() : (showEditModal.serialNumber || ''),
      purchaseDate: editForm.purchaseDate,
      purchaseCost: editForm.purchaseCost === '' ? 0 : Number(editForm.purchaseCost) || 0,
      warrantyExpiry: editForm.warrantyExpiry,
      condition: editForm.condition,
      status,
      ownership: editForm.ownership || 'Owned',
      notes: editForm.notes ? editForm.notes.trim() : '',
      assignedEmployeeId,
      assignedEmployeeDbId,
      assignedEmployeeName,
      assignedDepartment,
      assignedEmployeeAvatar,
      assignedDate: editForm.assignedEmployeeId ? (showEditModal.assignedDate || getTodayDateString()) : ''
    });

    setShowEditModal(null);
    setEditFormError(null);
  };

  // Download (Excel / PDF / CSV): exports exactly the rows currently shown (search + filters + role scope).
  // Values come straight from the stored asset records; empty fields are shown as-is, never invented.
  const getAssetExportData = () => {
    const columns: ExportColumn[] = [
      { key: 'assetTag', label: 'Asset Tag' },
      { key: 'name', label: 'Asset Name' },
      { key: 'ownership', label: 'Ownership' },
      { key: 'category', label: 'Category' },
      { key: 'serialNumber', label: 'Serial Number' },
      { key: 'status', label: 'Status' },
      { key: 'condition', label: 'Condition' },
      ...(!isEmployeeRole ? [
        { key: 'assignedEmployeeName', label: 'Assigned To' },
        { key: 'assignedEmployeeId', label: 'Employee ID' },
        { key: 'assignedDepartment', label: 'Department' },
      ] : []),
      { key: 'assignedDate', label: 'Assigned Date' },
      { key: 'purchaseDate', label: 'Purchase Date' },
      { key: 'purchaseCost', label: 'Purchase Cost (INR)' },
      { key: 'warrantyExpiry', label: 'Warranty Expiry' },
      { key: 'notes', label: 'Notes' },
    ];
    const fmtDate = (d?: string) => (d && d.trim() ? formatDateDDMMYYYY(d) : '');
    const data = filteredAssets.map(a => ({
      assetTag: a.assetTag || '',
      name: a.name || '',
      category: a.category || '',
      serialNumber: a.serialNumber?.trim() ? a.serialNumber : 'Not Provided',
      status: a.status || '',
      condition: a.condition || '',
      assignedEmployeeName: a.assignedEmployeeName || '',
      assignedEmployeeId: a.assignedEmployeeId && a.assignedEmployeeId.length < 30 ? a.assignedEmployeeId : '',
      assignedDepartment: a.assignedDepartment || '',
      assignedDate: fmtDate(a.assignedDate),
      purchaseDate: fmtDate(a.purchaseDate),
      purchaseCost: toNum(a.purchaseCost),
      warrantyExpiry: fmtDate(a.warrantyExpiry),
      notes: a.notes || '',
    }));
    return { columns, data };
  };
  const assetExportFileName = () => `${isEmployeeRole ? 'My_Assets' : 'Asset_Inventory'}_${getTodayDateString()}`;
  const handleExportAssetsExcel = () => {
    const { columns, data } = getAssetExportData();
    downloadExcel(data, assetExportFileName(), columns);
  };
  const handleExportAssetsPDF = () => {
    const { columns, data } = getAssetExportData();
    downloadPDF(data, isEmployeeRole ? 'My Assigned Assets' : 'Asset Management & Hardware Inventory', assetExportFileName(), columns);
  };
  const handleExportAssetsCSV = () => {
    const { columns, data } = getAssetExportData();
    downloadCSV(data, assetExportFileName(), columns);
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1>{isEmployeeRole ? 'My Assigned Assets & Hardware' : 'Asset Management & Hardware Inventory'}</h1>
          <p className="page-subtitle">
            {isEmployeeRole 
              ? 'View corporate devices, laptops, and field equipment currently assigned to you' 
              : 'Track company hardware allocations, laptop inventory, employee assignments, purchase costs, and warranty status'}
          </p>
        </div>

        <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <ExportDropdown
            onExportExcel={handleExportAssetsExcel}
            onExportPDF={handleExportAssetsPDF}
            onExportCSV={handleExportAssetsCSV}
            label="Download"
            disabled={filteredAssets.length === 0}
          />
          {canManageAssets && (
            <button 
              className="btn btn-primary btn-sm"
              onClick={() => {
                const randomTag = `AST-${Math.floor(Math.random() * 900 + 100)}`;
                const purchaseDate = getTodayDateString();
                setAddForm({
                  assetTag: randomTag,
                  name: '',
                  category: 'Laptops & Computers',
                  serialNumber: '',
                  purchaseDate,
                  purchaseCost: '',
                  warrantyExpiry: getWarrantyDefaultDate(purchaseDate),
                  condition: 'New',
                  ownership: 'Owned',
                  notes: ''
                });
                setShowAddModal(true);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                borderRadius: '12px',
                padding: '9px 18px',
                fontWeight: 700
              }}
            >
              <Plus size={16} /> Create Asset
            </button>
          )}
        </div>
      </div>

      {/* Mobile Asset Summary Bar & Compact Search + Filter Bar */}
      <div className="asset-mobile-summary-bar">
        <div>
          <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#0F172A' }}>
            {isEmployeeRole ? `${scopedAssets.length} Assigned Devices` : `${assets.length} Total Assets`}
          </span>
          <span style={{ fontSize: '0.72rem', color: '#64748B', marginLeft: '6px' }}>
            ({isEmployeeRole ? scopedAssets.filter(a => a.status === 'Assigned').length : assignedCount} in use)
          </span>
        </div>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0E7490' }}>
          {formatCurrency(isEmployeeRole ? userTotalCost : totalCost)}
        </div>
      </div>

      <div className="asset-mobile-search-row">
        <div className="asset-mobile-search-wrap">
          <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748B', pointerEvents: 'none' }} />
          <input 
            type="text" 
            placeholder="Search tag, device, serial #..." 
            value={searchQuery} 
            onChange={e => setSearchQuery(e.target.value)} 
          />
          {searchQuery && (
            <button 
              type="button" 
              onClick={() => setSearchQuery('')} 
              style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button 
          type="button" 
          className={`asset-mobile-filter-btn ${activeFilterCount > 0 ? 'active' : ''}`}
          onClick={() => setIsMobileFiltersOpen(prev => !prev)}
        >
          <Filter size={14} /> Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
        </button>
      </div>

      {/* Collapsible Mobile Filters Drawer */}
      {isMobileFiltersOpen && (
        <div className="asset-mobile-filters-drawer">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
            <span style={{ fontWeight: 800, fontSize: '0.84rem', color: '#0E7490' }}>Filter Assets</span>
            <button type="button" onClick={() => setIsMobileFiltersOpen(false)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: 0 }}>
              <X size={15} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '3px' }}>Category</label>
              <select 
                style={{ width: '100%', height: '34px', fontSize: '0.76rem', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 6px' }}
                value={categoryFilter} 
                onChange={e => setCategoryFilter(e.target.value)}
              >
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '3px' }}>Status</label>
              <select 
                style={{ width: '100%', height: '34px', fontSize: '0.76rem', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 6px' }}
                value={statusFilter} 
                onChange={e => setStatusFilter(e.target.value)}
              >
                {statuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '6px', borderTop: '1px solid #F1F5F9' }}>
            <button 
              type="button" 
              onClick={() => { setCategoryFilter('All'); setStatusFilter('All'); }} 
              style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
            >
              Reset Filters
            </button>
            <button 
              type="button" 
              onClick={() => setIsMobileFiltersOpen(false)} 
              style={{ backgroundColor: '#0E7490', color: '#FFFFFF', border: 'none', borderRadius: '6px', padding: '4px 12px', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* KPI Overview Grid (Desktop >= 768px) */}
      <div className="kpi-grid asset-desktop-kpi" style={{ marginBottom: '24px' }}>
        {isEmployeeRole ? (
          <>
            <div className="kpi-card">
              <div className="kpi-card-header">
                <span>My Assigned Devices</span>
                <div className="kpi-icon-wrapper blue">
                  <Laptop size={22} />
                </div>
              </div>
              <div className="kpi-card-body">
                <div className="kpi-value">{scopedAssets.length}</div>
              </div>
              <div className="kpi-footer">
                <span style={{ color: '#0891b2', fontWeight: 700 }}>
                  Total Value: {formatCurrency(userTotalCost)}
                </span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-card-header">
                <span>Allocation Status</span>
                <div className="kpi-icon-wrapper emerald">
                  <PackageCheck size={22} />
                </div>
              </div>
              <div className="kpi-card-body">
                <div className="kpi-value">{scopedAssets.filter(a => a.status === 'Assigned').length}</div>
              </div>
              <div className="kpi-footer">
                <span className="kpi-trend-up">In Active Use</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-card-header">
                <span>Hardware Condition</span>
                <div className="kpi-icon-wrapper purple">
                  <CheckCircle2 size={22} />
                </div>
              </div>
              <div className="kpi-card-body">
                <div className="kpi-value">
                  {scopedAssets.filter(a => a.condition === 'Good' || a.condition === 'New').length}
                </div>
              </div>
              <div className="kpi-footer">
                <span style={{ color: '#7c3aed', fontWeight: 600 }}>Good / Pristine Working Order</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-card-header">
                <span>Warranty Protected</span>
                <div className="kpi-icon-wrapper amber">
                  <ShieldCheck size={22} />
                </div>
              </div>
              <div className="kpi-card-body">
                <div className="kpi-value">
                  {scopedAssets.filter(a => a.warrantyExpiry && new Date(a.warrantyExpiry) >= new Date()).length}
                </div>
              </div>
              <div className="kpi-footer">
                <span style={{ color: '#d97706', fontWeight: 600 }}>Covered Under Corporate AMC</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="kpi-card">
              <div className="kpi-card-header">
                <span>Total Corporate Assets</span>
                <div className="kpi-icon-wrapper blue">
                  <Laptop size={22} />
                </div>
              </div>
              <div className="kpi-card-body">
                <div className="kpi-value">{assets.length}</div>
              </div>
              <div className="kpi-footer">
                <span style={{ color: '#0891b2', fontWeight: 700 }}>Total Value: {formatCurrency(totalCost)}</span>
                <span style={{ fontSize: '0.72rem', color: '#64748b', marginLeft: '8px', fontWeight: 600 }}>({ownedCount} Owned • {rentalCount} Rental)</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-card-header">
                <span>Assigned to Staff</span>
                <div className="kpi-icon-wrapper emerald">
                  <PackageCheck size={22} />
                </div>
              </div>
              <div className="kpi-card-body">
                <div className="kpi-value">{assignedCount}</div>
              </div>
              <div className="kpi-footer">
                <span className="kpi-trend-up">In Active Use</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-card-header">
                <span>Available In Stock</span>
                <div className="kpi-icon-wrapper purple">
                  <CheckCircle2 size={22} />
                </div>
              </div>
              <div className="kpi-card-body">
                <div className="kpi-value">{availableCount}</div>
              </div>
              <div className="kpi-footer">
                <span style={{ color: '#7c3aed', fontWeight: 600 }}>Ready for Allocation</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-card-header">
                <span>Under Maintenance</span>
                <div className="kpi-icon-wrapper amber">
                  <Wrench size={22} />
                </div>
              </div>
              <div className="kpi-card-body">
                <div className="kpi-value">{maintenanceCount}</div>
              </div>
              <div className="kpi-footer">
                <span style={{ color: '#d97706', fontWeight: 600 }}>Service / Repairs</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Filter Bar (Desktop >= 768px) */}
      <div className="card asset-desktop-filter-card" style={{ padding: '14px 18px', marginBottom: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Search Input Bar */}
            <div style={{ position: 'relative', width: '250px' }}>
              <input
                type="text"
                className="form-control"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tag, device, serial #..."
                style={{ paddingLeft: '34px', fontSize: '0.82rem', height: '38px', borderRadius: '8px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}
              />
              <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#155DFC' }} />
            </div>

            {/* Category Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>Category:</label>
              <select 
                className="form-control" 
                style={{ minWidth: '180px', padding: '6px 12px', fontSize: '0.82rem', height: '38px', borderRadius: '8px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}
                value={categoryFilter} 
                onChange={e => setCategoryFilter(e.target.value)}
              >
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>Status:</label>
              <select 
                className="form-control" 
                style={{ minWidth: '150px', padding: '6px 12px', fontSize: '0.82rem', height: '38px', borderRadius: '8px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}
                value={statusFilter} 
                onChange={e => setStatusFilter(e.target.value)}
              >
                {statuses.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Ownership Filter (Owned vs Rental) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>Ownership:</label>
              <select 
                className="form-control" 
                style={{ minWidth: '130px', padding: '6px 12px', fontSize: '0.82rem', height: '38px', borderRadius: '8px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', fontWeight: 600 }}
                value={ownershipFilter} 
                onChange={e => setOwnershipFilter(e.target.value)}
              >
                <option value="All">All Ownership</option>
                <option value="Owned">Owned</option>
                <option value="Rental">Rental</option>
              </select>
            </div>
          </div>


        </div>
      </div>

      {/* Asset Table Container (Desktop >= 768px) */}
      <div className="asset-desktop-table table-responsive" style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px', backgroundColor: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        <table className="hrms-table" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {canManageAssets && (
                <th style={{ width: '40px', minWidth: '40px', textAlign: 'center', padding: '12px 10px' }}>
                  <input
                    type="checkbox"
                    checked={filteredAssets.length > 0 && filteredAssets.every(a => selectedAssetIds.includes(a.id))}
                    onChange={handleToggleSelectAll}
                    style={{ accentColor: '#0E7490', cursor: 'pointer', width: '16px', height: '16px' }}
                    aria-label="Select all assets"
                  />
                </th>
              )}
              <th style={{ padding: '12px 10px', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                Asset Tag
              </th>
              <th style={{ padding: '12px 10px', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                Device Name
              </th>
              <th style={{ padding: '12px 10px', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                Ownership
              </th>
              <th style={{ padding: '12px 10px', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                Category
              </th>
              <th style={{ padding: '12px 10px', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                Serial Number
              </th>
              {!isEmployeeRole ? (
                <th style={{ padding: '12px 10px', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  Assigned Employee
                </th>
              ) : (
                <th style={{ padding: '12px 10px', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  Allocation Date
                </th>
              )}
              <th style={{ padding: '12px 10px', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase', textAlign: 'center', whiteSpace: 'nowrap' }}>
                Condition
              </th>
              <th style={{ padding: '12px 10px', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase', textAlign: 'center', whiteSpace: 'nowrap' }}>
                Status
              </th>
              <th style={{ padding: '12px 10px', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase', textAlign: 'left', whiteSpace: 'nowrap', width: '180px' }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredAssets.length === 0 ? (
              <tr>
                <td colSpan={canManageAssets ? 10 : 9} style={{ textAlign: 'center', padding: '45px', color: 'var(--text-muted)' }}>
                  <Laptop size={36} style={{ opacity: 0.3, margin: '0 auto 8px', display: 'block' }} />
                  <div>
                    {isEmployeeRole 
                      ? 'No corporate devices or hardware currently assigned to your profile.' 
                      : 'No corporate assets found matching current filters.'}
                  </div>
                  {isEmployeeRole ? (
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
                      Contact IT Administration or HR if you require an equipment allocation.
                    </div>
                  ) : canManageAssets && (
                    <button 
                      className="btn btn-primary btn-sm" 
                      style={{ marginTop: '14px', display: 'inline-flex', alignItems: 'center', gap: '6px', borderRadius: '10px', padding: '8px 18px', fontWeight: 700 }}
                      onClick={() => {
                        const randomTag = `AST-${Math.floor(Math.random() * 900 + 100)}`;
                        const purchaseDate = getTodayDateString();
                        setAddForm({
                          assetTag: randomTag,
                          name: '',
                          category: 'Laptops & Computers',
                          serialNumber: '',
                          purchaseDate,
                          purchaseCost: '',
                          warrantyExpiry: getWarrantyDefaultDate(purchaseDate),
                          condition: 'New',
                          ownership: 'Owned',
                          notes: ''
                        });
                        setShowAddModal(true);
                      }}
                    >
                      <Plus size={15} /> Create Asset
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              filteredAssets.map(asset => {
                const assignedEmp = employees.find(e => 
                  (e.id && (e.id === asset.assignedEmployeeId || e.id === asset.assignedEmployeeDbId)) ||
                  (e.employeeId && (e.employeeId === asset.assignedEmployeeId || e.employeeId === asset.assignedEmployeeDbId))
                );
                const resolvedName = (assignedEmp ? `${assignedEmp.firstName} ${assignedEmp.lastName}`.trim() : '') || asset.assignedEmployeeName || '';
                const resolvedDept = assignedEmp?.department || asset.assignedDepartment || '';
                const rawId = asset.assignedEmployeeId || asset.assignedEmployeeDbId || '';
                const resolvedDisplayId = assignedEmp?.employeeId || (rawId && rawId.length < 30 ? rawId : '');
                const avatarUrl = assignedEmp?.avatar || asset.assignedEmployeeAvatar;
                const initialLetter = (resolvedName ? resolvedName.charAt(0) : (assignedEmp?.firstName ? assignedEmp.firstName.charAt(0) : 'E')).toUpperCase();
                const isSelected = selectedAssetIds.includes(asset.id);
                const hasAssignee = Boolean(resolvedName || asset.assignedEmployeeId || asset.assignedEmployeeDbId);

                return (
                  <tr 
                    key={asset.id} 
                    style={{ 
                      borderBottom: '1px solid #f1f5f9',
                      backgroundColor: isSelected ? '#ECFEFF' : undefined,
                      borderLeft: isSelected ? '4px solid #0E7490' : undefined,
                      transition: 'background-color 0.15s ease'
                    }}
                  >
                    {canManageAssets && (
                      <td style={{ textAlign: 'center', verticalAlign: 'middle', padding: '10px 10px', width: '40px' }} onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleAsset(asset.id)}
                          style={{ accentColor: '#0E7490', cursor: 'pointer', width: '16px', height: '16px' }}
                          aria-label={`Select asset ${asset.assetTag}`}
                        />
                      </td>
                    )}
                    {/* 1. Asset Tag */}
                    <td style={{ padding: '10px 10px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                      <span style={{
                        backgroundColor: '#ecfeff',
                        color: '#0891b2',
                        border: '1px solid #a5f3fc',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                        letterSpacing: '0.02em',
                        display: 'inline-block'
                      }}>
                        {asset.assetTag}
                      </span>
                    </td>

                    {/* 2. Device Name */}
                    <td style={{ padding: '10px 10px', verticalAlign: 'middle' }}>
                      <div style={{ minWidth: 0 }}>
                        <strong 
                          style={{ 
                            fontSize: '0.84rem', 
                            color: '#0f172a', 
                            display: 'block',
                            whiteSpace: 'nowrap', 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis', 
                            maxWidth: '180px' 
                          }} 
                          title={asset.name}
                        >
                          {asset.name}
                        </strong>
                        <div 
                          style={{ 
                            fontSize: '0.7rem', 
                            color: '#64748b', 
                            whiteSpace: 'nowrap', 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis', 
                            maxWidth: '180px',
                            marginTop: '1px'
                          }} 
                          title={asset.notes || 'Hardware workstation'}
                        >
                          {asset.notes || 'Hardware workstation'}
                        </div>
                      </div>
                    </td>

                    {/* Ownership (Owned vs Rental) */}
                    <td style={{ padding: '10px 10px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                      {(() => {
                        const isRental = asset.ownership === 'Rental' || String(asset.notes || '').toLowerCase().includes('rent');
                        return (
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '3px 9px',
                            borderRadius: '99px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            backgroundColor: isRental ? '#fff7ed' : '#ecfeff',
                            color: isRental ? '#c2410c' : '#0891b2',
                            border: `1px solid ${isRental ? '#fed7aa' : '#a5f3fc'}`
                          }}>
                            {isRental ? 'Rental' : 'Owned'}
                          </span>
                        );
                      })()}
                    </td>

                    {/* 2. Category */}
                    <td style={{ padding: '10px 10px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: '0.8rem', color: '#1e293b', fontWeight: 600 }}>
                        {asset.category}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                        Corporate IT
                      </div>
                    </td>

                    {/* 3. Serial Number */}
                    <td style={{ padding: '10px 10px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                      <code style={{ 
                        fontSize: '0.72rem', 
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                        backgroundColor: '#f8fafc', 
                        border: '1px solid #e2e8f0',
                        padding: '2px 6px', 
                        borderRadius: '5px',
                        display: 'inline-block',
                        color: '#334155',
                        fontWeight: 600
                      }}>
                        {asset.serialNumber?.trim() ? asset.serialNumber : 'Not Provided'}
                      </code>
                    </td>

                    {/* 4. Assigned Employee (for HR/CEO) or Allocation Date (for Employee) */}
                    {!isEmployeeRole ? (
                      <td style={{ padding: '10px 10px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        {hasAssignee ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {avatarUrl ? (
                              <img
                                src={avatarUrl}
                                alt={resolvedName || 'Assigned Staff'}
                                style={{ width: '28px', height: '28px', borderRadius: '99px', objectFit: 'cover', flexShrink: 0, border: '1.5px solid #e2e8f0' }}
                              />
                            ) : (
                              <div style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '99px',
                                backgroundColor: '#eff6ff',
                                color: '#0E7490',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: '0.72rem',
                                flexShrink: 0,
                                border: '1.5px solid #cffafe'
                              }}>
                                {initialLetter}
                              </div>
                            )}
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0f172a', lineHeight: 1.2 }}>
                                {resolvedName || 'Assigned Staff'}
                              </div>
                              <div style={{ fontSize: '0.69rem', color: '#64748b', marginTop: '1px' }}>
                                {resolvedDept ? `${resolvedDept}${resolvedDisplayId ? ` • ${resolvedDisplayId}` : ''}` : (resolvedDisplayId || 'Active Allocation')}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '99px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#94a3b8' }}>
                              <User size={14} />
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '0.8rem', color: '#64748b', lineHeight: 1.2 }}>
                                Unassigned
                              </div>
                              <div style={{ fontSize: '0.69rem', color: '#94a3b8', marginTop: '1px' }}>
                                Available in Stock
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                    ) : (
                      <td style={{ padding: '10px 10px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>
                          {asset.assignedDate ? formatDateDDMMYYYY(asset.assignedDate) : 'Active Schedule'}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 600 }}>
                          Assigned to You
                        </div>
                      </td>
                    )}

                    {/* Condition */}

                    {/* 7. Condition */}
                    <td style={{ padding: '10px 10px', verticalAlign: 'middle', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '99px',
                        display: 'inline-block',
                        backgroundColor: asset.condition === 'New' ? '#ecfdf5' : asset.condition === 'Good' ? '#eff6ff' : '#fff1f2',
                        color: asset.condition === 'New' ? '#15803d' : asset.condition === 'Good' ? '#1d4ed8' : '#be123c',
                        border: `1px solid ${asset.condition === 'New' ? '#bbf7d0' : asset.condition === 'Good' ? '#bfdbfe' : '#fecaca'}`
                      }}>
                        {asset.condition}
                      </span>
                    </td>

                    {/* 8. Status */}
                    <td style={{ padding: '10px 10px', verticalAlign: 'middle', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <span 
                        className={`status-pill ${
                          asset.status === 'Assigned' ? 'present' : 
                          asset.status === 'Available' ? 'active' : 
                          asset.status === 'Under Maintenance' ? 'late' : 'rejected'
                        }`}
                        style={{ whiteSpace: 'nowrap', display: 'inline-flex' }}
                      >
                        {asset.status}
                      </span>
                    </td>

                    {/* 8. Actions */}
                    <td style={{ padding: '10px 10px', verticalAlign: 'middle', textAlign: 'left', whiteSpace: 'nowrap', width: '180px' }}>
                      <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                        {/* View Button - Symbol Only */}
                        <button
                          type="button"
                          style={{ 
                            width: '30px',
                            height: '30px',
                            padding: 0,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '7px',
                            backgroundColor: '#f1f5f9',
                            color: '#0E7490',
                            border: '1px solid #cbd5e1',
                            cursor: 'pointer',
                            flexShrink: 0,
                            transition: 'all 0.15s ease'
                          }}
                          onClick={() => setShowViewModal(asset)}
                          title="View complete asset specifications"
                          aria-label="View Asset"
                        >
                          <Eye size={15} />
                        </button>

                        {/* Edit Button - Symbol Only (Managers/Admin) */}
                        {canManageAssets && (
                          <button
                            type="button"
                            style={{ 
                              width: '30px',
                              height: '30px',
                              padding: 0,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '7px',
                              backgroundColor: '#fffbeb',
                              color: '#b45309',
                              border: '1px solid #fde68a',
                              cursor: 'pointer',
                              flexShrink: 0,
                              transition: 'all 0.15s ease'
                            }}
                            onClick={() => handleOpenEdit(asset)}
                            title="Edit asset details"
                            aria-label="Edit Asset"
                          >
                            <Edit2 size={14} />
                          </button>
                        )}

                        {/* Assign / Reassign Button (Managers/Admin) */}
                        {canManageAssets && (
                          <button
                            type="button"
                            className="btn btn-sm"
                            style={{ 
                              height: '30px',
                              width: '92px',
                              padding: '0 6px', 
                              fontSize: '0.72rem', 
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '5px',
                              borderRadius: '7px',
                              backgroundColor: '#ecfeff',
                              color: '#0891b2',
                              border: '1px solid #a5f3fc',
                              cursor: 'pointer',
                              flexShrink: 0
                            }}
                            onClick={() => {
                              setShowAssignModal(asset);
                              setAssignEmployeeId(assignedEmp?.employeeId || (asset.assignedEmployeeId && asset.assignedEmployeeId.length < 30 ? asset.assignedEmployeeId : '') || employees[0]?.employeeId || '');
                            }}
                            title="Assign or reassign asset"
                          >
                            <UserCheck size={13} />
                            <span>{hasAssignee ? 'Reassign' : 'Assign'}</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Asset Cards (Mobile < 768px) */}
      <div className="asset-mobile-cards">
        {filteredAssets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 16px', background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0' }}>
            <Laptop size={32} color="#94A3B8" style={{ margin: '0 auto 8px auto', display: 'block' }} />
            <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#475569' }}>No Assets Found</div>
            <div style={{ fontSize: '0.76rem', color: '#94A3B8', marginTop: '4px' }}>
              {isEmployeeRole ? 'You currently have no hardware devices assigned.' : 'No asset records match your criteria.'}
            </div>
          </div>
        ) : (
          filteredAssets.map(asset => {
            const isSelected = selectedAssetIds.includes(asset.id);
            const statusClass = asset.status === 'Assigned' ? 'present' : asset.status === 'Available' ? 'active' : asset.status === 'Under Maintenance' ? 'late' : 'rejected';
            const conditionBg = asset.condition === 'New' ? '#ecfdf5' : asset.condition === 'Good' ? '#eff6ff' : '#fff1f2';
            const conditionColor = asset.condition === 'New' ? '#15803d' : asset.condition === 'Good' ? '#1d4ed8' : '#be123c';
            const conditionBorder = asset.condition === 'New' ? '#bbf7d0' : asset.condition === 'Good' ? '#bfdbfe' : '#fecaca';

            return (
              <div 
                key={asset.id} 
                className={`mobile-asset-card ${isSelected ? 'selected' : ''}`}
                onClick={() => setShowViewModal(asset)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      fontFamily: 'monospace',
                      backgroundColor: '#ECFEFF',
                      color: '#0E7490',
                      border: '1px solid #CFFAFE',
                      padding: '2px 6px',
                      borderRadius: '6px'
                    }}>
                      {asset.assetTag}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                      {asset.category}
                    </span>
                  </div>
                  <span className={`status-pill ${statusClass}`} style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
                    {asset.status}
                  </span>
                </div>

                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A' }}>
                  {asset.name}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.74rem', backgroundColor: '#F8FAFC', padding: '8px 10px', borderRadius: '8px', border: '1px solid #F1F5F9' }}>
                  <div>
                    <div style={{ color: '#64748B', fontSize: '0.68rem', fontWeight: 500 }}>Serial Number</div>
                    <div style={{ fontWeight: 600, color: '#1E293B', fontFamily: 'monospace' }}>
                      {asset.serialNumber?.trim() ? asset.serialNumber : 'Not Provided'}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#64748B', fontSize: '0.68rem', fontWeight: 500 }}>Condition</div>
                    <span style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: '99px',
                      display: 'inline-block',
                      backgroundColor: conditionBg,
                      color: conditionColor,
                      border: `1px solid ${conditionBorder}`
                    }}>
                      {asset.condition}
                    </span>
                  </div>
                </div>

                {!isEmployeeRole && (
                  <div style={{ fontSize: '0.74rem', color: '#475569', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>
                      <strong style={{ color: '#64748B' }}>Assigned: </strong>
                      {asset.assignedEmployeeName || 'Unassigned / In Stock'}
                    </span>
                    {asset.purchaseCost ? (
                      <span style={{ fontWeight: 700, color: '#0E7490' }}>
                        {formatCurrency(asset.purchaseCost)}
                      </span>
                    ) : null}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '6px', borderTop: '1px solid #F1F5F9' }}>
                  <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>
                    Warranty: {asset.warrantyExpiry ? formatDateDDMMYYYY(asset.warrantyExpiry) : 'None'}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                    {canManageAssets && (
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(asset)}
                        style={{
                          padding: '3px 8px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          borderRadius: '6px',
                          backgroundColor: '#FFFFFF',
                          color: '#64748B',
                          border: '1px solid #E2E8F0',
                          cursor: 'pointer'
                        }}
                      >
                        Edit
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowViewModal(asset)}
                      style={{
                        padding: '3px 8px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        borderRadius: '6px',
                        backgroundColor: '#ECFEFF',
                        color: '#0E7490',
                        border: '1px solid #CFFAFE',
                        cursor: 'pointer'
                      }}
                    >
                      Details →
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Floating Action Bar per AGENTS.md */}
      {canManageAssets && (
        <StandardFloatingActionBar
          selectedCount={selectedAssetIds.length}
          onClearSelection={() => setSelectedAssetIds([])}
          onDelete={() => {
            if (confirm(`Delete ${selectedAssetIds.length} selected asset(s)?`)) {
              selectedAssetIds.forEach(id => deleteAsset(id));
              setSelectedAssetIds([]);
            }
          }}
          customActions={
            selectedAssetIds.length === 1 ? (
              <div style={{ display: 'inline-flex', gap: '8px' }}>
                <button
                  type="button"
                  className="action-bar-btn"
                  onClick={() => {
                    const target = filteredAssets.find(a => a.id === selectedAssetIds[0]);
                    if (target) setShowViewModal(target);
                  }}
                >
                  <Eye size={14} />
                  <span>View</span>
                </button>
                <button
                  type="button"
                  className="action-bar-btn"
                  onClick={() => {
                    const target = filteredAssets.find(a => a.id === selectedAssetIds[0]);
                    if (target) handleOpenEdit(target);
                  }}
                >
                  <Edit2 size={14} />
                  <span>Edit Info</span>
                </button>
                <button
                  type="button"
                  className="action-bar-btn"
                  onClick={() => {
                    const target = filteredAssets.find(a => a.id === selectedAssetIds[0]);
                    if (target) {
                      const emp = employees.find(e => 
                        (e.id && (e.id === target.assignedEmployeeId || e.id === target.assignedEmployeeDbId)) ||
                        (e.employeeId && (e.employeeId === target.assignedEmployeeId || e.employeeId === target.assignedEmployeeDbId))
                      );
                      setShowAssignModal(target);
                      setAssignEmployeeId(emp?.employeeId || (target.assignedEmployeeId && target.assignedEmployeeId.length < 30 ? target.assignedEmployeeId : '') || employees[0]?.employeeId || '');
                    }
                  }}
                >
                  <UserCheck size={14} />
                  <span>Assign</span>
                </button>
              </div>
            ) : undefined
          }
        />
      )}

      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '520px', width: '90%', borderRadius: '18px', padding: '24px' }}>
            <div className="modal-header" style={{ borderBottom: 'none', paddingBottom: '8px' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>Register New Corporate Asset</h2>
              <button onClick={() => {
                setAddFormError(null);
                setShowAddModal(false);
              }}><X size={18} /></button>
            </div>

            <form onSubmit={handleAddSubmit}>
              <div className="modal-body" style={{ padding: 0 }}>
                {addFormError && (
                  <div style={{
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FECACA',
                    color: '#B91C1C',
                    borderRadius: '10px',
                    padding: '9px 12px',
                    marginBottom: '12px',
                    fontSize: '0.78rem',
                    fontWeight: 600
                  }}>
                    {addFormError}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Asset Tag / ID <span style={{ color: '#EF4444' }}>*</span></label>
                    <input 
                      className="form-control" 
                      value={addForm.assetTag} 
                      onChange={e => setAddForm({ ...addForm, assetTag: e.target.value })} 
                      placeholder="e.g. AST-LAP-042" 
                      required 
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Category <span style={{ color: '#EF4444' }}>*</span></label>
                    <select 
                      className="form-control" 
                      value={addForm.category} 
                      onChange={e => setAddForm({ ...addForm, category: e.target.value as any })}
                    >
                      <option value="Laptops & Computers">Laptops & Computers</option>
                      <option value="Mobile Devices">Mobile Devices</option>
                      <option value="Monitors & Displays">Monitors & Displays</option>
                      <option value="Office Furniture">Office Furniture</option>
                      <option value="Peripherals & Accessories">Peripherals & Accessories</option>
                    </select>
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label className="form-label">Hardware Device Name <span style={{ color: '#EF4444' }}>*</span></label>
                  <input 
                    className="form-control" 
                    value={addForm.name} 
                    onChange={e => setAddForm({ ...addForm, name: e.target.value })} 
                    placeholder="e.g. MacBook Pro M3 Max 16-inch" 
                    required 
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Serial Number</label>
                    <input 
                      className="form-control" 
                      value={addForm.serialNumber} 
                      onChange={e => setAddForm({ ...addForm, serialNumber: e.target.value })} 
                      placeholder="e.g. C02G1829MD6R" 
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Purchase Cost (₹)</label>
                    <input 
                      className="form-control" 
                      type="number" 
                      min="0"
                      step="any"
                      placeholder="e.g. 45000"
                      value={addForm.purchaseCost} 
                      onChange={e => setAddForm({ ...addForm, purchaseCost: e.target.value })} 
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Purchase Date</label>
            <DateInput
                      className="form-control" 
                      value={addForm.purchaseDate} 
                      onChange={e => {
                        const purchaseDate = e.target.value;
                        setAddFormError(null);
                        setAddForm({
                          ...addForm,
                          purchaseDate,
                          warrantyExpiry: addForm.warrantyExpiry || getWarrantyDefaultDate(purchaseDate)
                        });
                      }}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Warranty Expiry</label>
                    <DateInput
                      className="form-control" 
                      value={addForm.warrantyExpiry} 
                      onChange={e => {
                        setAddFormError(null);
                        setAddForm({ ...addForm, warrantyExpiry: e.target.value });
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Ownership Type *</label>
                    <select 
                      className="form-control" 
                      value={addForm.ownership} 
                      onChange={e => setAddForm({ ...addForm, ownership: e.target.value as any })}
                      style={{ fontWeight: 600 }}
                    >
                      <option value="Owned">Owned (Company / VRM)</option>
                      <option value="Rental">Rental / Leased</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Hardware Condition</label>
                    <select 
                      className="form-control" 
                      value={addForm.condition} 
                      onChange={e => setAddForm({ ...addForm, condition: e.target.value as any })}
                    >
                      <option value="New">New</option>
                      <option value="Good">Good</option>
                      <option value="Fair">Fair</option>
                      <option value="Needs Repair">Needs Repair</option>
                    </select>
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: '10px' }}>
                  <label className="form-label">Notes & Specifications</label>
                  <textarea 
                    className="form-control" 
                    rows={2} 
                    value={addForm.notes} 
                    onChange={e => setAddForm({ ...addForm, notes: e.target.value })} 
                    placeholder="e.g. M3 Max 36GB RAM 1TB SSD" 
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ borderTop: 'none', padding: 0, marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
                  setAddFormError(null);
                  setShowAddModal(false);
                }}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm">Add Asset</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ASSIGN ASSET MODAL */}
      {showAssignModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '440px', width: '90%', borderRadius: '18px', padding: '24px' }}>
            <div className="modal-header" style={{ borderBottom: 'none', paddingBottom: '8px' }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>Assign Asset</h2>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {showAssignModal.assetTag} — {showAssignModal.name}
                </div>
              </div>
              <button onClick={() => setShowAssignModal(null)}><X size={18} /></button>
            </div>

            <form onSubmit={handleAssignSubmit}>
              <div className="modal-body" style={{ padding: '10px 0' }}>
                <div className="form-group">
                  <label className="form-label">Select Employee Assignee <span style={{ color: '#EF4444' }}>*</span></label>
                  <select 
                    className="form-control" 
                    value={assignEmployeeId}
                    onChange={e => setAssignEmployeeId(e.target.value)}
                    required
                  >
                    <option value="">-- Choose Employee Assignee --</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.employeeId || e.id}>
                        {e.firstName} {e.lastName} ({e.employeeId} - {e.department})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="modal-footer" style={{ borderTop: 'none', padding: 0, marginTop: '16px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAssignModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm">Assign Hardware Asset</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW ASSET DETAILS MODAL */}
      {showViewModal && (() => {
        const emp = employees.find(e => 
          (e.id && (e.id === showViewModal.assignedEmployeeId || e.id === showViewModal.assignedEmployeeDbId)) ||
          (e.employeeId && (e.employeeId === showViewModal.assignedEmployeeId || e.employeeId === showViewModal.assignedEmployeeDbId))
        );
        const resolvedName = (emp ? `${emp.firstName} ${emp.lastName}`.trim() : '') || showViewModal.assignedEmployeeName || '';
        const resolvedDept = emp?.department || showViewModal.assignedDepartment || '';
        const rawId = showViewModal.assignedEmployeeId || showViewModal.assignedEmployeeDbId || '';
        const resolvedDisplayId = emp?.employeeId || (rawId && rawId.length < 30 ? rawId : '');
        const avatarUrl = emp?.avatar || showViewModal.assignedEmployeeAvatar;
        const initialLetter = (resolvedName ? resolvedName.charAt(0) : (emp?.firstName ? emp.firstName.charAt(0) : 'E')).toUpperCase();
        const hasAssignee = Boolean(resolvedName || showViewModal.assignedEmployeeId || showViewModal.assignedEmployeeDbId);

        return (
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '580px', width: '90%', borderRadius: '20px', padding: '24px' }}>
              <div className="modal-header" style={{ borderBottom: 'none', paddingBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '12px',
                    backgroundColor: '#ecfeff',
                    color: '#0891b2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1.5px solid #a5f3fc'
                  }}>
                    <Laptop size={20} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        backgroundColor: '#ecfeff',
                        color: '#0891b2',
                        border: '1px solid #a5f3fc',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        fontFamily: 'monospace'
                      }}>
                        {showViewModal.assetTag}
                      </span>
                      <span className={`status-pill ${
                        showViewModal.status === 'Assigned' ? 'present' : 
                        showViewModal.status === 'Available' ? 'active' : 
                        showViewModal.status === 'Under Maintenance' ? 'late' : 'rejected'
                      }`}>
                        {showViewModal.status}
                      </span>
                    </div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '4px 0 0 0', color: '#0f172a' }}>
                      {showViewModal.name}
                    </h2>
                  </div>
                </div>
                <button onClick={() => setShowViewModal(null)} aria-label="Close view modal">
                  <X size={18} />
                </button>
              </div>

              <div className="modal-body" style={{ padding: '8px 0' }}>
                {/* Information Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      Category
                    </div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                      {showViewModal.category}
                    </div>
                  </div>

                  <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      Serial Number
                    </div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a', marginTop: '2px', fontFamily: 'monospace' }}>
                      {showViewModal.serialNumber?.trim() ? showViewModal.serialNumber : 'Not Provided'}
                    </div>
                  </div>

                  <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      Hardware Condition
                    </div>
                    <div style={{ marginTop: '4px' }}>
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '99px',
                        display: 'inline-block',
                        backgroundColor: showViewModal.condition === 'New' ? '#ecfdf5' : showViewModal.condition === 'Good' ? '#eff6ff' : '#fff1f2',
                        color: showViewModal.condition === 'New' ? '#15803d' : showViewModal.condition === 'Good' ? '#1d4ed8' : '#be123c',
                        border: `1px solid ${showViewModal.condition === 'New' ? '#bbf7d0' : showViewModal.condition === 'Good' ? '#bfdbfe' : '#fecaca'}`
                      }}>
                        {showViewModal.condition}
                      </span>
                    </div>
                  </div>

                  <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      Ownership Type
                    </div>
                    <div style={{ marginTop: '4px' }}>
                      {(() => {
                        const isRental = showViewModal.ownership === 'Rental' || String(showViewModal.notes || '').toLowerCase().includes('rent');
                        return (
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '99px',
                            display: 'inline-block',
                            backgroundColor: isRental ? '#fff7ed' : '#ecfeff',
                            color: isRental ? '#c2410c' : '#0891b2',
                            border: `1px solid ${isRental ? '#fed7aa' : '#a5f3fc'}`
                          }}>
                            {isRental ? 'Rental / Leased' : 'Owned (Company / VRM)'}
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      Purchase Cost
                    </div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0E7490', marginTop: '2px' }}>
                      {formatCurrency(showViewModal.purchaseCost)}
                    </div>
                  </div>
                </div>

                {/* Assigned Employee Card */}
                <div style={{ padding: '14px', backgroundColor: '#ffffff', borderRadius: '14px', border: '1.5px solid #e2e8f0', marginBottom: '14px' }}>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>
                    Assigned Staff Member
                  </div>
                  {hasAssignee ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={resolvedName}
                          style={{ width: '40px', height: '40px', borderRadius: '99px', objectFit: 'cover', border: '2px solid #e2e8f0' }}
                        />
                      ) : (
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '99px',
                          backgroundColor: '#ecfeff',
                          color: '#0891b2',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '0.95rem',
                          border: '2px solid #a5f3fc'
                        }}>
                          {initialLetter}
                        </div>
                      )}
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a' }}>
                          {resolvedName}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                          {resolvedDept} {resolvedDisplayId ? `• ID: ${resolvedDisplayId}` : ''}
                        </div>
                        {showViewModal.assignedDate && (
                          <div style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 600, marginTop: '3px' }}>
                            Assigned on: {formatDateDDMMYYYY(showViewModal.assignedDate)}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#64748b', fontSize: '0.85rem' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '99px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                        <User size={18} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: '#334155' }}>Unassigned / In Stock</div>
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Ready for staff allocation</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Dates & Warranty */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '14px' }}>
                  <div style={{ padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>Purchase Date</div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', marginTop: '2px' }}>
                      {showViewModal.purchaseDate ? formatDateDDMMYYYY(showViewModal.purchaseDate) : '—'}
                    </div>
                  </div>
                  <div style={{ padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>Warranty Expiry</div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', marginTop: '2px' }}>
                      {showViewModal.warrantyExpiry ? formatDateDDMMYYYY(showViewModal.warrantyExpiry) : '—'}
                    </div>
                  </div>
                </div>

                {/* Notes */}
                {showViewModal.notes && (
                  <div style={{ padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                      Technical Notes / Specifications
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#334155', marginTop: '4px', whiteSpace: 'pre-wrap' }}>
                      {showViewModal.notes}
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-footer" style={{ borderTop: 'none', padding: 0, marginTop: '16px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                {canManageAssets && (
                  <>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        const target = showViewModal;
                        setShowViewModal(null);
                        handleOpenEdit(target);
                      }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Edit2 size={13} />
                      <span>Edit Asset</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        const target = showViewModal;
                        setShowViewModal(null);
                        setShowAssignModal(target);
                        setAssignEmployeeId(emp?.employeeId || (target.assignedEmployeeId && target.assignedEmployeeId.length < 30 ? target.assignedEmployeeId : '') || employees[0]?.employeeId || '');
                      }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <UserCheck size={13} />
                      <span>{hasAssignee ? 'Reassign' : 'Assign'}</span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowViewModal(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* EDIT ASSET MODAL */}
      {showEditModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '520px', width: '90%', borderRadius: '18px', padding: '24px' }}>
            <div className="modal-header" style={{ borderBottom: 'none', paddingBottom: '8px' }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>Edit Corporate Asset</h2>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Updating details for {showEditModal.assetTag}
                </div>
              </div>
              <button onClick={() => {
                setEditFormError(null);
                setShowEditModal(null);
              }} aria-label="Close edit modal"><X size={18} /></button>
            </div>

            <form onSubmit={handleEditSubmit}>
              <div className="modal-body" style={{ padding: 0 }}>
                {editFormError && (
                  <div style={{
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FECACA',
                    color: '#B91C1C',
                    borderRadius: '10px',
                    padding: '9px 12px',
                    marginBottom: '12px',
                    fontSize: '0.78rem',
                    fontWeight: 600
                  }}>
                    {editFormError}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Asset Tag / ID <span style={{ color: '#EF4444' }}>*</span></label>
                    <input 
                      className="form-control" 
                      value={editForm.assetTag} 
                      onChange={e => setEditForm({ ...editForm, assetTag: e.target.value })} 
                      placeholder="e.g. AST-LAP-042" 
                      required 
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Category <span style={{ color: '#EF4444' }}>*</span></label>
                    <select 
                      className="form-control" 
                      value={editForm.category} 
                      onChange={e => setEditForm({ ...editForm, category: e.target.value as any })}
                    >
                      <option value="Laptops & Computers">Laptops & Computers</option>
                      <option value="Mobile Devices">Mobile Devices</option>
                      <option value="Monitors & Displays">Monitors & Displays</option>
                      <option value="Office Furniture">Office Furniture</option>
                      <option value="Peripherals & Accessories">Peripherals & Accessories</option>
                    </select>
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label className="form-label">Hardware Device Name <span style={{ color: '#EF4444' }}>*</span></label>
                  <input 
                    className="form-control" 
                    value={editForm.name} 
                    onChange={e => setEditForm({ ...editForm, name: e.target.value })} 
                    placeholder="e.g. MacBook Pro M3 Max 16-inch" 
                    required 
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Serial Number</label>
                    <input 
                      className="form-control" 
                      value={editForm.serialNumber} 
                      onChange={e => setEditForm({ ...editForm, serialNumber: e.target.value })} 
                      placeholder="e.g. C02G1829MD6R" 
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Purchase Cost (₹)</label>
                    <input 
                      className="form-control" 
                      type="number" 
                      min="0"
                      step="any"
                      placeholder="e.g. 45000"
                      value={editForm.purchaseCost} 
                      onChange={e => setEditForm({ ...editForm, purchaseCost: e.target.value })} 
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Purchase Date</label>
                    <DateInput 
                      className="form-control" 
                      value={editForm.purchaseDate} 
                      onChange={e => setEditForm({ ...editForm, purchaseDate: e.target.value })} 
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Warranty Expiry</label>
                    <DateInput 
                      className="form-control" 
                      value={editForm.warrantyExpiry} 
                      onChange={e => setEditForm({ ...editForm, warrantyExpiry: e.target.value })} 
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Ownership Type</label>
                    <select 
                      className="form-control" 
                      value={editForm.ownership} 
                      onChange={e => setEditForm({ ...editForm, ownership: e.target.value as any })}
                      style={{ fontWeight: 600 }}
                    >
                      <option value="Owned">Owned (VRM)</option>
                      <option value="Rental">Rental</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Hardware Condition</label>
                    <select 
                      className="form-control" 
                      value={editForm.condition} 
                      onChange={e => setEditForm({ ...editForm, condition: e.target.value as any })}
                    >
                      <option value="New">New</option>
                      <option value="Good">Good</option>
                      <option value="Fair">Fair</option>
                      <option value="Needs Repair">Needs Repair</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Allocation Status</label>
                    <select 
                      className="form-control" 
                      value={editForm.status} 
                      onChange={e => {
                        const newStatus = e.target.value as AssetItem['status'];
                        setEditForm({
                          ...editForm,
                          status: newStatus,
                          assignedEmployeeId: newStatus === 'Available' ? '' : editForm.assignedEmployeeId
                        });
                      }}
                    >
                      <option value="Available">Available</option>
                      <option value="Assigned">Assigned</option>
                      <option value="Under Maintenance">Under Maintenance</option>
                    </select>
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label className="form-label">Assigned Employee</label>
                  <select 
                    className="form-control" 
                    value={editForm.assignedEmployeeId} 
                    onChange={e => {
                      const val = e.target.value;
                      setEditForm({ 
                        ...editForm, 
                        assignedEmployeeId: val,
                        status: val ? (editForm.status === 'Under Maintenance' ? 'Under Maintenance' : 'Assigned') : (editForm.status === 'Assigned' ? 'Available' : editForm.status)
                      });
                    }}
                  >
                    <option value="">-- Unassigned (Available in Stock) --</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.employeeId || e.id}>
                        {e.firstName} {e.lastName} ({e.employeeId} - {e.department})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '10px' }}>
                  <label className="form-label">Notes & Specifications</label>
                  <textarea 
                    className="form-control" 
                    rows={2} 
                    value={editForm.notes} 
                    onChange={e => setEditForm({ ...editForm, notes: e.target.value })} 
                    placeholder="e.g. M3 Max 36GB RAM 1TB SSD" 
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ borderTop: 'none', padding: 0, marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
                  setEditFormError(null);
                  setShowEditModal(null);
                }}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
