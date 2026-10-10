import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { 
  X, 
  CheckCircle2, 
  RotateCcw, 
  Upload, 
  Download,
  Plus,
  FileText,
  Check,
  Paperclip,
  Send,
  Lock,
  Calendar,
  Link2,
  ExternalLink,
  Trash2,
  Pencil,
  Save
} from 'lucide-react';
import { TaskItemEnhanced, TaskAssigneeStatus, TaskDailyReport, computeDueStatus } from '../../types/tasks';
import { ExportDropdown } from '../common/ExportDropdown';
import { downloadCSV, downloadExcel, downloadPDF } from '../../utils/exportUtils';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';

interface TaskDetailModalProps {
  taskId: string;
  onClose: () => void;
}

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({ taskId, onClose }) => {
  const { enhancedTasks } = useHRMS();
  if (!enhancedTasks.some(t => t.id === taskId)) return null;
  return <TaskDetailModalInner taskId={taskId} onClose={onClose} />;
};

const TaskDetailModalInner: React.FC<TaskDetailModalProps> = ({ taskId, onClose }) => {
  const { 
    enhancedTasks, 
    businessSettings,
    currentUser, 
    closeTask, 
    reopenTask, 
    addTaskAttachment,
    addTaskDailyReport,
    updateTaskProcessStatus,
    updateEnhancedTask,
    markTaskViewed,
    markTaskDailyReportsSeen,
    addTaskLink,
    deleteTaskLink
  } = useHRMS();

  // Daily report inputs
  const [dailyDate, setDailyDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [dailyWorkDone, setDailyWorkDone] = useState<string>('');
  const dailyTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Link inputs & state
  const [isAddingLink, setIsAddingLink] = useState<boolean>(false);
  const [linkTitle, setLinkTitle] = useState<string>('');
  const [linkUrl, setLinkUrl] = useState<string>('');
  const [linkError, setLinkError] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitSuccessMsg, setSubmitSuccessMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close & Reopen modals
  const [showClosePrompt, setShowClosePrompt] = useState<boolean>(false);
  const [closeRemarks, setCloseRemarks] = useState<string>('');
  const [showReopenPrompt, setShowReopenPrompt] = useState<boolean>(false);
  const [reopenReason, setReopenReason] = useState<string>('');
  const [isEditingTask, setIsEditingTask] = useState<boolean>(false);

  const task = enhancedTasks.find(t => t.id === taskId)!;
  const [editTaskForm, setEditTaskForm] = useState({
    title: task.title,
    description: task.description,
    expectedOutput: task.expectedOutput,
    dueDate: task.dueDate,
    priority: task.priority,
    taskCategory: task.taskCategory
  });

  const currentEmpId = currentUser.employeeId || currentUser.id || 'EMP-001';
  const myAssignee = task.assignees.find(a => 
    a.employeeId === currentEmpId ||
    a.employeeId === currentUser.id ||
    (currentUser.name && a.employeeName?.toLowerCase().includes(currentUser.name.toLowerCase()))
  ) || task.assignees[0];

  // Process Stage (1 of 4: Pending, In Process, Under Review, Completed)
  const currentStage: TaskAssigneeStatus = (myAssignee?.individualStatus) || 
    (task.overallStatus === 'COMPLETED' || task.overallStatus === 'CLOSED' ? 'Completed' :
     task.overallStatus === 'IN PROGRESS' ? 'In Process' : 'Pending');

  const [selectedStage, setSelectedStage] = useState<TaskAssigneeStatus>(currentStage);

  useEffect(() => {
    setSelectedStage(currentStage);
  }, [currentStage]);

  const dueStatus = computeDueStatus(task.dueDate, task.overallStatus);
  const taskDailyReports: TaskDailyReport[] = task.dailyReports || [];

  // Authority & Role checks
  const currentEmpName = (currentUser.name || '').trim().toLowerCase();
  const isSuperAdmin = currentUser.role === 'Super Admin' || currentUser.role === 'ERP Administrator';
  const isCEO = isSuperAdmin || currentUser.role === 'CEO' || (currentUser as any).designation?.toLowerCase().includes('ceo') || (currentUser as any).role?.toLowerCase().includes('ceo');
  const isHR = currentUser.role === 'HR Manager' || currentUser.role === 'HR Admin' || (currentUser as any).department?.toLowerCase().includes('hr') || (currentUser as any).role?.toLowerCase().includes('hr');
  const isAssigner = 
    (task.assignedBy && task.assignedBy.toLowerCase().includes(currentEmpName)) ||
    (task.createdBy && task.createdBy.toLowerCase().includes(currentEmpName)) ||
    task.responsiblePersonId === currentEmpId ||
    task.responsiblePersonId === currentUser.id;
  const isResponsiblePerson = task.responsiblePersonId === currentEmpId || 
    task.responsiblePersonId === currentUser.id ||
    Boolean(currentEmpName && task.responsiblePersonName && task.responsiblePersonName.toLowerCase().includes(currentEmpName));
  const isAssignee = task.assignees.some(a => 
    (a.employeeId && (a.employeeId === currentEmpId || a.employeeId === currentUser.id)) || 
    (currentEmpName && a.employeeName && a.employeeName.toLowerCase().includes(currentEmpName)) ||
    (currentEmpName && a.employeeName && currentEmpName.includes(a.employeeName.toLowerCase()))
  );
  const canEditTaskDetails = isCEO || isHR || isSuperAdmin || isAssigner || isResponsiblePerson;

  useEffect(() => {
    markTaskViewed(task.id);
    if (isAssigner || isResponsiblePerson || isCEO || isHR || isSuperAdmin) {
      markTaskDailyReportsSeen(task.id);
    }
  }, [task.id, isAssigner, isResponsiblePerson, isCEO, isHR, isSuperAdmin]);

  // Process Stage status can ONLY be edited by the assigned person (or responsible person if no assignees assigned)
  const canEditProcess = isAssignee || (task.assignees.length === 0 && isResponsiblePerson);

  // Daily Reports: HR, CEO, Assigner, and Assigned Person can view AND submit daily reports
  const canSubmitDailyReport = isCEO || isHR || isAssigner || isAssignee || isResponsiblePerson;
  const canViewReports = isCEO || isHR || isAssigner || isAssignee || isResponsiblePerson;
  // Report downloads: ONLY HR and CEO can download (overall and single person reports)
  const canDownloadReport = isCEO || isHR;
  const visibleReports = taskDailyReports;

  // Task Do Person: ONLY the person doing/assigned to the task can give/add links
  // ("TASK DO PERSON ONLY GIVE THE LINK EG:MY TASK KU NATHA LINK KUDUKANUM")
  const isTaskDoer = isAssignee || (task.assignees.length === 0 && isResponsiblePerson);
  const canAddLink = isTaskDoer;
  const canDeleteLink = isTaskDoer || isSuperAdmin;

  const handleSaveTaskEdits = () => {
    if (!canEditTaskDetails || !editTaskForm.title.trim()) return;
    updateEnhancedTask(task.id, {
      title: editTaskForm.title.trim(),
      description: editTaskForm.description.trim(),
      expectedOutput: editTaskForm.expectedOutput.trim(),
      dueDate: editTaskForm.dueDate,
      priority: editTaskForm.priority,
      taskCategory: editTaskForm.taskCategory.trim() || task.taskCategory
    });
    setIsEditingTask(false);
  };

  const handleAddLink = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canAddLink) return;
    const trimmedUrl = linkUrl.trim();
    if (!trimmedUrl) {
      setLinkError('Please enter a valid URL / link');
      return;
    }
    addTaskLink(task.id, {
      title: linkTitle.trim() || trimmedUrl,
      url: trimmedUrl
    });
    setLinkTitle('');
    setLinkUrl('');
    setLinkError('');
    setIsAddingLink(false);
  };

  const canClose = (isResponsiblePerson || isHR || isCEO) && task.overallStatus !== 'CLOSED';
  const canReopen = (isResponsiblePerson || isHR || isCEO) && task.overallStatus === 'CLOSED';

  // Task Start Date and Timeline calculation from the day task started
  const taskStartDateStr = task.startDate || task.taskDate || (task.createdAt ? task.createdAt.split('T')[0] : '') || new Date().toISOString().split('T')[0];
  const todayStr = new Date().toISOString().split('T')[0];

  // Daily reports timeline starting from the date the task started (Task Start Date)
  const dailyReportTimeline = useMemo(() => {
    const list: { dateStr: string; dayIndex: number; reports: TaskDailyReport[] }[] = [];
    
    // Parse start date and today
    const [sY, sM, sD] = taskStartDateStr.split('-').map(Number);
    const start = new Date(sY, (sM || 1) - 1, sD || 1);
    
    const [tY, tM, tD] = todayStr.split('-').map(Number);
    const today = new Date(tY, (tM || 1) - 1, tD || 1);
    
    // End date should be at least today, or if start is in future, at least start
    const end = today.getTime() >= start.getTime() ? today : start;
    
    const cur = new Date(start);
    let day = 1;
    while (cur.getTime() <= end.getTime()) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const d = String(cur.getDate()).padStart(2, '0');
      const dStr = `${y}-${m}-${d}`;
      
      const matching = taskDailyReports.filter(r => r.reportDate === dStr);
      list.push({
        dateStr: dStr,
        dayIndex: day,
        reports: matching
      });
      
      cur.setDate(cur.getDate() + 1);
      day++;
    }
    
    // Also include any reports with dates outside range (e.g. future or prior)
    taskDailyReports.forEach(r => {
      if (!list.some(item => item.dateStr === r.reportDate)) {
        list.push({
          dateStr: r.reportDate,
          dayIndex: 0,
          reports: [r]
        });
      }
    });

    return list;
  }, [taskStartDateStr, todayStr, taskDailyReports]);

  // Export all task daily reports (ONLY for HR and CEO)
  const getTaskReportsExportData = () => {
    const columns = [
      { key: 'reportDate', label: 'Report Date' },
      { key: 'employeeName', label: 'Employee Name' },
      { key: 'employeeDepartment', label: 'Department' },
      { key: 'processStatus', label: 'Workflow Stage' },
      { key: 'workDoneToday', label: 'Work Completed Today' },
      { key: 'planForTomorrow', label: 'Plan For Tomorrow' },
      { key: 'blockersOrIssues', label: 'Blockers / Issues' }
    ];

    const data = taskDailyReports.map(r => ({
      reportDate: r.reportDate,
      employeeName: r.employeeName,
      employeeDepartment: r.employeeDepartment || task.department,
      processStatus: r.processStatus,
      workDoneToday: r.workDoneToday,
      planForTomorrow: r.planForTomorrow || 'N/A',
      blockersOrIssues: r.blockersOrIssues || 'None'
    }));

    const filename = `Task_${task.taskNumber}_Daily_Reports_${new Date().toISOString().split('T')[0]}`;
    const title = `${task.taskNumber} - Daily Execution Reports`;

    return { columns, data, filename, title };
  };

  const handleExportTaskDailyPDF = () => {
    if (!canDownloadReport) return;
    const { columns, data, filename, title } = getTaskReportsExportData();
    downloadPDF(data, title, filename, columns, businessSettings?.businessName || 'Businz');
  };

  const handleExportTaskDailyExcel = () => {
    if (!canDownloadReport) return;
    const { columns, data, filename } = getTaskReportsExportData();
    downloadExcel(data, filename, columns);
  };

  const handleExportTaskDailyCSV = () => {
    if (!canDownloadReport) return;
    const { columns, data, filename } = getTaskReportsExportData();
    downloadCSV(data, filename, columns);
  };

  // Final Submit Handler for Submit Button (Updates status and submits daily report)
  const handleFinalSubmit = () => {
    setIsSubmitting(true);

    // 1. Submit daily report if entered
    if (dailyWorkDone.trim()) {
      const reportStatus = canEditProcess ? selectedStage : (task.overallStatus === 'COMPLETED' ? 'Completed' : 'In Process');
      addTaskDailyReport(task.id, {
        reportDate: dailyDate,
        workDoneToday: dailyWorkDone.trim(),
        processStatus: reportStatus
      });
      setDailyWorkDone('');
    }

    // 2. Always synchronize/update process stage if assigned person
    if (canEditProcess) {
      updateTaskProcessStatus(task.id, selectedStage, dailyWorkDone.trim() || undefined, myAssignee?.id || myAssignee?.employeeId);
    }

    // 3. Show feedback & close
    setSubmitSuccessMsg(`✓ Daily updates submitted! Visible to CEO, HR, and Assigned Person.`);
    setTimeout(() => {
      setIsSubmitting(false);
      onClose();
    }, 1000);
  };

  const handleSubmitDailyReport = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!dailyWorkDone.trim()) return;

    const reportStatus = canEditProcess ? selectedStage : (task.overallStatus === 'COMPLETED' ? 'Completed' : 'In Process');

    addTaskDailyReport(task.id, {
      reportDate: dailyDate,
      workDoneToday: dailyWorkDone.trim(),
      processStatus: reportStatus
    });

    // Synchronize process status if authorized
    if (canEditProcess) {
      updateTaskProcessStatus(task.id, selectedStage, dailyWorkDone.trim(), myAssignee?.id || myAssignee?.employeeId);
    }

    setDailyWorkDone('');
    setSubmitSuccessMsg(`✓ Daily report for ${dailyDate} submitted! Visible to CEO, HR, and Assigned Person.`);
    setTimeout(() => setSubmitSuccessMsg(null), 3500);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      const sizeStr = file.size < 1024 * 1024 
        ? `${(file.size / 1024).toFixed(1)} KB` 
        : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;

      let initialUrl = '#';
      try {
        initialUrl = URL.createObjectURL(file);
      } catch (err) {
        console.warn('Could not create ObjectURL', err);
      }

      addTaskAttachment(task.id, {
        fileName: file.name,
        fileSize: sizeStr,
        fileType: file.type || 'Document',
        fileUrl: initialUrl,
        uploadedBy: `${currentUser.name} (${currentUser.role})`
      });

      if (file.size < 400 * 1024) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const base64Url = (event.target?.result as string) || '#';
          if (base64Url && base64Url !== '#') {
            // Updated in background if needed
          }
        };
        reader.readAsDataURL(file);
      }
    });

    e.target.value = '';
  };



  const handleExecuteClose = (e: React.FormEvent) => {
    e.preventDefault();
    closeTask(task.id, currentUser.name, closeRemarks.trim() || 'Verified and approved.');
    setShowClosePrompt(false);
  };

  const handleExecuteReopen = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenReason.trim()) return;
    reopenTask(task.id, currentUser.name, reopenReason.trim());
    setShowReopenPrompt(false);
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 60, backdropFilter: 'blur(4px)', backgroundColor: 'rgba(15, 23, 42, 0.6)' }}>
      <div className="modal-content" style={{ maxWidth: '860px', maxHeight: '92vh', display: 'flex', flexDirection: 'column', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 45px rgba(14, 116, 144, 0.15)', border: '1px solid #E7ECF3' }}>
        
        {/* ======================================================== */}
        {/* HEADER: Software Theme Color (#0E7490 Deep Teal)         */}
        {/* ======================================================== */}
        <div style={{ background: '#0E7490', color: '#FFFFFF', padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ flex: 1, marginRight: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.78rem', color: '#FFFFFF', background: 'rgba(255, 255, 255, 0.2)', padding: '2px 8px', borderRadius: '6px' }}>
                {task.taskNumber}
              </span>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: '#FEF3C7', color: '#92400E' }}>
                {task.priority}
              </span>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: '#ECFEFF', color: '#0E7490' }}>
                ● {currentStage}
              </span>
              {task.editedAt && (
                <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: '#F1F5F9', color: '#475569' }}>
                  Edited
                </span>
              )}
            </div>
            <h2 style={{ fontSize: '1.18rem', fontWeight: 700, margin: 0, color: '#FFFFFF', lineHeight: 1.3 }}>
              {task.title}
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {canEditTaskDetails && (
              <button 
                type="button"
                className="btn btn-sm"
                onClick={() => setIsEditingTask(prev => !prev)}
                style={{ background: '#FFFFFF', color: '#0E7490', fontSize: '0.75rem', borderRadius: '8px', padding: '6px 12px', border: 'none', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Pencil size={14} /> Edit
              </button>
            )}
            {canReopen && (
              <button 
                type="button"
                className="btn btn-sm"
                onClick={() => setShowReopenPrompt(true)}
                style={{ background: '#F59E0B', color: '#fff', fontSize: '0.75rem', borderRadius: '8px', padding: '6px 12px', border: 'none', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <RotateCcw size={14} /> Reopen
              </button>
            )}
            <button 
              type="button"
              onClick={onClose}
              style={{ color: '#FFFFFF', background: 'rgba(255,255,255,0.15)', border: 'none', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* UNIFIED SINGLE PAGE BODY (1, 2, 3, 4 IN SINGLE SHEET)    */}
        {/* ======================================================== */}
        <div style={{ overflowY: 'auto', padding: '22px', flex: 1, background: '#F7F9FC', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Submission Success Banner */}
          {submitSuccessMsg && (
            <div style={{
              background: '#DCFCE7',
              color: '#166534',
              border: '1px solid #86EFAC',
              borderRadius: '10px',
              padding: '12px 16px',
              fontSize: '0.84rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 2px 5px rgba(22, 101, 52, 0.1)'
            }}>
              <CheckCircle2 size={18} color="#16A34A" /> {submitSuccessMsg}
            </div>
          )}

          {isEditingTask && (
            <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '18px 20px', border: '1px solid #CFFAFE', boxShadow: '0 1px 3px rgba(14,116,144,0.08)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) 150px 150px', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Task Title</label>
                  <input className="form-control" value={editTaskForm.title} onChange={e => setEditTaskForm(prev => ({ ...prev, title: e.target.value }))} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Due Date</label>
                  <input type="date" className="form-control" value={editTaskForm.dueDate} onChange={e => setEditTaskForm(prev => ({ ...prev, dueDate: e.target.value }))} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Priority</label>
                  <select className="form-control" value={editTaskForm.priority} onChange={e => setEditTaskForm(prev => ({ ...prev, priority: e.target.value as any }))}>
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Description</label>
                  <textarea className="form-control" rows={3} value={editTaskForm.description} onChange={e => setEditTaskForm(prev => ({ ...prev, description: e.target.value }))} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Expected Output</label>
                  <textarea className="form-control" rows={3} value={editTaskForm.expectedOutput} onChange={e => setEditTaskForm(prev => ({ ...prev, expectedOutput: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setIsEditingTask(false)}>Cancel</button>
                <button type="button" className="btn btn-primary btn-sm" onClick={handleSaveTaskEdits} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Save size={14} /> Save Changes
                </button>
              </div>
            </div>
          )}

          {/* ------------------------------------------------------ */}
          {/* 1. TASK ASSIGNMENT & SCOPE (SINGLE CLEAN BOX)          */}
          {/* ------------------------------------------------------ */}
          <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '18px 20px', border: '1px solid #E7ECF3', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid #F1F5F9' }}>
              <span style={{ background: '#0E7490', color: '#FFFFFF', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.74rem', fontWeight: 800 }}>1</span>
              <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#1E293B', margin: 0 }}>
                Task Assignment &amp; Scope
              </h3>
            </div>

            {/* 4-Column Metadata Grid directly inside single box */}
            {(() => {
              const rawBy = (task.assignedBy || task.createdBy || '').replace(/\s*\([^)]*\)/g, '').trim().toLowerCase();
              const isSelfAssigned = task.assignees.some(a => {
                const aName = (a.employeeName || '').trim().toLowerCase();
                return aName && rawBy && (aName === rawBy || rawBy.includes(aName) || aName.includes(rawBy));
              });
              const displayAssignedBy = isSelfAssigned ? 'Velmurugan (CEO)' : (task.assignedBy || task.createdBy || 'HR/CEO');

              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', paddingBottom: '14px', borderBottom: '1px solid #F1F5F9' }}>
                  <div>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', display: 'block' }}>Assigned By</span>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#1E293B', marginTop: '2px' }}>{displayAssignedBy}</div>
                  </div>

                  <div>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', display: 'block' }}>Assigned To</span>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#1E293B', marginTop: '2px' }}>
                      {task.assignees.map(a => a.employeeName).join(', ') || 'Assigned Person'}
                    </div>
                    <span style={{ fontSize: '0.68rem', color: '#16A34A', fontWeight: 600 }}>{task.department} Dept</span>
                  </div>

                  <div>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', display: 'block' }}>Due Date</span>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: dueStatus === 'Overdue' ? '#DC2626' : '#1E293B', marginTop: '2px' }}>{formatDateDDMMYYYY(task.dueDate)}</div>
                    <span style={{ fontSize: '0.68rem', color: '#64748B' }}>Status: {dueStatus}</span>
                  </div>

                  <div>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', display: 'block' }}>Task Category</span>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#1E293B', marginTop: '2px' }}>{task.taskCategory}</div>
                    <span style={{ fontSize: '0.68rem', color: '#64748B' }}>Start: {formatDateDDMMYYYY(task.startDate || task.taskDate)}</span>
                  </div>
                </div>
              );
            })()}

            {/* Description directly inside single box */}
            <div style={{ paddingTop: '12px' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Description:</span>
              <p style={{ margin: '4px 0 0', fontSize: '0.84rem', color: '#334155', lineHeight: 1.5 }}>
                {task.description || 'No description provided.'}
              </p>
            </div>

            {/* Reference attachments directly inside single box */}
            {task.attachments && task.attachments.length > 0 && (
              <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #F1F5F9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <Paperclip size={14} color="#0E7490" />
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0E7490', textTransform: 'uppercase' }}>
                    Task Reference Attachments ({task.attachments.length})
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {task.attachments.map(att => (
                    <a
                      key={att.id}
                      href={att.fileUrl}
                      download={att.fileName}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 12px',
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '6px',
                        textDecoration: 'none',
                        color: '#1E293B',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        transition: 'all 0.15s ease'
                      }}
                      title={`Download ${att.fileName}`}
                    >
                      <FileText size={15} color="#0E7490" />
                      <span>{att.fileName}</span>
                      <Download size={14} color="#0E7490" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ------------------------------------------------------ */}
          {/* 2. PROCESS STAGE & INDEPENDENT ASSIGNEE STATUSES        */}
          {/* ------------------------------------------------------ */}
          <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '18px 20px', border: '1px solid #E7ECF3', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', paddingBottom: '14px', borderBottom: '1px solid #F1F5F9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ background: '#0E7490', color: '#FFFFFF', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.74rem', fontWeight: 800 }}>2</span>
                <div>
                  <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#1E293B', margin: 0 }}>
                    {task.assignees.length > 1 ? `Team Member Updates (${task.assignees.length} Members)` : 'Process Stage'}
                  </h3>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                    Overall Task Progress • Status: <strong style={{ color: task.overallStatus === 'COMPLETED' ? '#16A34A' : '#0E7490' }}>{task.overallStatus}</strong>
                    {task.assignees.length > 1 && (
                      <span style={{ marginLeft: '6px', color: '#64748B' }}>
                        ({task.assignees.filter(a => a.individualStatus === 'Completed' || a.progressPercentage === 100).length} of {task.assignees.length} members completed)
                      </span>
                    )}
                  </div>
                </div>
              </div>

            </div>

            {/* If Single Assignee */}
            {task.assignees.length <= 1 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '14px', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ fontSize: '0.82rem', color: '#334155', fontWeight: 600 }}>
                  Assignee: <strong>{task.assignees[0]?.employeeName || 'Assigned Person'}</strong> ({task.assignees[0]?.individualStatus || 'Pending'})
                </div>
                {canEditProcess ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>Change Status:</label>
                    <select
                      value={task.assignees[0]?.individualStatus || selectedStage}
                      onChange={(e) => {
                        const newSt = e.target.value as TaskAssigneeStatus;
                        setSelectedStage(newSt);
                        updateTaskProcessStatus(task.id, newSt, undefined, task.assignees[0]?.id || task.assignees[0]?.employeeId);
                      }}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '8px',
                        border: '1.5px solid #0E7490',
                        background: '#ECFEFF',
                        color: '#0E7490',
                        fontWeight: 700,
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        outline: 'none'
                      }}
                    >
                      <option value="Pending">Pending</option>
                      <option value="In Process">In Process</option>
                      <option value="Under Review">Under Review</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </div>
                ) : (
                  <span style={{ padding: '6px 18px', borderRadius: '8px', border: '1.5px solid #0E7490', background: '#ECFEFF', color: '#0E7490', fontWeight: 700, fontSize: '0.82rem' }}>
                    {task.assignees[0]?.individualStatus || selectedStage}
                  </span>
                )}
              </div>
            ) : (
              /* If Multiple Assignees (Team Task): Render each member independently */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '14px' }}>
                {task.assignees.map((a) => {
                  const isCompleted = a.individualStatus === 'Completed' || (a.progressPercentage || 0) === 100;
                  const canEditThis = (a.employeeId && (a.employeeId === currentEmpId || a.employeeId === currentUser.id)) ||
                    (currentEmpName && a.employeeName && (
                      a.employeeName.toLowerCase() === currentEmpName ||
                      a.employeeName.toLowerCase().includes(currentEmpName) ||
                      currentEmpName.includes(a.employeeName.toLowerCase())
                    )) || isCEO || isHR || isSuperAdmin || isAssigner || isResponsiblePerson;

                  return (
                    <div 
                      key={a.id || a.employeeId} 
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 16px',
                        background: isCompleted ? '#F0FDF4' : '#F8FAFC',
                        border: isCompleted ? '1px solid #BBF7D0' : '1px solid #E2E8F0',
                        borderRadius: '10px',
                        flexWrap: 'wrap',
                        gap: '12px'
                      }}
                    >
                      {/* Member Info */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '9999px',
                          background: isCompleted ? '#16A34A' : '#0E7490',
                          color: '#ffffff',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          {a.employeeName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.86rem', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>{a.employeeName}</span>
                            {a.role === 'RESPONSIBLE' && (
                              <span style={{ fontSize: '0.65rem', background: '#FEF3C7', color: '#B45309', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                Lead
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                            {a.employeeDepartment || task.department}
                            {a.completedDate && <span style={{ marginLeft: '6px', color: '#16A34A', fontWeight: 600 }}>• Done {formatDateDDMMYYYY(a.completedDate)}</span>}
                          </div>
                        </div>
                      </div>

                      {/* Individual Progress Bar */}
                      <div style={{ minWidth: '140px', flex: 1, maxWidth: '200px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', fontWeight: 600, color: '#475569', marginBottom: '3px' }}>
                          <span>Individual Progress</span>
                        </div>
                        <div style={{ height: '6px', background: '#E2E8F0', borderRadius: '999px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${a.progressPercentage || 0}%`,
                            height: '100%',
                            background: isCompleted ? '#16A34A' : '#0E7490',
                            borderRadius: '999px',
                            transition: 'width 0.3s ease'
                          }} />
                        </div>
                      </div>

                      {/* Independent Status Control */}
                      {canEditThis ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <label style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748B' }}>Status:</label>
                          <select
                            value={a.individualStatus || 'Pending'}
                            onChange={(e) => {
                              const newSt = e.target.value as TaskAssigneeStatus;
                              updateTaskProcessStatus(task.id, newSt, undefined, a.id || a.employeeId);
                            }}
                            style={{
                              padding: '5px 12px',
                              borderRadius: '8px',
                              border: isCompleted ? '1.5px solid #16A34A' : '1.5px solid #0E7490',
                              background: isCompleted ? '#DCFCE7' : '#ECFEFF',
                              color: isCompleted ? '#166534' : '#0E7490',
                              fontWeight: 700,
                              fontSize: '0.78rem',
                              cursor: 'pointer',
                              outline: 'none'
                            }}
                          >
                            <option value="Pending">Pending</option>
                            <option value="In Process">In Process</option>
                            <option value="Under Review">Under Review</option>
                            <option value="Completed">Completed</option>
                            <option value="Blocked">Blocked</option>
                          </select>
                        </div>
                      ) : (
                        <span style={{
                          padding: '4px 12px',
                          borderRadius: '6px',
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          background: isCompleted ? '#DCFCE7' : '#F1F5F9',
                          color: isCompleted ? '#166534' : '#475569'
                        }}>
                          {a.individualStatus || 'Pending'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ------------------------------------------------------ */}
          {/* 3. DAILY REPORTS (SINGLE NEAT & CLEAN BOX)             */}
          {/* ------------------------------------------------------ */}
          <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '18px 20px', border: '1px solid #E7ECF3', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '16px', paddingBottom: '14px', borderBottom: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ background: '#0E7490', color: '#FFFFFF', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.74rem', fontWeight: 800 }}>3</span>
                <div>
                  <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#1E293B', margin: 0 }}>
                    Daily Reports ({taskDailyReports.length})
                  </h3>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                    Tracked from task start date: <strong style={{ color: '#0E7490' }}>{taskStartDateStr}</strong>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.72rem', background: '#ECFEFF', color: '#0E7490', border: '1px solid #CFFAFE', padding: '3px 10px', borderRadius: '9999px', fontWeight: 700 }}>
                  {dailyReportTimeline.length} Days Tracked
                </span>
                {canDownloadReport && taskDailyReports.length > 0 && (
                  <ExportDropdown 
                    onExportPDF={handleExportTaskDailyPDF}
                    onExportExcel={handleExportTaskDailyExcel}
                    onExportCSV={handleExportTaskDailyCSV}
                    label="Download"
                    size="sm"
                  />
                )}
              </div>
            </div>

            {/* Direct Input Form inside the single box (No inner gray container) */}
            {canSubmitDailyReport && (
              <div style={{ marginBottom: '18px', paddingBottom: '16px', borderBottom: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <label style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569' }}>
                      Report Date:
                    </label>
                    <input 
                      type="date" 
                      value={dailyDate} 
                      min={taskStartDateStr}
                      onChange={e => setDailyDate(e.target.value)} 
                      style={{
                        fontSize: '0.8rem',
                        height: '34px',
                        width: '160px',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        background: '#FFFFFF',
                        color: '#1E293B',
                        fontWeight: 600,
                        outline: 'none'
                      }} 
                    />
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                    Reporting as: <strong style={{ color: '#0E7490' }}>{currentUser.name}</strong> ({currentUser.role})
                  </span>
                </div>

                <div>
                  <textarea 
                    ref={dailyTextareaRef}
                    rows={2} 
                    placeholder={`Explain specific work completed on ${dailyDate}...`} 
                    value={dailyWorkDone} 
                    onChange={e => setDailyWorkDone(e.target.value)} 
                    style={{
                      width: '100%',
                      fontSize: '0.82rem',
                      lineHeight: 1.45,
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      padding: '8px 12px',
                      resize: 'vertical',
                      outline: 'none',
                      fontFamily: 'inherit'
                    }} 
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: '8px' }}>
                  <button
                    type="button"
                    onClick={() => handleSubmitDailyReport()}
                    disabled={!dailyWorkDone.trim()}
                    className="btn btn-primary btn-sm"
                    style={{
                      fontSize: '0.78rem',
                      padding: '6px 16px',
                      borderRadius: '8px',
                      background: '#0E7490',
                      borderColor: '#0E7490',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: !dailyWorkDone.trim() ? 'not-allowed' : 'pointer',
                      opacity: !dailyWorkDone.trim() ? 0.6 : 1,
                      boxShadow: '0 1px 3px rgba(14, 116, 144, 0.2)'
                    }}
                  >
                    <Send size={13} /> Send
                  </button>
                </div>
              </div>
            )}

            {/* Timeline track with vertical connecting line on the left */}
            <div style={{ position: 'relative', paddingLeft: '22px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Continuous Vertical Timeline Line */}
              <div 
                style={{ 
                  position: 'absolute', 
                  left: '7px', 
                  top: '14px', 
                  bottom: '14px', 
                  width: '2px', 
                  background: '#CBD5E1', 
                  borderRadius: '2px' 
                }} 
              />

              {dailyReportTimeline.map((dayItem) => {
                const isToday = dayItem.dateStr === todayStr;
                const isStart = dayItem.dayIndex === 1;
                const hasReports = dayItem.reports.length > 0;

                if (hasReports) {
                  return dayItem.reports.map((dlr, rIdx) => (
                    <div 
                      key={dlr.id || `${dayItem.dateStr}-${rIdx}`} 
                      style={{ 
                        position: 'relative',
                        padding: '12px 14px', 
                        background: '#F8FAFC', 
                        borderRadius: '8px', 
                        border: '1px solid #E2E8F0'
                      }}
                    >
                      {/* Timeline Node Dot on vertical line */}
                      <div 
                        style={{
                          position: 'absolute',
                          left: '-19px',
                          top: '15px',
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          background: dlr.processStatus === 'Completed' ? '#16A34A' : '#0E7490',
                          border: '2px solid #FFFFFF',
                          boxShadow: '0 0 0 2px #CFFAFE',
                          zIndex: 2
                        }}
                      />

                      {/* Header row with divider line */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', paddingBottom: '6px', borderBottom: '1px solid #E2E8F0', flexWrap: 'wrap', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ 
                            fontSize: '0.7rem', 
                            fontWeight: 700, 
                            color: '#0E7490',
                            background: '#ECFEFF',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            border: '1px solid #CFFAFE'
                          }}>
                            {dayItem.dayIndex > 0 ? `Day ${dayItem.dayIndex}` : 'Daily'}: {formatDateDDMMYYYY(dayItem.dateStr)} {isStart ? '(Start Date)' : isToday ? '(Today)' : ''}
                          </span>
                          <strong style={{ fontSize: '0.8rem', color: '#1E293B' }}>{dlr.employeeName}</strong>
                          <span
                            title={(dlr.seenBy || []).length > 0 ? 'Seen by assigner' : 'Not seen by assigner yet'}
                            style={{
                              fontSize: '0.74rem',
                              color: (dlr.seenBy || []).length > 0 ? '#0E7490' : '#94A3B8',
                              fontWeight: 800
                            }}
                          >
                            {(dlr.seenBy || []).length > 0 ? '✓✓' : '✓'}
                          </span>
                          {dlr.employeeDepartment && (
                            <span style={{ fontSize: '0.68rem', color: '#64748B' }}>({dlr.employeeDepartment})</span>
                          )}
                        </div>
                        <span style={{ 
                          fontSize: '0.68rem', 
                          background: dlr.processStatus === 'Completed' ? '#DCFCE7' : dlr.processStatus === 'In Process' || dlr.processStatus === 'In Progress' ? '#CFFAFE' : dlr.processStatus === 'Under Review' ? '#FEF3C7' : '#F1F5F9', 
                          color: dlr.processStatus === 'Completed' ? '#166534' : dlr.processStatus === 'In Process' || dlr.processStatus === 'In Progress' ? '#0E7490' : dlr.processStatus === 'Under Review' ? '#92400E' : '#475569', 
                          padding: '2px 8px', 
                          borderRadius: '4px', 
                          fontWeight: 700 
                        }}>
                          {dlr.processStatus}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#334155', lineHeight: 1.45, whiteSpace: 'pre-line' }}>
                        {dlr.workDoneToday}
                      </div>
                      {dlr.planForTomorrow && (
                        <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '6px', paddingTop: '4px', borderTop: '1px dashed #E2E8F0' }}>
                          <strong>Tomorrow:</strong> {dlr.planForTomorrow}
                        </div>
                      )}
                      {dlr.blockersOrIssues && (
                        <div style={{ fontSize: '0.72rem', color: '#DC2626', marginTop: '6px', paddingTop: '4px', borderTop: '1px dashed #FECACA' }}>
                          <strong>Blocker:</strong> {dlr.blockersOrIssues}
                        </div>
                      )}
                    </div>
                  ));
                }

                // If no report submitted for this day yet: clean inline item with pending dot
                return (
                  <div 
                    key={dayItem.dateStr} 
                    style={{ 
                      position: 'relative',
                      padding: '8px 12px', 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      borderRadius: '6px',
                      background: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      fontSize: '0.78rem'
                    }}
                  >
                    {/* Node dot on vertical line for empty day */}
                    <div 
                      style={{
                        position: 'absolute',
                        left: '-18px',
                        top: '12px',
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: '#94A3B8',
                        border: '2px solid #FFFFFF',
                        boxShadow: '0 0 0 1px #CBD5E1',
                        zIndex: 2
                      }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B' }}>
                        {dayItem.dayIndex > 0 ? `Day ${dayItem.dayIndex}` : 'Daily'}: {formatDateDDMMYYYY(dayItem.dateStr)} {isStart ? '(Start Date)' : isToday ? '(Today)' : ''}
                      </span>
                      <span style={{ color: '#94A3B8', fontSize: '0.74rem' }}>
                        • No daily report submitted for this day
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Clean Section Divider Line Between Daily Reports and Document Reports */}
          <div style={{ height: '1px', background: '#E2E8F0', margin: '2px 0' }} />

          {/* ------------------------------------------------------ */}
          {/* 4. DOCUMENT REPORT                                     */}
          {/* ------------------------------------------------------ */}
          <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '16px 20px', border: '1px solid #E7ECF3', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid #E2E8F0' }}>
              <span style={{ background: '#0E7490', color: '#FFFFFF', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.74rem', fontWeight: 800 }}>4</span>
              <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#1E293B', margin: 0 }}>
                Document ({task.attachments.length})
              </h3>
            </div>

            {/* Hidden Real File Input */}
            <input 
              type="file" 
              ref={fileInputRef} 
              multiple 
              onChange={handleFileUpload} 
              style={{ display: 'none' }} 
            />

            {/* Documents List */}
            {task.attachments.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: canEditProcess ? '12px' : '0px' }}>
                {task.attachments.map((att) => (
                  <div key={att.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: '#FFFFFF', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                    <a 
                      href={att.fileUrl} 
                      download={att.fileName} 
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', color: '#0E7490' }}
                      title={`Download ${att.fileName}`}
                    >
                      <FileText size={16} color="#0E7490" />
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1E293B' }}>{att.fileName}</span>
                    </a>
                    <a 
                      href={att.fileUrl} 
                      download={att.fileName} 
                      className="btn btn-secondary btn-sm" 
                      style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', color: '#0E7490', borderColor: '#CFFAFE', background: '#ECFEFF', textDecoration: 'none' }}
                      title={`Download ${att.fileName}`}
                    >
                      <Download size={14} />
                    </a>
                  </div>
                ))}
              </div>
            ) : !canEditProcess ? (
              <div style={{ padding: '14px', background: '#F8FAFC', borderRadius: '8px', border: '1px dashed #CBD5E1', textAlign: 'center', color: '#64748B', fontSize: '0.78rem' }}>
                No documents uploaded yet.
              </div>
            ) : null}

            {/* Centered File Upload Zone - Only for Assigned Person */}
            {canEditProcess && (
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '1.5px dashed #0E7490',
                  borderRadius: '12px',
                  padding: '22px 20px',
                  textAlign: 'center',
                  background: '#F0FDFA',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  background: '#CCFBF1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Upload size={20} color="#0E7490" />
                </div>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  style={{
                    background: '#0E7490',
                    color: '#fff',
                    border: 'none',
                    fontSize: '0.8rem',
                    padding: '7px 20px',
                    borderRadius: '8px',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 4px rgba(14, 116, 144, 0.2)'
                  }}
                >
                  <Upload size={14} /> Upload File
                </button>
                <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                  Click to attach licenses, deliverables, reports or receipts (PDF, PNG, JPG)
                </span>
              </div>
            )}
          </div>

          {/* Clean Section Divider Line Between Document Reports and Links */}
          <div style={{ height: '1px', background: '#E2E8F0', margin: '2px 0' }} />

          {/* ------------------------------------------------------ */}
          {/* 5. LINKS                                               */}
          {/* ------------------------------------------------------ */}
          <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '16px 20px', border: '1px solid #E7ECF3', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid #E2E8F0', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ background: '#0E7490', color: '#FFFFFF', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.74rem', fontWeight: 800 }}>5</span>
                <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#1E293B', margin: 0 }}>
                  Links ({(task.links || []).length})
                </h3>
              </div>
            </div>

            {/* Inline Add Link Form */}
            {isAddingLink && (
              <form onSubmit={handleAddLink} style={{ marginBottom: '14px', padding: '14px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #CBD5E1' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Link Title / Description
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Design Prototype, Google Drive, Pull Request"
                      value={linkTitle}
                      onChange={e => setLinkTitle(e.target.value)}
                      style={{
                        width: '100%',
                        fontSize: '0.8rem',
                        height: '34px',
                        padding: '6px 10px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        background: '#FFFFFF',
                        outline: 'none',
                        fontFamily: 'inherit'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      URL / Web Address <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="https://... or docs.google.com/..."
                      value={linkUrl}
                      onChange={e => { setLinkUrl(e.target.value); if (linkError) setLinkError(''); }}
                      style={{
                        width: '100%',
                        fontSize: '0.8rem',
                        height: '34px',
                        padding: '6px 10px',
                        borderRadius: '8px',
                        border: linkError ? '1.5px solid #EF4444' : '1px solid #CBD5E1',
                        background: '#FFFFFF',
                        outline: 'none',
                        fontFamily: 'inherit'
                      }}
                    />
                  </div>
                </div>
                {linkError && (
                  <div style={{ fontSize: '0.72rem', color: '#EF4444', marginBottom: '8px', fontWeight: 600 }}>
                    {linkError}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => { setIsAddingLink(false); setLinkError(''); }}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      background: '#FFFFFF',
                      color: '#64748B',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '5px 14px',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#0E7490',
                      color: '#FFFFFF',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 1px 3px rgba(14, 116, 144, 0.2)'
                    }}
                  >
                    <Plus size={13} /> Save Link
                  </button>
                </div>
              </form>
            )}

            {/* Links List */}
            {(task.links && task.links.length > 0) ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {task.links.map((lnk) => (
                  <div key={lnk.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', transition: 'border-color 0.15s ease' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1, marginRight: '10px' }}>
                      <div style={{ width: '30px', height: '30px', borderRadius: '6px', background: '#ECFEFF', border: '1px solid #CFFAFE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Link2 size={16} color="#0E7490" />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <a
                          href={lnk.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: '0.82rem',
                            fontWeight: 700,
                            color: '#0E7490',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px'
                          }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lnk.title || lnk.url}</span>
                          <ExternalLink size={12} color="#0E7490" style={{ flexShrink: 0 }} />
                        </a>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.7rem', color: '#64748B', marginTop: '2px' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '340px' }}>
                            {lnk.url}
                          </span>
                          {lnk.addedBy && (
                            <>
                              <span>•</span>
                              <span>Added by {lnk.addedBy}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      <a
                        href={lnk.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary btn-sm"
                        style={{
                          padding: '5px 9px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          borderRadius: '6px',
                          color: '#0E7490',
                          borderColor: '#CFFAFE',
                          background: '#ECFEFF',
                          textDecoration: 'none',
                          fontSize: '0.74rem',
                          fontWeight: 700
                        }}
                        title={`Open ${lnk.title}`}
                      >
                        <ExternalLink size={13} />
                        <span>Open</span>
                      </a>
                      {canDeleteLink && (
                        <button
                          type="button"
                          onClick={() => deleteTaskLink(task.id, lnk.id)}
                          style={{
                            padding: '5px 8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '6px',
                            border: '1px solid #FEE2E2',
                            background: '#FEF2F2',
                            color: '#EF4444',
                            cursor: 'pointer'
                          }}
                          title="Delete link"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Task Doer can add additional links */}
                {canAddLink && !isAddingLink && (
                  <div style={{ marginTop: '8px' }}>
                    <button
                      type="button"
                      onClick={() => { setIsAddingLink(true); setLinkError(''); }}
                      style={{
                        padding: '6px 14px',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        color: '#0E7490',
                        background: '#ECFEFF',
                        border: '1px solid #CFFAFE',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <Plus size={14} /> Add Another Link
                    </button>
                  </div>
                )}
              </div>
            ) : !isAddingLink ? (
              canAddLink ? (
                /* Empty state for Task Doer: Clickable prompt to add resource link */
                <div
                  onClick={() => { setIsAddingLink(true); setLinkError(''); }}
                  style={{
                    border: '1.5px dashed #0E7490',
                    borderRadius: '12px',
                    padding: '18px 20px',
                    textAlign: 'center',
                    background: '#F0FDFA',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    background: '#CCFBF1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Link2 size={18} color="#0E7490" />
                  </div>
                  <button
                    type="button"
                    onClick={() => { setIsAddingLink(true); setLinkError(''); }}
                    className="btn btn-sm"
                    style={{
                      background: '#0E7490',
                      color: '#fff',
                      border: 'none',
                      fontSize: '0.8rem',
                      padding: '6px 18px',
                      borderRadius: '8px',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 2px 4px rgba(14, 116, 144, 0.2)'
                    }}
                  >
                    <Plus size={14} /> Add Resource Link
                  </button>
                  <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                    Click to add project URLs, Figma designs, GitHub PRs, Google Docs or deliverables
                  </span>
                </div>
              ) : (
                /* Read-only empty state for viewers/managers who are NOT the task doer */
                <div style={{ padding: '16px', background: '#F8FAFC', borderRadius: '10px', border: '1px dashed #CBD5E1', textAlign: 'center', color: '#64748B', fontSize: '0.8rem' }}>
                  <div style={{ fontWeight: 600, color: '#475569', marginBottom: '4px' }}>No resource links added yet.</div>
                  <div style={{ fontSize: '0.74rem', color: '#94A3B8' }}>
                    Only assigned team members executing this task can submit deliverable links.
                  </div>
                </div>
              )
            ) : null}
          </div>

        </div>

        {/* ======================================================== */}
        {/* MODAL FOOTER WITH SUBMIT BUTTON                          */}
        {/* ======================================================== */}
        <div style={{
          padding: '16px 24px',
          background: '#FFFFFF',
          borderTop: '1px solid #E7ECF3',
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: '10px'
        }}>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
            style={{
              fontSize: '0.82rem',
              padding: '8px 18px',
              borderRadius: '10px',
              fontWeight: 600
            }}
          >
            {canEditProcess ? 'Cancel' : 'Close'}
          </button>
          {canEditProcess && (
            <button
              type="button"
              onClick={handleFinalSubmit}
              disabled={isSubmitting}
              className="btn btn-primary"
              style={{
                fontSize: '0.84rem',
                padding: '8px 24px',
                borderRadius: '10px',
                background: '#0E7490',
                borderColor: '#0E7490',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 6px rgba(14, 116, 144, 0.25)',
                cursor: isSubmitting ? 'not-allowed' : 'pointer'
              }}
            >
              <Check size={16} /> Submit Task Updates
            </button>
          )}
        </div>

        {/* ======================================================== */}
        {/* CLOSE & REOPEN MODALS                                    */}
        {/* ======================================================== */}
        {showClosePrompt && (
          <div className="modal-overlay" style={{ zIndex: 70 }}>
            <div className="modal-content" style={{ maxWidth: '420px', borderRadius: '12px' }}>
              <div className="modal-header" style={{ padding: '14px 18px', background: '#0E7490', color: '#fff' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: '#fff' }}>Sign-Off &amp; Close Task</h3>
                <button onClick={() => setShowClosePrompt(false)} style={{ color: '#fff' }}><X size={16} /></button>
              </div>
              <form onSubmit={handleExecuteClose} className="modal-body" style={{ padding: '16px' }}>
                <p style={{ fontSize: '0.78rem', color: '#64748B', marginBottom: '10px' }}>
                  Verify that all deliverables, daily reports, and document evidence have been approved.
                </p>
                <textarea 
                  rows={2} 
                  placeholder="Verification remarks..." 
                  value={closeRemarks} 
                  onChange={e => setCloseRemarks(e.target.value)} 
                  className="form-control" 
                  style={{ fontSize: '0.8rem', marginBottom: '12px' }} 
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowClosePrompt(false)}>Cancel</button>
                  <button type="submit" className="btn btn-sm" style={{ background: '#10B981', color: '#fff', border: 'none' }}>Sign-Off &amp; Close</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showReopenPrompt && (
          <div className="modal-overlay" style={{ zIndex: 70 }}>
            <div className="modal-content" style={{ maxWidth: '420px', borderRadius: '12px' }}>
              <div className="modal-header" style={{ padding: '14px 18px', background: '#F59E0B', color: '#fff' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: '#fff' }}>Reopen Task</h3>
                <button onClick={() => setShowReopenPrompt(false)} style={{ color: '#fff' }}><X size={16} /></button>
              </div>
              <form onSubmit={handleExecuteReopen} className="modal-body" style={{ padding: '16px' }}>
                <p style={{ fontSize: '0.78rem', color: '#64748B', marginBottom: '10px' }}>
                  Provide reason for reopening this task. Action will be audited.
                </p>
                <textarea 
                  rows={2} 
                  placeholder="Reason for reopening..." 
                  value={reopenReason} 
                  onChange={e => setReopenReason(e.target.value)} 
                  className="form-control" 
                  style={{ fontSize: '0.8rem', marginBottom: '12px' }} 
                  required 
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowReopenPrompt(false)}>Cancel</button>
                  <button type="submit" className="btn btn-sm" style={{ background: '#F59E0B', color: '#fff', border: 'none' }}>Confirm Reopen</button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
