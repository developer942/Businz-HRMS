// VRM Enterprise HRMS - Complete Petty Cash Management Module
import React, { useState, useEffect, useCallback } from 'react';
import {
  Wallet,
  UserCheck,
  CreditCard,
  FileSpreadsheet,
  ShieldAlert,
  Plus,
  Send,
  Lock,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import { pettyCashService } from '../../services/pettyCashService';
import type {
  PettyCashAccount,
  PettyCashRequest,
  PettyCashDisbursement,
  PettyCashExpense,
  PettyCashLedgerEntry,
} from '../../types/pettyCash';

import './PettyCash.css';
import { PettyCashCeoView } from './PettyCashCeoView';
import { PettyCashAccountsView } from './PettyCashAccountsView';
import { PettyCashCustodianView } from './PettyCashCustodianView';
import { PettyCashLedgerReportsView } from './PettyCashLedgerReportsView';
import { AssignCustodianModal } from './AssignCustodianModal';
import { ReconcileCustodianModal } from './ReconcileCustodianModal';
import { RequestPettyCashModal } from './RequestPettyCashModal';
import { CeoApprovalModal } from './CeoApprovalModal';
import { DisburseCashModal } from './DisburseCashModal';
import { ConfirmReceiptModal } from './ConfirmReceiptModal';
import { AddDailyExpenseModal } from './AddDailyExpenseModal';
import { ProofViewerModal } from './ProofViewerModal';

export const PettyCashManagement: React.FC = () => {
  const { currentUser } = useHRMS();

  // Role detection
  const isCEO =
    currentUser.role === 'Super Admin' ||
    currentUser.role === 'CEO' ||
    currentUser.role === 'Admin' ||
    currentUser.designation === 'CEO' ||
    (currentUser.designation && currentUser.designation.toLowerCase().includes('ceo')) ||
    currentUser.employeeId === 'EMP-000';

  const isAccounts =
    currentUser.role === 'Finance Manager' ||
    currentUser.role === 'Finance' ||
    (currentUser.department &&
      (currentUser.department.toLowerCase().includes('finance') ||
        currentUser.department.toLowerCase().includes('accounts'))) ||
    (currentUser.designation &&
      (currentUser.designation.toLowerCase().includes('accounts') ||
        currentUser.designation.toLowerCase().includes('finance')));

  // State
  const [activeAccount, setActiveAccount] = useState<PettyCashAccount | null>(null);
  const [requests, setRequests] = useState<PettyCashRequest[]>([]);
  const [disbursements, setDisbursements] = useState<PettyCashDisbursement[]>([]);
  const [expenses, setExpenses] = useState<PettyCashExpense[]>([]);
  const [ledger, setLedger] = useState<PettyCashLedgerEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Active Tab
  const defaultTab = isCEO ? 'CEO_DASHBOARD' : isAccounts ? 'ACCOUNTS_DISBURSEMENTS' : 'CUSTODIAN_DESK';
  const [activeTab, setActiveTab] = useState<string>(defaultTab);

  // Modals state
  const [isAssignModalOpen, setIsAssignModalOpen] = useState<boolean>(false);
  const [isReconcileModalOpen, setIsReconcileModalOpen] = useState<boolean>(false);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState<boolean>(false);
  const [isAddExpenseModalOpen, setIsAddExpenseModalOpen] = useState<boolean>(false);

  const [selectedRequestForApproval, setSelectedRequestForApproval] = useState<PettyCashRequest | null>(null);
  const [selectedRequestForDisburse, setSelectedRequestForDisburse] = useState<PettyCashRequest | null>(null);
  const [selectedDisbursementForReceipt, setSelectedDisbursementForReceipt] = useState<PettyCashDisbursement | null>(null);

  const [proofViewer, setProofViewer] = useState<{ isOpen: boolean; url: string; title: string }>({
    isOpen: false,
    url: '',
    title: '',
  });

  // Load all module data
  const loadModuleData = useCallback(async () => {
    try {
      setLoading(true);
      const [acc, reqs, disbs, exps, ledg] = await Promise.all([
        pettyCashService.getActiveCustodianAccount().catch(() => null),
        pettyCashService.getRequests().catch(() => []),
        pettyCashService.getDisbursements().catch(() => []),
        pettyCashService.getExpenses().catch(() => []),
        pettyCashService.getLedger().catch(() => []),
      ]);

      setActiveAccount(acc);
      setRequests(reqs);
      setDisbursements(disbs);
      setExpenses(exps);
      setLedger(ledg);
    } catch (err: any) {
      console.error('Error loading petty cash data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModuleData();
  }, [loadModuleData]);

  // Check if current user is the custodian
  const isCustodian =
    activeAccount &&
    (activeAccount.custodian_id === currentUser.id ||
      activeAccount.custodian_employee_id === currentUser.employeeId ||
      (activeAccount.custodian_name &&
        currentUser.name &&
        activeAccount.custodian_name.toLowerCase() === currentUser.name.toLowerCase()));

  // Unauthorized guard: If not CEO, not Accounts, and not Custodian
  const isAuthorized = isCEO || isAccounts || isCustodian;

  // Strict role confinement: automatically keep activeTab within the authorized role scope
  useEffect(() => {
    if (isCEO && activeTab !== 'CEO_DASHBOARD' && activeTab !== 'LEDGER_REPORTS') {
      setActiveTab('CEO_DASHBOARD');
    } else if (isAccounts && !isCEO && activeTab !== 'ACCOUNTS_DISBURSEMENTS' && activeTab !== 'LEDGER_REPORTS') {
      setActiveTab('ACCOUNTS_DISBURSEMENTS');
    } else if (isCustodian && !isCEO && !isAccounts && activeTab !== 'CUSTODIAN_DESK' && activeTab !== 'LEDGER_REPORTS') {
      setActiveTab('CUSTODIAN_DESK');
    }
  }, [isCEO, isAccounts, isCustodian, activeTab]);

  const showToast = (type: 'success' | 'error', text: string) => {
    setFeedbackMessage({ type, text });
    setTimeout(() => setFeedbackMessage(null), 5000);
  };

  const currentBalance = Number(activeAccount?.current_balance || 0);

  if (!isAuthorized && !loading) {
    return (
      <div className="petty-cash-container">
        <div className="custodian-locked-card">
          <div className="locked-icon-wrapper">
            <Lock size={32} />
          </div>
          <h3>Petty Cash Custodian Access Restricted</h3>
          <p>
            You are logged in as <strong>{currentUser.name || currentUser.email}</strong> ({currentUser.role}). This module
            is restricted exclusively to the assigned Petty Cash Custodian, Accounts department, and Executive Leadership.
          </p>
          <p style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
            Current assigned custodian: <strong>{activeAccount ? activeAccount.custodian_name : 'Pending CEO Assignment'}</strong>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="petty-cash-container">
      {/* Toast Feedback */}
      {feedbackMessage && (
        <div
          style={{
            position: 'fixed',
            top: '84px',
            right: '24px',
            zIndex: 1200,
            background: feedbackMessage.type === 'success' ? '#0F766E' : '#B91C1C',
            color: '#FFFFFF',
            padding: '12px 20px',
            borderRadius: '12px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2)',
            fontSize: '0.875rem',
            fontWeight: 600,
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {feedbackMessage.text}
        </div>
      )}

      {/* Main Header */}
      <div className="petty-cash-header">
        <div className="petty-cash-title-group">
          <h1>
            <Wallet size={28} color="var(--color-primary-blue)" />
            Petty Cash Management
          </h1>
          <p>
            Role-based financial stewardship • CEO Approvals • Accounts Disbursements • Custodian Daily Expenses & Ledger
          </p>
        </div>

        <div className="petty-cash-actions-group">
          {/* Quick Context Action Buttons for Custodian Employee only */}
          {isCustodian && !isCEO && !isAccounts && (
            <>
              <button className="btn-secondary" onClick={() => setIsRequestModalOpen(true)}>
                <Send size={15} /> Request Petty Cash
              </button>
              <button
                className="btn-primary"
                onClick={() => setIsAddExpenseModalOpen(true)}
                disabled={currentBalance <= 0}
              >
                <Plus size={16} /> Add Daily Expense
              </button>
            </>
          )}

          {isCEO && !activeAccount && (
            <button className="btn-primary" onClick={() => setIsAssignModalOpen(true)}>
              <UserCheck size={16} /> Assign Custodian
            </button>
          )}
        </div>
      </div>

      {/* Primary Navigation Tabs - Strictly Isolated by Role */}
      <div className="petty-cash-tabs">
        {/* 1. CEO View: Only visible to CEO / Super Admin */}
        {isCEO && (
          <button
            className={`petty-cash-tab-btn ${activeTab === 'CEO_DASHBOARD' ? 'active' : ''}`}
            onClick={() => setActiveTab('CEO_DASHBOARD')}
          >
            <UserCheck size={16} /> CEO Executive Desk
            {requests.filter((r) => r.status === 'PENDING_CEO_APPROVAL').length > 0 && (
              <span className="tab-badge">
                {requests.filter((r) => r.status === 'PENDING_CEO_APPROVAL').length}
              </span>
            )}
          </button>
        )}

        {/* 2. Accounts View: Only visible to Accounts / Finance staff */}
        {isAccounts && !isCEO && (
          <button
            className={`petty-cash-tab-btn ${activeTab === 'ACCOUNTS_DISBURSEMENTS' ? 'active' : ''}`}
            onClick={() => setActiveTab('ACCOUNTS_DISBURSEMENTS')}
          >
            <CreditCard size={16} /> Accounts Disbursements
            {requests.filter((r) => r.status === 'APPROVED_BY_CEO').length > 0 && (
              <span className="tab-badge" style={{ background: '#CFFAFE', color: '#0E7490' }}>
                {requests.filter((r) => r.status === 'APPROVED_BY_CEO').length}
              </span>
            )}
          </button>
        )}

        {/* 3. Custodian View: Only visible to the assigned Custodian employee */}
        {isCustodian && !isCEO && !isAccounts && (
          <button
            className={`petty-cash-tab-btn ${activeTab === 'CUSTODIAN_DESK' ? 'active' : ''}`}
            onClick={() => setActiveTab('CUSTODIAN_DESK')}
          >
            <Wallet size={16} /> Custodian Desk
          </button>
        )}

        {/* 4. General Ledger & Reports: Available for authorized roles */}
        <button
          className={`petty-cash-tab-btn ${activeTab === 'LEDGER_REPORTS' ? 'active' : ''}`}
          onClick={() => setActiveTab('LEDGER_REPORTS')}
        >
          <FileSpreadsheet size={16} /> General Ledger & Reports
        </button>
      </div>

      {/* Main Tab Views */}
      {activeTab === 'CEO_DASHBOARD' && (
        <PettyCashCeoView
          activeAccount={activeAccount}
          requests={requests}
          expenses={expenses}
          ledger={ledger}
          onOpenAssignCustodian={() => setIsAssignModalOpen(true)}
          onOpenReconcile={() => setIsReconcileModalOpen(true)}
          onSelectRequestForApproval={(req) => setSelectedRequestForApproval(req)}
          onViewProof={(url, title) => setProofViewer({ isOpen: true, url, title })}
          onRefresh={loadModuleData}
        />
      )}

      {activeTab === 'ACCOUNTS_DISBURSEMENTS' && (
        <PettyCashAccountsView
          activeAccount={activeAccount}
          requests={requests}
          disbursements={disbursements}
          expenses={expenses}
          onOpenDisburseModal={(req) => setSelectedRequestForDisburse(req)}
          onViewProof={(url, title) => setProofViewer({ isOpen: true, url, title })}
          onRefresh={loadModuleData}
        />
      )}

      {activeTab === 'CUSTODIAN_DESK' && (
        <PettyCashCustodianView
          activeAccount={activeAccount}
          requests={requests}
          disbursements={disbursements}
          expenses={expenses}
          ledger={ledger}
          onOpenRequestModal={() => setIsRequestModalOpen(true)}
          onOpenAddExpenseModal={() => setIsAddExpenseModalOpen(true)}
          onOpenConfirmReceiptModal={(disb) => setSelectedDisbursementForReceipt(disb)}
          onViewProof={(url, title) => setProofViewer({ isOpen: true, url, title })}
          onRefresh={loadModuleData}
        />
      )}

      {activeTab === 'LEDGER_REPORTS' && (
        <PettyCashLedgerReportsView
          onViewProof={(url, title) => setProofViewer({ isOpen: true, url, title })}
        />
      )}

      {/* Modals & Dialogs */}
      {/* 1. Assign Custodian Modal */}
      <AssignCustodianModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        activeAccount={activeAccount}
        onAssigned={(newAccount) => {
          setActiveAccount(newAccount);
          showToast('success', `Petty cash custodian ${newAccount.custodian_name} assigned successfully.`);
          loadModuleData();
        }}
        onOpenReconciliation={() => setIsReconcileModalOpen(true)}
      />

      {/* 2. Reconcile & Handover Modal */}
      <ReconcileCustodianModal
        isOpen={isReconcileModalOpen}
        onClose={() => setIsReconcileModalOpen(false)}
        activeAccount={activeAccount}
        onReconciled={(newAcc) => {
          setActiveAccount(newAcc);
          showToast('success', `Custodian handover to ${newAcc.custodian_name} reconciled & executed successfully.`);
          loadModuleData();
        }}
      />

      {/* 3. Request Petty Cash Modal (Custodian) */}
      <RequestPettyCashModal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        currentBalance={currentBalance}
        onRequestCreated={(newReq) => {
          showToast('success', `Fund request ${newReq.request_number} submitted to CEO for approval.`);
          loadModuleData();
        }}
      />

      {/* 4. CEO Approval Modal */}
      <CeoApprovalModal
        isOpen={!!selectedRequestForApproval}
        onClose={() => setSelectedRequestForApproval(null)}
        request={selectedRequestForApproval}
        currentBalance={currentBalance}
        onActionComplete={(updated) => {
          showToast(
            'success',
            updated.status === 'APPROVED_BY_CEO'
              ? `Request ${updated.request_number} approved! Now visible in Accounts for disbursement.`
              : `Request ${updated.request_number} rejected.`
          );
          setSelectedRequestForApproval(null);
          loadModuleData();
        }}
        onViewProof={(url, title) => setProofViewer({ isOpen: true, url, title })}
      />

      {/* 5. Disburse Cash Modal (Accounts) */}
      <DisburseCashModal
        isOpen={!!selectedRequestForDisburse}
        onClose={() => setSelectedRequestForDisburse(null)}
        request={selectedRequestForDisburse}
        onDisbursed={(disbursement) => {
          showToast(
            'success',
            `Disbursement ${disbursement.disbursement_number} recorded! Awaiting custodian cash receipt confirmation.`
          );
          setSelectedRequestForDisburse(null);
          loadModuleData();
        }}
      />

      {/* 6. Confirm Receipt Modal (Custodian) */}
      <ConfirmReceiptModal
        isOpen={!!selectedDisbursementForReceipt}
        onClose={() => setSelectedDisbursementForReceipt(null)}
        disbursement={selectedDisbursementForReceipt}
        onConfirmed={(receipt, newBal) => {
          showToast('success', `Cash receipt confirmed! Petty cash balance credited to ₹${newBal.toFixed(2)}.`);
          setSelectedDisbursementForReceipt(null);
          loadModuleData();
        }}
        onDisputed={() => {
          showToast('error', 'Discrepancy reported to Accounts and CEO for investigation.');
          setSelectedDisbursementForReceipt(null);
          loadModuleData();
        }}
      />

      {/* 7. Add Daily Expense Modal (Custodian) */}
      <AddDailyExpenseModal
        isOpen={isAddExpenseModalOpen}
        onClose={() => setIsAddExpenseModalOpen(false)}
        availableBalance={currentBalance}
        onExpenseAdded={(res) => {
          showToast(
            'success',
            `Expense recorded! ₹${res.expense.amount.toFixed(2)} deducted. Available balance: ₹${res.newBalance.toFixed(2)}`
          );
          setIsAddExpenseModalOpen(false);
          loadModuleData();
        }}
      />

      {/* 8. Proof Viewer Modal */}
      <ProofViewerModal
        isOpen={proofViewer.isOpen}
        onClose={() => setProofViewer({ isOpen: false, url: '', title: '' })}
        title={proofViewer.title}
        fileUrl={proofViewer.url}
      />
    </div>
  );
};
