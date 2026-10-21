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
  User
} from 'lucide-react';
import { StandardFloatingActionBar } from '../common/StandardFloatingActionBar';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';

export const AssetManagement: React.FC = () => {
  const { assets, addAsset, assignAsset, deleteAsset, employees, currentUser, hasPermission } = useHRMS();

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

  // Strict User Scoping: In employee view, strictly match assigned assets
  const isAssetAssignedToUser = (asset: AssetItem): boolean => {
    const userEmpId = (currentUser.employeeId || currentUser.id || '').trim().toLowerCase();
    const userName = (currentUser.name || '').trim().toLowerCase();
    const assetEmpId = (asset.assignedEmployeeId || '').trim().toLowerCase();
    const assetEmpName = (asset.assignedEmployeeName || '').trim().toLowerCase();

    // Direct Employee ID match
    if (userEmpId && assetEmpId && userEmpId === assetEmpId) return true;
    
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

  // Add Asset Form
  const [addForm, setAddForm] = useState({
    assetTag: '',
    name: '',
    category: 'Laptops & Computers' as AssetItem['category'],
    serialNumber: '',
    purchaseDate: getTodayDateString(),
    purchaseCost: 1200,
    warrantyExpiry: getWarrantyDefaultDate(getTodayDateString()),
    condition: 'New' as AssetItem['condition'],
    notes: ''
  });
  const [addFormError, setAddFormError] = useState<string | null>(null);

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
    const matchesSearch = !searchQuery.trim() || 
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.assetTag.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.serialNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.assignedEmployeeName && a.assignedEmployeeName.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesCategory && matchesStatus && matchesSearch;
  });

  const totalCost = assets.reduce((sum, a) => sum + toNum(a.purchaseCost), 0);
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
      serialNumber: addForm.serialNumber || `SN-${Math.floor(Math.random() * 900000 + 100000)}`,
      purchaseDate: addForm.purchaseDate,
      purchaseCost: Number(addForm.purchaseCost),
      warrantyExpiry: addForm.warrantyExpiry,
      status: 'Available',
      condition: addForm.condition,
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
      purchaseCost: 1200,
      warrantyExpiry: getWarrantyDefaultDate(getTodayDateString()),
      condition: 'New',
      notes: ''
    });
  };

  const handleAssignSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!showAssignModal || !assignEmployeeId) return;

    const emp = employees.find(e => e.employeeId === assignEmployeeId);
    if (!emp) return;

    assignAsset(
      showAssignModal.id,
      emp.employeeId,
      `${emp.firstName} ${emp.lastName}`,
      emp.department
    );

    setShowAssignModal(null);
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

        {canManageAssets && (
          <div className="header-actions">
            <button 
              className="btn btn-primary btn-sm"
              onClick={() => {
                const randomTag = `AST-${Math.floor(Math.random() * 900 + 100)}`;
                const purchaseDate = getTodayDateString();
                setAddForm(prev => ({
                  ...prev,
                  assetTag: randomTag,
                  purchaseDate,
                  warrantyExpiry: getWarrantyDefaultDate(purchaseDate)
                }));
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
          </div>
        )}
      </div>

      {/* KPI Overview Grid */}
      <div className="kpi-grid" style={{ marginBottom: '24px' }}>
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

      {/* Filter Bar */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
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
          </div>


        </div>
      </div>      {/* Asset Table Container */}
      <div className="table-responsive" style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px', backgroundColor: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
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
                Asset Tag & Device Name
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
              {canManageAssets && (
                <th style={{ padding: '12px 10px', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {filteredAssets.length === 0 ? (
              <tr>
                <td colSpan={canManageAssets ? 8 : 6} style={{ textAlign: 'center', padding: '45px', color: 'var(--text-muted)' }}>
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
                        setAddForm(prev => ({ ...prev, assetTag: randomTag }));
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
                const assignedEmp = employees.find(e => e.employeeId === asset.assignedEmployeeId);
                const isSelected = selectedAssetIds.includes(asset.id);

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
                    {/* 1. Asset Tag & Device Name */}
                    <td style={{ padding: '10px 10px', verticalAlign: 'middle' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap', marginBottom: '2px' }}>
                          <span style={{
                            backgroundColor: '#ecfeff',
                            color: '#0891b2',
                            border: '1px solid #a5f3fc',
                            padding: '2px 6px',
                            borderRadius: '5px',
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                            letterSpacing: '0.02em'
                          }}>
                            {asset.assetTag}
                          </span>
                          <strong 
                            style={{ fontSize: '0.84rem', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '170px' }} 
                            title={asset.name}
                          >
                            {asset.name}
                          </strong>
                        </div>
                        <div 
                          style={{ fontSize: '0.7rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '210px' }} 
                          title={asset.notes || 'Hardware workstation'}
                        >
                          {asset.notes || 'Hardware workstation'}
                        </div>
                      </div>
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
                        {asset.serialNumber}
                      </code>
                      <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '2px' }}>
                        Verified S/N
                      </div>
                    </td>

                    {/* 4. Assigned Employee (for HR/CEO) or Allocation Date (for Employee) */}
                    {!isEmployeeRole ? (
                      <td style={{ padding: '10px 10px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        {asset.assignedEmployeeId ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {assignedEmp?.avatar ? (
                              <img
                                src={assignedEmp.avatar}
                                alt={asset.assignedEmployeeName}
                                style={{ width: '28px', height: '28px', borderRadius: '99px', objectFit: 'cover', flexShrink: 0, border: '1.5px solid #e2e8f0' }}
                              />
                            ) : (
                              <div style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '99px',
                                backgroundColor: '#eff6ff',
                                color: '#155DFC',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: '0.72rem',
                                flexShrink: 0,
                                border: '1.5px solid #dbeafe'
                              }}>
                                {asset.assignedEmployeeName ? asset.assignedEmployeeName.charAt(0) : 'U'}
                              </div>
                            )}
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0f172a', lineHeight: 1.2 }}>
                                {asset.assignedEmployeeName}
                              </div>
                              <div style={{ fontSize: '0.69rem', color: '#64748b', marginTop: '1px' }}>
                                {asset.assignedDepartment} ({asset.assignedEmployeeId})
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

                    {/* 9. Actions */}
                    {canManageAssets && (
                      <td style={{ padding: '10px 10px', verticalAlign: 'middle', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-sm"
                            style={{ 
                              padding: '4px 8px', 
                              fontSize: '0.72rem', 
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              borderRadius: '6px',
                              backgroundColor: '#ecfeff',
                              color: '#0891b2',
                              border: '1px solid #a5f3fc',
                              cursor: 'pointer'
                            }}
                            onClick={() => {
                              setShowAssignModal(asset);
                              setAssignEmployeeId(asset.assignedEmployeeId || employees[0]?.employeeId || '');
                            }}
                            title="Assign or reassign asset"
                          >
                            <UserCheck size={12} />
                            <span>{asset.assignedEmployeeId ? 'Reassign' : 'Assign'}</span>
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
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
              <button
                type="button"
                className="action-bar-btn"
                onClick={() => {
                  const target = filteredAssets.find(a => a.id === selectedAssetIds[0]);
                  if (target) {
                    setShowAssignModal(target);
                    setAssignEmployeeId(target.assignedEmployeeId || employees[0]?.employeeId || '');
                  }
                }}
              >
                <UserCheck size={14} />
                <span>Assign / Reassign</span>
              </button>
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
                      value={addForm.purchaseCost} 
                      onChange={e => setAddForm({ ...addForm, purchaseCost: Number(e.target.value) })} 
                      required 
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

                <div className="form-group" style={{ marginBottom: '14px' }}>
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
                    {employees.map(e => (
                      <option key={e.id} value={e.employeeId}>
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

    </div>
  );
};
