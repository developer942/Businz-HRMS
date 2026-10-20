import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { 
  CheckSquare, 
  Calendar, 
  User, 
  Building, 
  FileText, 
  Paperclip, 
  Users, 
  Link2, 
  Upload, 
  X, 
  Check, 
  AlertCircle,
  Search,
  Star
} from 'lucide-react';
import { TaskPriority, TaskSourceType, TaskAssignee, TaskAssigneeRole, TaskAssigneeStatus } from '../../types/tasks';
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

  // Current user identification
  const currentEmpId = currentUser.employeeId || currentUser.id || '';
  const currentEmpName = (currentUser.name || '').trim().toLowerCase();

  // Tasks cannot be assigned to oneself ("oru person own task assign pannakudathu")
  const isSelf = (empOrId: string | { id?: string; employeeId?: string; firstName?: string; lastName?: string }) => {
    if (!empOrId) return false;
    const empId = typeof empOrId === 'string' ? empOrId : (empOrId.employeeId || empOrId.id || '');
    const empObj = typeof empOrId === 'object' && (empOrId.firstName || empOrId.lastName)
      ? empOrId 
      : employees.find(e => e.employeeId === empId || e.id === empId);

    // Check by ID or employeeId
    if (currentEmpId && empId && (empId.toLowerCase() === currentEmpId.toLowerCase())) return true;
    if (currentUser.id && empId && (empId.toLowerCase() === currentUser.id.toLowerCase())) return true;
    if (currentUser.employeeId && empId && (empId.toLowerCase() === currentUser.employeeId.toLowerCase())) return true;
    if (empObj?.id && currentUser.employeeId && (empObj.id.toLowerCase() === currentUser.employeeId.toLowerCase())) return true;
    if (empObj?.employeeId && currentUser.id && (empObj.employeeId.toLowerCase() === currentUser.id.toLowerCase())) return true;

    // Check by email
    if (currentUser.email && empObj && (empObj as any).email && ((empObj as any).email.toLowerCase() === currentUser.email.toLowerCase())) return true;

    // Check by name or partial name
    const targetName = empObj ? `${empObj.firstName || ''} ${empObj.lastName || ''}`.trim().toLowerCase() : '';
    if (currentEmpName && targetName) {
      if (targetName === currentEmpName) return true;
      if (currentEmpName.includes(targetName) || targetName.includes(currentEmpName)) return true;
      const currentParts = currentEmpName.replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(p => p.length > 2 && !['admin', 'manager', 'head', 'ceo', 'lead', 'specialist', 'executive'].includes(p));
      const targetParts = targetName.replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(p => p.length > 2);
      if (currentParts.some(cp => targetParts.some(tp => cp === tp || cp.includes(tp) || tp.includes(cp)))) {
        return true;
      }
    }
    return false;
  };

  // Section 2: Initial Department & non-self employee discovery
  const defaultNonSelfEmp = employees.find(e => !isSelf(e) && e.designation !== 'CEO' && e.employeeId !== 'EMP-000') || employees.find(e => !isSelf(e));
  const initialDept = defaultNonSelfEmp?.department || departments[0]?.name || 'Engineering';

  // Section 1: Task Identification
  const [taskDate, setTaskDate] = useState<string>(today);
  const [taskTitle, setTaskTitle] = useState<string>('');
  const [sourceType, setSourceType] = useState<TaskSourceType>('Direct');
  const [sourceReference, setSourceReference] = useState<string>('');
  const [momNumber, setMomNumber] = useState<string>('');
  const [momItemNumber, setMomItemNumber] = useState<string>('');

  const isCEO = currentUser.role === 'CEO' || currentUser.designation === 'CEO' || currentUser.employeeId === 'EMP-000';

  // Section 2: Ownership & Department
  const [department, setDepartment] = useState<string>(initialDept);

  const isCeoEmp = (emp: any) => {
    return emp.designation?.toLowerCase().includes('ceo') || emp.role === 'CEO' || (emp.department?.toLowerCase() === 'management' && emp.designation?.toLowerCase().includes('director'));
  };

  // Department-scoped assignable employees (ONLY employees belonging to the selected department, excluding creator and excluding CEO)
  const departmentAssignableEmployees = useMemo(() => {
    return employees.filter(emp => !isSelf(emp) && !isCeoEmp(emp) && departmentMatches(emp.department, department, departments));
  }, [employees, departments, department, currentEmpId, currentEmpName, currentUser]);

  const defaultDeptEmp = departmentAssignableEmployees.find(e => e.designation !== 'CEO' && e.employeeId !== 'EMP-000') || departmentAssignableEmployees[0];
  const [responsiblePersonId, setResponsiblePersonId] = useState<string>(defaultDeptEmp?.employeeId || '');
  const [assignedEmployeeIds, setAssignedEmployeeIds] = useState<string[]>(defaultDeptEmp ? [defaultDeptEmp.employeeId] : []);

  // Section 3: Task Planning
  const taskCategory = 'Technical';
  const [priority, setPriority] = useState<TaskPriority>('High');
  const [startDate, setStartDate] = useState<string>(today);
  const [dueDate, setDueDate] = useState<string>(nextWeek);
  const [reviewDate, setReviewDate] = useState<string>('');
  const [relatedProject, setRelatedProject] = useState<string>('');
  const [selectedDependencies, setSelectedDependencies] = useState<string[]>([]);

  // Section 4: Task Description
  const [description, setDescription] = useState<string>('');
  const [expectedOutput, setExpectedOutput] = useState<string>('');

  // Section 5: Attachments
  const [attachmentsList, setAttachmentsList] = useState<{ fileName: string; fileSize: string; fileType: string; fileUrl: string; uploadedBy: string }[]>([]);
  const [newFileName, setNewFileName] = useState<string>('');
  const [resourceLink, setResourceLink] = useState<string>('');
  const [resourceLinkTitle, setResourceLinkTitle] = useState<string>('');

  // Section 6 UI Controls
  const [assigneeSearch, setAssigneeSearch] = useState<string>('');
  const [imageErrorMap, setImageErrorMap] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Synchronize responsible person & assignees whenever department changes
  useEffect(() => {
    const validInDept = departmentAssignableEmployees.find(e => e.designation !== 'CEO' && e.employeeId !== 'EMP-000') || departmentAssignableEmployees[0];

    // Ensure responsible person is in this department
    const isRespValid = departmentAssignableEmployees.some(e => e.employeeId === responsiblePersonId);
    if (!isRespValid || isSelf(responsiblePersonId)) {
      setResponsiblePersonId(validInDept ? validInDept.employeeId : '');
    }

    // Filter assigned IDs to this department only
    setAssignedEmployeeIds(prev => {
      const filtered = prev.filter(id => !isSelf(id) && departmentAssignableEmployees.some(e => e.employeeId === id));
      if (filtered.length === 0 && validInDept) {
        return [validInDept.employeeId];
      }
      return filtered;
    });
  }, [department, departmentAssignableEmployees]);

  // Handle department change from dropdown
  const handleDepartmentChange = (newDept: string) => {
    setDepartment(newDept);
    setAssigneeSearch('');
    setErrors(prev => ({ ...prev, department: '', responsiblePerson: '', assignees: '' }));
  };

  // Handle responsible person change
  const handleResponsibleChange = (empId: string) => {
    if (isSelf(empId)) {
      setErrors(prev => ({ ...prev, responsiblePerson: 'You cannot assign a task to yourself. Please select another team member.' }));
      return;
    }
    setErrors(prev => ({ ...prev, responsiblePerson: '' }));
    setResponsiblePersonId(empId);
    if (empId && !assignedEmployeeIds.includes(empId)) {
      setAssignedEmployeeIds(prev => [...prev.filter(id => !isSelf(id)), empId]);
    }
  };

  // Toggle employee in multi-assignee list
  const toggleAssignee = (empId: string) => {
    if (isSelf(empId)) {
      setErrors(prev => ({ ...prev, assignees: 'You cannot assign a task to yourself. Tasks must be assigned to other team members.' }));
      return;
    }
    setErrors(prev => ({ ...prev, assignees: '' }));
    setAssignedEmployeeIds(prev => {
      if (prev.includes(empId)) {
        if (prev.length === 1) return prev; // Keep at least one
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

  // Select all employees in current department
  const handleSelectAllDept = () => {
    const allIds = departmentAssignableEmployees.map(e => e.employeeId);
    setAssignedEmployeeIds(allIds);
    if (!responsiblePersonId && allIds.length > 0) {
      setResponsiblePersonId(allIds[0]);
    }
    setErrors(prev => ({ ...prev, assignees: '' }));
  };

  // Reset assignees to only responsible lead
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

  // Filtered members by search query within department
  const filteredDeptEmployees = useMemo(() => {
    if (!assigneeSearch.trim()) return departmentAssignableEmployees;
    const q = assigneeSearch.toLowerCase();
    return departmentAssignableEmployees.filter(e => 
      `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) ||
      (e.designation || '').toLowerCase().includes(q) ||
      (e.employeeId || '').toLowerCase().includes(q)
    );
  }, [departmentAssignableEmployees, assigneeSearch]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      const sizeStr = file.size < 1024 * 1024 
        ? `${(file.size / 1024).toFixed(1)} KB` 
        : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;

      // Instant ObjectURL for immediate preview/download
      let fileUrl = '#';
      try {
        fileUrl = URL.createObjectURL(file);
      } catch (err) {
        console.warn('Could not create ObjectURL', err);
      }

      const initialAtt = {
        fileName: file.name,
        fileSize: sizeStr,
        fileType: file.type || 'Document',
        fileUrl: fileUrl,
        uploadedBy: currentUser.name || 'User'
      };

      setAttachmentsList(prev => [...prev, initialAtt]);

      // Also read as data URL if small for permanent offline persistence
      if (file.size < 400 * 1024) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const base64Url = event.target?.result as string;
          if (base64Url) {
            setAttachmentsList(prev => prev.map(item => item.fileName === file.name ? { ...item, fileUrl: base64Url } : item));
          }
        };
        reader.readAsDataURL(file);
      }
    });

    e.target.value = '';
  };

  const handleAddManualAttachment = () => {
    if (!newFileName.trim()) return;
    const name = newFileName.includes('.') ? newFileName.trim() : `${newFileName.trim()}.pdf`;
    setAttachmentsList(prev => [
      ...prev,
      {
        fileName: name,
        fileSize: '1.2 MB',
        fileType: 'Document',
        fileUrl: '#',
        uploadedBy: currentUser.name || 'User'
      }
    ]);
    setNewFileName('');
  };

  const handleRemoveAttachment = (idx: number) => {
    setAttachmentsList(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!taskTitle.trim()) newErrors.taskTitle = 'Task title is required.';
    if (!description.trim()) newErrors.description = 'Task description is required.';

    if (!dueDate) {
      newErrors.dueDate = 'Due date is required.';
    } else {
      const dv = validateRequestDate(dueDate);
      if (!dv.valid) {
        newErrors.dueDate = dv.error || PAST_DATE_ERROR_MESSAGE;
      }
    }

    if (startDate) {
      const sv = validateRequestDate(startDate);
      if (!sv.valid) {
        newErrors.startDate = sv.error || PAST_DATE_ERROR_MESSAGE;
      } else if (dueDate && startDate > dueDate) {
        newErrors.dueDate = INVALID_DATE_RANGE_ORDER_MESSAGE;
      }
    }

    if (assignedEmployeeIds.length === 0) newErrors.assignees = 'At least one employee must be assigned.';

    // Self-assignment prevention check ("oru person own task assign pannakudathu")
    if (isSelf(responsiblePersonId)) {
      newErrors.responsiblePerson = 'You cannot assign a task to yourself. Please select another team member.';
    }
    if (assignedEmployeeIds.some(empId => isSelf(empId))) {
      newErrors.assignees = 'Self-assignment is not permitted. You cannot assign a task to yourself.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const respEmp = employees.find(e => e.employeeId === responsiblePersonId || e.id === responsiblePersonId);

    // Build assignee records
    const assignees: TaskAssignee[] = assignedEmployeeIds.map((empId, idx): TaskAssignee => {
      const emp = employees.find(e => e.employeeId === empId || e.id === empId);
      const isResp = empId === responsiblePersonId;
      return {
        id: `ASN-${Date.now()}-${idx}`,
        taskId: '',
        employeeId: empId,
        employeeName: emp ? `${emp.firstName} ${emp.lastName}` : (empId === currentUser.employeeId ? currentUser.name : 'ASSIGNEE'),
        employeeEmail: emp?.email || '',
        employeeDepartment: emp?.department || department,
        employeeAvatar: emp?.avatar || '',
        role: (isResp ? 'RESPONSIBLE' : 'ASSIGNEE') as TaskAssigneeRole,
        individualStatus: 'Pending' as TaskAssigneeStatus,
        progressPercentage: 0,
        assignedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    });

    // Auto-include any entered manual file name that was not yet added
    let finalAttachments = [...attachmentsList];
    if (newFileName.trim()) {
      const manualName = newFileName.includes('.') ? newFileName.trim() : `${newFileName.trim()}.pdf`;
      finalAttachments.push({
        fileName: manualName,
        fileSize: '1.2 MB',
        fileType: 'Document',
        fileUrl: '#',
        uploadedBy: currentUser.name || 'User'
      });
      setNewFileName('');
    }
    if (resourceLink.trim()) {
      finalAttachments.push({
        fileName: resourceLinkTitle.trim() || 'Reference link',
        fileSize: 'Link',
        fileType: 'URL',
        fileUrl: resourceLink.trim(),
        uploadedBy: currentUser.name || 'User'
      });
    }

    // Create enhanced task
    const created = createEnhancedTask({
      title: taskTitle.trim(),
      taskDate,
      sourceType,
      sourceReference: sourceReference.trim() || undefined,
      momId: sourceType === 'MOM' ? momNumber : undefined,
      momItemNumber: sourceType === 'MOM' ? momItemNumber : undefined,
      createdBy: currentUser.name,
      createdById: currentUser.employeeId || currentUser.id || 'EMP-001',
      assignedBy: `${currentUser.name} (${currentUser.role})`,
      assignedById: currentUser.employeeId || currentUser.id || 'EMP-001',
      responsiblePersonId,
      responsiblePersonName: respEmp ? `${respEmp.firstName} ${respEmp.lastName}` : currentUser.name,
      department,
      taskCategory,
      priority,
      startDate,
      dueDate,
      reviewDate: reviewDate || undefined,
      relatedProject: relatedProject.trim() || undefined,
      dependencyIds: selectedDependencies,
      description: description.trim(),
      expectedOutput: expectedOutput.trim() || description.trim() || 'Task completion',
      assignees,
      attachments: finalAttachments as any
    });

    onTaskCreated(created.id);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="new-task-form-container" style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a' }}>{isCEO ? 'Assign New Task' : 'Create New Task'}</h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Define task details, assignees, deadlines, and deliverables.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel} style={{ fontSize: '0.85rem' }}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Check size={16} /> {isCEO ? 'Assign Task' : 'Create Task'}
          </button>
        </div>
      </div>

      {/* SECTION 1: TASK IDENTIFICATION */}
      <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>1. Task Identification</h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Task Date <span style={{ color: '#EF4444' }}>*</span></label>
            <input 
              type="date"
              value={taskDate}
              onChange={e => setTaskDate(e.target.value)}
              className="form-control"
              style={{ marginTop: '4px', background: '#F8FAFC' }}
              disabled
              aria-disabled="true"
            />
            <span style={{ display: 'block', marginTop: '4px', fontSize: '0.7rem', color: '#64748B' }}>Set automatically when the task is created.</span>
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Task Number</label>
            <input 
              type="text"
              value={`TSK-2026-${(enhancedTasks.length + 1).toString().padStart(3, '0')}`}
              disabled
              className="form-control"
              style={{ marginTop: '4px', background: '#f8fafc', color: '#1e40af', fontWeight: 700 }}
            />
          </div>
        </div>

        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Task Title <span style={{ color: '#EF4444' }}>*</span></label>
          <input 
            type="text"
            placeholder="e.g. Solar Tracker Mounting Structure Quality Inspection"
            value={taskTitle}
            onChange={e => { setTaskTitle(e.target.value); setErrors(prev => ({ ...prev, taskTitle: '' })); }}
            onKeyDown={preventSpaceEnterPropagation}
            className={`form-control ${errors.taskTitle ? 'is-invalid' : ''}`}
            style={{ marginTop: '4px', fontSize: '0.9rem', fontWeight: 600 }}
            required
          />
          {errors.taskTitle && <span style={{ color: '#dc2626', fontSize: '0.75rem' }}>{errors.taskTitle}</span>}
        </div>
      </div>

      {/* SECTION 2: OWNERSHIP & CLASSIFICATION */}
      <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>2. Ownership & Department</h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Assigned By</label>
            <input 
              type="text"
              value={`${currentUser.name} (${currentUser.role})`}
              disabled
              className="form-control"
              style={{ marginTop: '4px', background: '#f8fafc', color: 'var(--text-muted)' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Department <span style={{ color: '#EF4444' }}>*</span></label>
            <select 
              value={department}
              onChange={e => handleDepartmentChange(e.target.value)}
              className="form-control"
              style={{ marginTop: '4px' }}
              required
            >
              {departments.map(d => (
                <option key={d.id} value={d.name}>{d.name}</option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Responsible Person <span style={{ color: '#EF4444' }}>*</span></label>
              <span style={{ fontSize: '0.68rem', color: '#0E7490', fontWeight: 600 }}>From {department}</span>
            </div>
            <select 
              value={responsiblePersonId}
              onChange={e => handleResponsibleChange(e.target.value)}
              className={`form-control ${errors.responsiblePerson ? 'is-invalid' : ''}`}
              style={{ marginTop: '4px' }}
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
            {errors.responsiblePerson && <span style={{ color: '#dc2626', fontSize: '0.75rem' }}>{errors.responsiblePerson}</span>}
          </div>
        </div>
      </div>

      {/* SECTION 3: TASK PLANNING */}
      <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>3. Planning & Schedule</h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '16px' }}>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Priority <span style={{ color: '#EF4444' }}>*</span></label>
            <select 
              value={priority} 
              onChange={e => setPriority(e.target.value as any)}
              className="form-control"
              style={{ marginTop: '4px', fontWeight: 600 }}
              required
            >
              <option value="Urgent">Urgent / Critical</option>
              <option value="High">High Priority</option>
              <option value="Medium">Medium Priority</option>
              <option value="Low">Low Priority</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Start Date</label>
            <input 
              type="date"
              value={startDate}
              min={getTodayKolkata()}
              onChange={e => setStartDate(e.target.value)}
              className="form-control"
              style={{ marginTop: '4px' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Due Date <span style={{ color: '#EF4444' }}>*</span></label>
            <input 
              type="date"
              value={dueDate}
              min={startDate || getTodayKolkata()}
              onChange={e => { setDueDate(e.target.value); setErrors(prev => ({ ...prev, dueDate: '' })); }}
              className={`form-control ${errors.dueDate ? 'is-invalid' : ''}`}
              style={{ marginTop: '4px', fontWeight: 600 }}
              required
            />
            {errors.dueDate && <span style={{ color: '#dc2626', fontSize: '0.75rem' }}>{errors.dueDate}</span>}
          </div>
        </div>
      </div>

      {/* SECTION 4: TASK DESCRIPTION & DELIVERABLES */}
      <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>4. Task Description</h3>
        </div>

        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Task Description <span style={{ color: '#EF4444' }}>*</span></label>
          <textarea 
            rows={4}
            placeholder="Provide operational requirements, fabrication specifications, site location details, or execution steps..."
            value={description}
            onChange={e => { setDescription(e.target.value); setErrors(prev => ({ ...prev, description: '' })); }}
            onKeyDown={preventSpaceEnterPropagation}
            className={`form-control ${errors.description ? 'is-invalid' : ''}`}
            style={{ marginTop: '4px', resize: 'vertical' }}
            required
          />
          {errors.description && <span style={{ color: '#dc2626', fontSize: '0.75rem' }}>{errors.description}</span>}
        </div>
      </div>

      {/* SECTION 5: ATTACHMENTS */}
      <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>5. Attachments</h3>
          <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600 }}>
            {attachmentsList.length} {attachmentsList.length === 1 ? 'file' : 'files'} attached
          </span>
        </div>

        {/* Hidden Real File Input */}
        <input 
          type="file"
          ref={fileInputRef}
          multiple
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />

        {/* Real File Upload Dropzone / Trigger */}
        <div 
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              const fakeEvent = { target: { files: e.dataTransfer.files, value: '' } } as any;
              handleFileUpload(fakeEvent);
            }
          }}
          style={{
            border: '2px dashed #CBD5E1',
            borderRadius: '12px',
            padding: '20px 16px',
            textAlign: 'center',
            backgroundColor: '#F8FAFC',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            marginBottom: '14px'
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = '#0E7490'}
          onMouseLeave={e => e.currentTarget.style.borderColor = '#CBD5E1'}
        >
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            backgroundColor: '#ECFEFF',
            color: '#0E7490',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 8px'
          }}>
            <Upload size={18} />
          </div>
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1E293B', marginBottom: '2px' }}>
            Click to upload files from your device
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '10px' }}>
            Supports PDF, DOCX, XLSX, images, zip (multiple files supported)
          </div>
          <button 
            type="button" 
            className="btn btn-primary btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            style={{ 
              fontSize: '0.82rem', 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '6px',
              padding: '6px 16px',
              borderRadius: '8px',
              fontWeight: 700,
              backgroundColor: '#0E7490',
              border: 'none',
              color: '#FFFFFF',
              cursor: 'pointer'
            }}
          >
            <Upload size={14} /> Add File
          </button>
        </div>

        {attachmentsList.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {attachmentsList.map((file, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Paperclip size={16} color="#0E7490" />
                  <div>
                    <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#1E293B' }}>{file.fileName}</span>
                    <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                      {file.fileSize} • Uploaded by {file.uploadedBy}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {file.fileUrl && file.fileUrl !== '#' && (
                    <a 
                      href={file.fileUrl} 
                      download={file.fileName}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                    >
                      Download
                    </a>
                  )}
                  <button 
                    type="button" 
                    onClick={() => handleRemoveAttachment(idx)} 
                    style={{ color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                    title="Remove file"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 6: REFERENCE LINK */}
      <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>
          <Link2 size={17} color="#0E7490" />
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>Reference Link</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
          <input className="form-control" value={resourceLinkTitle} onChange={e => setResourceLinkTitle(e.target.value)} placeholder="Link name (optional)" />
          <input className="form-control" type="url" value={resourceLink} onChange={e => setResourceLink(e.target.value)} placeholder="https://docs.example.com/..." />
        </div>
        <span style={{ display: 'block', marginTop: '6px', fontSize: '0.72rem', color: '#64748B' }}>Add a Google Drive, GitHub, Figma, website, or other project URL.</span>
      </div>

      {/* SECTION 7: MULTI-EMPLOYEE TASK ASSIGNMENT */}
      <div className="card" style={{ padding: '20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '14px', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
          <div>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: '#0F172A' }}>
              6. Assignees
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
              Assign one or more team members from the <strong>{department}</strong> department to execute this task.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ 
              fontSize: '0.74rem', 
              fontWeight: 700, 
              color: '#0E7490', 
              background: '#ECFEFF', 
              padding: '4px 10px', 
              borderRadius: '9999px',
              border: '1px solid #CFFAFE',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px'
            }}>
              <Building size={12} /> {department} ({departmentAssignableEmployees.length})
            </span>

            {departmentAssignableEmployees.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={handleSelectAllDept}
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: '1px solid #E2E8F0',
                    background: '#FFFFFF',
                    color: '#475569',
                    cursor: 'pointer'
                  }}
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleClearAssignees}
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: '1px solid #E2E8F0',
                    background: '#FFFFFF',
                    color: '#475569',
                    cursor: 'pointer'
                  }}
                >
                  Reset
                </button>
              </>
            )}
          </div>
        </div>

        {errors.assignees && (
          <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '8px 12px', borderRadius: '8px', fontSize: '0.8rem', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertCircle size={14} /> {errors.assignees}
          </div>
        )}

        {departmentAssignableEmployees.length === 0 ? (
          <div style={{ 
            padding: '32px 20px', 
            textAlign: 'center', 
            background: '#F8FAFC', 
            borderRadius: '12px', 
            border: '1px dashed #CBD5E1', 
            color: '#64748B' 
          }}>
            <Users size={32} color="#94A3B8" style={{ marginBottom: '8px' }} />
            <div style={{ fontWeight: 700, color: '#1E293B', fontSize: '0.9rem' }}>
              No assignable team members in {department}
            </div>
            <div style={{ fontSize: '0.78rem', marginTop: '4px' }}>
              Change the Department in Section 2 above to assign members from another department.
            </div>
          </div>
        ) : (
          <>
            {departmentAssignableEmployees.length > 4 && (
              <div style={{ marginBottom: '12px', position: 'relative' }}>
                <Search size={13} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder={`Search in ${department}...`}
                  value={assigneeSearch}
                  onChange={e => setAssigneeSearch(e.target.value)}
                  style={{
                    height: '32px',
                    paddingLeft: '28px',
                    paddingRight: '10px',
                    fontSize: '0.78rem',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    outline: 'none',
                    width: '220px',
                    background: '#FFFFFF'
                  }}
                />
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
              {filteredDeptEmployees.map(emp => {
                const isAssigned = assignedEmployeeIds.includes(emp.employeeId);
                const isResponsible = emp.employeeId === responsiblePersonId;

                return (
                  <div 
                    key={emp.id} 
                    onClick={() => toggleAssignee(emp.employeeId)}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      padding: '11px 14px', 
                      borderRadius: '12px', 
                      border: isAssigned ? '2px solid #0E7490' : '1px solid #E2E8F0',
                      background: isAssigned ? '#F0FDFA' : '#FFFFFF',
                      boxShadow: isAssigned ? '0 3px 10px rgba(14, 116, 144, 0.08)' : '0 1px 2px rgba(0,0,0,0.02)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      userSelect: 'none'
                    }}
                    onMouseEnter={e => {
                      if (!isAssigned) {
                        e.currentTarget.style.borderColor = '#CBD5E1';
                        e.currentTarget.style.background = '#F8FAFC';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isAssigned) {
                        e.currentTarget.style.borderColor = '#E2E8F0';
                        e.currentTarget.style.background = '#FFFFFF';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      {emp.avatar && !imageErrorMap[emp.id] ? (
                        <img 
                          src={emp.avatar} 
                          alt={emp.firstName} 
                          onError={() => setImageErrorMap(prev => ({ ...prev, [emp.id]: true }))}
                          style={{ width: '38px', height: '38px', borderRadius: '10px', objectFit: 'cover', flexShrink: 0 }} 
                        />
                      ) : (
                        <div style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '10px',
                          backgroundColor: isAssigned ? '#ECFEFF' : '#F1F5F9',
                          color: isAssigned ? '#0E7490' : '#475569',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          border: isAssigned ? '1px solid #CFFAFE' : '1px solid #E2E8F0',
                          flexShrink: 0
                        }}>
                          {emp.firstName?.[0] || ''}{emp.lastName?.[0] || ''}
                        </div>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ 
                          fontWeight: 700, 
                          fontSize: '0.86rem', 
                          color: '#0F172A',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {emp.firstName} {emp.lastName}
                        </div>
                        <div style={{ 
                          fontSize: '0.72rem', 
                          color: 'var(--text-secondary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {emp.designation} • {emp.employeeId}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '8px' }}>
                      <span style={{ 
                        fontSize: '0.67rem', 
                        fontWeight: 600, 
                        padding: '2px 8px', 
                        borderRadius: '9999px',
                        background: isAssigned ? '#E0F2FE' : '#F8FAFC',
                        color: isAssigned ? '#0369A1' : '#94A3B8',
                        border: isAssigned ? '1px solid #BAE6FD' : '1px solid #E2E8F0'
                      }}>
                        {isAssigned ? 'Assigned' : 'Unassigned'}
                      </span>

                      <input 
                        type="checkbox" 
                        checked={isAssigned}
                        onChange={() => {}} // Handled by parent div
                        style={{ 
                          accentColor: '#0E7490', 
                          width: '16px', 
                          height: '16px', 
                          cursor: 'pointer' 
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

          </>
        )}
      </div>

      {/* Form Actions Footer */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingBottom: '30px' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} style={{ fontSize: '0.9rem', padding: '10px 20px' }}>
          Cancel
        </button>
        <button 
          type="submit" 
          disabled={isSubmitting}
          className="btn btn-primary" 
          style={{ 
            fontSize: '0.9rem', 
            padding: '10px 24px', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            opacity: isSubmitting ? 0.7 : 1,
            cursor: isSubmitting ? 'not-allowed' : 'pointer'
          }}
        >
          <Check size={18} /> {isSubmitting ? 'Saving Task...' : (isCEO ? 'Assign Task' : 'Create Task')}
        </button>
      </div>
    </form>
  );
};
