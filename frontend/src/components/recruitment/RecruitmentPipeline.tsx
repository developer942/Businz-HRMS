import React, { useEffect, useState } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { 
  Briefcase, 
  Plus, 
  Users, 
  UserPlus, 
  CheckCircle2, 
  ArrowRight, 
  Check, 
  X, 
  ShieldCheck, 
  AlertCircle, 
  Clock, 
  Award,
  UserCheck
} from 'lucide-react';
import { Candidate } from '../../types/hrms';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';

export const RecruitmentPipeline: React.FC = () => {
  const { 
    jobOpenings, 
    candidates, 
    addJobOpening, 
    updateCandidateStage, 
    referCandidate, 
    reviewReferral, 
    addEmployee, 
    currentUser,
    employees
  } = useHRMS();

  // Strict Role Scoping: HR & CEO manage recruitment pipeline and post jobs
  const isHrOrCeo =
    currentUser.role === 'Super Admin' ||
    currentUser.role === 'CEO' || 
    currentUser.role === 'HR Admin' || 
    currentUser.role === 'HR Manager' || 
    currentUser.role === 'HR' || 
    (currentUser.department && (currentUser.department.toLowerCase() === 'hr' || currentUser.department.toLowerCase() === 'human resources')) ||
    (currentUser.designation && currentUser.designation.toLowerCase().includes('hr')) ||
    currentUser.designation === 'CEO' ||
    (currentUser.designation && currentUser.designation.toLowerCase().includes('ceo'));

  const isEmployeeRole = (currentUser.role === 'Employee' || currentUser.role === 'Assignee') && !isHrOrCeo;
  const canReferCandidate = isEmployeeRole || isHrOrCeo;
  const canAcceptReferral = isHrOrCeo;
  const canPostJob = isHrOrCeo;
  const canApprovePipeline = isHrOrCeo;

  const [activeTab, setActiveTab] = useState<'pipeline' | 'jobs' | 'referral'>(() => {
    return isEmployeeRole ? 'referral' : 'pipeline';
  });

  useEffect(() => {
    if (isEmployeeRole && activeTab !== 'referral') {
      setActiveTab('referral');
    }
  }, [activeTab, isEmployeeRole]);
  const [showAddJobModal, setShowAddJobModal] = useState(false);
  const [showReferralModal, setShowReferralModal] = useState(false);

  // Quick review modal state for HR & CEO
  const [selectedReferral, setSelectedReferral] = useState<Candidate | null>(null);
  const [reviewActionType, setReviewActionType] = useState<'accept' | 'reject' | 'hire'>('accept');
  const [reviewNotes, setReviewNotes] = useState('');

  const [jobForm, setJobForm] = useState({
    title: '',
    department: 'Engineering',
    location: 'Chennai, TN',
    type: 'Full-Time' as any,
    experience: '3+ Years',
    positions: 2,
    salaryRange: '₹6L - ₹10L',
    description: ''
  });

  const [referralForm, setReferralForm] = useState({
    name: '',
    email: '',
    phone: '',
    jobId: jobOpenings[0]?.id || 'JOB-01',
    notes: ''
  });
  const [referralError, setReferralError] = useState<string | null>(null);

  const sanitizeCandidateName = (value: string) => value.replace(/[^A-Za-z\s.'-]/g, '').replace(/\s{2,}/g, ' ');
  const sanitizePhoneNumber = (value: string) => value.replace(/\D/g, '').slice(0, 10);

  const handleCreateJob = (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobForm.title) return;
    addJobOpening({
      title: jobForm.title,
      department: jobForm.department,
      location: jobForm.location,
      type: jobForm.type,
      experience: jobForm.experience,
      positions: Number(jobForm.positions),
      salaryRange: jobForm.salaryRange,
      status: 'Active',
      description: jobForm.description
    });
    setShowAddJobModal(false);
  };

  const handleReferral = (e: React.FormEvent) => {
    e.preventDefault();
    const candidateName = referralForm.name.trim();
    const phoneNumber = sanitizePhoneNumber(referralForm.phone);

    if (!candidateName) {
      setReferralError('Candidate full name is required.');
      return;
    }
    if (!/^[A-Za-z][A-Za-z\s.'-]*$/.test(candidateName)) {
      setReferralError('Candidate name must contain letters only.');
      return;
    }
    if (phoneNumber && phoneNumber.length !== 10) {
      setReferralError('Phone number must be exactly 10 digits.');
      return;
    }

    const targetJob = jobOpenings.find(j => j.id === referralForm.jobId);
    referCandidate({
      jobId: referralForm.jobId,
      jobTitle: targetJob?.title || 'Open Role',
      name: candidateName,
      email: referralForm.email,
      phone: phoneNumber,
      referrerEmployeeId: currentUser.employeeId || '',
      referrerName: `${currentUser.name} (Employee)`,
      rating: 5,
      notes: referralForm.notes
    });
    setReferralForm({
      name: '',
      email: '',
      phone: '',
      jobId: jobOpenings[0]?.id || 'JOB-01',
      notes: ''
    });
    setReferralError(null);
    setShowReferralModal(false);
  };

  // Convert Hired candidate to Employee directly!
  const convertCandidateToEmployee = (cand: Candidate) => {
    addEmployee({
      employeeId: '',
      firstName: cand.name.split(' ')[0] || cand.name,
      lastName: cand.name.split(' ')[1] || 'Candidate',
      email: cand.email,
      phone: cand.phone,
      dob: '1995-01-01',
      gender: 'Other',
      address: 'VRM Company Onboarding',
      department: 'Production Head',
      designation: cand.jobTitle,
      reportingManagerId: employees[0]?.employeeId || 'EMP-000',
      reportingManagerName: employees[0] ? `${employees[0].firstName} ${employees[0].lastName}`.trim() : 'Velmurugan',
      joiningDate: new Date().toISOString().split('T')[0],
      employmentType: 'Full-Time',
      status: 'Active',
      avatar: '',
      basicSalary: 12000,
      allowances: { hra: 3000, transport: 1000, medical: 500, special: 1000 },
      bankDetails: { bankName: 'HDFC Bank', accountNumber: '50100223344', ifscCode: 'HDFC0001', branch: 'Chennai Main' },
      attendanceMethod: 'Face Scan',
      gpsAllowed: true,
      faceRegistered: false,
      documents: []
    });
    updateCandidateStage(cand.id, 'Hired');
  };

  const handleExecuteReview = () => {
    if (!selectedReferral) return;
    const reviewerTitle = currentUser.role === 'Super Admin' ? 'CEO' : 'HR';
    const reviewerSignature = `${currentUser.name} (${reviewerTitle})`;

    if (reviewActionType === 'accept') {
      reviewReferral(
        selectedReferral.id,
        'Accepted',
        reviewerSignature,
        reviewNotes || 'Referral accepted by executive management for interview scheduling.',
        'Interview'
      );
    } else if (reviewActionType === 'reject') {
      reviewReferral(
        selectedReferral.id,
        'Rejected',
        reviewerSignature,
        reviewNotes || 'Referral rejected after review.',
        'Rejected'
      );
    } else if (reviewActionType === 'hire') {
      reviewReferral(
        selectedReferral.id,
        'Accepted',
        reviewerSignature,
        reviewNotes || 'Referral accepted and approved for immediate onboarding.',
        'Hired'
      );
      convertCandidateToEmployee(selectedReferral);
    }

    setSelectedReferral(null);
    setReviewNotes('');
  };

  const stages: Candidate['stage'][] = ['Applied', 'Screening', 'Interview', 'Selected', 'Hired', 'Rejected'];

  // Referral counts
  const normalizePerson = (value?: string) => (value || '').replace(/\s*\([^)]*\)/g, '').trim().toLowerCase();
  const currentEmployeeId = (currentUser.employeeId || '').trim().toLowerCase();
  const currentUserName = normalizePerson(currentUser.name);
  const isOwnReferral = (candidate: Candidate) => {
    const referrerId = (candidate.referrerEmployeeId || '').trim().toLowerCase();
    const referrerName = normalizePerson(candidate.referrerName);
    return Boolean(
      (currentEmployeeId && referrerId === currentEmployeeId) ||
      (currentUserName && referrerName === currentUserName)
    );
  };
  const visibleCandidates = isHrOrCeo ? candidates : candidates.filter(isOwnReferral);
  const referralCandidates = visibleCandidates.filter(c => c.referrerName);
  const pendingReferralsCount = referralCandidates.filter(c => (c.referralStatus || 'Pending') === 'Pending').length;
  const acceptedReferralsCount = referralCandidates.filter(c => c.referralStatus === 'Accepted').length;
  const hiredReferralsCount = referralCandidates.filter(c => c.stage === 'Hired').length;

  return (
    <div>
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div className="page-title-group">
          <h1>{isEmployeeRole ? 'Referral Portal' : 'Recruitment & Referral Portal'}</h1>
        </div>
        <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {canPostJob && (
            <button 
              className="btn btn-primary btn-sm" 
              onClick={() => setShowAddJobModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                borderRadius: '12px',
                padding: '9px 18px',
                fontWeight: 700
              }}
            >
              <Plus size={16} /> Create Job Opening
            </button>
          )}

          {/* REFER CANDIDATE BUTTON */}
          {canReferCandidate && (
            <button 
              className={`btn ${canPostJob ? 'btn-secondary' : 'btn-primary'} btn-sm`} 
              onClick={() => {
                setReferralError(null);
                setShowReferralModal(true);
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, borderRadius: '12px', padding: '9px 18px' }}
            >
              <UserPlus size={16} /> Refer Candidate
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-container" style={{ marginBottom: '20px' }}>
        {!isEmployeeRole && (
          <button 
            className={`tab-btn ${activeTab === 'pipeline' ? 'active' : ''}`} 
            onClick={() => setActiveTab('pipeline')}
          >
            Application Pipeline Board ({visibleCandidates.length})
          </button>
        )}
        <button 
          className={`tab-btn ${activeTab === 'referral' ? 'active' : ''}`} 
          onClick={() => setActiveTab('referral')}
        >
          Employee Referral Portal ({referralCandidates.length})
          {pendingReferralsCount > 0 && (
            <span style={{ 
              marginLeft: '6px', 
              background: '#F59E0B', 
              color: '#fff', 
              fontSize: '0.68rem', 
              padding: '1px 6px', 
              borderRadius: '9999px', 
              fontWeight: 700 
            }}>
              {pendingReferralsCount} Pending
            </span>
          )}
        </button>
        {!isEmployeeRole && (
          <button 
            className={`tab-btn ${activeTab === 'jobs' ? 'active' : ''}`} 
            onClick={() => setActiveTab('jobs')}
          >
            Active Job Openings ({jobOpenings.length})
          </button>
        )}
      </div>

      {/* TAB 1: KANBAN PIPELINE BOARD (HR & CEO) */}
      {activeTab === 'pipeline' && (
        <div className="kanban-grid">
          {stages.map(stage => {
            const stageCandidates = visibleCandidates.filter(c => c.stage === stage);
            return (
              <div key={stage} className="kanban-col" style={{ minHeight: '450px', padding: '10px' }}>
                <div className="kanban-col-header" style={{ fontSize: '0.78rem' }}>
                  <span>{stage}</span>
                  <span className="badge-count" style={{ position: 'static' }}>{stageCandidates.length}</span>
                </div>

                {stageCandidates.map(c => {
                  const isReferral = !!c.referrerName;
                  const referralStatus = c.referralStatus || (isReferral ? 'Pending' : undefined);

                  return (
                    <div key={c.id} className="kanban-card" style={{ padding: '10px' }}>
                      <h4 style={{ fontSize: '0.85rem', fontWeight: 700 }}>{c.name}</h4>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '2px 0 6px' }}>{c.jobTitle}</p>
                      
                      {/* Referral Badge */}
                      {isReferral && (
                        <div style={{ marginBottom: '6px' }}>
                          <span style={{ 
                            fontSize: '0.65rem', 
                            padding: '2px 6px', 
                            borderRadius: '4px',
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: referralStatus === 'Accepted' ? '#DCFCE7' : referralStatus === 'Rejected' ? '#FEE2E2' : '#FEF3C7',
                            color: referralStatus === 'Accepted' ? '#15803D' : referralStatus === 'Rejected' ? '#B91C1C' : '#B45309',
                            border: referralStatus === 'Accepted' ? '1px solid #BBF7D0' : referralStatus === 'Rejected' ? '1px solid #FECACA' : '1px solid #FDE68A'
                          }}>
                            {referralStatus === 'Accepted' ? '✓ Ref Accepted' : referralStatus === 'Rejected' ? '✕ Ref Rejected' : 'Ref Pending'} 
                            • By {c.referrerName}
                          </span>
                        </div>
                      )}


                      {/* HR & CEO Pipeline Controls */}
                      {canApprovePipeline ? (
                        <div>
                          <select
                            style={{ width: '100%', fontSize: '0.7rem', padding: '3px', borderRadius: '4px', border: '1px solid var(--border-medium)', marginBottom: '4px' }}
                            value={c.stage}
                            onChange={e => {
                              const newStg = e.target.value as Candidate['stage'];
                              if (newStg === 'Hired') {
                                convertCandidateToEmployee(c);
                              } else {
                                updateCandidateStage(c.id, newStg);
                              }
                            }}
                          >
                            {stages.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>

                          {/* Quick Accept button for pending referrals right on kanban */}
                          {isReferral && referralStatus === 'Pending' && (
                            <button
                              onClick={() => {
                                setSelectedReferral(c);
                                setReviewActionType('accept');
                              }}
                              style={{
                                width: '100%',
                                marginTop: '4px',
                                fontSize: '0.68rem',
                                padding: '3px 6px',
                                background: '#ECFDF5',
                                border: '1px solid #A7F3D0',
                                color: '#047857',
                                borderRadius: '4px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px'
                              }}
                            >
                              <Check size={11} /> Accept Referral
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="status-pill pending" style={{ fontSize: '0.65rem', display: 'block', textAlign: 'center' }}>
                          Stage: {c.stage}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 2: EMPLOYEE REFERRAL PORTAL */}
      {activeTab === 'referral' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Referral KPI Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <div className="card" style={{ padding: '14px', marginBottom: 0 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>Total Candidate Referrals</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1E293B', marginTop: '4px' }}>
                {referralCandidates.length}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#0E7490', marginTop: '2px' }}>Submitted by employees</div>
            </div>

            <div className="card" style={{ padding: '14px', marginBottom: 0, borderLeft: '4px solid #F59E0B' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>Pending HR / CEO Review</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#D97706', marginTop: '4px' }}>
                {pendingReferralsCount}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#B45309', marginTop: '2px' }}>Awaiting executive decision</div>
            </div>

            <div className="card" style={{ padding: '14px', marginBottom: 0, borderLeft: '4px solid #10B981' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>Accepted Referrals</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#059669', marginTop: '4px' }}>
                {acceptedReferralsCount}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#15803D', marginTop: '2px' }}>Approved by HR & CEO</div>
            </div>

            <div className="card" style={{ padding: '14px', marginBottom: 0, borderLeft: '4px solid #0E7490' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>Hired from Referrals</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0E7490', marginTop: '4px' }}>
                {hiredReferralsCount}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#0E7490', marginTop: '2px' }}>Onboarded as team members</div>
            </div>
          </div>

          {/* Referrals Main Table */}
          <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '0.98rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                Referred Candidate Applications
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                  Showing {referralCandidates.length} referrals
                </span>
              </div>
            </div>

            <div className="table-responsive">
              <table className="hrms-table" style={{ width: '100%', minWidth: '1000px' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC' }}>
                    <th style={{ minWidth: '180px' }}>Candidate</th>
                    <th style={{ minWidth: '180px' }}>Target Position</th>
                    <th style={{ minWidth: '150px' }}>Referred By</th>
                    <th style={{ minWidth: '110px' }}>Applied Date</th>
                    <th style={{ minWidth: '170px' }}>Referral Status</th>
                    <th style={{ minWidth: '120px' }}>Pipeline Stage</th>
                    <th style={{ minWidth: '180px', textAlign: 'right' }}>
                      {canAcceptReferral ? 'HR & CEO Actions' : 'Status'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {referralCandidates.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
                        <Users size={36} style={{ opacity: 0.3, margin: '0 auto 8px' }} />
                        <div>No candidate referrals found.</div>
                        {canReferCandidate && (
                          <div style={{ marginTop: '6px' }}>
                            <button 
                              className="btn btn-primary btn-sm" 
                              onClick={() => {
                                setReferralError(null);
                                setShowReferralModal(true);
                              }}
                              style={{ fontSize: '0.75rem' }}
                            >
                              Refer First Candidate
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : (
                    referralCandidates.map(c => {
                      const referralStatus = c.referralStatus || 'Pending';

                      return (
                        <tr key={c.id}>
                          {/* Candidate Info */}
                          <td>
                            <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.86rem' }}>{c.name}</div>
                            <div style={{ fontSize: '0.74rem', color: '#64748B' }}>{c.email}</div>
                            <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>{c.phone}</div>
                          </td>

                          {/* Position */}
                          <td>
                            <div style={{ fontWeight: 600, color: '#334155', fontSize: '0.82rem' }}>{c.jobTitle}</div>
                            {c.notes && (
                              <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '2px', fontStyle: 'italic' }}>
                                "{c.notes}"
                              </div>
                            )}
                          </td>

                          {/* Referred By */}
                          <td>
                            <div style={{ fontWeight: 600, color: '#0E7490', fontSize: '0.82rem' }}>
                              {c.referrerName || 'Employee'}
                            </div>
                            <span style={{ fontSize: '0.68rem', color: '#64748B', background: '#F1F5F9', padding: '1px 6px', borderRadius: '4px' }}>
                              {c.referrerEmployeeId || 'EMP-REF'}
                            </span>
                          </td>

                          {/* Date */}
                          <td>
                            <span style={{ fontSize: '0.78rem', color: '#475569', whiteSpace: 'nowrap' }}>{formatDateDDMMYYYY(c.appliedDate)}</span>
                          </td>

                          {/* Referral Status */}
                          <td>
                            {referralStatus === 'Pending' && (
                              <span style={{ 
                                fontSize: '0.72rem', 
                                fontWeight: 600, 
                                padding: '4px 9px', 
                                borderRadius: '9999px',
                                background: '#FEF3C7', 
                                color: '#B45309',
                                border: '1px solid #FDE68A',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px'
                              }}>
                                <Clock size={11} /> Pending HR/CEO Review
                              </span>
                            )}

                            {referralStatus === 'Accepted' && (
                              <div>
                                <span style={{ 
                                  fontSize: '0.72rem', 
                                  fontWeight: 600, 
                                  padding: '4px 9px', 
                                  borderRadius: '9999px',
                                  background: '#DCFCE7', 
                                  color: '#15803D',
                                  border: '1px solid #BBF7D0',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px'
                                }}>
                                  <Check size={11} /> ✓ Accepted
                                </span>
                                {c.referralReviewedBy && (
                                  <div style={{ fontSize: '0.68rem', color: '#166534', marginTop: '3px' }}>
                                    By {c.referralReviewedBy}
                                  </div>
                                )}
                              </div>
                            )}

                            {referralStatus === 'Rejected' && (
                              <div>
                                <span style={{ 
                                  fontSize: '0.72rem', 
                                  fontWeight: 600, 
                                  padding: '4px 9px', 
                                  borderRadius: '9999px',
                                  background: '#FEE2E2', 
                                  color: '#B91C1C',
                                  border: '1px solid #FECACA',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px'
                                }}>
                                  <X size={11} /> ✕ Rejected
                                </span>
                                {c.referralReviewedBy && (
                                  <div style={{ fontSize: '0.68rem', color: '#991B1B', marginTop: '3px' }}>
                                    By {c.referralReviewedBy}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Pipeline Stage */}
                          <td>
                            <span className={`status-pill ${c.stage === 'Hired' ? 'active' : c.stage === 'Rejected' ? 'inactive' : 'pending'}`} style={{ fontSize: '0.72rem' }}>
                              {c.stage}
                            </span>
                          </td>

                          {/* ACTIONS: Strictly HR & CEO */}
                          <td style={{ textAlign: 'right' }}>
                            {canAcceptReferral ? (
                              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', flexWrap: 'wrap' }}>
                                {referralStatus === 'Pending' && (
                                  <>
                                    <button
                                      onClick={() => {
                                        setSelectedReferral(c);
                                        setReviewActionType('accept');
                                      }}
                                      title="Accept this referral for interview"
                                      style={{
                                        fontSize: '0.72rem',
                                        padding: '5px 10px',
                                        borderRadius: '6px',
                                        background: '#0E7490',
                                        color: '#ffffff',
                                        border: 'none',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        boxShadow: '0 1px 2px rgba(14, 116, 144, 0.2)'
                                      }}
                                    >
                                      <Check size={12} /> Accept Referral
                                    </button>

                                    <button
                                      onClick={() => {
                                        setSelectedReferral(c);
                                        setReviewActionType('reject');
                                      }}
                                      title="Reject this referral"
                                      style={{
                                        fontSize: '0.72rem',
                                        padding: '5px 9px',
                                        borderRadius: '6px',
                                        background: '#FEF2F2',
                                        color: '#DC2626',
                                        border: '1px solid #FECACA',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '3px'
                                      }}
                                    >
                                      <X size={12} /> Reject
                                    </button>
                                  </>
                                )}

                                {referralStatus === 'Accepted' && c.stage !== 'Hired' && (
                                  <button
                                    onClick={() => {
                                      setSelectedReferral(c);
                                      setReviewActionType('hire');
                                    }}
                                    title="Directly hire and create Employee profile"
                                    style={{
                                      fontSize: '0.72rem',
                                      padding: '5px 10px',
                                      borderRadius: '6px',
                                      background: '#059669',
                                      color: '#ffffff',
                                      border: 'none',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px'
                                    }}
                                  >
                                    <Award size={12} /> Hire as Employee
                                  </button>
                                )}

                                {c.stage === 'Hired' && (
                                  <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    <CheckCircle2 size={13} /> Active Employee
                                  </span>
                                )}

                                {referralStatus === 'Rejected' && (
                                  <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                                    Decision Finalized
                                  </span>
                                )}
                              </div>
                            ) : (
                              /* Read-only feedback for Employees and other roles */
                              <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                {referralStatus === 'Pending' && 'Awaiting HR / CEO Approval'}
                                {referralStatus === 'Accepted' && '✓ Approved by Executive Panel'}
                                {referralStatus === 'Rejected' && '✕ Referral Declined'}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ACTIVE JOB OPENINGS */}
      {activeTab === 'jobs' && (
        <div>
          {canPostJob && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                  Company Job Openings ({jobOpenings.length})
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                  Manage published job vacancies and track applicant counts
                </p>
              </div>
              <button 
                className="btn btn-primary btn-sm"
                onClick={() => setShowAddJobModal(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  borderRadius: '10px',
                  padding: '8px 16px',
                  fontWeight: 700
                }}
              >
                <Plus size={16} /> Create Job Opening
              </button>
            </div>
          )}

          {jobOpenings.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '50px 24px', borderRadius: '16px' }}>
              <Briefcase size={42} style={{ opacity: 0.3, margin: '0 auto 12px', display: 'block', color: '#0E7490' }} />
              <h4 style={{ margin: '0 0 6px', fontSize: '1.05rem', fontWeight: 700, color: '#0F172A' }}>No Job Openings Published</h4>
              <p style={{ margin: '0 0 16px', fontSize: '0.82rem', color: '#64748B' }}>
                Create new job postings to start receiving employee candidate referrals and applications.
              </p>
              {canPostJob && (
                <button 
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowAddJobModal(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, borderRadius: '10px', padding: '9px 18px' }}
                >
                  <Plus size={16} /> Create Job Opening
                </button>
              )}
            </div>
          ) : (
            <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
              {jobOpenings.map(j => (
                <div key={j.id} className="card" style={{ marginBottom: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <h4 style={{ fontSize: '1rem', fontWeight: 700 }}>{j.title}</h4>
                    <span className="status-pill active" style={{ fontSize: '0.65rem' }}>{j.status}</span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>{j.description}</p>
                  <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '10px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    <div><strong>Department:</strong> {j.department}</div>
                    <div><strong>Salary:</strong> {j.salaryRange}</div>
                    <div><strong>Experience:</strong> {j.experience}</div>
                    <div><strong>Applicants:</strong> {j.applicantsCount} Candidates</div>
                  </div>

                  {canReferCandidate && (
                    <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid #F1F5F9' }}>
                      <button
                        onClick={() => {
                          setReferralError(null);
                          setReferralForm({ ...referralForm, jobId: j.id });
                          setShowReferralModal(true);
                        }}
                        className="btn btn-secondary btn-sm"
                        style={{ width: '100%', fontSize: '0.75rem', fontWeight: 700 }}
                      >
                        <UserPlus size={14} /> Refer for this Role
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: Post Job Modal (HR & CEO Only) */}
      {showAddJobModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Post Job Opening</h2>
              <button onClick={() => setShowAddJobModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateJob}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Job Title <span style={{ color: '#EF4444' }}>*</span></label>
                  <input className="form-control" value={jobForm.title} onChange={e => setJobForm({ ...jobForm, title: e.target.value })} required />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Department</label>
                    <input className="form-control" value={jobForm.department} onChange={e => setJobForm({ ...jobForm, department: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Salary Range</label>
                    <input className="form-control" value={jobForm.salaryRange} onChange={e => setJobForm({ ...jobForm, salaryRange: e.target.value })} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="form-control" rows={3} value={jobForm.description} onChange={e => setJobForm({ ...jobForm, description: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAddJobModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm">Publish Job</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Refer Candidate Modal (STRICTLY FOR EMPLOYEE ROLE) */}
      {showReferralModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
              <div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: '#0F172A' }}>Refer Candidate</h2>
                <div style={{ fontSize: '0.74rem', color: '#0E7490', marginTop: '2px', fontWeight: 600 }}>
                  Submitted by: {currentUser.name}{currentUser.employeeId ? ` (${currentUser.employeeId})` : ''}
                </div>
              </div>
              <button onClick={() => setShowReferralModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer' }}>✕</button>
            </div>
            <form onSubmit={handleReferral}>
              <div className="modal-body" style={{ padding: '16px' }}>
                {referralError && (
                  <div style={{
                    background: '#FEF2F2',
                    border: '1px solid #FECACA',
                    color: '#B91C1C',
                    padding: '9px 10px',
                    borderRadius: '8px',
                    marginBottom: '12px',
                    fontSize: '0.76rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <AlertCircle size={16} style={{ flexShrink: 0 }} />
                    <span>{referralError}</span>
                  </div>
                )}
                <div style={{ 
                  background: '#ECFEFF', 
                  border: '1px solid #CFFAFE', 
                  padding: '10px', 
                  borderRadius: '8px', 
                  marginBottom: '14px', 
                  fontSize: '0.75rem', 
                  color: '#0E7490',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>
                    Your referral will be routed directly to <strong>HR & CEO</strong> for review and official acceptance.
                  </span>
                </div>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 600 }}>Candidate Full Name <span style={{ color: '#EF4444' }}>*</span></label>
                  <input 
                    className="form-control" 
                    placeholder="e.g. Anandha Kumar" 
                    value={referralForm.name} 
                    onChange={e => {
                      setReferralError(null);
                      setReferralForm({ ...referralForm, name: sanitizeCandidateName(e.target.value) });
                    }}
                    pattern="[A-Za-z\s.'-]+"
                    title="Candidate name must contain letters only."
                    required 
                  />
                </div>

                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 600 }}>Email Address <span style={{ color: '#EF4444' }}>*</span></label>
                    <input 
                      className="form-control" 
                      type="email" 
                      placeholder="candidate@gmail.com" 
                      value={referralForm.email} 
                      onChange={e => setReferralForm({ ...referralForm, email: e.target.value })} 
                      required 
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 600 }}>Phone Number</label>
                    <input 
                      className="form-control" 
                      placeholder="9876543210"
                      inputMode="numeric"
                      maxLength={10}
                      pattern="\d{10}"
                      title="Phone number must be exactly 10 digits."
                      value={referralForm.phone} 
                      onChange={e => {
                        setReferralError(null);
                        setReferralForm({ ...referralForm, phone: sanitizePhoneNumber(e.target.value) });
                      }}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 600 }}>Target Job Opening <span style={{ color: '#EF4444' }}>*</span></label>
                  <select 
                    className="form-control" 
                    value={referralForm.jobId} 
                    onChange={e => setReferralForm({ ...referralForm, jobId: e.target.value })}
                  >
                    {jobOpenings.map(j => <option key={j.id} value={j.id}>{j.title} ({j.department})</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 600 }}>Referral Recommendation Notes</label>
                  <textarea 
                    className="form-control" 
                    rows={3} 
                    placeholder="Briefly state why you recommend this candidate (skills, past experience, work ethic)..."
                    value={referralForm.notes} 
                    onChange={e => setReferralForm({ ...referralForm, notes: e.target.value })} 
                  />
                </div>
              </div>
              <div className="modal-footer" style={{ borderTop: '1px solid #E2E8F0', padding: '12px 16px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setReferralError(null);
                    setShowReferralModal(false);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm" style={{ fontWeight: 700 }}>Submit Referral</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: HR & CEO Accept / Reject Referral Review Modal */}
      {selectedReferral && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
              <div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: '#0F172A' }}>
                  {reviewActionType === 'accept' && 'Accept Candidate Referral'}
                  {reviewActionType === 'reject' && 'Reject Candidate Referral'}
                  {reviewActionType === 'hire' && 'Hire & Convert to Employee'}
                </h2>
                <div style={{ fontSize: '0.74rem', color: '#0E7490', marginTop: '2px', fontWeight: 600 }}>
                  Reviewing as: {currentUser.name} ({currentUser.role === 'Super Admin' ? 'CEO' : 'HR Admin'})
                </div>
              </div>
              <button onClick={() => setSelectedReferral(null)} style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer' }}>✕</button>
            </div>

            <div className="modal-body" style={{ padding: '16px' }}>
              <div style={{ 
                background: '#F8FAFC', 
                border: '1px solid #E2E8F0', 
                padding: '12px', 
                borderRadius: '8px', 
                marginBottom: '14px', 
                fontSize: '0.82rem'
              }}>
                <div><strong>Candidate:</strong> {selectedReferral.name} ({selectedReferral.email})</div>
                <div style={{ marginTop: '3px' }}><strong>Position:</strong> {selectedReferral.jobTitle}</div>
                <div style={{ marginTop: '3px' }}><strong>Referred By:</strong> {selectedReferral.referrerName} ({selectedReferral.referrerEmployeeId})</div>
                {selectedReferral.notes && (
                  <div style={{ marginTop: '4px', fontStyle: 'italic', color: '#64748B' }}>
                    "{selectedReferral.notes}"
                  </div>
                )}
              </div>

              {reviewActionType === 'accept' && (
                <div style={{ fontSize: '0.8rem', color: '#0F172A', marginBottom: '12px' }}>
                  Accepting this referral will advance <strong>{selectedReferral.name}</strong> to the <strong>Interview</strong> stage and notify the referring employee.
                </div>
              )}

              {reviewActionType === 'hire' && (
                <div style={{ fontSize: '0.8rem', color: '#0F172A', marginBottom: '12px' }}>
                  This will officially onboard <strong>{selectedReferral.name}</strong> into the company directory with active employee status.
                </div>
              )}

              {reviewActionType === 'reject' && (
                <div style={{ fontSize: '0.8rem', color: '#DC2626', marginBottom: '12px' }}>
                  This referral will be marked as rejected.
                </div>
              )}

              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                  Executive Review Comments
                </label>
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder="Optional review feedback..."
                  value={reviewNotes}
                  onChange={e => setReviewNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-footer" style={{ borderTop: '1px solid #E2E8F0', padding: '12px 16px' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelectedReferral(null)}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteReview}
                className={`btn btn-sm ${reviewActionType === 'reject' ? 'btn-danger' : 'btn-primary'}`}
                style={{
                  fontWeight: 700,
                  background: reviewActionType === 'reject' ? '#DC2626' : '#0E7490',
                  color: '#ffffff'
                }}
              >
                {reviewActionType === 'accept' && 'Confirm Acceptance'}
                {reviewActionType === 'reject' && 'Confirm Rejection'}
                {reviewActionType === 'hire' && 'Confirm & Onboard Employee'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
