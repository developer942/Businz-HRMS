import React, { useState, useEffect, useMemo } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import {
  ShieldCheck,
  Plus,
  Edit2,
  Copy,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Save,
  RotateCcw,
  X,
  History,
  Lock,
  Layers,
  ChevronRight,
  Search,
  CheckSquare,
  Square,
  Users,
  Eye,
  Sliders,
  FileText
} from 'lucide-react';
import {
  RoleDefinition,
  ModuleDefinition,
  PermissionAction,
  DataAccessLevel,
  RolePermissionConfig,
  PermissionAuditLog,
} from '../../types/rbac';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import {
  rbacService,
  ALL_PERMISSION_ACTIONS,
  SPECIAL_PERMISSIONS_LIST,
} from '../../services/rbacService';

export const RolesPermissionsSettings: React.FC = () => {
  const { currentUser } = useHRMS();

  // Primary Data State
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [modules, setModules] = useState<ModuleDefinition[]>([]);
  const [permissionsByRole, setPermissionsByRole] = useState<Record<string, RolePermissionConfig>>({});
  const [auditLogs, setAuditLogs] = useState<PermissionAuditLog[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>('role-ceo');
  const [activeTab, setActiveTab] = useState<'matrix' | 'special' | 'audit'>('matrix');

  // UI / Filter States
  const [searchModule, setSearchModule] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<{ title: string; subtitle?: string; type: 'success' | 'warning' } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Modals
  const [showRoleModal, setShowRoleModal] = useState<boolean>(false);
  const [roleModalMode, setRoleModalMode] = useState<'create' | 'edit'>('create');
  const [roleFormData, setRoleFormData] = useState({
    name: '',
    description: '',
    department: 'Operations',
    status: 'Active' as 'Active' | 'Inactive',
    cloneFromRoleId: '',
  });

  const [showDuplicateModal, setShowDuplicateModal] = useState<boolean>(false);
  const [duplicateRoleName, setDuplicateRoleName] = useState<string>('');

  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);

  const [showAddModuleModal, setShowAddModuleModal] = useState<boolean>(false);
  const [moduleFormData, setModuleFormData] = useState({
    name: '',
    key: '',
    category: 'Custom Modules',
    description: '',
  });

  // Local unsaved modifications tracker for current role
  const [draftConfig, setDraftConfig] = useState<RolePermissionConfig | null>(null);
  const [hasChanges, setHasChanges] = useState<boolean>(false);

  // Load RBAC Data
  const loadData = async () => {
    try {
      const data = await rbacService.fetchRBACData();
      setRoles(data.roles);
      setModules(data.modules);
      setPermissionsByRole(data.permissionsByRole);
      setAuditLogs(data.auditLogs);

      const activeRoleExists = data.roles.some(r => r.id === selectedRoleId);
      const effectiveId = activeRoleExists ? selectedRoleId : (data.roles[0]?.id || 'role-ceo');
      setSelectedRoleId(effectiveId);

      if (data.permissionsByRole[effectiveId]) {
        setDraftConfig(JSON.parse(JSON.stringify(data.permissionsByRole[effectiveId])));
      }
      setHasChanges(false);
    } catch (err) {
      console.error('Failed to load RBAC data', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // When selected role changes, update draftConfig
  useEffect(() => {
    if (permissionsByRole[selectedRoleId]) {
      setDraftConfig(JSON.parse(JSON.stringify(permissionsByRole[selectedRoleId])));
      setHasChanges(false);
    }
  }, [selectedRoleId, permissionsByRole]);

  const showToast = (title: string, subtitle?: string, type: 'success' | 'warning' = 'success') => {
    setToastMessage({ title, subtitle, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const currentRole = useMemo(() => {
    return roles.find(r => r.id === selectedRoleId) || roles[0];
  }, [roles, selectedRoleId]);

  const filteredModules = useMemo(() => {
    if (!searchModule.trim()) return modules;
    const q = searchModule.toLowerCase();
    return modules.filter(m => m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q) || m.key.toLowerCase().includes(q));
  }, [modules, searchModule]);

  // Permission Action Handlers
  const handleToggleAction = (moduleKey: string, action: PermissionAction) => {
    if (!draftConfig) return;

    const currentActions = draftConfig.modulePermissions[moduleKey] || [];
    const isGranted = currentActions.includes(action);
    const updatedActions = isGranted
      ? currentActions.filter(a => a !== action)
      : [...currentActions, action];

    const updatedModulePerms = {
      ...draftConfig.modulePermissions,
      [moduleKey]: updatedActions,
    };

    setDraftConfig({
      ...draftConfig,
      modulePermissions: updatedModulePerms,
    });
    setHasChanges(true);
  };

  const handleToggleRowSelectAll = (moduleKey: string) => {
    if (!draftConfig) return;

    const currentActions = draftConfig.modulePermissions[moduleKey] || [];
    const allActions = ALL_PERMISSION_ACTIONS.map(a => a.id);
    const isAllSelected = currentActions.length === allActions.length;

    const updatedModulePerms = {
      ...draftConfig.modulePermissions,
      [moduleKey]: isAllSelected ? [] : [...allActions],
    };

    setDraftConfig({
      ...draftConfig,
      modulePermissions: updatedModulePerms,
    });
    setHasChanges(true);
  };

  const handleSelectAllPermissions = () => {
    if (!draftConfig) return;

    const allActions = ALL_PERMISSION_ACTIONS.map(a => a.id);
    const updatedModulePerms: Record<string, PermissionAction[]> = {};
    modules.forEach(m => {
      updatedModulePerms[m.key] = [...allActions];
    });

    const allSpecial = SPECIAL_PERMISSIONS_LIST.map(s => s.key);

    setDraftConfig({
      ...draftConfig,
      dataAccess: 'all',
      modulePermissions: updatedModulePerms,
      specialPermissions: allSpecial,
    });
    setHasChanges(true);
    showToast('Granted All Permissions', 'All modules, actions, and special privileges unlocked for this role.');
  };

  const handleClearAllPermissions = () => {
    if (!draftConfig) return;

    const updatedModulePerms: Record<string, PermissionAction[]> = {};
    modules.forEach(m => {
      updatedModulePerms[m.key] = [];
    });

    setDraftConfig({
      ...draftConfig,
      dataAccess: 'own',
      modulePermissions: updatedModulePerms,
      specialPermissions: [],
    });
    setHasChanges(true);
    showToast('Permissions Cleared', 'Revoked all action privileges for this role.', 'warning');
  };

  const handleSetDataAccess = (level: DataAccessLevel) => {
    if (!draftConfig) return;
    setDraftConfig({
      ...draftConfig,
      dataAccess: level,
    });
    setHasChanges(true);
  };

  const handleToggleSpecialPermission = (key: string) => {
    if (!draftConfig) return;
    const currentSpecial = draftConfig.specialPermissions || [];
    const isEnabled = currentSpecial.includes(key);
    const updatedSpecial = isEnabled
      ? currentSpecial.filter(k => k !== key)
      : [...currentSpecial, key];

    setDraftConfig({
      ...draftConfig,
      specialPermissions: updatedSpecial,
    });
    setHasChanges(true);
  };

  // Save Permissions
  const handleSavePermissions = async () => {
    if (!draftConfig || !currentRole) return;
    setIsSubmitting(true);
    try {
      const saved = await rbacService.saveRolePermissions(currentRole.id, {
        dataAccess: draftConfig.dataAccess,
        modulePermissions: draftConfig.modulePermissions,
        specialPermissions: draftConfig.specialPermissions,
        changedBy: currentUser?.name || 'Administrator',
      });

      setPermissionsByRole(prev => ({
        ...prev,
        [currentRole.id]: saved,
      }));
      setHasChanges(false);
      showToast(
        `Permissions Saved for "${currentRole.name}"`,
        `Configuration synchronized and logged in security audit log.`
      );
      loadData();
    } catch (err: any) {
      showToast('Save Failed', err.message || 'Error updating role permissions', 'warning');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset to last saved
  const handleReset = () => {
    if (permissionsByRole[selectedRoleId]) {
      setDraftConfig(JSON.parse(JSON.stringify(permissionsByRole[selectedRoleId])));
      setHasChanges(false);
      showToast('Reset Complete', 'Reverted unsaved matrix changes back to last saved state.');
    }
  };

  // Role CRUD Modals
  const openCreateRoleModal = () => {
    setRoleModalMode('create');
    setRoleFormData({
      name: '',
      description: '',
      department: 'Operations',
      status: 'Active',
      cloneFromRoleId: '',
    });
    setShowRoleModal(true);
  };

  const openEditRoleModal = () => {
    if (!currentRole) return;
    setRoleModalMode('edit');
    setRoleFormData({
      name: currentRole.name,
      description: currentRole.description,
      department: currentRole.department,
      status: currentRole.status,
      cloneFromRoleId: '',
    });
    setShowRoleModal(true);
  };

  const handleRoleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleFormData.name.trim()) {
      showToast('Validation Error', 'Role Name is mandatory.', 'warning');
      return;
    }

    try {
      if (roleModalMode === 'create') {
        const created = await rbacService.createRole({
          name: roleFormData.name,
          description: roleFormData.description,
          department: roleFormData.department,
          status: roleFormData.status,
          cloneFromRoleId: roleFormData.cloneFromRoleId || undefined,
          changedBy: currentUser?.name || 'Administrator',
        });
        showToast('Role Created', `New role "${created.name}" created successfully.`);
        await loadData();
        setSelectedRoleId(created.id);
      } else {
        const updated = await rbacService.updateRole(currentRole.id, {
          name: roleFormData.name,
          description: roleFormData.description,
          department: roleFormData.department,
          status: roleFormData.status,
          changedBy: currentUser?.name || 'Administrator',
        });
        showToast('Role Updated', `Role "${updated.name}" details updated.`);
        await loadData();
      }
      setShowRoleModal(false);
    } catch (err: any) {
      showToast('Operation Failed', err.message || 'Failed to save role', 'warning');
    }
  };

  const handleDuplicateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!duplicateRoleName.trim()) {
      showToast('Validation Error', 'New Role Name is required.', 'warning');
      return;
    }

    try {
      const dup = await rbacService.duplicateRole(
        currentRole.id,
        duplicateRoleName.trim(),
        currentUser?.name || 'Administrator'
      );
      showToast('Role Duplicated', `Created "${dup.name}" with matching permissions.`);
      setShowDuplicateModal(false);
      setDuplicateRoleName('');
      await loadData();
      setSelectedRoleId(dup.id);
    } catch (err: any) {
      showToast('Duplicate Failed', err.message || 'Error duplicating role', 'warning');
    }
  };

  const handleDeleteRole = async () => {
    if (!currentRole) return;
    if (currentRole.isDefault) {
      showToast('Restricted', `Core system role "${currentRole.name}" cannot be deleted.`, 'warning');
      setShowDeleteModal(false);
      return;
    }

    try {
      await rbacService.deleteRole(currentRole.id, currentUser?.name || 'Administrator');
      showToast('Role Deleted', `Role "${currentRole.name}" removed from system.`);
      setShowDeleteModal(false);
      await loadData();
      setSelectedRoleId('role-ceo');
    } catch (err: any) {
      showToast('Delete Failed', err.message || 'Error deleting role', 'warning');
    }
  };

  const handleAddModuleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moduleFormData.name.trim()) {
      showToast('Validation Error', 'Module Name is required.', 'warning');
      return;
    }

    try {
      const newMod = await rbacService.addDynamicModule({
        name: moduleFormData.name,
        key: moduleFormData.key || undefined,
        category: moduleFormData.category,
        description: moduleFormData.description,
        changedBy: currentUser?.name || 'Administrator',
      });
      showToast('Dynamic Module Registered', `Module "${newMod.name}" is now available in permissions matrix.`);
      setShowAddModuleModal(false);
      setModuleFormData({ name: '', key: '', category: 'Custom Modules', description: '' });
      await loadData();
    } catch (err: any) {
      showToast('Registration Failed', err.message || 'Error adding module', 'warning');
    }
  };

  const specialCategories = useMemo(() => {
    const map: Record<string, typeof SPECIAL_PERMISSIONS_LIST> = {};
    SPECIAL_PERMISSIONS_LIST.forEach(item => {
      if (!map[item.category]) map[item.category] = [];
      map[item.category].push(item);
    });
    return map;
  }, []);

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          zIndex: 9999,
          backgroundColor: toastMessage.type === 'success' ? '#0E7490' : '#D97706',
          color: '#FFFFFF',
          padding: '12px 20px',
          borderRadius: '12px',
          boxShadow: '0 10px 25px -5px rgba(14, 116, 144, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          animation: 'fadeIn 0.2s ease-in-out'
        }}>
          {toastMessage.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{toastMessage.title}</div>
            {toastMessage.subtitle && (
              <div style={{ fontSize: '0.78rem', opacity: 0.9, marginTop: '2px' }}>{toastMessage.subtitle}</div>
            )}
          </div>
        </div>
      )}

      {/* 1. Header Banner & Dynamic Role Management Bar */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E7ECF3',
        padding: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                backgroundColor: '#ECFEFF',
                color: '#0E7490',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <ShieldCheck size={22} />
              </div>
              <div>
                <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Roles & Permissions Management
                </h1>
                <p style={{ fontSize: '0.84rem', color: '#64748B', margin: '2px 0 0 0' }}>
                  Dynamic RBAC governance, module authorization matrix, data access tiers & audit trail
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons for Roles & Modules */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={openCreateRoleModal}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#0E7490',
                color: '#FFFFFF',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '10px',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#0891B2'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = '#0E7490'}
            >
              <Plus size={16} /> Create Role
            </button>

            <button
              type="button"
              onClick={() => setShowAddModuleModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#F0FDFA',
                color: '#0D9488',
                border: '1px solid #CCFBF1',
                padding: '8px 14px',
                borderRadius: '10px',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#CCFBF1'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = '#F0FDFA'}
            >
              <Layers size={16} /> + Add Dynamic Module
            </button>
          </div>
        </div>

        {/* Role Selector Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          {roles.map(r => {
            const isSelected = r.id === selectedRoleId;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedRoleId(r.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: '12px',
                  border: isSelected ? '1px solid #0E7490' : '1px solid #E2E8F0',
                  backgroundColor: isSelected ? '#ECFEFF' : '#F8FAFC',
                  color: isSelected ? '#0E7490' : '#475569',
                  fontWeight: isSelected ? 800 : 600,
                  fontSize: '0.86rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>{r.name}</span>
                <span style={{
                  fontSize: '0.72rem',
                  padding: '2px 6px',
                  borderRadius: '6px',
                  backgroundColor: r.status === 'Active' ? (isSelected ? '#0E7490' : '#E2E8F0') : '#FEE2E2',
                  color: r.status === 'Active' ? (isSelected ? '#FFFFFF' : '#475569') : '#DC2626',
                  fontWeight: 700
                }}>
                  {r.status}
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected Role Meta & Quick Operations */}
        {currentRole && (
          <div style={{
            marginTop: '16px',
            padding: '14px 18px',
            backgroundColor: '#F8FAFC',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>
                  {currentRole.name}
                </span>
                <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '9999px', backgroundColor: '#E0F2FE', color: '#0369A1', fontWeight: 700 }}>
                  Dept: {currentRole.department}
                </span>
                {currentRole.isDefault && (
                  <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '9999px', backgroundColor: '#FEF3C7', color: '#B45309', fontWeight: 700 }}>
                    Core Default Role
                  </span>
                )}
              </div>
              <p style={{ fontSize: '0.82rem', color: '#64748B', margin: '4px 0 0 0', maxWidth: '680px' }}>
                {currentRole.description}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={openEditRoleModal}
                title="Edit Role Details"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  color: '#334155',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <Edit2 size={14} /> Edit Role
              </button>

              <button
                type="button"
                onClick={() => {
                  setDuplicateRoleName(`${currentRole.name} (Copy)`);
                  setShowDuplicateModal(true);
                }}
                title="Duplicate Role"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  color: '#334155',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <Copy size={14} /> Duplicate
              </button>

              {!currentRole.isDefault && (
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(true)}
                  title="Delete Role"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    backgroundColor: '#FEE2E2',
                    border: '1px solid #FECACA',
                    color: '#DC2626',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  <Trash2 size={14} /> Delete
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 2. Navigation Tabs (Matrix, Special Permissions, Audit Log) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#FFFFFF',
        borderRadius: '14px',
        padding: '6px 8px',
        border: '1px solid #E7ECF3'
      }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('matrix')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 18px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: activeTab === 'matrix' ? '#0E7490' : 'transparent',
              color: activeTab === 'matrix' ? '#FFFFFF' : '#64748B',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <Layers size={16} /> Module Permissions Matrix
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('special')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 18px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: activeTab === 'special' ? '#0E7490' : 'transparent',
              color: activeTab === 'special' ? '#FFFFFF' : '#64748B',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <Sliders size={16} /> Special Permissions ({draftConfig?.specialPermissions?.length || 0})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 18px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: activeTab === 'audit' ? '#0E7490' : 'transparent',
              color: activeTab === 'audit' ? '#FFFFFF' : '#64748B',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <History size={16} /> Audit History ({auditLogs.length})
          </button>
        </div>

        {/* Global Select All / Clear All Shortcuts */}
        {activeTab !== 'audit' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={handleSelectAllPermissions}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '8px',
                backgroundColor: '#ECFEFF',
                border: '1px solid #A5F3FC',
                color: '#0E7490',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Select All Permissions
            </button>

            <button
              type="button"
              onClick={handleClearAllPermissions}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '8px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                color: '#64748B',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Clear All
            </button>
          </div>
        )}
      </div>

      {/* 3. DATA ACCESS PERMISSION CARD (Section 3 Requirement) */}
      {draftConfig && activeTab !== 'audit' && (
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E7ECF3',
          padding: '20px 24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Data Access Tier
              </h2>
              <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '2px 0 0 0' }}>
                Controls the depth of employee records visible to this role across all authorized modules
              </p>
            </div>
            <span style={{
              fontSize: '0.76rem',
              fontWeight: 800,
              padding: '3px 10px',
              borderRadius: '9999px',
              backgroundColor: draftConfig.dataAccess === 'all' ? '#DCFCE7' : (draftConfig.dataAccess === 'own' ? '#F1F5F9' : '#FEF3C7'),
              color: draftConfig.dataAccess === 'all' ? '#15803D' : (draftConfig.dataAccess === 'own' ? '#475569' : '#B45309')
            }}>
              Current Scope: {draftConfig.dataAccess.toUpperCase()}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            {[
              {
                id: 'own' as DataAccessLevel,
                title: 'Own Data Only',
                desc: 'Restricted strictly to personal self-service records (e.g. Employee).',
              },
              {
                id: 'team' as DataAccessLevel,
                title: 'Own + Team Data',
                desc: 'Access to self plus direct and indirect reporting members (e.g. Manager, Team Leader).',
              },
              {
                id: 'department' as DataAccessLevel,
                title: 'Department Data',
                desc: 'Full visibility across all staff in the assigned departmental branch unit.',
              },
              {
                id: 'all' as DataAccessLevel,
                title: 'All Employee Data',
                desc: 'Company-wide enterprise visibility across all staff (e.g. CEO, HR, Admin).',
              },
            ].map(opt => {
              const isSelected = draftConfig.dataAccess === opt.id;
              return (
                <label
                  key={opt.id}
                  onClick={() => handleSetDataAccess(opt.id)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '14px 16px',
                    borderRadius: '12px',
                    border: isSelected ? '2px solid #0E7490' : '1px solid #E2E8F0',
                    backgroundColor: isSelected ? '#ECFEFF' : '#FFFFFF',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <input
                      type="radio"
                      name="dataAccessLevel"
                      checked={isSelected}
                      onChange={() => handleSetDataAccess(opt.id)}
                      style={{ accentColor: '#0E7490', width: '16px', height: '16px' }}
                    />
                    <span style={{ fontWeight: 800, fontSize: '0.88rem', color: isSelected ? '#0E7490' : '#1E293B' }}>
                      {opt.title}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: '#64748B', lineHeight: '1.4' }}>
                    {opt.desc}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. TAB 1: MODULE PERMISSIONS MATRIX TABLE */}
      {activeTab === 'matrix' && draftConfig && (
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E7ECF3',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          {/* Table Header Filter Bar */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid #E7ECF3',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            backgroundColor: '#F8FAFC'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1E293B' }}>
                HRMS Modules ({filteredModules.length})
              </span>
              <span style={{ fontSize: '0.76rem', color: '#64748B' }}>
                Toggle individual permissions or use row Select All
              </span>
            </div>

            <div style={{ position: 'relative', width: '260px' }}>
              <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input
                type="text"
                placeholder="Search module..."
                value={searchModule}
                onChange={e => setSearchModule(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 10px 6px 32px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.82rem',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          {/* Permission Matrix Grid */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '880px' }}>
              <thead>
                <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '2px solid #E2E8F0' }}>
                  <th style={{ padding: '12px 16px', width: '220px', fontSize: '0.8rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase' }}>
                    Module Name
                  </th>
                  <th style={{ padding: '12px 10px', width: '90px', fontSize: '0.78rem', fontWeight: 800, color: '#0E7490', textTransform: 'uppercase', textAlign: 'center' }}>
                    Row Select
                  </th>
                  {ALL_PERMISSION_ACTIONS.map(action => (
                    <th key={action.id} style={{ padding: '12px 10px', fontSize: '0.78rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', textAlign: 'center' }}>
                      {action.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredModules.map((mod, idx) => {
                  const currentActions = draftConfig.modulePermissions[mod.key] || [];
                  const isAllRowSelected = currentActions.length === ALL_PERMISSION_ACTIONS.length;

                  return (
                    <tr
                      key={mod.id}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#FAFCFD',
                        transition: 'background 0.1s ease'
                      }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F0FDFA'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#FFFFFF' : '#FAFCFD'}
                    >
                      {/* Module Title & Category */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.88rem' }}>
                            {mod.name}
                          </span>
                          {mod.isCustom && (
                            <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', backgroundColor: '#FEF3C7', color: '#B45309', fontWeight: 700 }}>
                              Custom
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '2px' }}>
                          {mod.category}
                        </div>
                      </td>

                      {/* Row Select All */}
                      <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleToggleRowSelectAll(mod.key)}
                          title="Select / Deselect all actions for this module"
                          style={{
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            color: isAllRowSelected ? '#0E7490' : '#94A3B8',
                            padding: '4px'
                          }}
                        >
                          {isAllRowSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                        </button>
                      </td>

                      {/* 8 Action Checkboxes */}
                      {ALL_PERMISSION_ACTIONS.map(action => {
                        const isChecked = currentActions.includes(action.id);
                        return (
                          <td key={action.id} style={{ padding: '12px 10px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleAction(mod.key, action.id)}
                              style={{
                                width: '18px',
                                height: '18px',
                                accentColor: '#0E7490',
                                cursor: 'pointer',
                                borderRadius: '4px'
                              }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. TAB 2: SPECIAL PERMISSIONS GRID (Section 4 Requirement) */}
      {activeTab === 'special' && draftConfig && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{
            padding: '16px 20px',
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E7ECF3',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Granular Special Authority Permissions
              </h2>
              <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '2px 0 0 0' }}>
                Separate authorizations for sensitive payroll processing, document access, attendance alterations, and system governance
              </p>
            </div>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0E7490' }}>
              {draftConfig.specialPermissions.length} of {SPECIAL_PERMISSIONS_LIST.length} Enabled
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
            {Object.entries(specialCategories).map(([catName, items]) => (
              <div
                key={catName}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '16px',
                  border: '1px solid #E7ECF3',
                  padding: '20px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                }}
              >
                <h3 style={{
                  fontSize: '0.9rem',
                  fontWeight: 800,
                  color: '#0E7490',
                  margin: '0 0 14px 0',
                  paddingBottom: '8px',
                  borderBottom: '1px solid #F1F5F9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <span>{catName}</span>
                  <span style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>
                    {items.filter(i => draftConfig.specialPermissions.includes(i.key)).length}/{items.length}
                  </span>
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {items.map(item => {
                    const isChecked = draftConfig.specialPermissions.includes(item.key);
                    return (
                      <label
                        key={item.key}
                        onClick={() => handleToggleSpecialPermission(item.key)}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          backgroundColor: isChecked ? '#ECFEFF' : '#F8FAFC',
                          border: isChecked ? '1px solid #A5F3FC' : '1px solid #F1F5F9',
                          cursor: 'pointer',
                          transition: 'all 0.1s ease'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSpecialPermission(item.key)}
                          style={{
                            width: '17px',
                            height: '17px',
                            accentColor: '#0E7490',
                            marginTop: '2px',
                            cursor: 'pointer'
                          }}
                        />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.84rem', color: isChecked ? '#0E7490' : '#1E293B' }}>
                            {item.label}
                          </div>
                          {item.description && (
                            <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '1px' }}>
                              {item.description}
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. TAB 3: AUDIT HISTORY (Section 9 Requirement) */}
      {activeTab === 'audit' && (
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E7ECF3',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E7ECF3', backgroundColor: '#F8FAFC' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              Permissions Modification Audit Trail
            </h2>
            <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '2px 0 0 0' }}>
              Immutable forensic log tracking administrator modifications, old vs new states, date and timestamp
            </p>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '2px solid #E2E8F0' }}>
                  <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Date & Time</th>
                  <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Changed By</th>
                  <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Target Role</th>
                  <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Action / Detail</th>
                  <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Diff (Old vs New)</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '36px', textAlign: 'center', color: '#94A3B8', fontSize: '0.88rem' }}>
                      No permission changes recorded yet.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log, idx) => (
                    <tr key={log.id || idx} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#FAFCFD' }}>
                      <td style={{ padding: '12px 16px', fontSize: '0.82rem', color: '#334155', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 700 }}>{formatDateDDMMYYYY(log.date)}</div>
                        <div style={{ fontSize: '0.74rem', color: '#64748B' }}>{log.time}</div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '0.84rem', fontWeight: 700, color: '#0E7490' }}>
                        {log.changedBy}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '0.84rem', fontWeight: 700, color: '#1E293B' }}>
                        {log.role}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '0.82rem', color: '#334155' }}>
                        {log.permissionChanged}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '0.78rem', color: '#64748B' }}>
                        <div><strong style={{ color: '#DC2626' }}>Prev:</strong> {log.oldPermission}</div>
                        <div><strong style={{ color: '#16A34A' }}>New:</strong> {log.newPermission}</div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. Action Bar (Save Permissions, Reset, Cancel) */}
      {activeTab !== 'audit' && (
        <div style={{
          position: 'sticky',
          bottom: '24px',
          zIndex: 50,
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E7ECF3',
          padding: '14px 24px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.03)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {hasChanges ? (
              <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#D97706', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertCircle size={16} /> You have unsaved permission modifications for {currentRole?.name}
              </span>
            ) : (
              <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={16} color="#16A34A" /> Matrix configuration synchronized
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={handleReset}
              disabled={!hasChanges}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '10px',
                backgroundColor: '#F1F5F9',
                border: 'none',
                color: hasChanges ? '#334155' : '#94A3B8',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: hasChanges ? 'pointer' : 'not-allowed'
              }}
            >
              <RotateCcw size={15} /> Reset
            </button>

            <button
              type="button"
              onClick={() => {
                handleReset();
                showToast('Action Cancelled', 'Discarded current session changes.');
              }}
              style={{
                padding: '8px 16px',
                borderRadius: '10px',
                backgroundColor: 'transparent',
                border: '1px solid #E2E8F0',
                color: '#64748B',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSavePermissions}
              disabled={isSubmitting}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 22px',
                borderRadius: '12px',
                backgroundColor: '#0E7490',
                color: '#FFFFFF',
                border: 'none',
                fontSize: '0.88rem',
                fontWeight: 800,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 6px rgba(14, 116, 144, 0.25)',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={e => !isSubmitting && (e.currentTarget.style.backgroundColor = '#0891B2')}
              onMouseLeave={e => !isSubmitting && (e.currentTarget.style.backgroundColor = '#0E7490')}
            >
              <Save size={16} /> {isSubmitting ? 'Saving...' : 'Save Permissions'}
            </button>
          </div>
        </div>
      )}

      {/* MODAL 1: Role Creation & Edit */}
      {showRoleModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '520px',
            border: '1px solid #E7ECF3',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #F1F5F9',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#FAFCFD'
            }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>
                {roleModalMode === 'create' ? 'Create New Role' : `Edit Role: ${currentRole?.name}`}
              </h3>
              <button
                type="button"
                onClick={() => setShowRoleModal(false)}
                style={{ border: 'none', background: 'none', color: '#94A3B8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleRoleFormSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Role Name <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Regional Supervisor, Quality Auditor"
                  value={roleFormData.name}
                  onChange={e => setRoleFormData({ ...roleFormData, name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.88rem',
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Department <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <select
                  value={roleFormData.department}
                  onChange={e => setRoleFormData({ ...roleFormData, department: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.88rem',
                    outline: 'none',
                    backgroundColor: '#FFFFFF'
                  }}
                >
                  <option value="Executive Board">Executive Board</option>
                  <option value="Human Resources">Human Resources</option>
                  <option value="IT & Administration">IT & Administration</option>
                  <option value="Operations & Engineering">Operations & Engineering</option>
                  <option value="Finance & Accounts">Finance & Accounts</option>
                  <option value="Field Operations">Field Operations</option>
                  <option value="General Staff">General Staff</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Role Status
                </label>
                <select
                  value={roleFormData.status}
                  onChange={e => setRoleFormData({ ...roleFormData, status: e.target.value as 'Active' | 'Inactive' })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.88rem',
                    outline: 'none',
                    backgroundColor: '#FFFFFF'
                  }}
                >
                  <option value="Active">Active (Assignable to Staff)</option>
                  <option value="Inactive">Inactive (Suspended)</option>
                </select>
              </div>

              {roleModalMode === 'create' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Copy Existing Permissions From (Optional)
                  </label>
                  <select
                    value={roleFormData.cloneFromRoleId}
                    onChange={e => setRoleFormData({ ...roleFormData, cloneFromRoleId: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.88rem',
                      outline: 'none',
                      backgroundColor: '#FFFFFF'
                    }}
                  >
                    <option value="">-- Start with Blank Permissions --</option>
                    {roles.map(r => (
                      <option key={r.id} value={r.id}>
                        Clone from {r.name} ({r.department})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Role Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Outline responsibilities and authorization boundaries..."
                  value={roleFormData.description}
                  onChange={e => setRoleFormData({ ...roleFormData, description: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.88rem',
                    outline: 'none',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowRoleModal(false)}
                  style={{
                    padding: '9px 18px',
                    borderRadius: '10px',
                    backgroundColor: '#F1F5F9',
                    border: 'none',
                    color: '#334155',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '9px 20px',
                    borderRadius: '10px',
                    backgroundColor: '#0E7490',
                    border: 'none',
                    color: '#FFFFFF',
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  {roleModalMode === 'create' ? 'Create Role' : 'Update Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Duplicate Role */}
      {showDuplicateModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '460px',
            border: '1px solid #E7ECF3',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                Duplicate Role: {currentRole?.name}
              </h3>
              <button
                type="button"
                onClick={() => setShowDuplicateModal(false)}
                style={{ border: 'none', background: 'none', color: '#94A3B8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleDuplicateSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ fontSize: '0.82rem', color: '#64748B', margin: 0 }}>
                This creates an identical copy of <strong>{currentRole?.name}</strong> including all 16 module checkboxes, 4-tier data access level, and special permission flags.
              </p>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  New Role Name <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  value={duplicateRoleName}
                  onChange={e => setDuplicateRoleName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.88rem',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setShowDuplicateModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '10px',
                    backgroundColor: '#F1F5F9',
                    border: 'none',
                    color: '#334155',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 20px',
                    borderRadius: '10px',
                    backgroundColor: '#0E7490',
                    border: 'none',
                    color: '#FFFFFF',
                    fontSize: '0.84rem',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  Clone & Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Delete Role Confirmation */}
      {showDeleteModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '440px',
            padding: '24px',
            border: '1px solid #FEE2E2',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                backgroundColor: '#FEE2E2',
                color: '#DC2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Trash2 size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                  Delete Role?
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                  This action is permanent and logged in the security audit trail.
                </p>
              </div>
            </div>

            <p style={{ fontSize: '0.84rem', color: '#475569', lineHeight: '1.5', margin: '0 0 20px' }}>
              Are you sure you want to delete role <strong>"{currentRole?.name}"</strong>? Any employees assigned this role will revert to standard Employee permissions.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '10px',
                  backgroundColor: '#F1F5F9',
                  border: 'none',
                  color: '#334155',
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Keep Role
              </button>
              <button
                type="button"
                onClick={handleDeleteRole}
                style={{
                  padding: '8px 18px',
                  borderRadius: '10px',
                  backgroundColor: '#DC2626',
                  border: 'none',
                  color: '#FFFFFF',
                  fontSize: '0.84rem',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Dynamic Module Addition (Section 10 Requirement) */}
      {showAddModuleModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '500px',
            border: '1px solid #E7ECF3',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #F1F5F9',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#FAFCFD'
            }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>
                Register Dynamic HRMS Module
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModuleModal(false)}
                style={{ border: 'none', background: 'none', color: '#94A3B8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddModuleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ fontSize: '0.82rem', color: '#64748B', margin: 0 }}>
                When you add a new module to the software, it automatically injects into the dynamic RBAC permissions grid for every role.
              </p>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Module Display Name <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Asset Audit, Training & Certifications, Fleet Management"
                  value={moduleFormData.name}
                  onChange={e => setModuleFormData({ ...moduleFormData, name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.88rem',
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Module System Key (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. fleet_management (auto-generated if empty)"
                  value={moduleFormData.key}
                  onChange={e => setModuleFormData({ ...moduleFormData, key: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.88rem',
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Category
                </label>
                <select
                  value={moduleFormData.category}
                  onChange={e => setModuleFormData({ ...moduleFormData, category: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.88rem',
                    outline: 'none',
                    backgroundColor: '#FFFFFF'
                  }}
                >
                  <option value="HR Core">HR Core</option>
                  <option value="Operations">Operations</option>
                  <option value="Finance">Finance</option>
                  <option value="Field Force">Field Force</option>
                  <option value="Compliance">Compliance</option>
                  <option value="Custom Extensions">Custom Extensions</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Description
                </label>
                <input
                  type="text"
                  placeholder="Short description of this new module's purpose"
                  value={moduleFormData.description}
                  onChange={e => setModuleFormData({ ...moduleFormData, description: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.88rem',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModuleModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '10px',
                    backgroundColor: '#F1F5F9',
                    border: 'none',
                    color: '#334155',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 20px',
                    borderRadius: '10px',
                    backgroundColor: '#0E7490',
                    border: 'none',
                    color: '#FFFFFF',
                    fontSize: '0.84rem',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  Register Module
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RolesPermissionsSettings;
