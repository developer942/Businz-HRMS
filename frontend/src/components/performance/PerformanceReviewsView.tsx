import React, { useState } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import {
  PerformanceReviewRecord,
  EmployeePerformanceDetail,
  ReviewCycleType
} from '../../types/performance';
import { INITIAL_REVIEWS } from '../../data/performanceInitialData';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import {
  Award,
  Star,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Calendar,
  User,
  X,
  FileText,
  ThumbsUp,
  AlertTriangle,
  Building2,
  ChevronRight
} from 'lucide-react';

interface PerformanceReviewsViewProps {
  employees: EmployeePerformanceDetail[];
  initialReviews?: PerformanceReviewRecord[];
  onSelectEmployee: (empId: string) => void;
}

export const PerformanceReviewsView: React.FC<PerformanceReviewsViewProps> = ({
  employees,
  initialReviews = INITIAL_REVIEWS,
  onSelectEmployee
}) => {
  const [reviews, setReviews] = useState<PerformanceReviewRecord[]>(initialReviews);
  const [activeCycle, setActiveCycle] = useState<ReviewCycleType | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');

  // Review Detail Modal
  const [selectedReview, setSelectedReview] = useState<PerformanceReviewRecord | null>(null);

  // New Review Form Modal
  const [isNewReviewModalOpen, setIsNewReviewModalOpen] = useState(false);
  const [revEmpId, setRevEmpId] = useState(employees[0]?.employeeId || '');
  const [revCycle, setRevCycle] = useState<ReviewCycleType>('Quarterly');
  const [revPeriodLabel, setRevPeriodLabel] = useState('2026 Q3 Review');
  const [revRating, setRevRating] = useState<1 | 2 | 3 | 4 | 5>(4);
  const [revStrengths, setRevStrengths] = useState('');
  const [revImprovements, setRevImprovements] = useState('');
  const [revManagerComments, setRevManagerComments] = useState('');
  const [revHrComments, setRevHrComments] = useState('');
  const [revFinalComments, setRevFinalComments] = useState('');

  const cycles: (ReviewCycleType | 'ALL')[] = ['ALL', 'Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'];
  const { orgStructure } = useHRMS();
  const configuredDepts = orgStructure?.departments || [];
  const departments = ['ALL', ...configuredDepts];

  const getRatingLabel = (r: number): PerformanceReviewRecord['ratingLabel'] => {
    switch (r) {
      case 1: return 'Poor';
      case 2: return 'Needs Improvement';
      case 3: return 'Meets Expectations';
      case 4: return 'Exceeds Expectations';
      case 5: return 'Outstanding';
      default: return 'Meets Expectations';
    }
  };

  const handleCreateReview = (e: React.FormEvent) => {
    e.preventDefault();
    const emp = employees.find(e => e.employeeId === revEmpId) || employees[0];

    const newRecord: PerformanceReviewRecord = {
      id: `REV-${Date.now()}`,
      employeeId: emp.employeeId,
      employeeName: emp.employeeName,
      department: emp.department,
      designation: emp.designation,
      reviewPeriod: revCycle,
      reviewPeriodLabel: revPeriodLabel,
      reviewerName: 'Velmurugan',
      reviewerRole: 'CEO',
      reviewDate: new Date().toISOString().split('T')[0],
      kraScore: emp.kraScore,
      kpiScore: emp.kpiScore,
      goalScore: emp.goalScore,
      taskPerformance: emp.taskPerformance.completionRate,
      attendanceImpact: emp.attendanceImpact.attendancePercent,
      overallScore: emp.overallScore,
      rating: revRating,
      ratingLabel: getRatingLabel(revRating),
      strengths: revStrengths.split('\n').filter(s => s.trim().length > 0),
      areasForImprovement: revImprovements.split('\n').filter(s => s.trim().length > 0),
      managerComments: revManagerComments,
      hrComments: revHrComments,
      finalComments: revFinalComments || 'Evaluation reviewed and approved.',
      status: 'Completed'
    };

    setReviews([newRecord, ...reviews]);
    setIsNewReviewModalOpen(false);
    setRevStrengths('');
    setRevImprovements('');
    setRevManagerComments('');
    setRevHrComments('');
    setRevFinalComments('');
  };

  const filteredReviews = reviews.filter(r => {
    const matchesCycle = activeCycle === 'ALL' || r.reviewPeriod === activeCycle;
    const matchesDept = deptFilter === 'ALL' || r.department.toLowerCase() === deptFilter.toLowerCase();
    const matchesSearch = r.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.reviewPeriodLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.reviewerName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCycle && matchesDept && matchesSearch;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* ── TOP HEADER CARD ── */}
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E7ECF3',
        borderRadius: '16px',
        padding: '20px 24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            backgroundColor: '#DCFCE7',
            color: '#15803D',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Award size={24} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#1E293B', fontFamily: 'DM Sans, sans-serif', letterSpacing: '-0.02em' }}>
              Performance Reviews & Appraisal Cycles
            </h1>
            <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#64748B' }}>
              Conduct 1–5 scale appraisals, review KRA/KPI achievements, qualitative feedback, and final approvals
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsNewReviewModalOpen(true)}
          title="Conduct Review"
          aria-label="Conduct Review"
          style={{
            width: '38px',
            height: '38px',
            padding: 0,
            backgroundColor: '#0E7490',
            color: '#FFFFFF',
            borderRadius: '10px',
            border: 'none',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 4px rgba(14, 116, 144, 0.2)'
          }}
        >
          <Plus size={18} strokeWidth={2.5} />
        </button>
      </div>

      {/* ── REVIEW CYCLES FILTER TABS ── */}
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E7ECF3',
        borderRadius: '16px',
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginRight: '4px' }}>
            Cycles:
          </span>
          {cycles.map(cyc => {
            const isActive = activeCycle === cyc;
            return (
              <button
                key={cyc}
                type="button"
                onClick={() => setActiveCycle(cyc)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '9999px',
                  border: isActive ? '1px solid #0E7490' : '1px solid #E2E8F0',
                  backgroundColor: isActive ? '#0E7490' : '#FFFFFF',
                  color: isActive ? '#FFFFFF' : '#475569',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {cyc === 'ALL' ? 'All Cycles' : `${cyc} Reviews`}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={15} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search by name or reviewer..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                padding: '6px 10px 6px 30px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                fontSize: '12px',
                outline: 'none'
              }}
            />
          </div>

          <select
            value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px', backgroundColor: '#FFFFFF' }}
          >
            {departments.map(d => (
              <option key={d} value={d}>{d === 'ALL' ? 'All Departments' : d}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── REVIEWS TABLE ── */}
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E7ECF3',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '920px' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Employee</th>
                <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Department</th>
                <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Period</th>
                <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Reviewer</th>
                <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', textAlign: 'center' }}>Overall Score</th>
                <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Rating (1–5)</th>
                <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Status</th>
                <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredReviews.map((rev, idx) => (
                <tr
                  key={rev.id}
                  onClick={() => setSelectedReview(rev)}
                  style={{
                    borderBottom: '1px solid #E7ECF3',
                    backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#FAFCFE',
                    cursor: 'pointer',
                    transition: 'background-color 0.15s ease'
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#ECFEFF'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#FFFFFF' : '#FAFCFE'}
                >
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '30px', height: '30px', borderRadius: '50%', backgroundColor: '#0E7490', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700 }}>
                        {rev.employeeName.charAt(0)}
                      </div>
                      <div>
                        <strong style={{ fontSize: '13px', color: '#1E293B', display: 'block' }}>
                          {rev.employeeName}
                        </strong>
                        <span style={{ fontSize: '11px', color: '#64748B' }}>
                          {rev.employeeId} • {rev.designation}
                        </span>
                      </div>
                    </div>
                  </td>

                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ padding: '3px 8px', borderRadius: '6px', backgroundColor: '#F1F5F9', fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                      {rev.department}
                    </span>
                  </td>

                  <td style={{ padding: '14px 16px', fontSize: '13px', color: '#1E293B', fontWeight: 600 }}>
                    {rev.reviewPeriodLabel}
                  </td>

                  <td style={{ padding: '14px 16px', fontSize: '13px', color: '#475569' }}>
                    {rev.reviewerName} ({rev.reviewerRole})
                  </td>

                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <span style={{ fontSize: '15px', fontWeight: 900, color: '#0E7490' }}>
                      {rev.overallScore}%
                    </span>
                  </td>

                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {[1, 2, 3, 4, 5].map(star => (
                        <Star
                          key={star}
                          size={14}
                          fill={star <= rev.rating ? '#F59E0B' : 'transparent'}
                          color={star <= rev.rating ? '#F59E0B' : '#CBD5E1'}
                        />
                      ))}
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#1E293B', marginLeft: '4px' }}>
                        {rev.ratingLabel}
                      </span>
                    </div>
                  </td>

                  <td style={{ padding: '14px 16px' }}>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '9999px',
                      backgroundColor: '#DCFCE7',
                      color: '#15803D',
                      fontSize: '11px',
                      fontWeight: 700
                    }}>
                      {rev.status}
                    </span>
                  </td>

                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedReview(rev);
                      }}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '8px',
                        backgroundColor: '#ECFEFF',
                        border: '1px solid #A5F3FC',
                        color: '#0E7490',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      View Report ›
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── REVIEW DETAIL MODAL (SECTIONS BREAKDOWN) ── */}
      {selectedReview && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '680px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '28px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '16px', marginBottom: '18px' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#0E7490', textTransform: 'uppercase' }}>
                  Performance Evaluation Sheet
                </span>
                <h2 style={{ margin: '4px 0 2px', fontSize: '18px', fontWeight: 800, color: '#1E293B' }}>
                  {selectedReview.employeeName} — {selectedReview.reviewPeriodLabel}
                </h2>
                <span style={{ fontSize: '12px', color: '#64748B' }}>
                  {selectedReview.designation} • {selectedReview.department} • Reviewed by {selectedReview.reviewerName} on {formatDateDDMMYYYY(selectedReview.reviewDate)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReview(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Score Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '10px', marginBottom: '20px' }}>
              <div style={{ backgroundColor: '#F8FAFC', padding: '10px', borderRadius: '10px', textAlign: 'center', border: '1px solid #E2E8F0' }}>
                <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>KRA Score</span>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#1E293B', marginTop: '2px' }}>{selectedReview.kraScore}%</div>
              </div>
              <div style={{ backgroundColor: '#F8FAFC', padding: '10px', borderRadius: '10px', textAlign: 'center', border: '1px solid #E2E8F0' }}>
                <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>KPI Score</span>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#1E293B', marginTop: '2px' }}>{selectedReview.kpiScore}%</div>
              </div>
              <div style={{ backgroundColor: '#F8FAFC', padding: '10px', borderRadius: '10px', textAlign: 'center', border: '1px solid #E2E8F0' }}>
                <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Goal Score</span>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#1E293B', marginTop: '2px' }}>{selectedReview.goalScore}%</div>
              </div>
              <div style={{ backgroundColor: '#F8FAFC', padding: '10px', borderRadius: '10px', textAlign: 'center', border: '1px solid #E2E8F0' }}>
                <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Tasks</span>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#1E293B', marginTop: '2px' }}>{selectedReview.taskPerformance}%</div>
              </div>
              <div style={{ backgroundColor: '#F8FAFC', padding: '10px', borderRadius: '10px', textAlign: 'center', border: '1px solid #E2E8F0' }}>
                <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Attendance</span>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#1E293B', marginTop: '2px' }}>{selectedReview.attendanceImpact}%</div>
              </div>
              <div style={{ backgroundColor: '#ECFEFF', padding: '10px', borderRadius: '10px', textAlign: 'center', border: '1px solid #A5F3FC' }}>
                <span style={{ fontSize: '10px', color: '#0E7490', fontWeight: 800, textTransform: 'uppercase' }}>Overall</span>
                <div style={{ fontSize: '18px', fontWeight: 900, color: '#0E7490', marginTop: '2px' }}>{selectedReview.overallScore}%</div>
              </div>
            </div>

            {/* Rating Banner */}
            <div style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', padding: '14px 18px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <span style={{ fontSize: '11px', color: '#B45309', fontWeight: 700, textTransform: 'uppercase' }}>Assigned Rating Scale (1 to 5)</span>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#92400E' }}>
                  {selectedReview.rating} – {selectedReview.ratingLabel}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                {[1, 2, 3, 4, 5].map(s => (
                  <Star key={s} size={18} fill={s <= selectedReview.rating ? '#F59E0B' : 'transparent'} color={s <= selectedReview.rating ? '#F59E0B' : '#CBD5E1'} />
                ))}
              </div>
            </div>

            {/* Qualitative Feedback */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <h4 style={{ margin: '0 0 6px', fontSize: '13px', fontWeight: 800, color: '#16A34A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ThumbsUp size={14} /> Strengths
                </h4>
                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: '#334155', lineHeight: '1.5' }}>
                  {selectedReview.strengths.map((str, i) => (
                    <li key={i}>{str}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 style={{ margin: '0 0 6px', fontSize: '13px', fontWeight: 800, color: '#D97706', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle size={14} /> Areas for Improvement
                </h4>
                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: '#334155', lineHeight: '1.5' }}>
                  {selectedReview.areasForImprovement.map((imp, i) => (
                    <li key={i}>{imp}</li>
                  ))}
                </ul>
              </div>

              <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '12px' }}>
                <strong style={{ fontSize: '12px', color: '#475569', display: 'block', marginBottom: '3px' }}>Manager Comments:</strong>
                <p style={{ margin: 0, fontSize: '13px', color: '#1E293B', fontStyle: 'italic' }}>"{selectedReview.managerComments}"</p>
              </div>

              <div>
                <strong style={{ fontSize: '12px', color: '#475569', display: 'block', marginBottom: '3px' }}>HR Comments:</strong>
                <p style={{ margin: 0, fontSize: '13px', color: '#1E293B', fontStyle: 'italic' }}>"{selectedReview.hrComments}"</p>
              </div>

              <div>
                <strong style={{ fontSize: '12px', color: '#475569', display: 'block', marginBottom: '3px' }}>Final Approval Comments:</strong>
                <p style={{ margin: 0, fontSize: '13px', color: '#0E7490', fontWeight: 600 }}>{selectedReview.finalComments}</p>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                type="button"
                onClick={() => setSelectedReview(null)}
                style={{ padding: '9px 18px', borderRadius: '10px', border: 'none', backgroundColor: '#0E7490', color: '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONDUCT REVIEW FORM MODAL ── */}
      {isNewReviewModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '600px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#1E293B' }}>
                Conduct Performance Appraisal Review
              </h3>
              <button
                type="button"
                onClick={() => setIsNewReviewModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateReview} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Select Employee <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <select
                    value={revEmpId}
                    onChange={e => setRevEmpId(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px', backgroundColor: '#FFFFFF' }}
                  >
                    {employees.map(emp => (
                      <option key={emp.employeeId} value={emp.employeeId}>
                        {emp.employeeName} ({emp.department} - {emp.designation})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Review Cycle <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <select
                    value={revCycle}
                    onChange={e => setRevCycle(e.target.value as ReviewCycleType)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px', backgroundColor: '#FFFFFF' }}
                  >
                    <option value="Monthly">Monthly</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Half-Yearly">Half-Yearly</option>
                    <option value="Yearly">Yearly</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Review Period Label
                </label>
                <input
                  type="text"
                  value={revPeriodLabel}
                  onChange={e => setRevPeriodLabel(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Overall Rating (1 to 5 Scale) <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {[1, 2, 3, 4, 5].map(num => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setRevRating(num as any)}
                      style={{
                        padding: '8px 14px',
                        borderRadius: '10px',
                        border: revRating === num ? '2px solid #0E7490' : '1px solid #E2E8F0',
                        backgroundColor: revRating === num ? '#ECFEFF' : '#FFFFFF',
                        color: revRating === num ? '#0E7490' : '#475569',
                        fontWeight: 800,
                        fontSize: '13px',
                        cursor: 'pointer'
                      }}
                    >
                      {num} ★
                    </button>
                  ))}
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#0E7490', marginLeft: '6px' }}>
                    {getRatingLabel(revRating)}
                  </span>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Key Strengths (one per line)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Rapid technical turnaround on STAAD drawings..."
                  value={revStrengths}
                  onChange={e => setRevStrengths(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Areas for Improvement (one per line)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Clear invoice backlogs within 48 hours..."
                  value={revImprovements}
                  onChange={e => setRevImprovements(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Manager & HR Comments
                </label>
                <input
                  type="text"
                  placeholder="Manager observations..."
                  value={revManagerComments}
                  onChange={e => setRevManagerComments(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px', marginBottom: '6px' }}
                />
                <input
                  type="text"
                  placeholder="HR administrative notes & policy verification..."
                  value={revHrComments}
                  onChange={e => setRevHrComments(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsNewReviewModalOpen(false)}
                  style={{ padding: '9px 16px', borderRadius: '10px', border: '1px solid #E2E8F0', background: '#FFFFFF', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '9px 18px', borderRadius: '10px', border: 'none', backgroundColor: '#0E7490', color: '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Submit & Complete Review
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
