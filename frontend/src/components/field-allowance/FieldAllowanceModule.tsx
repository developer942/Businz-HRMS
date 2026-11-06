import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, CalendarDays, Check, ChevronRight, FileText,
  IndianRupee, Loader2, MapPin, Plus, Search, Send, WalletCards, X,
} from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import { fieldAllowanceService } from '../../services/fieldAllowanceService';
import type {
  FieldAllowanceDecision, FieldAllowanceDetail, FieldAllowanceRequest,
  FieldAllowanceRequestPayload, FieldAllowanceStatus, FieldAllowanceSummary,
} from '../../types/fieldAllowance';
import './FieldAllowance.css';

type Screen = 'home' | 'approvals' | 'new' | 'detail';

const STATUS_LABELS: Record<FieldAllowanceStatus, string> = {
  DRAFT: 'Draft', PENDING_APPROVAL: 'Pending Approval', CORRECTION_REQUESTED: 'Correction Requested',
  REJECTED: 'Rejected', APPROVED: 'Approved', AMOUNT_DISTRIBUTED: 'Amount Distributed',
  IN_PROGRESS: 'In Progress', COMPLETED: 'Completed',
};

const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
const displayDate = (value?: string) => value ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value.slice(0, 10)}T00:00:00`)) : '—';
const today = () => new Date().toISOString().slice(0, 10);

const StatusBadge = ({ status }: { status: FieldAllowanceStatus }) => (
  <span className={`fa-status fa-status--${status.toLowerCase()}`}>{STATUS_LABELS[status]}</span>
);

const KpiCard = ({ label, value, tone = 'default' }: { label: string; value: string | number; tone?: 'default' | 'positive' | 'negative' }) => (
  <div className={`fa-kpi fa-kpi--${tone}`}><span>{label}</span><strong>{value}</strong></div>
);

const EmptyState = ({ title, text }: { title: string; text: string }) => (
  <div className="fa-empty"><MapPin size={28} /><strong>{title}</strong><span>{text}</span></div>
);

const RequestCards = ({ rows, onOpen, actionLabel = 'View details' }: { rows: FieldAllowanceRequest[]; onOpen: (row: FieldAllowanceRequest) => void; actionLabel?: string }) => (
  <div className="fa-mobile-list">
    {rows.map(row => (
      <article className="fa-trip-card" key={row.id}>
        <div className="fa-trip-card__head"><div><small>{row.trip_code}</small><strong>{row.purpose}</strong></div><StatusBadge status={row.status} /></div>
        <div className="fa-trip-card__meta"><span><MapPin size={14} />{row.destination}</span><span><CalendarDays size={14} />{displayDate(row.start_date)} – {displayDate(row.end_date)}</span></div>
        <div className="fa-trip-card__money"><span>Allocated <b>{money(row.allocated_amount)}</b></span><span>Spent <b>{money(row.total_spent)}</b></span><span>Balance <b className={row.balance < 0 ? 'fa-negative' : ''}>{money(row.balance)}</b></span></div>
        <button className="fa-link-button" onClick={() => onOpen(row)}>{actionLabel}<ChevronRight size={16} /></button>
      </article>
    ))}
  </div>
);

export const FieldAllowanceModule: React.FC = () => {
  const { currentUser } = useHRMS();
  const role = currentUser.role || '';
  const isManagement = ['CEO', 'Super Admin', 'Admin', 'HR', 'HR Manager', 'HR Admin', 'Management', 'ERP Administrator'].includes(role);
  const roleKey = role.trim().toLowerCase();
  const departmentKey = (currentUser.department || '').trim().toLowerCase();
  const designationKey = (currentUser.designation || '').trim().toLowerCase();
  const isAccountsUser = ['finance manager', 'finance', 'accountant', 'accounts', 'accounts manager', 'accounts executive'].includes(roleKey) ||
    departmentKey.includes('accounts') || departmentKey.includes('finance') ||
    designationKey.includes('account') || designationKey.includes('finance');
  const [screen, setScreen] = useState<Screen>('home');
  const [rows, setRows] = useState<FieldAllowanceRequest[]>([]);
  const [detail, setDetail] = useState<FieldAllowanceDetail | null>(null);
  const [summary, setSummary] = useState<FieldAllowanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState<FieldAllowanceDetail | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [requestRows, summaryData] = await Promise.all([
        fieldAllowanceService.list(isAccountsUser && !isManagement ? { scope: 'mine' } : {}),
        isManagement ? fieldAllowanceService.summary() : Promise.resolve(null),
      ]);
      setRows(requestRows); setSummary(summaryData);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to load Field Allowance'); }
    finally { setLoading(false); }
  }, [isAccountsUser, isManagement]);

  useEffect(() => {
    const handle = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(handle);
  }, [refresh]);

  const openDetail = async (row: FieldAllowanceRequest) => {
    setLoading(true); setError('');
    try { setDetail(await fieldAllowanceService.detail(row.id)); setScreen('detail'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to load trip'); }
    finally { setLoading(false); }
  };

  const flash = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 3500); };
  const filtered = useMemo(() => rows.filter(row => {
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || [row.employee_name, row.employee_id, row.trip_code, row.purpose, row.destination].some(value => value?.toLowerCase().includes(term));
    return matchesSearch && (!statusFilter || row.status === statusFilter);
  }), [rows, search, statusFilter]);

  const goHome = () => { setDetail(null); setEditing(null); setScreen('home'); setError(''); };

  if (loading && !rows.length && !detail) return <div className="fa-loading"><Loader2 className="fa-spin" />Loading Field Allowance…</div>;

  return (
    <section className="fa-module">
      {notice && <div className="fa-toast" role="status"><Check size={18} />{notice}</div>}
      {error && <div className="fa-alert" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss"><X size={17} /></button></div>}

      {screen === 'new' && <RequestForm user={currentUser} initial={editing} busy={busy} onCancel={goHome} onSave={async payload => {
        setBusy(true); setError('');
        try {
          if (editing) await fieldAllowanceService.update(editing.id, payload);
          else await fieldAllowanceService.create(payload);
          flash(payload.submit ? 'Request submitted for approval' : 'Draft saved'); await refresh(); goHome();
        }
        catch (err) { setError(err instanceof Error ? err.message : 'Unable to save request'); }
        finally { setBusy(false); }
      }} />}

      {screen === 'detail' && detail && <TripDetail detail={detail} isManagement={isManagement} isAccounts={false} busy={busy} onBack={goHome} onEdit={() => { setEditing(detail); setScreen('new'); }} onChanged={async (message: string) => {
        setBusy(true); setError('');
        try { const fresh = await fieldAllowanceService.detail(detail.id); setDetail(fresh); await refresh(); flash(message); }
        catch (err) { setError(err instanceof Error ? err.message : 'Unable to update trip'); }
        finally { setBusy(false); }
      }} setBusy={setBusy} setError={setError} />}

      {!['new', 'detail'].includes(screen) && <>
        <header className="fa-page-header">
          <div><p className="fa-eyebrow">Finance & Payroll</p><h1>{isManagement ? 'Field Allowance' : 'My Field Allowance'}</h1><p>Manage field visit advances and day-wise business expenses.</p></div>
          {!isManagement && <button className="fa-button fa-button--primary" onClick={() => { setEditing(null); setScreen('new'); }}><Plus size={18} />New request</button>}
        </header>

        {isManagement && <nav className="fa-segment" aria-label="Field Allowance views">
          <button className={screen === 'home' ? 'active' : ''} onClick={() => setScreen('home')}>{isManagement ? 'Overview' : 'Approved requests'}</button>
          <button className={screen === 'approvals' ? 'active' : ''} onClick={() => setScreen('approvals')}>
            Approvals
          </button>
        </nav>}

        {screen === 'home' && isManagement && <ManagementDashboard summary={summary} rows={filtered} onOpen={openDetail} />}
        {screen === 'approvals' && isManagement && <ApprovalList rows={filtered} search={search} setSearch={setSearch} status={statusFilter} setStatus={setStatusFilter} onOpen={openDetail} />}
        {screen === 'home' && !isManagement && <EmployeeOverview rows={filtered} onOpen={openDetail} onNew={() => setScreen('new')} />}
      </>}
    </section>
  );
};

const EmployeeOverview = ({ rows, onOpen, onNew }: { rows: FieldAllowanceRequest[]; onOpen: (r: FieldAllowanceRequest) => void; onNew: () => void }) => {
  const allocated = rows.reduce((sum, row) => sum + row.allocated_amount, 0);
  const spent = rows.reduce((sum, row) => sum + row.total_spent, 0);
  return <>
    <div className="fa-kpi-grid fa-kpi-grid--three"><KpiCard label="Allocated Amount" value={money(allocated)} /><KpiCard label="Spent Amount" value={money(spent)} /><KpiCard label="Balance" value={money(allocated - spent)} tone={allocated - spent < 0 ? 'negative' : 'positive'} /></div>
    <div className="fa-panel"><div className="fa-panel__head"><div><h2>My field visits</h2><p>Requests, active trips, and completed visit history.</p></div></div>
      {!rows.length ? <EmptyState title="No field visits yet" text="Create a request when your next field visit is planned." /> : <RequestTable rows={rows} onOpen={onOpen} />}
    </div>
    {!rows.length && <button className="fa-button fa-button--primary fa-empty-action" onClick={onNew}><Plus size={18} />New Field Allowance Request</button>}
  </>;
};

const ManagementDashboard = ({ summary, rows, onOpen }: { summary: FieldAllowanceSummary | null; rows: FieldAllowanceRequest[]; onOpen: (r: FieldAllowanceRequest) => void }) => {
  const active = rows.filter(row => ['AMOUNT_DISTRIBUTED', 'IN_PROGRESS'].includes(row.status));
  return <>
    <div className="fa-kpi-grid fa-kpi-grid--six">
      <KpiCard label="Total Requests" value={summary?.total_requests || 0} /><KpiCard label="Pending Approval" value={summary?.pending_approval || 0} />
      <KpiCard label="Approved Requests" value={summary?.approved_requests || 0} /><KpiCard label="Total Distributed" value={money(summary?.total_distributed_amount || 0)} />
      <KpiCard label="Active Trips" value={summary?.active_trips || 0} /><KpiCard label="Total Spent" value={money(summary?.total_spent_amount || 0)} />
    </div>
    <div className="fa-panel"><div className="fa-panel__head"><div><h2>Active field visits</h2><p>Current allocation and spending at a glance.</p></div></div>
      {!active.length ? <EmptyState title="No active trips" text="Distributed trips will appear here." /> : <RequestTable rows={active} onOpen={onOpen} showEmployee />}
    </div>
  </>;
};

const Toolbar = ({ search, setSearch, status, setStatus }: { search: string; setSearch: (v: string) => void; status?: string; setStatus?: (v: string) => void }) => <div className="fa-toolbar">
  <label className="fa-search"><Search size={17} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee, trip, purpose…" /></label>
  {setStatus && <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter status"><option value="">All statuses</option><option value="PENDING_APPROVAL">Pending Approval</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="CORRECTION_REQUESTED">Correction Requested</option><option value="AMOUNT_DISTRIBUTED">Amount Distributed</option><option value="IN_PROGRESS">In Progress</option><option value="COMPLETED">Completed</option></select>}
</div>;

const ApprovalList = ({ rows, search, setSearch, status, setStatus, onOpen }: any) => <div className="fa-panel">
  <div className="fa-panel__head"><div><h2>Field Allowance Approvals</h2><p>Review employee requests and record a clear decision.</p></div></div>
  <Toolbar search={search} setSearch={setSearch} status={status} setStatus={setStatus} />
  {!rows.length ? <EmptyState title="No matching requests" text="New requests will appear here when employees submit them." /> : <RequestTable rows={rows} onOpen={onOpen} showEmployee actionLabel="Review" />}
</div>;

const RequestTable = ({ rows, onOpen, showEmployee = false, actionLabel = 'View details' }: { rows: FieldAllowanceRequest[]; onOpen: (r: FieldAllowanceRequest) => void; showEmployee?: boolean; actionLabel?: string }) => <>
  <div className="fa-table-wrap"><table className="fa-table"><thead><tr>{showEmployee && <th>Employee</th>}<th>Trip ID / Purpose</th><th>Destination</th><th>Dates</th><th>Status</th><th>Allocated</th><th>Spent</th><th>Balance</th><th></th></tr></thead><tbody>{rows.map(row => <tr key={row.id}>{showEmployee && <td><b>{row.employee_name}</b><small>{row.employee_id} · {row.department_name || '—'}</small></td>}<td><b>{row.trip_code}</b><small>{row.purpose}</small></td><td>{row.destination}</td><td>{displayDate(row.start_date)}<small>to {displayDate(row.end_date)}</small></td><td><StatusBadge status={row.status} /></td><td>{money(row.allocated_amount)}</td><td>{money(row.total_spent)}</td><td className={row.balance < 0 ? 'fa-negative' : 'fa-positive'}>{money(row.balance)}</td><td><button className="fa-table-action" onClick={() => onOpen(row)}>{actionLabel}<ChevronRight size={15} /></button></td></tr>)}</tbody></table></div>
  <RequestCards rows={rows} onOpen={onOpen} actionLabel={actionLabel} />
</>;

const RequestForm = ({ user, initial, busy, onCancel, onSave }: { user: any; initial?: FieldAllowanceDetail | null; busy: boolean; onCancel: () => void; onSave: (payload: FieldAllowanceRequestPayload) => void }) => {
  const [form, setForm] = useState({ purpose: initial?.purpose || '', customerSiteName: initial?.customer_site_name || '', destination: initial?.destination || '', startDate: initial?.start_date || '', endDate: initial?.end_date || '', travelMode: initial?.travel_mode || '', description: initial?.description || '', advanceRequired: initial?.advance_required ?? true, requestedAmount: initial?.advance_required ? String(initial.requested_amount) : '' });
  const [validation, setValidation] = useState('');
  const submit = (shouldSubmit: boolean) => {
    if (!form.purpose.trim() || !form.destination.trim() || !form.startDate || !form.endDate) { setValidation('Complete purpose, destination, and trip dates.'); return; }
    if (form.endDate < form.startDate) { setValidation('End date cannot be before start date.'); return; }
    const amount = form.advanceRequired ? Number(form.requestedAmount) : 0;
    if (amount < 0 || (form.advanceRequired && amount <= 0)) { setValidation('Enter a valid requested amount.'); return; }
    onSave({ ...form, requestedAmount: amount, submit: shouldSubmit });
  };
  const set = (key: string, value: any) => setForm(current => ({ ...current, [key]: value }));
  return <div className="fa-form-page"><button className="fa-back" onClick={onCancel}><ArrowLeft size={18} />Back to my requests</button>
    <div className="fa-panel fa-form-card"><div className="fa-panel__head"><div><h1>{initial ? 'Update Field Allowance Request' : 'New Field Allowance Request'}</h1><p>{initial ? 'Apply the requested correction, then resubmit for approval.' : 'Share the essentials. HR or CEO will review the requested advance.'}</p></div></div>
      <div className="fa-readonly-grid"><div><span>Employee</span><b>{user.name}</b></div><div><span>Employee ID</span><b>{user.employeeId || '—'}</b></div><div><span>Department</span><b>{user.department || '—'}</b></div></div>
      {validation && <div className="fa-inline-error">{validation}</div>}
      <div className="fa-form-grid">
        <label className="fa-field fa-field--wide"><span>Purpose / Visit Purpose *</span><input value={form.purpose} maxLength={200} onChange={e => set('purpose', e.target.value)} placeholder="e.g. Client site inspection" /></label>
        <label className="fa-field"><span>Customer / Site Name</span><input value={form.customerSiteName} onChange={e => set('customerSiteName', e.target.value)} placeholder="Optional" /></label>
        <label className="fa-field"><span>Work Location / Destination *</span><input value={form.destination} onChange={e => set('destination', e.target.value)} placeholder="City or site location" /></label>
        <label className="fa-field"><span>Start Date *</span><input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} /></label>
        <label className="fa-field"><span>End Date *</span><input type="date" min={form.startDate} value={form.endDate} onChange={e => set('endDate', e.target.value)} /></label>
        <label className="fa-field"><span>Travel Mode</span><select value={form.travelMode} onChange={e => set('travelMode', e.target.value)}><option value="">Select (optional)</option><option>Company Vehicle</option><option>Train</option><option>Flight</option><option>Bus</option><option>Cab</option><option>Own Vehicle</option><option>Other</option></select></label>
        <div className="fa-field"><span>Advance Required? *</span><div className="fa-choice"><button type="button" className={form.advanceRequired ? 'active' : ''} onClick={() => set('advanceRequired', true)}>Yes</button><button type="button" className={!form.advanceRequired ? 'active' : ''} onClick={() => { set('advanceRequired', false); set('requestedAmount', ''); }}>No</button></div></div>
        {form.advanceRequired && <label className="fa-field"><span>Requested Amount *</span><div className="fa-money-input"><IndianRupee size={16} /><input type="number" min="0" value={form.requestedAmount} onChange={e => set('requestedAmount', e.target.value)} placeholder="0" /></div></label>}
        <label className="fa-field fa-field--wide"><span>Description / Remarks</span><textarea rows={3} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Add useful visit details or instructions" /></label>
      </div>
      <div className="fa-form-actions"><button className="fa-button fa-button--ghost" disabled={busy} onClick={onCancel}>Cancel</button><button className="fa-button fa-button--secondary" disabled={busy} onClick={() => submit(false)}>Save draft</button><button className="fa-button fa-button--primary" disabled={busy} onClick={() => submit(true)}>{busy ? <Loader2 className="fa-spin" size={18} /> : <Send size={18} />}Submit request</button></div>
    </div>
  </div>;
};

const TripDetail = ({ detail, isManagement, isAccounts, busy, onBack, onEdit, onChanged, setBusy, setError }: any) => {
  const [decision, setDecision] = useState<FieldAllowanceDecision>('APPROVED');
  const [approvedAmount, setApprovedAmount] = useState(String(detail.requested_amount));
  const [decisionRemarks, setDecisionRemarks] = useState('');
  const [distribution, setDistribution] = useState({ distributedAmount: String(detail.approved_amount), distributionDate: today(), paymentMethod: 'Bank Transfer', referenceNumber: '', remarks: '' });
  const [expense, setExpense] = useState({ expenseDate: today(), category: 'TRAVEL', amount: '', description: '', attachmentPath: '' });
  const canAddExpense = !isManagement && !isAccounts && (['AMOUNT_DISTRIBUTED', 'IN_PROGRESS'].includes(detail.status) || (!detail.advance_required && detail.status === 'APPROVED'));
  const fileChange = (file?: File) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setError('Proof file must be 2 MB or smaller.'); return; }
    const reader = new FileReader(); reader.onload = () => setExpense((e: any) => ({ ...e, attachmentPath: String(reader.result || '') })); reader.readAsDataURL(file);
  };
  const act = async (work: () => Promise<any>, message: string) => { setBusy(true); setError(''); try { await work(); await onChanged(message); } catch (err) { setError(err instanceof Error ? err.message : 'Unable to update trip'); setBusy(false); } };
  return <div className="fa-detail-page"><button className="fa-back" onClick={onBack}><ArrowLeft size={18} />Back</button>
    <div className="fa-detail-heading"><div><div className="fa-detail-title"><h1>{detail.purpose}</h1><StatusBadge status={detail.status} /></div><p>{detail.trip_code} · {detail.destination} · {displayDate(detail.start_date)} – {displayDate(detail.end_date)}</p></div></div>
    <div className="fa-kpi-grid fa-kpi-grid--three"><KpiCard label="Allocated Amount" value={money(detail.allocated_amount)} /><KpiCard label="Spent Amount" value={money(detail.total_spent)} /><KpiCard label="Balance" value={money(detail.balance)} tone={detail.balance < 0 ? 'negative' : 'positive'} /></div>
    <div className="fa-detail-layout"><main>
      <div className="fa-panel"><div className="fa-panel__head"><div><h2>Trip details</h2><p>{detail.employee_name} · {detail.employee_id} · {detail.department_name || 'No department'}</p></div></div>
        <dl className="fa-detail-grid"><div><dt>Destination</dt><dd>{detail.destination}</dd></div><div><dt>Customer / Site</dt><dd>{detail.customer_site_name || '—'}</dd></div><div><dt>Travel mode</dt><dd>{detail.travel_mode || '—'}</dd></div><div><dt>Advance requested</dt><dd>{detail.advance_required ? money(detail.requested_amount) : 'No advance'}</dd></div><div className="wide"><dt>Remarks</dt><dd>{detail.description || '—'}</dd></div></dl>
      </div>
      <div className="fa-panel"><div className="fa-panel__head"><div><h2>Daily Expense Report</h2><p>Day-wise spending and supporting proof for this trip.</p></div>{canAddExpense && <span className="fa-small-note">Add expenses below</span>}</div>
        {!detail.daily_reports.length ? <EmptyState title="No daily reports" text="Expense entries will appear here." /> : <div className="fa-expense-list">{detail.daily_reports.map((item: any) => <div className="fa-expense-row" key={item.id}><div className="fa-expense-icon"><FileText size={18} /></div><div><b>{item.category.charAt(0) + item.category.slice(1).toLowerCase()}</b><span>{item.description}</span></div><time>{displayDate(item.expense_date)}</time><strong>{money(item.amount)}</strong>{item.attachment_path ? <a href={item.attachment_path} target="_blank" rel="noreferrer">View proof</a> : <span className="fa-muted">No proof</span>}</div>)}</div>}
        <div className="fa-totals"><span>Total Spent <b>{money(detail.total_spent)}</b></span><span>Current Balance <b className={detail.balance < 0 ? 'fa-negative' : 'fa-positive'}>{money(detail.balance)}</b></span></div>
      </div>
      {canAddExpense && <div className="fa-panel"><div className="fa-panel__head"><div><h2>Add daily report</h2><p>Record one expense with an optional bill or proof.</p></div></div><div className="fa-form-grid">
        <label className="fa-field"><span>Expense Date *</span><input type="date" min={detail.start_date} max={detail.end_date} value={expense.expenseDate} onChange={e => setExpense({ ...expense, expenseDate: e.target.value })} /></label>
        <label className="fa-field"><span>Category *</span><select value={expense.category} onChange={e => setExpense({ ...expense, category: e.target.value })}><option value="TRAVEL">Travel</option><option value="FOOD">Food</option><option value="ROOM">Room</option><option value="BUS">Bus</option><option value="FUEL">Fuel</option><option value="OTHER">Other</option></select></label>
        <label className="fa-field"><span>Amount *</span><input type="number" min="0.01" value={expense.amount} onChange={e => setExpense({ ...expense, amount: e.target.value })} placeholder="0" /></label>
        <label className="fa-field"><span>Bill / Proof</span><input className="fa-file" type="file" accept="image/*,.pdf" onChange={e => fileChange(e.target.files?.[0])} /></label>
        <label className="fa-field fa-field--wide"><span>Description *</span><input value={expense.description} onChange={e => setExpense({ ...expense, description: e.target.value })} placeholder="What was this expense for?" /></label>
      </div><div className="fa-form-actions"><button className="fa-button fa-button--primary" disabled={busy || !expense.amount || !expense.description.trim()} onClick={() => act(() => fieldAllowanceService.addDailyReport(detail.id, { ...expense, amount: Number(expense.amount) }), 'Daily expense added')}><Plus size={18} />Add Daily Report</button></div></div>}
    </main><aside>
      {isManagement && detail.status === 'PENDING_APPROVAL' && <div className="fa-panel fa-action-panel"><h2>Review request</h2><p>Record one clear decision for the employee.</p><label className="fa-field"><span>Decision</span><select value={decision} onChange={e => setDecision(e.target.value as FieldAllowanceDecision)}><option value="APPROVED">Approve</option><option value="CORRECTION_REQUESTED">Request correction</option><option value="REJECTED">Reject</option></select></label>{decision === 'APPROVED' && <label className="fa-field"><span>Approved amount</span><input type="number" min="0" value={approvedAmount} onChange={e => setApprovedAmount(e.target.value)} /></label>}<label className="fa-field"><span>Remarks {decision !== 'APPROVED' && '*'}</span><textarea rows={3} value={decisionRemarks} onChange={e => setDecisionRemarks(e.target.value)} /></label><button className="fa-button fa-button--primary fa-button--full" disabled={busy || (decision !== 'APPROVED' && !decisionRemarks.trim())} onClick={() => act(() => fieldAllowanceService.decide(detail.id, { decision, approvedAmount: Number(approvedAmount), remarks: decisionRemarks }), 'Decision recorded')}>Confirm Decision</button></div>}
      {isAccounts && detail.status === 'APPROVED' && detail.advance_required && <div className="fa-panel fa-action-panel"><h2>Distribute amount</h2><p>Record the payment made to the employee.</p><label className="fa-field"><span>Amount distributed</span><input type="number" min="0.01" max={detail.approved_amount} value={distribution.distributedAmount} onChange={e => setDistribution({ ...distribution, distributedAmount: e.target.value })} /></label><label className="fa-field"><span>Distribution date</span><input type="date" value={distribution.distributionDate} onChange={e => setDistribution({ ...distribution, distributionDate: e.target.value })} /></label><label className="fa-field"><span>Payment method</span><select value={distribution.paymentMethod} onChange={e => setDistribution({ ...distribution, paymentMethod: e.target.value })}><option>Bank Transfer</option><option>UPI</option><option>Cash</option><option>Cheque</option><option>Other</option></select></label><label className="fa-field"><span>Reference number</span><input value={distribution.referenceNumber} onChange={e => setDistribution({ ...distribution, referenceNumber: e.target.value })} /></label><label className="fa-field"><span>Remarks</span><textarea rows={2} value={distribution.remarks} onChange={e => setDistribution({ ...distribution, remarks: e.target.value })} /></label><button className="fa-button fa-button--primary fa-button--full" disabled={busy || Number(distribution.distributedAmount) <= 0} onClick={() => act(() => fieldAllowanceService.distribute(detail.id, { ...distribution, distributedAmount: Number(distribution.distributedAmount) }), 'Distribution recorded')}>Confirm Distribution</button></div>}
      {!isManagement && !isAccounts && ['DRAFT', 'CORRECTION_REQUESTED'].includes(detail.status) && <div className="fa-panel fa-action-panel"><h2>{detail.status === 'DRAFT' ? 'Continue draft' : 'Correction requested'}</h2><p>{detail.approvals?.[0]?.remarks || 'Update the request details and submit it for approval.'}</p><button className="fa-button fa-button--primary fa-button--full" disabled={busy} onClick={onEdit}><FileText size={18} />Edit and submit</button></div>}
      {!isManagement && !isAccounts && (['AMOUNT_DISTRIBUTED', 'IN_PROGRESS'].includes(detail.status) || (!detail.advance_required && detail.status === 'APPROVED')) && <div className="fa-panel fa-action-panel"><h2>Finish this visit</h2><p>Complete the trip after all daily expenses have been entered.</p><button className="fa-button fa-button--secondary fa-button--full" disabled={busy} onClick={() => act(() => fieldAllowanceService.complete(detail.id), 'Field visit completed')}><Check size={18} />Complete visit</button></div>}
      <div className="fa-panel fa-action-panel"><h2>Workflow</h2><div className="fa-timeline"><span className="done"><Check size={14} />Request created</span><span className={['DRAFT','PENDING_APPROVAL','CORRECTION_REQUESTED','REJECTED'].includes(detail.status) ? '' : 'done'}><Check size={14} />Approval</span><span className={detail.allocated_amount > 0 ? 'done' : ''}><WalletCards size={14} />Amount distributed</span><span className={['IN_PROGRESS','COMPLETED'].includes(detail.status) ? 'done' : ''}><FileText size={14} />Daily reports</span><span className={detail.status === 'COMPLETED' ? 'done' : ''}><Check size={14} />Completed</span></div></div>
    </aside></div>
  </div>;
};

export default FieldAllowanceModule;
