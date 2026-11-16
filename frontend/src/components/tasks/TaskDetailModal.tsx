import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import {
  X,
  Calendar,
  FileText,
  Send,
  RotateCcw,
  Upload,
  Check,
  Download,
  Edit2,
  Link2,
  ExternalLink,
  Trash2,
  Plus,
  FileSpreadsheet,
  ChevronDown,
  ArrowLeft,
  Play
} from 'lucide-react';
import { IndividualTaskStatus, TaskPriority, TaskCategory } from '../../types/tasks';
import {
  formatDateDDMMYYYY,
  formatDateTimeDDMMYYYY,
  formatDateDayMonthYear
} from '../../utils/dateUtils';
import { exportToExcel, exportToPDF } from '../../utils/exportUtils';
import { preventSpaceEnterPropagation, handleFormKeyDown } from '../../utils/keyboardUtils';

interface Props {
  taskId: string;
  onClose: () => void;
}

const TASK_CATEGORIES: TaskCategory[] = [
  'HR Operations',
  'Payroll & Compliance',
  'Sales & Field Visit',
  'Accounts & Finance',
  'Recruitment & Onboarding',
  'IT & Asset Support',
  'Audit & Documentation',
  'General Administration'
];

export const TaskDetailModal: React.FC<Props> = ({ taskId, onClose }) => {
  const {
    enhancedTasks,
    currentUser,
    employees,
    departments,
    updateAssigneeProgress,
    addTaskDailyReport,
    addTaskAttachment,
    addTaskLink,
    deleteTaskLink,
    closeTask,
    reopenTask,
    updateEnhancedTask,
    addNotification,
    markTaskViewed,
    markTaskDailyReportsSeen,
    markModuleNotificationsRead
  } = useHRMS();

  useEffect(() => {
    if (taskId) {
      markTaskViewed?.(taskId);
      markTaskDailyReportsSeen?.(taskId);
      markModuleNotificationsRead?.('tasks');
    }
  }, [taskId]);

  const updateAssigneeStatus = (tId: string, empIdOrAssigneeId: string, newStatus: IndividualTaskStatus) => {
    const targetTask = enhancedTasks.find(t => t.id === tId);
    const targetAssignee = targetTask?.assignees.find(
      a => a.employeeId === empIdOrAssigneeId || a.id === empIdOrAssigneeId
    );
    const assigneeId = targetAssignee?.id || empIdOrAssigneeId;
    const progress =
      newStatus === 'Completed'
        ? 100
        : newStatus === 'Under Review'
        ? 85
        : newStatus === 'In Progress' || newStatus === 'In Process'
        ? 50
        : 0;
    updateAssigneeProgress(tId, assigneeId, progress, newStatus);
  };

  const task = enhancedTasks.find(t => t.id === taskId);

  const [activeSubTab, setActiveSubTab] = useState<'updates' | 'reports' | 'files'>('updates');
  const [showQuickStatusMenu, setShowQuickStatusMenu] = useState(false);

  const todayISO = new Date().toISOString().split('T')[0];
  const [reportDate, setReportDate] = useState<string>(todayISO);
  const [workDoneToday, setWorkDoneToday] = useState('');
  const [reportSubmitFeedback, setReportSubmitFeedback] = useState(false);

  const [processStage, setProcessStage] = useState<
    'Pending' | 'In Process' | 'Under Review' | 'Completed'
  >(() => {
    if (!task) return 'Pending';
    if (task.overallStatus === 'COMPLETED' || task.overallStatus === 'CLOSED') return 'Completed';
    if (task.overallStatus === 'UNDER REVIEW') return 'Under Review';
    if (task.overallStatus === 'IN PROGRESS' || task.overallStatus === 'PARTIALLY COMPLETED') return 'In Process';
    return 'Pending';
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isAddingLink, setIsAddingLink] = useState(false);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState('');

  const [showReportExportMenu, setShowReportExportMenu] = useState(false);
  const reportExportRef = useRef<HTMLDivElement>(null);

  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editTitle, setEditTitle] = useState(task?.title || '');
  const [editCategory, setEditCategory] = useState<TaskCategory>(task?.taskCategory || 'HR Operations');
  const [editPriority, setEditPriority] = useState<TaskPriority>(task?.priority || 'Medium');
  const [editStartDate, setEditStartDate] = useState(task?.startDate || todayISO);
  const [editDueDate, setEditDueDate] = useState(task?.dueDate || todayISO);
  const [editDepartment, setEditDepartment] = useState(task?.department || '');
  const [editResponsibleId, setEditResponsibleId] = useState(task?.responsiblePersonId || '');
  const [editDescription, setEditDescription] = useState(task?.description || '');

  const [closeRemarks, setCloseRemarks] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [showClosePrompt, setShowClosePrompt] = useState(false);
  const [showReopenPrompt, setShowReopenPrompt] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!task) return null;

  const isClosed = task.overallStatus === 'CLOSED';

  const currentEmpRecord = employees.find(
    e =>
      e.employeeId === currentUser.employeeId ||
      e.id === currentUser.id ||
      (e.email && currentUser.email && e.email.toLowerCase() === currentUser.email.toLowerCase()) ||
      `${e.firstName} ${e.lastName}`.toLowerCase() === currentUser.name.toLowerCase()
  );

  const matchesCurrentUser = (idOrCode?: string, name?: string) => {
    if (idOrCode) {
      if (idOrCode === currentUser.employeeId || idOrCode === currentUser.id) return true;
      if (currentEmpRecord && (idOrCode === currentEmpRecord.employeeId || idOrCode === currentEmpRecord.id)) return true;
    }
    if (name) {
      const target = name.trim().toLowerCase();
      if (target === currentUser.name.trim().toLowerCase()) return true;
      if (
        currentEmpRecord &&
        target === `${currentEmpRecord.firstName} ${currentEmpRecord.lastName}`.trim().toLowerCase()
      ) {
        return true;
      }
    }
    return false;
  };

  const isAssignedByCurrentUser = matchesCurrentUser(task.assignedById, task.assignedByName);
  const isResponsiblePerson = matchesCurrentUser(task.responsiblePersonId, task.responsiblePersonName);
  const myAssigneeObj = task.assignees.find(a => matchesCurrentUser(a.employeeId, a.employeeName));
  const isAssigneeMember = Boolean(myAssigneeObj);
  const isAdminOrHrOrCeo =
    currentUser.role === 'Super Admin' || currentUser.role === 'CEO' || currentUser.role === 'HR';

  useEffect(() => {
    if (myAssigneeObj) {
      const st = myAssigneeObj.individualStatus;
      if (st === 'Completed') setProcessStage('Completed');
      else if (st === 'Under Review') setProcessStage('Under Review');
      else if (st === 'In Process' || st === 'In Progress') setProcessStage('In Process');
      else setProcessStage('Pending');
    }
  }, [myAssigneeObj?.individualStatus]);

  // Strictly ONLY the assigned employee can change their own status.
  // The person who assigned the task (or HR/CEO who is not an assignee) CANNOT change the status, only Reopen!
  const isAssignedEmployee = task.assignees.length > 0 ? isAssigneeMember : isResponsiblePerson;
  const canEditTaskDetails = !isClosed && (isAssignedByCurrentUser || isAdminOrHrOrCeo);
  const canEditProcess = !isClosed && isAssignedEmployee;
  const isTaskDoer = isAssignedEmployee;
  const canAddLink = !isClosed && isTaskDoer;
  const canDeleteLink = !isClosed && isTaskDoer;
  const canDownloadReport = isAssignedByCurrentUser || isResponsiblePerson || isAssigneeMember || isAdminOrHrOrCeo;

  const handleOpenEditDetails = () => {
    setEditTitle(task.title);
    setEditCategory(task.taskCategory);
    setEditPriority(task.priority);
    setEditStartDate(task.startDate);
    setEditDueDate(task.dueDate);
    setEditDepartment(task.department);
    setEditResponsibleId(task.responsiblePersonId);
    setEditDescription(task.description);
    setIsEditingDetails(true);
  };

  const handleSaveTaskDetails = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitle.trim()) return;

    const respEmp = employees.find(e => e.employeeId === editResponsibleId || e.id === editResponsibleId);
    const respName = respEmp
      ? `${respEmp.firstName} ${respEmp.lastName}`.trim()
      : task.responsiblePersonName;

    updateEnhancedTask(task.id, {
      title: editTitle.trim(),
      taskCategory: editCategory,
      priority: editPriority,
      dueDate: editDueDate,
      description: editDescription.trim()
    } as any);

    setIsEditingDetails(false);
  };

  const handleProcessStageSelect = (
    stage: 'Pending' | 'In Process' | 'Under Review' | 'Completed'
  ) => {
    if (!canEditProcess) return;
    setProcessStage(stage);
    setShowQuickStatusMenu(false);

    const mappedIndividualStatus: IndividualTaskStatus = stage;

    const myAssignee = task.assignees.find(a => matchesCurrentUser(a.employeeId, a.employeeName));
    if (myAssignee) {
      updateAssigneeStatus(task.id, myAssignee.id || myAssignee.employeeId, mappedIndividualStatus);
    }
  };

  const handleSubmitDailyReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditProcess || !workDoneToday.trim()) return;

    const computedProgress =
      processStage === 'Completed'
        ? 100
        : processStage === 'Under Review'
        ? 85
        : processStage === 'In Process'
        ? Math.max(task.overallProgress, 50)
        : task.overallProgress;

    addTaskDailyReport(task.id, {
      reportDate,
      workDoneToday: workDoneToday.trim(),
      processStatus: processStage,
      hoursSpent: 8
    });

    setWorkDoneToday('');
    setReportSubmitFeedback(true);
    setTimeout(() => setReportSubmitFeedback(false), 2500);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEditProcess) return;
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : '';
        addTaskAttachment(task.id, {
          fileName: file.name,
          fileSize: `${Math.max(1, Math.round(file.size / 1024))} KB`,
          fileType: file.type || 'application/octet-stream',
          fileUrl: dataUrl,
          uploadedBy: currentUser.name
        });
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  const handleAddLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAddLink) return;

    const rawUrl = linkUrl.trim();
    const rawTitle = linkTitle.trim();

    if (!rawUrl) {
      setLinkError('Please enter a valid web link or URL.');
      return;
    }

    const formattedUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    try {
      new URL(formattedUrl);
    } catch {
      setLinkError('Invalid URL format. Example: https://docs.google.com/...');
      return;
    }

    const finalTitle = rawTitle || formattedUrl.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0];
    addTaskLink(task.id, { title: finalTitle, url: formattedUrl });

    setLinkTitle('');
    setLinkUrl('');
    setLinkError('');
    setIsAddingLink(false);
  };

  const handleExportTaskDailyReport = (type: 'excel' | 'pdf') => {
    setShowReportExportMenu(false);

    const reports = task.dailyReports || [];
    if (reports.length === 0) {
      alert('No daily report entries available to download for this task.');
      return;
    }

    const columns = [
      { label: 'Report Date', key: 'reportDateFormatted' },
      { label: 'Employee Name', key: 'employeeName' },
      { label: 'Department', key: 'employeeDepartment' },
      { label: 'Work Done / Daily Update', key: 'workDoneToday' },
      { label: 'Stage Status', key: 'processStatus' },
      { label: 'Progress', key: 'progressFormatted' },
      { label: 'Submitted At', key: 'submittedAtFormatted' }
    ];

    const sortedReports = [...reports].sort((a, b) => a.reportDate.localeCompare(b.reportDate));

    const data = sortedReports.map(r => ({
      ...r,
      employeeDepartment: r.employeeDepartment || task.department,
      reportDateFormatted: formatDateDDMMYYYY(r.reportDate),
      progressFormatted: `${r.progressPercentage ?? task.overallProgress}%`,
      submittedAtFormatted: formatDateTimeDDMMYYYY(r.submittedAt)
    }));

    const timestamp = new Date().toISOString().split('T')[0];
    const safeTaskNo = task.taskNumber.replace(/[^a-zA-Z0-9_-]/g, '_');

    if (type === 'excel') {
      exportToExcel(data, `Daily_Report_${safeTaskNo}_${timestamp}`, columns);
    } else {
      exportToPDF(
        data,
        `Daily Task Report — ${task.taskNumber}: ${task.title}`,
        `Daily_Report_${safeTaskNo}_${timestamp}`,
        columns
      );
    }
  };

  const handleFinalSubmit = () => {
    if (!canEditProcess) {
      onClose();
      return;
    }

    setIsSubmitting(true);

    if (workDoneToday.trim()) {
      addTaskDailyReport(task.id, {
        reportDate,
        workDoneToday: workDoneToday.trim(),
        processStatus: processStage,
        hoursSpent: 8
      });
      setWorkDoneToday('');
    }

    const mappedIndividualStatus: IndividualTaskStatus = processStage;

    const myAssignee = task.assignees.find(a => matchesCurrentUser(a.employeeId, a.employeeName));
    if (myAssignee && myAssignee.individualStatus !== mappedIndividualStatus) {
      updateAssigneeStatus(task.id, myAssignee.employeeId, mappedIndividualStatus);
    }

    addNotification({
      title: `Task Updated: ${task.taskNumber}`,
      message: `${currentUser.name} submitted updates for "${task.title}" (Stage: ${processStage}).`,
      category: 'Task',
      targetRole: 'All'
    } as any);

    setTimeout(() => {
      setIsSubmitting(false);
      onClose();
    }, 250);
  };

  const handleExecuteClose = (e: React.FormEvent) => {
    e.preventDefault();
    closeTask(task.id, currentUser.name, closeRemarks || 'Task verified and closed.');
    setShowClosePrompt(false);
    setCloseRemarks('');
  };

  const handleExecuteReopen = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenReason.trim()) return;
    reopenTask(task.id, currentUser.name, reopenReason);
    setShowReopenPrompt(false);
    setReopenReason('');
  };

  const getPriorityBadgeStyle = (p: string) => {
    switch (p) {
      case 'Urgent':
        return { bg: '#FEE2E2', color: '#DC2626', dot: '#DC2626' };
      case 'High':
        return { bg: '#FEF3C7', color: '#D97706', dot: '#D97706' };
      case 'Medium':
        return { bg: '#EFF6FF', color: '#2563EB', dot: '#2563EB' };
      default:
        return { bg: '#DCFCE7', color: '#15803D', dot: '#15803D' };
    }
  };

  const getStatusBadgeStyle = (s: string) => {
    if (s === 'COMPLETED' || s === 'CLOSED' || s === 'Completed') {
      return { bg: '#DCFCE7', color: '#15803D', label: 'Completed', showDot: true };
    }
    if (s === 'UNDER REVIEW' || s === 'Under Review') {
      return { bg: '#FEF3C7', color: '#D97706', label: 'Under Review', showDot: true };
    }
    if (s === 'IN PROGRESS' || s === 'PARTIALLY COMPLETED' || s === 'REOPENED' || s === 'In Process' || s === 'In Progress') {
      return { bg: '#E0F2FE', color: '#0284C7', label: 'In Process', showDot: true };
    }
    return { bg: '#F1F5F9', color: '#475569', label: 'Pending', showDot: true };
  };

  const pBadge = getPriorityBadgeStyle(task.priority);
  const sBadge = getStatusBadgeStyle(task.overallStatus);

  const sortedDailyReports = useMemo(() => {
    return [...(task.dailyReports || [])].sort((a, b) => {
      if (b.reportDate !== a.reportDate) return b.reportDate.localeCompare(a.reportDate);
      return (b.submittedAt || '').localeCompare(a.submittedAt || '');
    });
  }, [task.dailyReports]);

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        zIndex: 20000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px'
      }}
    >
      <div
        className="modal-content task-detail-modal-content"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '620px',
          width: '100%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '20px',
          overflow: 'hidden',
          boxShadow: '0 24px 48px -12px rgba(15, 23, 42, 0.2)',
          border: '1px solid #E2E8F0',
          background: '#FFFFFF',
          padding: 0
        }}
      >
        {/* ======================================================== */}
        {/* HEADER: ← Task Details                                   */}
        {/* ======================================================== */}
        <div
          style={{
            padding: '14px 18px',
            background: '#FFFFFF',
            borderBottom: '1px solid #F1F5F9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                background: '#F8FAFC',
                color: '#0F172A',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              title="Back"
            >
              <ArrowLeft size={17} />
            </button>
            <h2
              style={{
                fontSize: '1.08rem',
                fontWeight: 800,
                color: '#0F172A',
                margin: 0,
                letterSpacing: '-0.01em'
              }}
            >
              Task Details
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {canEditTaskDetails && !isEditingDetails && (
              <button
                type="button"
                onClick={handleOpenEditDetails}
                style={{
                  height: '32px',
                  padding: '0 10px',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  background: '#F8FAFC',
                  color: '#0E7490',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  cursor: 'pointer'
                }}
              >
                <Edit2 size={13} /> Edit
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: 'none',
                background: 'transparent',
                color: '#64748B',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* BODY                                                     */}
        {/* ======================================================== */}
        <div
          style={{
            padding: '16px 18px',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            background: '#FFFFFF'
          }}
        >
          {/* ====================================================== */}
          {/* TOP TASK OVERVIEW CARD (Matches Reference Image Screen 4)*/}
          {/* ====================================================== */}
          {!isEditingDetails ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}
            >
              {/* Row 1: Task Number Pill (left) + Status Pill (right) */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <span
                  style={{
                    background: '#E0F2FE',
                    color: '#0E7490',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    padding: '4px 10px',
                    borderRadius: '8px',
                    letterSpacing: '0.01em'
                  }}
                >
                  {task.taskNumber}
                </span>

                <span
                  style={{
                    background: sBadge.bg,
                    color: sBadge.color,
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    padding: '4px 12px',
                    borderRadius: '999px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {sBadge.showDot && (
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: sBadge.color
                      }}
                    />
                  )}
                  {sBadge.label}
                </span>
              </div>

              {/* Row 2: Task Title & Description */}
              <div>
                <h3
                  style={{
                    fontSize: '1.22rem',
                    fontWeight: 800,
                    color: '#0F172A',
                    margin: '0 0 4px 0',
                    lineHeight: 1.3
                  }}
                >
                  {task.title}
                </h3>
                <p
                  style={{
                    fontSize: '0.86rem',
                    color: '#64748B',
                    margin: 0,
                    lineHeight: 1.45,
                    whiteSpace: 'pre-line'
                  }}
                >
                  {task.description || 'No additional description provided.'}
                </p>
              </div>

              {/* Divider + Due Date & Priority Rows (Matches Reference Image Screen 4) */}
              <div
                style={{
                  borderTop: '1px solid #F1F5F9',
                  borderBottom: '1px solid #F1F5F9',
                  padding: '12px 0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#475569', fontSize: '0.84rem', fontWeight: 600 }}>
                    <Calendar size={16} color="#64748B" />
                    <span>Due Date</span>
                  </div>
                  <span style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0F172A' }}>
                    {formatDateDayMonthYear(task.dueDate)}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#475569', fontSize: '0.84rem', fontWeight: 600 }}>
                    <Play size={15} color="#64748B" />
                    <span>Priority</span>
                  </div>
                  <span
                    style={{
                      background: pBadge.bg,
                      color: pBadge.color,
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      padding: '3px 10px',
                      borderRadius: '999px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: pBadge.dot
                      }}
                    />
                    {task.priority}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* Edit Task Details Form (when Edit is clicked) */
            <form
              onSubmit={handleSaveTaskDetails}
              onKeyDown={handleFormKeyDown}
              style={{
                background: '#F8FAFC',
                padding: '14px',
                borderRadius: '14px',
                border: '1px solid #CBD5E1',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    Task Title *
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    required
                    style={{ fontSize: '0.82rem', height: '36px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    Category
                  </label>
                  <select
                    className="form-control"
                    value={editCategory}
                    onChange={e => setEditCategory(e.target.value as TaskCategory)}
                    style={{ fontSize: '0.82rem', height: '36px' }}
                  >
                    {TASK_CATEGORIES.map(c => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    Priority
                  </label>
                  <select
                    className="form-control"
                    value={editPriority}
                    onChange={e => setEditPriority(e.target.value as TaskPriority)}
                    style={{ fontSize: '0.82rem', height: '36px' }}
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    className="form-control"
                    value={editStartDate}
                    onChange={e => setEditStartDate(e.target.value)}
                    style={{ fontSize: '0.8rem', height: '36px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    Due Date
                  </label>
                  <input
                    type="date"
                    className="form-control"
                    value={editDueDate}
                    onChange={e => setEditDueDate(e.target.value)}
                    style={{ fontSize: '0.8rem', height: '36px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    Department
                  </label>
                  <select
                    className="form-control"
                    value={editDepartment}
                    onChange={e => setEditDepartment(e.target.value)}
                    style={{ fontSize: '0.8rem', height: '36px' }}
                  >
                    {departments.map(d => (
                      <option key={d.id} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    Responsible Lead
                  </label>
                  <select
                    className="form-control"
                    value={editResponsibleId}
                    onChange={e => setEditResponsibleId(e.target.value)}
                    style={{ fontSize: '0.8rem', height: '36px' }}
                  >
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.employeeId}>
                        {emp.firstName} {emp.lastName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                  Description
                </label>
                <textarea
                  rows={2}
                  className="form-control"
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  onKeyDown={preventSpaceEnterPropagation}
                  style={{ fontSize: '0.82rem', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setIsEditingDetails(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  style={{ background: '#0E7490', borderColor: '#0E7490' }}
                >
                  Save Changes
                </button>
              </div>
            </form>
          )}

          {/* ====================================================== */}
          {/* 3 SUB-TABS: Updates | Reports | Files (Matches Screen 4)*/}
          {/* ====================================================== */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              borderBottom: '1px solid #E2E8F0'
            }}
          >
            {[
              { id: 'updates' as const, label: 'Updates' },
              {
                id: 'reports' as const,
                label: `Reports${sortedDailyReports.length > 0 ? ` (${sortedDailyReports.length})` : ''}`
              },
              {
                id: 'files' as const,
                label: `Files${
                  task.attachments.length + (task.links?.length || 0) > 0
                    ? ` (${task.attachments.length + (task.links?.length || 0)})`
                    : ''
                }`
              }
            ].map(tab => {
              const isActive = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSubTab(tab.id)}
                  style={{
                    padding: '10px 8px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: isActive ? '2.5px solid #0E7490' : '2.5px solid transparent',
                    color: isActive ? '#0E7490' : '#64748B',
                    fontSize: '0.84rem',
                    fontWeight: isActive ? 800 : 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    textAlign: 'center'
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* ====================================================== */}
          {/* SUB-TAB 1: UPDATES (Stage + Daily Report + Team Status)*/}
          {/* ====================================================== */}
          {activeSubTab === 'updates' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Process Stage Buttons: Pending | In Process | Under Review | Completed */}
              <div>
                <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                  Update Task Status
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '8px'
                  }}
                >
                  {(['Pending', 'In Process', 'Under Review', 'Completed'] as const).map(stage => {
                    const isSelected = processStage === stage;
                    return (
                      <button
                        key={stage}
                        type="button"
                        disabled={!canEditProcess}
                        onClick={() => handleProcessStageSelect(stage)}
                        style={{
                          padding: '9px 10px',
                          borderRadius: '10px',
                          border: isSelected ? '1.5px solid #0E7490' : '1px solid #E2E8F0',
                          background: isSelected ? '#ECFEFF' : '#F8FAFC',
                          color: isSelected ? '#0E7490' : '#475569',
                          fontWeight: isSelected ? 800 : 600,
                          fontSize: '0.78rem',
                          cursor: canEditProcess ? 'pointer' : 'not-allowed',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        {isSelected && <Check size={14} />}
                        <span>{stage}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quick Task Daily Report Entry right inside Updates */}
              {canEditProcess && (
                <form
                  onSubmit={handleSubmitDailyReport}
                  onKeyDown={handleFormKeyDown}
                  style={{
                    background: '#F8FAFC',
                    padding: '12px',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0F172A' }}>
                      Task Daily Report
                    </span>
                    <input
                      type="date"
                      value={reportDate}
                      onChange={e => setReportDate(e.target.value)}
                      required
                      style={{
                        height: '28px',
                        padding: '0 8px',
                        fontSize: '0.74rem',
                        borderRadius: '7px',
                        border: '1px solid #CBD5E1',
                        background: '#FFFFFF'
                      }}
                    />
                  </div>
                  <textarea
                    rows={2}
                    placeholder="Enter today's work progress / daily report for this task..."
                    value={workDoneToday}
                    onChange={e => setWorkDoneToday(e.target.value)}
                    onKeyDown={preventSpaceEnterPropagation}
                    required
                    style={{
                      width: '100%',
                      fontSize: '0.8rem',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      background: '#FFFFFF',
                      outline: 'none',
                      resize: 'vertical',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box'
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    {reportSubmitFeedback ? (
                      <span style={{ fontSize: '0.73rem', fontWeight: 700, color: '#16A34A' }}>
                        ✓ Daily report added!
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.7rem', color: '#64748B' }}>
                        Status: <strong>{processStage}</strong>
                      </span>
                    )}
                    <button
                      type="submit"
                      style={{
                        height: '32px',
                        padding: '0 14px',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#0E7490',
                        color: '#FFFFFF',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      <Send size={12} /> Add Daily Report
                    </button>
                  </div>
                </form>
              )}

              {/* Team Members / Assignees List */}
              <div>
                <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                  Assignees ({task.assignees.filter(a => a.individualStatus === 'Completed').length} of{' '}
                  {task.assignees.length} Completed)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {task.assignees.map(a => {
                    // Strictly ONLY the logged-in team member can change their own status!
                    const canModifyThisAssignee =
                      !isClosed && matchesCurrentUser(a.employeeId, a.employeeName);
                    const normalizedAssigneeStatus =
                      a.individualStatus === 'Completed'
                        ? 'Completed'
                        : a.individualStatus === 'Under Review'
                        ? 'Under Review'
                        : a.individualStatus === 'In Process' || a.individualStatus === 'In Progress'
                        ? 'In Process'
                        : 'Pending';
                    return (
                      <div
                        key={a.id || a.employeeId}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '9px 12px',
                          background: '#F8FAFC',
                          borderRadius: '10px',
                          border: '1px solid #E2E8F0'
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0F172A' }}>
                            {a.employeeName}
                            {canModifyThisAssignee && (
                              <span style={{ marginLeft: '6px', fontSize: '0.68rem', color: '#0E7490', fontWeight: 700 }}>
                                (You)
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                            {a.employeeDepartment || a.department || task.department}
                            {a.completedDate || a.completedAt
                              ? ` • Done ${formatDateTimeDDMMYYYY((a.completedDate || a.completedAt) as string)}`
                              : ''}
                          </div>
                        </div>

                        {canModifyThisAssignee ? (
                          <select
                            value={normalizedAssigneeStatus}
                            onChange={e =>
                              updateAssigneeStatus(
                                task.id,
                                a.id || a.employeeId,
                                e.target.value as IndividualTaskStatus
                              )
                            }
                            style={{
                              height: '32px',
                              padding: '0 10px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              borderRadius: '8px',
                              border: '1px solid #0E7490',
                              background:
                                normalizedAssigneeStatus === 'Completed'
                                  ? '#DCFCE7'
                                  : normalizedAssigneeStatus === 'Under Review'
                                  ? '#FEF3C7'
                                  : normalizedAssigneeStatus === 'In Process'
                                  ? '#E0F2FE'
                                  : '#FFFFFF',
                              color:
                                normalizedAssigneeStatus === 'Completed'
                                  ? '#15803D'
                                  : normalizedAssigneeStatus === 'Under Review'
                                  ? '#D97706'
                                  : normalizedAssigneeStatus === 'In Process'
                                  ? '#0284C7'
                                  : '#334155',
                              cursor: 'pointer'
                            }}
                          >
                            <option value="Pending">Pending</option>
                            <option value="In Process">In Process</option>
                            <option value="Under Review">Under Review</option>
                            <option value="Completed">Completed</option>
                          </select>
                        ) : (
                          <span
                            style={{
                              padding: '5px 12px',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              borderRadius: '999px',
                              background:
                                normalizedAssigneeStatus === 'Completed'
                                  ? '#DCFCE7'
                                  : normalizedAssigneeStatus === 'Under Review'
                                  ? '#FEF3C7'
                                  : normalizedAssigneeStatus === 'In Process'
                                  ? '#E0F2FE'
                                  : '#F1F5F9',
                              color:
                                normalizedAssigneeStatus === 'Completed'
                                  ? '#15803D'
                                  : normalizedAssigneeStatus === 'Under Review'
                                  ? '#D97706'
                                  : normalizedAssigneeStatus === 'In Process'
                                  ? '#0284C7'
                                  : '#475569'
                            }}
                          >
                            {normalizedAssigneeStatus}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Assignment Metadata Summary */}
              <div
                style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '12px',
                  padding: '12px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '10px',
                  fontSize: '0.78rem'
                }}
              >
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '0.7rem' }}>Department</span>
                  <strong style={{ color: '#0F172A' }}>{task.department}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '0.7rem' }}>Category</span>
                  <strong style={{ color: '#0F172A' }}>{task.taskCategory}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '0.7rem' }}>Assigned By</span>
                  <strong style={{ color: '#0F172A' }}>{task.assignedByName}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '0.7rem' }}>Responsible Lead</span>
                  <strong style={{ color: '#0F172A' }}>{task.responsiblePersonName}</strong>
                </div>
              </div>
            </div>
          )}

          {/* ====================================================== */}
          {/* SUB-TAB 2: REPORTS (Daily Report Entry + History)      */}
          {/* ====================================================== */}
          {activeSubTab === 'reports' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Submit Daily Report Form */}
              {canEditProcess && (
                <form
                  onSubmit={handleSubmitDailyReport}
                  onKeyDown={handleFormKeyDown}
                  style={{
                    background: '#F8FAFC',
                    padding: '12px',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0F172A' }}>
                      Log Daily Work Update
                    </span>
                    <input
                      type="date"
                      value={reportDate}
                      onChange={e => setReportDate(e.target.value)}
                      required
                      style={{
                        height: '30px',
                        padding: '0 8px',
                        fontSize: '0.75rem',
                        borderRadius: '7px',
                        border: '1px solid #CBD5E1',
                        background: '#FFFFFF'
                      }}
                    />
                  </div>

                  <textarea
                    rows={2}
                    placeholder="1. Explain specific work completed today..."
                    value={workDoneToday}
                    onChange={e => setWorkDoneToday(e.target.value)}
                    onKeyDown={preventSpaceEnterPropagation}
                    required
                    style={{
                      width: '100%',
                      fontSize: '0.82rem',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      background: '#FFFFFF',
                      outline: 'none',
                      resize: 'vertical',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box'
                    }}
                  />

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    {reportSubmitFeedback ? (
                      <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#16A34A' }}>
                        ✓ Report saved!
                      </span>
                    ) : (
                      <span />
                    )}
                    <button
                      type="submit"
                      style={{
                        height: '34px',
                        padding: '0 14px',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#0E7490',
                        color: '#FFFFFF',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      <Send size={13} /> Send Report
                    </button>
                  </div>
                </form>
              )}

              {/* Export Daily Report Header */}
              {canDownloadReport && sortedDailyReports.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#64748B' }}>
                    Submitted Updates ({sortedDailyReports.length})
                  </span>
                  <div ref={reportExportRef} style={{ position: 'relative' }}>
                    <button
                      type="button"
                      onClick={() => setShowReportExportMenu(prev => !prev)}
                      style={{
                        height: '30px',
                        padding: '0 10px',
                        borderRadius: '8px',
                        border: '1px solid #CFFAFE',
                        background: '#ECFEFF',
                        color: '#0E7490',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        cursor: 'pointer'
                      }}
                    >
                      <Download size={12} /> Export <ChevronDown size={11} />
                    </button>
                    {showReportExportMenu && (
                      <div
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: 'calc(100% + 4px)',
                          background: '#FFFFFF',
                          border: '1px solid #E2E8F0',
                          borderRadius: '10px',
                          boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.12)',
                          minWidth: '170px',
                          zIndex: 50,
                          padding: '5px'
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => handleExportTaskDailyReport('excel')}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '7px 10px',
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.76rem',
                            fontWeight: 600,
                            color: '#1E293B',
                            width: '100%'
                          }}
                        >
                          <FileSpreadsheet size={14} color="#16A34A" /> Excel (.xlsx)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportTaskDailyReport('pdf')}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '7px 10px',
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.76rem',
                            fontWeight: 600,
                            color: '#1E293B',
                            width: '100%'
                          }}
                        >
                          <FileText size={14} color="#DC2626" /> PDF (.pdf)
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Daily Reports List */}
              {sortedDailyReports.length === 0 ? (
                <div
                  style={{
                    padding: '28px 16px',
                    textAlign: 'center',
                    background: '#F8FAFC',
                    borderRadius: '12px',
                    border: '1px dashed #CBD5E1',
                    color: '#64748B',
                    fontSize: '0.8rem'
                  }}
                >
                  No daily reports submitted for this task yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {sortedDailyReports.map(dlr => (
                    <div
                      key={dlr.id}
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: '12px',
                        padding: '12px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0F172A' }}>
                          {dlr.employeeName}
                        </span>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            color: '#0E7490',
                            background: '#ECFEFF',
                            padding: '2px 8px',
                            borderRadius: '999px'
                          }}
                        >
                          {formatDateDayMonthYear(dlr.reportDate)}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '0.82rem',
                          color: '#334155',
                          lineHeight: 1.45,
                          whiteSpace: 'pre-line'
                        }}
                      >
                        {dlr.workDoneToday}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ====================================================== */}
          {/* SUB-TAB 3: FILES (Attachments + Resource Links)        */}
          {/* ====================================================== */}
          {activeSubTab === 'files' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Hidden File Input */}
              <input
                type="file"
                ref={fileInputRef}
                multiple
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />

              {/* Section A: Documents */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '8px'
                  }}
                >
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>
                    Documents ({task.attachments.length})
                  </span>
                  {canEditProcess && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        height: '30px',
                        padding: '0 10px',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#0E7490',
                        color: '#FFFFFF',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        cursor: 'pointer'
                      }}
                    >
                      <Upload size={12} /> Upload File
                    </button>
                  )}
                </div>

                {task.attachments.length === 0 ? (
                  <div
                    style={{
                      padding: '18px',
                      background: '#F8FAFC',
                      borderRadius: '10px',
                      border: '1px dashed #CBD5E1',
                      textAlign: 'center',
                      fontSize: '0.78rem',
                      color: '#64748B'
                    }}
                  >
                    No documents uploaded yet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {task.attachments.map(att => (
                      <div
                        key={att.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '8px 12px',
                          background: '#F8FAFC',
                          borderRadius: '10px',
                          border: '1px solid #E2E8F0'
                        }}
                      >
                        <a
                          href={att.fileUrl}
                          download={att.fileName}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            textDecoration: 'none',
                            color: '#0F172A',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            minWidth: 0
                          }}
                        >
                          <FileText size={15} color="#0E7490" />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {att.fileName}
                          </span>
                        </a>
                        <a
                          href={att.fileUrl}
                          download={att.fileName}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            background: '#ECFEFF',
                            color: '#0E7490',
                            display: 'inline-flex',
                            alignItems: 'center'
                          }}
                        >
                          <Download size={13} />
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section B: Resource Links */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '8px'
                  }}
                >
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>
                    Resource Links ({(task.links || []).length})
                  </span>
                  {canAddLink && !isAddingLink && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingLink(true);
                        setLinkError('');
                      }}
                      style={{
                        height: '30px',
                        padding: '0 10px',
                        borderRadius: '8px',
                        border: '1px solid #CFFAFE',
                        background: '#ECFEFF',
                        color: '#0E7490',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        cursor: 'pointer'
                      }}
                    >
                      <Plus size={12} /> Add Link
                    </button>
                  )}
                </div>

                {isAddingLink && (
                  <form
                    onSubmit={handleAddLink}
                    onKeyDown={handleFormKeyDown}
                    style={{
                      marginBottom: '10px',
                      padding: '12px',
                      background: '#F8FAFC',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    <input
                      type="text"
                      placeholder="Link Title (e.g. Figma Design, PR, Google Sheet)"
                      value={linkTitle}
                      onChange={e => setLinkTitle(e.target.value)}
                      style={{
                        width: '100%',
                        height: '34px',
                        padding: '0 10px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.8rem',
                        boxSizing: 'border-box'
                      }}
                    />
                    <input
                      type="text"
                      placeholder="https://..."
                      value={linkUrl}
                      onChange={e => {
                        setLinkUrl(e.target.value);
                        if (linkError) setLinkError('');
                      }}
                      style={{
                        width: '100%',
                        height: '34px',
                        padding: '0 10px',
                        borderRadius: '8px',
                        border: linkError ? '1.5px solid #EF4444' : '1px solid #CBD5E1',
                        fontSize: '0.8rem',
                        boxSizing: 'border-box'
                      }}
                    />
                    {linkError && (
                      <span style={{ fontSize: '0.72rem', color: '#EF4444', fontWeight: 600 }}>{linkError}</span>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingLink(false);
                          setLinkError('');
                        }}
                        className="btn btn-secondary btn-sm"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary btn-sm"
                        style={{ background: '#0E7490', borderColor: '#0E7490' }}
                      >
                        Save Link
                      </button>
                    </div>
                  </form>
                )}

                {!task.links || task.links.length === 0 ? (
                  <div
                    style={{
                      padding: '18px',
                      background: '#F8FAFC',
                      borderRadius: '10px',
                      border: '1px dashed #CBD5E1',
                      textAlign: 'center',
                      fontSize: '0.78rem',
                      color: '#64748B'
                    }}
                  >
                    No resource links attached yet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {task.links.map(lnk => (
                      <div
                        key={lnk.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '8px 12px',
                          background: '#F8FAFC',
                          borderRadius: '10px',
                          border: '1px solid #E2E8F0'
                        }}
                      >
                        <a
                          href={lnk.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            color: '#0E7490',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            textDecoration: 'none',
                            minWidth: 0
                          }}
                        >
                          <Link2 size={14} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {lnk.title || lnk.url}
                          </span>
                          <ExternalLink size={12} />
                        </a>

                        {canDeleteLink && (
                          <button
                            type="button"
                            onClick={() => deleteTaskLink(task.id, lnk.id)}
                            style={{
                              padding: '4px 6px',
                              borderRadius: '6px',
                              border: '1px solid #FEE2E2',
                              background: '#FEF2F2',
                              color: '#EF4444',
                              cursor: 'pointer',
                              display: 'inline-flex'
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* STICKY FOOTER: Update Status ⌄ (Matches Reference Screen 4)*/}
        {/* ======================================================== */}
        <div
          style={{
            padding: '12px 18px',
            background: '#FFFFFF',
            borderTop: '1px solid #F1F5F9',
            position: 'relative',
            flexShrink: 0
          }}
        >
          {/* Quick Status Picker Popover */}
          {showQuickStatusMenu && canEditProcess && (
            <div
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 8px)',
                left: '18px',
                right: '18px',
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '14px',
                boxShadow: '0 12px 30px -4px rgba(15, 23, 42, 0.18)',
                padding: '6px',
                zIndex: 40,
                display: 'flex',
                flexDirection: 'column',
                gap: '2px'
              }}
            >
              {(['Pending', 'In Process', 'Under Review', 'Completed'] as const).map(st => (
                <button
                  key={st}
                  type="button"
                  onClick={() => handleProcessStageSelect(st)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: 'none',
                    background: processStage === st ? '#ECFEFF' : 'transparent',
                    color: processStage === st ? '#0E7490' : '#0F172A',
                    fontSize: '0.84rem',
                    fontWeight: processStage === st ? 800 : 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <span>{st}</span>
                  {processStage === st && <Check size={16} color="#0E7490" />}
                </button>
              ))}
            </div>
          )}

          {canEditProcess ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowQuickStatusMenu(prev => !prev)}
                style={{
                  flex: 1,
                  height: '44px',
                  borderRadius: '12px',
                  border: 'none',
                  background: '#0E7490',
                  color: '#FFFFFF',
                  fontSize: '0.9rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(14, 116, 144, 0.25)'
                }}
              >
                <span>Update Status</span>
                <ChevronDown size={17} />
              </button>

              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={isSubmitting}
                style={{
                  height: '44px',
                  padding: '0 18px',
                  borderRadius: '12px',
                  border: '1px solid #0E7490',
                  background: '#ECFEFF',
                  color: '#0E7490',
                  fontSize: '0.84rem',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer'
                }}
                title="Save & Close"
              >
                <Check size={16} /> Done
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              {(isAssignedByCurrentUser || isAdminOrHrOrCeo) && task.overallStatus !== 'OPEN' && (
                <button
                  type="button"
                  onClick={() => setShowReopenPrompt(true)}
                  style={{
                    flex: 1,
                    height: '42px',
                    borderRadius: '12px',
                    border: '1px solid #FCD34D',
                    background: '#FFFBEB',
                    color: '#B45309',
                    fontSize: '0.86rem',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    cursor: 'pointer'
                  }}
                >
                  <RotateCcw size={15} /> Reopen Task
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                style={{
                  flex: 1,
                  height: '42px',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  background: '#F8FAFC',
                  color: '#334155',
                  fontSize: '0.86rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* CLOSE & REOPEN MODALS                                    */}
        {/* ======================================================== */}
        {showClosePrompt && (
          <div className="modal-overlay" style={{ zIndex: 20010 }}>
            <div className="modal-content" style={{ maxWidth: '420px', borderRadius: '12px' }}>
              <div className="modal-header" style={{ padding: '14px 18px', background: '#0E7490', color: '#fff' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: '#fff' }}>
                  Sign-Off &amp; Close Task
                </h3>
                <button type="button" onClick={() => setShowClosePrompt(false)} style={{ color: '#fff' }}>
                  <X size={16} />
                </button>
              </div>
              <form
                onSubmit={handleExecuteClose}
                onKeyDown={handleFormKeyDown}
                className="modal-body"
                style={{ padding: '16px' }}
              >
                <p style={{ fontSize: '0.78rem', color: '#64748B', marginBottom: '10px' }}>
                  Verify that all deliverables, daily reports, and document evidence have been approved.
                </p>
                <textarea
                  rows={2}
                  placeholder="Verification remarks..."
                  value={closeRemarks}
                  onChange={e => setCloseRemarks(e.target.value)}
                  onKeyDown={preventSpaceEnterPropagation}
                  className="form-control"
                  style={{ fontSize: '0.8rem', marginBottom: '12px' }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowClosePrompt(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-sm"
                    style={{ background: '#10B981', color: '#fff', border: 'none' }}
                  >
                    Sign-Off &amp; Close
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showReopenPrompt && (
          <div className="modal-overlay" style={{ zIndex: 20010 }}>
            <div className="modal-content" style={{ maxWidth: '420px', borderRadius: '12px' }}>
              <div className="modal-header" style={{ padding: '14px 18px', background: '#F59E0B', color: '#fff' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: '#fff' }}>Reopen Task</h3>
                <button type="button" onClick={() => setShowReopenPrompt(false)} style={{ color: '#fff' }}>
                  <X size={16} />
                </button>
              </div>
              <form
                onSubmit={handleExecuteReopen}
                onKeyDown={handleFormKeyDown}
                className="modal-body"
                style={{ padding: '16px' }}
              >
                <p style={{ fontSize: '0.78rem', color: '#64748B', marginBottom: '10px' }}>
                  Provide reason for reopening this task. Action will be audited.
                </p>
                <textarea
                  rows={2}
                  placeholder="Reason for reopening..."
                  value={reopenReason}
                  onChange={e => setReopenReason(e.target.value)}
                  onKeyDown={preventSpaceEnterPropagation}
                  className="form-control"
                  style={{ fontSize: '0.8rem', marginBottom: '12px' }}
                  required
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowReopenPrompt(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-sm"
                    style={{ background: '#F59E0B', color: '#fff', border: 'none' }}
                  >
                    Confirm Reopen
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
