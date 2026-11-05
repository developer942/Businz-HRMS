import React, { useState, useEffect, useMemo } from 'react';
import {
  IndianRupee,
  Plus,
  Search,
  Filter,
  Briefcase,
  CheckCircle2,
  Clock,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Receipt,
  FileCheck,
  Building,
} from 'lucide-react';
import { FieldVisitAdvance, FieldVisitFinancialSummary, FundingType } from '../../types/fieldAdvance';
import { fetchFieldVisits, fetchFieldFinancialSummary } from '../../services/fieldAdvanceService';
import { FieldVisitList } from './FieldVisitList';
import { NewFieldVisitModal } from './NewFieldVisitModal';
import { FieldVisitDetailModal } from './FieldVisitDetailModal';

interface FieldVisitManagementProps {
  currentUser: any;
}

export const FieldVisitManagement: React.FC<FieldVisitManagementProps> = ({ currentUser }) => {
  const [visits, setVisits] = useState<FieldVisitAdvance[]>([]);
  const [summary, setSummary] = useState<FieldVisitFinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Tabs & filters
  const isCeoOrHr =
    currentUser.role === 'CEO' ||
    currentUser.role === 'Super Admin' ||
    currentUser.role === 'Director' ||
    currentUser.role?.includes('HR');

  const isAccounts =
    currentUser.role === 'Finance Manager' ||
    currentUser.role === 'Accountant' ||
    currentUser.department?.toLowerCase().includes('account') ||
    currentUser.department?.toLowerCase().includes('finance');

  // Role-tailored default tab
  const [activeTab, setActiveTab] = useState<string>('all');
  const [fundingFilter, setFundingFilter] = useState<'all' | 'advance' | 'personal'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showNewVisitModal, setShowNewVisitModal] = useState(false);
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);

  // Tab definitions based on user role (Section 10 of prompt)
  const tabs = useMemo(() => {
    if (isAccounts) {
      return [
        { id: 'all', label: 'Overview' },
        { id: 'disbursements', label: 'Advance Disbursements' },
        { id: 'collections', label: 'Balance Collections' },
        { id: 'reimbursements', label: 'Reimbursement Payments' },
        { id: 'history', label: 'Financial History' },
      ];
    }
    if (isCeoOrHr) {
      return [
        { id: 'all', label: 'Overview' },
        { id: 'advance_approvals', label: 'Advance Approvals' },
        { id: 'expense_approvals', label: 'Expense Approvals' },
        { id: 'collections', label: 'Outstanding Settlements' },
        { id: 'history', label: 'History' },
      ];
    }
    // Employee tabs
    return [
      { id: 'all', label: 'Overview' },
      { id: 'my_visits', label: 'My Field Visits' },
      { id: 'collections', label: 'Settlements' },
      { id: 'history', label: 'History' },
    ];
  }, [isCeoOrHr, isAccounts]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [visitsData, summaryData] = await Promise.all([
        fetchFieldVisits({
          tab: activeTab !== 'all' ? activeTab : undefined,
          fundingType: fundingFilter !== 'all' ? fundingFilter : undefined,
          search: searchQuery.trim() || undefined,
        }),
        fetchFieldFinancialSummary(),
      ]);

      setVisits(visitsData);
      setSummary(summaryData);
    } catch (err) {
      console.error('Failed to load field visits:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab, fundingFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 4 Apple-inspired KPI Cards (Uniform Layout & Proportional Alignment) */}
      <div 
        className="kpi-grid" 
        style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', 
          gap: '14px', 
          margin: 0 
        }}
      >
        {/* Card 1: Advances Disbursed */}
        <div 
          className="kpi-card" 
          style={{ 
            background: '#FFFFFF', 
            borderRadius: '16px', 
            border: '1px solid #E2E8F0', 
            padding: '16px 20px', 
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '110px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748B' }}>Advances Disbursed</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#ECFEFF', color: '#0E7490', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IndianRupee size={16} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0E7490', lineHeight: 1.2 }}>
              ₹{(summary?.totalAdvancesDisbursed || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '4px' }}>
              Total company funds issued
            </div>
          </div>
        </div>

        {/* Card 2: Total Recorded Expenses */}
        <div 
          className="kpi-card" 
          style={{ 
            background: '#FFFFFF', 
            borderRadius: '16px', 
            border: '1px solid #E2E8F0', 
            padding: '16px 20px', 
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '110px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748B' }}>Recorded Expenses</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Receipt size={16} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#2563EB', lineHeight: 1.2 }}>
              ₹{(summary?.totalExpensesRecorded || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '4px' }}>
              All submitted trip bills
            </div>
          </div>
        </div>

        {/* Card 3: Pending Returns (Scenario 1) */}
        <div 
          className="kpi-card" 
          style={{ 
            background: '#FFFFFF', 
            borderRadius: '16px', 
            border: '1px solid #E2E8F0', 
            padding: '16px 20px', 
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '110px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748B' }}>Unused Balance Due</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#DCFCE7', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingDown size={16} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#16A34A', lineHeight: 1.2 }}>
              ₹{(summary?.totalPendingReturns || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '4px' }}>
              Returnable to Accounts
            </div>
          </div>
        </div>

        {/* Card 4: Pending Reimbursements (Scenario 2 & 3) */}
        <div 
          className="kpi-card" 
          style={{ 
            background: '#FFFFFF', 
            borderRadius: '16px', 
            border: '1px solid #E2E8F0', 
            padding: '16px 20px', 
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '110px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748B' }}>Reimbursement Due</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={16} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#D97706', lineHeight: 1.2 }}>
              ₹{(summary?.totalPendingReimbursements || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '4px' }}>
              Payable to employees
            </div>
          </div>
        </div>
      </div>

      {/* Action Header & Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        {/* Role-tailored Horizontal Segmented Tab Bar */}
        <div 
          style={{ 
            display: 'inline-flex', 
            padding: '4px', 
            background: '#F1F5F9', 
            borderRadius: '12px', 
            border: '1px solid #E2E8F0', 
            gap: '4px', 
            overflowX: 'auto', 
            maxWidth: '100%' 
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '7px 16px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                background: activeTab === tab.id ? '#0E7490' : 'transparent',
                color: activeTab === tab.id ? '#FFFFFF' : '#475569',
                boxShadow: activeTab === tab.id ? '0 2px 4px rgba(14, 116, 144, 0.25)' : 'none'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Create Field Visit Button */}
        <button
          type="button"
          onClick={() => setShowNewVisitModal(true)}
          className="btn btn-primary"
          style={{
            padding: '8px 18px',
            borderRadius: '10px',
            fontSize: '0.82rem',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            flexShrink: 0,
            whiteSpace: 'nowrap'
          }}
        >
          <Plus size={16} />
          <span>New Field Visit</span>
        </button>
      </div>

      {/* Filter toolbar */}
      <div 
        style={{ 
          display: 'flex', 
          flexWrap: 'wrap', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          gap: '12px', 
          padding: '12px 16px', 
          background: '#FFFFFF', 
          borderRadius: '14px', 
          border: '1px solid #E2E8F0' 
        }}
      >
        {/* Search */}
        <form onSubmit={handleSearchSubmit} style={{ position: 'relative', flex: '1 1 280px', maxWidth: '440px' }}>
          <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search request #, destination, customer or staff..."
            style={{
              width: '100%',
              padding: '8px 14px 8px 36px',
              fontSize: '0.82rem',
              borderRadius: '9px',
              border: '1px solid #CBD5E1',
              outline: 'none',
              background: '#F8FAFC'
            }}
          />
        </form>

        {/* Funding Filter Chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', marginRight: '4px' }}>Funding:</span>
          {(['all', 'advance', 'personal'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setFundingFilter(mode)}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                border: fundingFilter === mode ? '1px solid #0E7490' : '1px solid #E2E8F0',
                background: fundingFilter === mode ? '#0E7490' : '#FFFFFF',
                color: fundingFilter === mode ? '#FFFFFF' : '#475569',
                transition: 'all 0.15s ease'
              }}
            >
              {mode === 'all' ? 'All' : mode === 'advance' ? 'Option A: Advance' : 'Option B: Personal'}
            </button>
          ))}
        </div>
      </div>

      {/* Visits List / Table */}
      <FieldVisitList
        visits={visits}
        onSelectVisit={(id) => setSelectedVisitId(id)}
        loading={loading}
      />

      {/* Modals */}
      {showNewVisitModal && (
        <NewFieldVisitModal
          isOpen={showNewVisitModal}
          onClose={() => setShowNewVisitModal(false)}
          onCreated={loadData}
          currentUser={currentUser}
        />
      )}

      {selectedVisitId && (
        <FieldVisitDetailModal
          isOpen={Boolean(selectedVisitId)}
          onClose={() => setSelectedVisitId(null)}
          advanceId={selectedVisitId}
          currentUser={currentUser}
          onUpdated={loadData}
        />
      )}
    </div>
  );
};

export default FieldVisitManagement;