import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { DateInput } from '../common/DateInput';
import {
  CheckSquare,
  Paperclip,
  Upload,
  X,
  Check,
  AlertCircle,
  Search,
  ChevronDown,
  Users
} from 'lucide-react';
import { TaskPriority, TaskAssignee } from '../../types/tasks';
import {
  getTodayKolkata,
  validateRequestDate,
  PAST_DATE_ERROR_MESSAGE,
  INVALID_DATE_RANGE_ORDER_MESSAGE
} from '../../utils/requestValidation';
import { handleFormKeyDown, preventSpaceEnterPropagation } from '../../utils/keyboardUtils';

interface NewTaskFormProps {
  onTaskCreated: (taskId: string) => void;
  onCancel: () => void;
}

const normalizeDepartmentLabel = (value?: string) =>
  (value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const canonicalDepartmentKey = (value?: string) => {
  const normalized = normalizeDepartmentLabel(value);
  if (!normalized) return '';
  if (normalized === 'hr' || normalized.includes('human resource')) return 'hr';
  if (normalized.includes('sales') || normalized.includes('marketing')) return 'sales';
  if (normalized.includes('account') || normalized.includes('finance')) return 'accounts';
  if (normalized.includes('operation')) return 'operations';
  if (normalized.includes('engineer') || normalized.includes('technical') || normalized === 'it') return 'engineering';
  return normalized;
};

const departmentLookupKeys = (value?: string, allDepartments: { id?: string; name?: string; code?: string }[] = []) => {
  const normalized = normalizeDepartmentLabel(value);
  if (!normalized) return new Set<string>();

  const keys = new Set([normalized, canonicalDepartmentKey(value)]);
  allDepartments.forEach(dept => {
    const identifiers = [dept.id, dept.name, dept.code]
      .map(item => normalizeDepartmentLabel(item))
      .filter(Boolean);
    if (identifiers.includes(normalized)) {
      identifiers.forEach(item => keys.add(item));
      keys.add(canonicalDepartmentKey(dept.name || dept.code || dept.id));
    }
  });
  return keys;
};

const departmentMatches = (
  employeeDepartment?: string,
  selectedDepartment?: string,
  allDepartments: { id?: string; name?: string; code?: string }[] = []
) => {
  const employeeNormalized = normalizeDepartmentLabel(employeeDepartment);
  const selectedNormalized = normalizeDepartmentLabel(selectedDepartment);
  if (!employeeNormalized || !selectedNormalized) return false;
  if (employeeNormalized === selectedNormalized) return true;

  const employeeKeys = departmentLookupKeys(employeeDepartment, allDepartments);
  const selectedKeys = departmentLookupKeys(selectedDepartment, allDepartments);
  if ([...employeeKeys].some(key => selectedKeys.has(key))) return true;

  const employeeTokens = new Set(employeeNormalized.split(' ').filter(token => token.length >= 4));
  return selectedNormalized.split(' ').some(token => token.length >= 4 && employeeTokens.has(token));
};

export const NewTaskForm: React.FC<NewTaskFormProps> = ({ onTaskCreated, onCancel }) => {
  const { employees, departments, enhancedTasks, currentUser, createEnhancedTask } = useHRMS();

  const today = getTodayKolkata();
  const nextWeek = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const currentEmpId = currentUser.employeeId || currentUser.id || '';
  const currentEmpName = (currentUser.name || '').trim().toLowerCase();

  const isSelf = (empOrId: string | { id?: string; employeeId?: string; firstName?: string; lastName?: string }) => {
    if (!empOrId) return false;
    const empId = typeof empOrId === 'string' ? empOrId : empOrId.employeeId || empOrId.id || '';
    const empObj =
      typeof empOrId === 'object' && (empOrId.firstName || empOrId.lastName)
        ? empOrId
        : employees.find(e => e.employeeId === empId || e.id === empId);

    if (currentEmpId && empId && empId.toLowerCase() === currentEmpId.toLowerCase()) return true;
    if (currentUser.id && empId && empId.toLowerCase() === currentUser.id.toLowerCase()) return true;
    if (currentUser.employeeId && empId && empId.toLowerCase() === currentUser.employeeId.toLowerCase()) return true;
    if (empObj?.id && currentUser.employeeId && empObj.id.toLowerCase() === currentUser.employeeId.toLowerCase())
      return true;
    if (empObj?.employeeId && currentUser.id && empObj.employeeId.toLowerCase() === currentUser.id.toLowerCase())
      return true;

    if (currentUser.email && empObj && (empObj as any).email && (empObj as any).email.toLowerCase() === currentUser.email.toLowerCase())
      return true;

    const targetName = empObj ? `${empObj.firstName || ''} ${empObj.lastName || ''}`.trim().toLowerCase() : '';
    if (currentEmpName && targetName) {
      if (targetName === currentEmpName) return true;
      if (currentEmpName.includes(targetName) || targetName.includes(currentEmpName)) return true;
    }
    return false;
  };

  const isCeoEmp = (emp: any) => {
    return (
      emp.designation?.toLowerCase().includes('ceo') ||
      emp.role === 'CEO' ||
      (emp.department?.toLowerCase() === 'management' && emp.designation?.toLowerCase().includes('director'))
    );
  };

  const defaultNonSelfEmp =
    employees.find(e => !isSelf(e) && !isCeoEmp(e) && e.employeeId !== 'EMP-000') ||
    employees.find(e => !isSelf(e));
  const initialDept = defaultNonSelfEmp?.department || departments[0]?.name || 'Engineering';

  // 1. Task Name
  const [taskTitle, setTaskTitle] = useState<string>('');
  // 2. Assigned By (Current User)
  const assignedByDisplay = `${currentUser.name} (${currentUser.role})`;
  // 3. Department
  const [department, setDepartment] = useState<string>(initialDept);

  const departmentAssignableEmployees = useMemo(() => {
    const matched = employees.filter(
      emp => !isSelf(emp) && !isCeoEmp(emp) && departmentMatches(emp.department, department, departments)
    );
    if (matched.length > 0) return matched;
    return employees.filter(emp => !isSelf(emp) && !isCeoEmp(emp));
  }, [employees, departments, department, currentEmpId, currentEmpName, currentUser]);

  const defaultDeptEmp =
    departmentAssignableEmployees.find(e => e.designation !== 'CEO' && e.employeeId !== 'EMP-000') ||
    departmentAssignableEmployees[0];

  // 4. Select Responsible Person
  const [responsiblePersonId, setResponsiblePersonId] = useState<string>(defaultDeptEmp?.employeeId || '');
  // 5. Priority
  const [priority, setPriority] = useState<TaskPriority>('High');
  // 6. Start Date
  const [startDate, setStartDate] = useState<string>(today);
  // 7. End Date (Due Date)
  const [dueDate, setDueDate] = useState<string>(nextWeek);
  // 8. Description
  const [description, setDescription] = useState<string>('');
  // 9. Attachment
  const [attachmentsList, setAttachmentsList] = useState<
    { fileName: string; fileSize: string; fileType: string; fileUrl: string; uploadedBy: string }[]
  >([]);
  // 10. Assignees
  const [assignedEmployeeIds, setAssignedEmployeeIds] = useState<string[]>(
    defaultDeptEmp ? [defaultDeptEmp.employeeId] : []
  );

  const [assigneeSearch, setAssigneeSearch] = useState<string>('');
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState<boolean>(false);
  const assigneeDropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (assigneeDropdownRef.current && !assigneeDropdownRef.current.contains(e.target as Node)) {
        setShowAssigneeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const validInDept =
      departmentAssignableEmployees.find(e => e.designation !== 'CEO' && e.employeeId !== 'EMP-000') ||
      departmentAssignableEmployees[0];

    const isRespValid = departmentAssignableEmployees.some(e => e.employeeId === responsiblePersonId);
    if (!isRespValid || isSelf(responsiblePersonId)) {
      setResponsiblePersonId(validInDept ? validInDept.employeeId : '');
    }

    setAssignedEmployeeIds(prev => {
      const filtered = prev.filter(
        id => !isSelf(id) && departmentAssignableEmployees.some(e => e.employeeId === id)
      );
      if (filtered.length === 0 && validInDept) {
        return [validInDept.employeeId];
      }
      return filtered;
    });
  }, [department, departmentAssignableEmployees]);

  const handleDepartmentChange = (newDept: string) => {
    setDepartment(newDept);
    setAssigneeSearch('');
    setErrors(prev => ({ ...prev, department: '', responsiblePerson: '', assignees: '' }));
  };

  const handleResponsibleChange = (empId: string) => {
    if (isSelf(empId)) {
      setErrors(prev => ({
        ...prev,
        responsiblePerson: 'You cannot assign a task to yourself. Please select another team member.'
      }));
      return;
    }
    setErrors(prev => ({ ...prev, responsiblePerson: '' }));
    setResponsiblePersonId(empId);
    if (empId && !assignedEmployeeIds.includes(empId)) {
      setAssignedEmployeeIds(prev => [...prev.filter(id => !isSelf(id)), empId]);
    }
  };

  const toggleAssignee = (empId: string) => {
    if (isSelf(empId)) {
      setErrors(prev => ({
        ...prev,
        assignees: 'You cannot assign a task to yourself.'
      }));
      return;
    }
    setErrors(prev => ({ ...prev, assignees: '' }));
    setAssignedEmployeeIds(prev => {
      if (prev.includes(empId)) {
        if (prev.length === 1) return prev;
        const updated = prev.filter(id => id !== empId);
        if (empId === responsiblePersonId && updated.length > 0) {
          setResponsiblePersonId(updated[0]);
        }
        return updated;
      } else {
        return [...prev.filter(id => !isSelf(id)), empId];
      }
    });
  };

  const handleSelectAllDept = () => {
    const allIds = departmentAssignableEmployees.map(e => e.employeeId);
    setAssignedEmployeeIds(allIds);
    if (!responsiblePersonId && allIds.length > 0) {
      setResponsiblePersonId(allIds[0]);
    }
    setErrors(prev => ({ ...prev, assignees: '' }));
  };

  const handleClearAssignees = () => {
    if (responsiblePersonId) {
      setAssignedEmployeeIds([responsiblePersonId]);
    } else if (departmentAssignableEmployees.length > 0) {
      const first = departmentAssignableEmployees[0].employeeId;
      setResponsiblePersonId(first);
      setAssignedEmployeeIds([first]);
    }
    setErrors(prev => ({ ...prev, assignees: '' }));
  };

  const filteredDeptEmployees = useMemo(() => {
    if (!assigneeSearch.trim()) return departmentAssignableEmployees;
    const q = assigneeSearch.toLowerCase();
    return departmentAssignableEmployees.filter(
      e =>
        `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) ||
        (e.designation || '').toLowerCase().includes(q) ||
        (e.employeeId || '').toLowerCase().includes(q)
    );
  }, [departmentAssignableEmployees, assigneeSearch]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      const sizeStr =
        file.size < 1024 * 1024
          ? `${(file.size / 1024).toFixed(1)} KB`
          : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;

      let fileUrl = '#';
      try {
        fileUrl = URL.createObjectURL(file);
      } catch {
        // ignore
      }

      const initialAtt = {
        fileName: file.name,
        fileSize: sizeStr,
        fileType: file.type || 'Document',
        fileUrl,
        uploadedBy: currentUser.name || 'User'
      };

      setAttachmentsList(prev => [...prev, initialAtt]);

      if (file.size < 400 * 1024) {
        const reader = new FileReader();
        reader.onload = event => {
          const base64Url = event.target?.result as string;
          if (base64Url) {
            setAttachmentsList(prev =>
              prev.map(item => (item.fileName === file.name ? { ...item, fileUrl: base64Url } : item))
            );
          }
        };
        reader.readAsDataURL(file);
      }
    });

    e.target.value = '';
  };

  const handleRemoveAttachment = (idx: number) => {
    setAttachmentsList(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!taskTitle.trim()) newErrors.taskTitle = 'Task Name is required.';
    if (!description.trim()) newErrors.description = 'Description is required.';

    if (!dueDate) {
      newErrors.dueDate = 'End Date is required.';
    } else if (!validateRequestDate(dueDate)) {
      newErrors.dueDate = PAST_DATE_ERROR_MESSAGE;
    } else if (startDate && dueDate < startDate) {
      newErrors.dueDate = INVALID_DATE_RANGE_ORDER_MESSAGE;
    }

    const validAssignees = assignedEmployeeIds.filter(id => !isSelf(id));
    if (validAssignees.length === 0) {
      newErrors.assignees = 'At least one assignee must be selected.';
    }

    if (!responsiblePersonId || isSelf(responsiblePersonId)) {
      newErrors.responsiblePerson = 'Please select a valid Responsible Person.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const respEmp = employees.find(e => e.employeeId === responsiblePersonId);
      const respName = respEmp ? `${respEmp.firstName} ${respEmp.lastName}`.trim() : 'Unassigned';

      const assignees: TaskAssignee[] = validAssignees.map((empId, index) => {
        const emp = employees.find(e => e.employeeId === empId);
        return {
          id: `ASG-NEW-${Date.now()}-${index}`,
          taskId: '',
          employeeId: empId,
          employeeName: emp ? `${emp.firstName} ${emp.lastName}`.trim() : empId,
          employeeEmail: emp?.email || '',
          employeeDepartment: emp?.department || department,
          employeeAvatar: emp?.avatar || '',
          role: empId === responsiblePersonId ? 'RESPONSIBLE' : 'ASSIGNEE',
          individualStatus: 'Pending',
          progressPercentage: 0,
          assignedAt: today,
          updatedAt: today
        };
      });

      const finalAttachments = attachmentsList.map((a, idx) => ({
        id: `ATT-NEW-${Date.now()}-${idx}`,
        taskId: '',
        ...a,
        uploadedAt: today
      }));

      const created = createEnhancedTask({
        title: taskTitle.trim(),
        taskDate: today,
        sourceType: 'Direct',
        createdBy: currentUser.name,
        createdById: currentUser.employeeId || currentUser.id,
        assignedBy: assignedByDisplay,
        assignedByName: currentUser.name,
        assignedById: currentUser.employeeId || currentUser.id,
        responsiblePersonId,
        responsiblePersonName: respName,
        department,
        taskCategory: 'General Operations',
        priority,
        startDate,
        dueDate,
        description: description.trim(),
        expectedOutput: description.trim(),
        assignees,
        attachments: finalAttachments as any
      });

      onTaskCreated(created.id);
    } finally {
      setIsSubmitting(false);
    }
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.78rem',
    fontWeight: 700,
    color: '#1E293B',
    marginBottom: '5px'
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: '40px',
    padding: '0 12px',
    borderRadius: '10px',
    border: '1px solid #CBD5E1',
    background: '#FFFFFF',
    fontSize: '0.84rem',
    fontWeight: 600,
    color: '#0F172A',
    outline: 'none',
    boxSizing: 'border-box'
  };

  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: '20px',
        boxShadow: '0 20px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 10px -6px rgba(15, 23, 42, 0.06)',
        border: '1px solid #E2E8F0',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '90vh',
        overflow: 'hidden',
        width: '100%',
        maxWidth: '680px',
        margin: '0 auto'
      }}
    >
      {/* Modal Header (Apple-Clean Leave-Policy Style) */}
      <div
        style={{
          padding: '18px 22px',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#FFFFFF',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '11px',
              background: '#ECFEFF',
              border: '1px solid #CFFAFE',
              color: '#0E7490',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <CheckSquare size={19} />
          </div>
          <div>
            <h2
              style={{
                fontSize: '1.12rem',
                fontWeight: 800,
                color: '#0F172A',
                margin: 0,
                letterSpacing: '-0.01em'
              }}
            >
              Assign Task
            </h2>
            <p style={{ fontSize: '0.76rem', color: '#64748B', margin: '2px 0 0 0', fontWeight: 500 }}>
              Task ID: <strong style={{ color: '#0E7490' }}>{`TSK-2026-${(enhancedTasks.length + 1).toString().padStart(3, '0')}`}</strong> • Assign deliverable to your team
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onCancel}
          style={{
            width: '34px',
            height: '34px',
            borderRadius: '10px',
            border: '1px solid #E2E8F0',
            background: '#F8FAFC',
            color: '#64748B',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Scrollable Form Body */}
      <form
        id="assign-task-clean-form"
        onSubmit={handleSubmit}
        onKeyDown={handleFormKeyDown}
        style={{
          padding: '20px 22px',
          overflowY: 'auto',
          flex: '1 1 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '15px'
        }}
      >
        {/* Row 1: 1. TASK NAME & 2. ASSIGNED BY */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '14px'
          }}
        >
          <div>
            <label style={labelStyle}>
              Task Name <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. HRMS Corrections / Monthly Sales Audit"
              value={taskTitle}
              onChange={e => {
                setTaskTitle(e.target.value);
                setErrors(prev => ({ ...prev, taskTitle: '' }));
              }}
              onKeyDown={preventSpaceEnterPropagation}
              style={{
                ...inputStyle,
                borderColor: errors.taskTitle ? '#EF4444' : '#CBD5E1'
              }}
              required
            />
            {errors.taskTitle && (
              <span style={{ color: '#DC2626', fontSize: '0.72rem', fontWeight: 600, marginTop: '3px', display: 'block' }}>
                {errors.taskTitle}
              </span>
            )}
          </div>

          <div>
            <label style={labelStyle}>Assigned By</label>
            <input
              type="text"
              value={assignedByDisplay}
              disabled
              style={{
                ...inputStyle,
                background: '#F8FAFC',
                color: '#475569',
                cursor: 'not-allowed'
              }}
            />
          </div>
        </div>

        {/* Row 2: 3. DEPARTMENT & 4. SELECT RESPONSIBLE PERSON */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '14px'
          }}
        >
          <div>
            <label style={labelStyle}>
              Department <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <select
              value={department}
              onChange={e => handleDepartmentChange(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
              required
            >
              {departments.map(d => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>
              Select Responsible Person <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <select
              value={responsiblePersonId}
              onChange={e => handleResponsibleChange(e.target.value)}
              style={{
                ...inputStyle,
                cursor: 'pointer',
                borderColor: errors.responsiblePerson ? '#EF4444' : '#CBD5E1'
              }}
              required
            >
              {departmentAssignableEmployees.length === 0 ? (
                <option value="">No employees in {department}</option>
              ) : (
                departmentAssignableEmployees.map(emp => (
                  <option key={emp.id} value={emp.employeeId}>
                    {emp.firstName} {emp.lastName} ({emp.designation})
                  </option>
                ))
              )}
            </select>
            {errors.responsiblePerson && (
              <span style={{ color: '#DC2626', fontSize: '0.72rem', fontWeight: 600, marginTop: '3px', display: 'block' }}>
                {errors.responsiblePerson}
              </span>
            )}
          </div>
        </div>

        {/* Row 3: 5. PRIORITY, 6. START DATE & 7. END DATE */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
            gap: '12px'
          }}
        >
          <div>
            <label style={labelStyle}>
              Priority <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <select
              value={priority}
              onChange={e => setPriority(e.target.value as TaskPriority)}
              style={{ ...inputStyle, cursor: 'pointer' }}
              required
            >
              <option value="Urgent">Urgent</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>
              Start Date <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <DateInput
              value={startDate}
              min={getTodayKolkata()}
              onChange={e => setStartDate(e.target.value)}
              className="form-control"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>
              End Date <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <DateInput
              value={dueDate}
              min={startDate || getTodayKolkata()}
              onChange={e => {
                setDueDate(e.target.value);
                setErrors(prev => ({ ...prev, dueDate: '' }));
              }}
              className="form-control"
              style={{
                ...inputStyle,
                borderColor: errors.dueDate ? '#EF4444' : '#CBD5E1'
              }}
              required
            />
            {errors.dueDate && (
              <span style={{ color: '#DC2626', fontSize: '0.72rem', fontWeight: 600, marginTop: '3px', display: 'block' }}>
                {errors.dueDate}
              </span>
            )}
          </div>
        </div>

        {/* Row 4: 10. ASSIGNEES (Searchable Chip Multi-Select like Leave/OT Policy Modal) */}
        <div ref={assigneeDropdownRef} style={{ position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>
              Assignees <span style={{ color: '#EF4444' }}>*</span>
              <span style={{ fontWeight: 500, color: '#64748B', marginLeft: '6px', fontSize: '0.72rem' }}>
                ({assignedEmployeeIds.length} selected from {department})
              </span>
            </label>
            {departmentAssignableEmployees.length > 1 && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={handleSelectAllDept}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    fontSize: '0.73rem',
                    fontWeight: 700,
                    color: '#0E7490',
                    cursor: 'pointer'
                  }}
                >
                  Select All
                </button>
                <span style={{ color: '#CBD5E1', fontSize: '0.73rem' }}>|</span>
                <button
                  type="button"
                  onClick={handleClearAssignees}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    fontSize: '0.73rem',
                    fontWeight: 600,
                    color: '#64748B',
                    cursor: 'pointer'
                  }}
                >
                  Reset
                </button>
              </div>
            )}
          </div>

          {/* Selected Assignee Chips Box */}
          <div
            onClick={() => setShowAssigneeDropdown(prev => !prev)}
            style={{
              minHeight: '44px',
              padding: '6px 10px',
              borderRadius: '10px',
              border: `1px solid ${showAssigneeDropdown ? '#0E7490' : errors.assignees ? '#EF4444' : '#CBD5E1'}`,
              background: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              cursor: 'pointer',
              boxShadow: showAssigneeDropdown ? '0 0 0 3px rgba(14, 116, 144, 0.12)' : 'none'
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', flex: 1 }}>
              {assignedEmployeeIds.length === 0 ? (
                <span style={{ fontSize: '0.82rem', color: '#94A3B8', padding: '2px 4px' }}>
                  Click to select assignees...
                </span>
              ) : (
                assignedEmployeeIds.map(empId => {
                  const emp = employees.find(e => e.employeeId === empId);
                  const name = emp ? `${emp.firstName} ${emp.lastName}`.trim() : empId;
                  const isLead = empId === responsiblePersonId;
                  return (
                    <span
                      key={empId}
                      onClick={e => e.stopPropagation()}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '3px 9px',
                        borderRadius: '999px',
                        background: isLead ? '#0E7490' : '#ECFEFF',
                        color: isLead ? '#FFFFFF' : '#0E7490',
                        border: `1px solid ${isLead ? '#0E7490' : '#BAE6FD'}`,
                        fontSize: '0.74rem',
                        fontWeight: 700
                      }}
                    >
                      {name}
                      {isLead && (
                        <span style={{ fontSize: '0.64rem', opacity: 0.9, fontWeight: 600 }}>(Lead)</span>
                      )}
                      {assignedEmployeeIds.length > 1 && (
                        <button
                          type="button"
                          onClick={() => toggleAssignee(empId)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            color: isLead ? '#FFFFFF' : '#0E7490',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center'
                          }}
                        >
                          <X size={12} />
                        </button>
                      )}
                    </span>
                  );
                })
              )}
            </div>
            <ChevronDown size={16} color="#64748B" style={{ flexShrink: 0 }} />
          </div>

          {errors.assignees && (
            <span style={{ color: '#DC2626', fontSize: '0.72rem', fontWeight: 600, marginTop: '3px', display: 'block' }}>
              <AlertCircle size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
              {errors.assignees}
            </span>
          )}

          {/* Dropdown Menu for Assignees */}
          {showAssigneeDropdown && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                right: 0,
                background: '#FFFFFF',
                border: '1px solid #CBD5E1',
                borderRadius: '12px',
                boxShadow: '0 12px 28px rgba(15, 23, 42, 0.14)',
                zIndex: 60,
                padding: '10px',
                maxHeight: '240px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}
            >
              <div style={{ position: 'relative' }}>
                <Search
                  size={14}
                  color="#94A3B8"
                  style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
                />
                <input
                  type="text"
                  placeholder={`Search employee in ${department}...`}
                  value={assigneeSearch}
                  onChange={e => setAssigneeSearch(e.target.value)}
                  onKeyDown={preventSpaceEnterPropagation}
                  style={{
                    width: '100%',
                    height: '34px',
                    paddingLeft: '30px',
                    paddingRight: '10px',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    fontSize: '0.78rem',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {filteredDeptEmployees.length === 0 ? (
                  <div style={{ padding: '12px', textAlign: 'center', fontSize: '0.78rem', color: '#64748B' }}>
                    <Users size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                    No matching employees found
                  </div>
                ) : (
                  filteredDeptEmployees.map(emp => {
                    const isSelected = assignedEmployeeIds.includes(emp.employeeId);
                    return (
                      <div
                        key={emp.id}
                        onClick={() => toggleAssignee(emp.employeeId)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '7px 10px',
                          borderRadius: '8px',
                          background: isSelected ? '#ECFEFF' : 'transparent',
                          cursor: 'pointer'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                          <div
                            style={{
                              width: '26px',
                              height: '26px',
                              borderRadius: '50%',
                              background: isSelected ? '#0E7490' : '#E2E8F0',
                              color: isSelected ? '#FFFFFF' : '#475569',
                              fontSize: '0.7rem',
                              fontWeight: 800,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}
                          >
                            {emp.firstName?.[0] || 'U'}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F172A' }}>
                              {emp.firstName} {emp.lastName}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                              {emp.designation} • {emp.employeeId}
                            </div>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          style={{ accentColor: '#0E7490', width: '15px', height: '15px', cursor: 'pointer' }}
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Row 5: 8. DESCRIPTION */}
        <div>
          <label style={labelStyle}>
            Description <span style={{ color: '#EF4444' }}>*</span>
          </label>
          <textarea
            rows={3}
            placeholder="Enter clear task instructions, deliverables, or checklists..."
            value={description}
            onChange={e => {
              setDescription(e.target.value);
              setErrors(prev => ({ ...prev, description: '' }));
            }}
            onKeyDown={preventSpaceEnterPropagation}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '10px',
              border: `1px solid ${errors.description ? '#EF4444' : '#CBD5E1'}`,
              fontSize: '0.84rem',
              color: '#0F172A',
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'inherit',
              boxSizing: 'border-box'
            }}
            required
          />
          {errors.description && (
            <span style={{ color: '#DC2626', fontSize: '0.72rem', fontWeight: 600, marginTop: '3px', display: 'block' }}>
              {errors.description}
            </span>
          )}
        </div>

        {/* Row 6: 9. ATTACHMENT */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Attachment</label>
            <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
              {attachmentsList.length} file(s)
            </span>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            multiple
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '1.5px dashed #CBD5E1',
              borderRadius: '10px',
              padding: '10px 14px',
              background: '#F8FAFC',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: '#ECFEFF',
                  color: '#0E7490',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Upload size={15} />
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F172A' }}>
                  Upload Task Attachment
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                  PDF, Images, Excel, Word or ZIP files
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              style={{
                height: '30px',
                padding: '0 12px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#0E7490',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Browse
            </button>
          </div>

          {attachmentsList.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
              {attachmentsList.map((file, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    borderRadius: '8px',
                    background: '#F1F5F9',
                    border: '1px solid #E2E8F0',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    color: '#1E293B'
                  }}
                >
                  <Paperclip size={12} color="#0E7490" />
                  <span>{file.fileName}</span>
                  <span style={{ color: '#64748B', fontSize: '0.68rem' }}>({file.fileSize})</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(idx)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: '#EF4444',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center'
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </form>

      {/* Sticky Footer */}
      <div
        style={{
          padding: '14px 22px',
          borderTop: '1px solid #E2E8F0',
          background: '#F8FAFC',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '10px',
          flexShrink: 0
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          style={{
            height: '38px',
            padding: '0 18px',
            borderRadius: '10px',
            border: '1px solid #CBD5E1',
            background: '#FFFFFF',
            color: '#475569',
            fontSize: '0.84rem',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          form="assign-task-clean-form"
          disabled={isSubmitting}
          style={{
            height: '38px',
            padding: '0 22px',
            borderRadius: '10px',
            border: 'none',
            background: '#0E7490',
            color: '#FFFFFF',
            fontSize: '0.84rem',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            boxShadow: '0 2px 6px rgba(14, 116, 144, 0.25)'
          }}
        >
          <Check size={16} />
          {isSubmitting ? 'Assigning...' : 'Assign Task'}
        </button>
      </div>
    </div>
  );
};
