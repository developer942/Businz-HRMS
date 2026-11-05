import React from 'react';
import {
  IndianRupee,
  MapPin,
  Building,
  Calendar,
  ChevronRight,
  Receipt,
  User,
  AlertCircle,
  Eye,
} from 'lucide-react';
import { FieldVisitAdvance } from '../../types/fieldAdvance';

interface FieldVisitListProps {
  visits: FieldVisitAdvance[];
  onSelectVisit: (id: string) => void;
  loading: boolean;
}

export const FieldVisitList: React.FC<FieldVisitListProps> = ({
  visits,
  onSelectVisit,
  loading,
}) => {
  if (loading) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748B', fontSize: '0.85rem' }}>
        Loading field visits &amp; advance records...
      </div>
    );
  }

  if (visits.length === 0) {
    return (
      <div 
        style={{ 
          padding: '48px 24px', 
          textAlign: 'center', 
          background: '#FFFFFF', 
          borderRadius: '16px', 
          border: '1px solid #E2E8F0', 
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)' 
        }}
      >
        <div 
          style={{ 
            width: '48px', 
            height: '48px', 
            borderRadius: '50%', 
            background: '#F1F5F9', 
            color: '#64748B', 
            display: 'inline-flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            marginBottom: '12px' 
          }}
        >
          <Receipt size={24} />
        </div>
        <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1E293B', margin: '0 0 4px 0' }}>
          No field visits found
        </h4>
        <p style={{ fontSize: '0.8rem', color: '#64748B', margin: 0 }}>
          Create a new field visit request to start tracking advances and trip expenses.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* MOBILE LIST: Apple-inspired compact cards */}
      <div className="mobile-only-block" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {visits.map((visit) => {
          const disbursed = visit.disbursed_amount || 0;
          const expenses = visit.expenses_total || 0;
          const balance = visit.provisional_balance !== undefined ? visit.provisional_balance : disbursed - expenses;

          return (
            <div
              key={visit.id}
              onClick={() => onSelectVisit(visit.id)}
              style={{
                padding: '14px 16px',
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}
            >
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 800, color: '#0F172A' }}>
                    {visit.request_number}
                  </span>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      background: visit.funding_type === 'advance' ? '#ECFEFF' : '#F3E8FF',
                      color: visit.funding_type === 'advance' ? '#0E7490' : '#7E22CE',
                      border: visit.funding_type === 'advance' ? '1px solid #A5F3FC' : '1px solid #E9D5FF'
                    }}
                  >
                    {visit.funding_type === 'advance' ? 'Advance' : 'Personal'}
                  </span>
                </div>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    background:
                      visit.status === 'Completed'
                        ? '#DCFCE7'
                        : visit.status === 'Active'
                        ? '#ECFEFF'
                        : visit.status.includes('Pending')
                        ? '#FEF3C7'
                        : '#F1F5F9',
                    color:
                      visit.status === 'Completed'
                        ? '#166534'
                        : visit.status === 'Active'
                        ? '#0E7490'
                        : visit.status.includes('Pending')
                        ? '#92400E'
                        : '#475569'
                  }}
                >
                  {visit.status}
                </span>
              </div>

              {/* Destination & Client */}
              <div>
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A', display: 'block' }}>
                  {visit.client_name}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                  <MapPin size={12} color="#94A3B8" />
                  <span>{visit.destination}</span>
                  <span style={{ color: '#CBD5E1' }}>•</span>
                  <span>{visit.start_date.slice(5)} to {visit.end_date.slice(5)}</span>
                </span>
              </div>

              {/* Financial mini balance grid */}
              <div 
                style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '1fr 1fr 1fr', 
                  padding: '8px 10px', 
                  background: '#F8FAFC', 
                  borderRadius: '10px', 
                  border: '1px solid #F1F5F9',
                  textAlign: 'center' 
                }}
              >
                <div>
                  <span style={{ fontSize: '0.68rem', color: '#64748B', display: 'block' }}>Advance</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0F172A' }}>₹{disbursed.toLocaleString('en-IN')}</span>
                </div>
                <div>
                  <span style={{ fontSize: '0.68rem', color: '#64748B', display: 'block' }}>Expenses</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0E7490' }}>₹{expenses.toLocaleString('en-IN')}</span>
                </div>
                <div>
                  <span style={{ fontSize: '0.68rem', color: '#64748B', display: 'block' }}>Balance</span>
                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      color: balance < 0 ? '#DC2626' : balance > 0 ? '#16A34A' : '#475569'
                    }}
                  >
                    {balance < 0 ? `−₹${Math.abs(balance).toLocaleString('en-IN')}` : `₹${balance.toLocaleString('en-IN')}`}
                  </span>
                </div>
              </div>

              {/* Footer row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748B', paddingTop: '4px', borderTop: '1px solid #F1F5F9' }}>
                <span>{visit.employee_name}</span>
                <span style={{ color: '#0E7490', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '2px' }}>
                  <span>View Details</span>
                  <ChevronRight size={14} />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* DESKTOP TABLE */}
      <div 
        className="desktop-only-block" 
        style={{ 
          background: '#FFFFFF', 
          borderRadius: '16px', 
          border: '1px solid #E2E8F0', 
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)', 
          overflowX: 'auto' 
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <th style={{ padding: '12px 16px' }}>Request #</th>
              <th style={{ padding: '12px 16px' }}>Employee</th>
              <th style={{ padding: '12px 16px' }}>Customer &amp; Destination</th>
              <th style={{ padding: '12px 16px' }}>Period</th>
              <th style={{ padding: '12px 16px' }}>Funding</th>
              <th style={{ padding: '12px 16px' }}>Advance</th>
              <th style={{ padding: '12px 16px' }}>Expenses</th>
              <th style={{ padding: '12px 16px' }}>Balance (A − D)</th>
              <th style={{ padding: '12px 16px' }}>Status</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {visits.map((visit) => {
              const disbursed = visit.disbursed_amount || 0;
              const expenses = visit.expenses_total || 0;
              const balance =
                visit.provisional_balance !== undefined ? visit.provisional_balance : disbursed - expenses;

              return (
                <tr
                  key={visit.id}
                  onClick={() => onSelectVisit(visit.id)}
                  style={{ 
                    borderBottom: '1px solid #F1F5F9', 
                    cursor: 'pointer',
                    transition: 'background 0.15s ease'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 800, color: '#0F172A' }}>
                    {visit.request_number}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontWeight: 700, color: '#0F172A', display: 'block' }}>{visit.employee_name}</span>
                    <span style={{ fontSize: '0.72rem', color: '#64748B' }}>{visit.employee_code}</span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontWeight: 600, color: '#0F172A', display: 'block', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {visit.client_name}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <MapPin size={12} color="#94A3B8" />
                      <span style={{ maxWidth: '180px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{visit.destination}</span>
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#475569', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                    {visit.start_date.slice(5)} to {visit.end_date.slice(5)}
                  </td>
                  <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '9999px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        background: visit.funding_type === 'advance' ? '#ECFEFF' : '#F3E8FF',
                        color: visit.funding_type === 'advance' ? '#0E7490' : '#7E22CE',
                        border: visit.funding_type === 'advance' ? '1px solid #A5F3FC' : '1px solid #E9D5FF'
                      }}
                    >
                      {visit.funding_type === 'advance' ? 'Option A: Advance' : 'Option B: Personal'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap' }}>
                    ₹{disbursed.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0E7490', whiteSpace: 'nowrap' }}>
                    ₹{expenses.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                    <span
                      style={{
                        fontWeight: 800,
                        fontSize: '0.85rem',
                        color:
                          balance < 0
                            ? '#DC2626'
                            : balance > 0
                            ? '#16A34A'
                            : '#475569'
                      }}
                    >
                      {balance < 0
                        ? `−₹${Math.abs(balance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : balance > 0
                        ? `+₹${balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : '₹0.00'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                    <span
                      style={{
                        padding: '3px 10px',
                        borderRadius: '9999px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        background:
                          visit.status === 'Completed'
                            ? '#DCFCE7'
                            : visit.status === 'Active'
                            ? '#ECFEFF'
                            : visit.status.includes('Pending')
                            ? '#FEF3C7'
                            : '#F1F5F9',
                        color:
                          visit.status === 'Completed'
                            ? '#166534'
                            : visit.status === 'Active'
                            ? '#0E7490'
                            : visit.status.includes('Pending')
                            ? '#92400E'
                            : '#475569'
                      }}
                    >
                      {visit.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectVisit(visit.id);
                      }}
                      className="btn btn-secondary btn-sm"
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      title="View Details"
                    >
                      <Eye size={14} />
                      <span>View</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FieldVisitList;