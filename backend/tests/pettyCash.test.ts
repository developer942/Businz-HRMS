import { describe, it, expect, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { Server } from 'http';

let server: Server;
const PORT = 8011;
const BASE_URL = `http://localhost:${PORT}/api/v1/petty-cash`;

function createToken(payload: {
  id: string;
  email: string;
  role: string;
  employeeId: string;
  name: string;
  company_id?: string;
}) {
  return jwt.sign(
    {
      ...payload,
      company_id: payload.company_id || 'company-a',
    },
    env.JWT_SECRET,
    { expiresIn: '2h' }
  );
}

const ceoToken = createToken({
  id: 'usr-ceo-001',
  email: 'ceo@businz.com',
  role: 'CEO',
  employeeId: 'EMP-000',
  name: 'Businz CEO',
});

const accountsToken = createToken({
  id: 'usr-acc-001',
  email: 'accounts@businz.com',
  role: 'Finance Manager',
  employeeId: 'EMP-002',
  name: 'Accounts Head',
});

const custodianToken = createToken({
  id: 'usr-cust-001',
  email: 'custodian@businz.com',
  role: 'Employee',
  employeeId: 'EMP-004',
  name: 'Karthik Custodian',
});

const otherEmployeeToken = createToken({
  id: 'usr-other-001',
  email: 'other@businz.com',
  role: 'Employee',
  employeeId: 'EMP-009',
  name: 'Unauthorized Employee',
});

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(PORT, () => resolve());
  });
  return () => {
    server.close();
  };
});

describe('BUSINZ HRMS - Complete Petty Cash Management Module (End-to-End)', () => {
  let activeAccountId: string;
  let requestId: string;
  let disbursementId: string;
  let expenseId: string;

  // ------------------------------------------------------------
  // PHASE 1: Role-Based Custodian Assignment
  // ------------------------------------------------------------
  it('1. Rejects non-CEO attempt to assign a custodian', async () => {
    const res = await fetch(`${BASE_URL}/custodian/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${otherEmployeeToken}`,
      },
      body: JSON.stringify({
        employeeId: 'usr-cust-001',
        employeeName: 'Karthik Custodian',
        employeeCode: 'EMP-004',
      }),
    });
    expect(res.status).toBe(403);
  });

  it('2. CEO successfully assigns an active employee as Petty Cash Custodian', async () => {
    const res = await fetch(`${BASE_URL}/custodian/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ceoToken}`,
      },
      body: JSON.stringify({
        employeeId: 'usr-cust-001',
        employeeName: 'Karthik Custodian',
        employeeCode: 'EMP-004',
        lowBalanceThreshold: 1000,
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.custodian_name).toBe('Karthik Custodian');
    expect(body.data.status).toBe('ACTIVE');
    expect(body.data.current_balance).toBe(0);
    activeAccountId = body.data.id;
  });

  it('3. Fetches the active custodian account', async () => {
    const res = await fetch(`${BASE_URL}/custodian/active`, {
      headers: { Authorization: `Bearer ${custodianToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(activeAccountId);
  });

  // ------------------------------------------------------------
  // PHASE 2: Petty Cash Request
  // ------------------------------------------------------------
  it('4. Rejects request from an unauthorized employee who is not the custodian', async () => {
    const res = await fetch(`${BASE_URL}/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${otherEmployeeToken}`,
      },
      body: JSON.stringify({
        requestedAmount: 10000,
        purpose: 'Office monthly operational expenses',
      }),
    });
    expect(res.status).toBe(400); // Service rejects unauthorized custodian
  });

  it('5. Rejects request with zero or negative amount', async () => {
    const res = await fetch(`${BASE_URL}/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${custodianToken}`,
      },
      body: JSON.stringify({
        requestedAmount: -500,
        purpose: 'Invalid negative test',
      }),
    });
    expect(res.status).toBe(422); // Zod validation failure
  });

  it('6. Assigned Custodian successfully requests ₹10,000 petty cash', async () => {
    const res = await fetch(`${BASE_URL}/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${custodianToken}`,
      },
      body: JSON.stringify({
        requestedAmount: 10000,
        purpose: 'Office operational expenses for refreshments, stationery, transport',
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.requested_amount).toBe(10000);
    expect(body.data.status).toBe('PENDING_CEO_APPROVAL');
    requestId = body.data.id;
  });

  // ------------------------------------------------------------
  // PHASE 3: CEO Approval
  // ------------------------------------------------------------
  it('7. Rejects non-CEO attempt to approve request', async () => {
    const res = await fetch(`${BASE_URL}/requests/${requestId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accountsToken}`,
      },
      body: JSON.stringify({
        action: 'APPROVE',
        approvedAmount: 10000,
      }),
    });
    expect(res.status).toBe(403);
  });

  it('8. CEO approves the fund request for ₹10,000', async () => {
    const res = await fetch(`${BASE_URL}/requests/${requestId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ceoToken}`,
      },
      body: JSON.stringify({
        action: 'APPROVE',
        approvedAmount: 10000,
        remarks: 'Approved for office operations',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('APPROVED_BY_CEO');
    expect(body.data.approved_amount).toBe(10000);

    // Verify balance is STILL 0 (approval does NOT credit cash yet)
    const accRes = await fetch(`${BASE_URL}/custodian/active`, {
      headers: { Authorization: `Bearer ${ceoToken}` },
    });
    const accBody = await accRes.json();
    expect(accBody.data.current_balance).toBe(0);
  });

  // ------------------------------------------------------------
  // PHASE 4: Accounts Cash Disbursement
  // ------------------------------------------------------------
  it('9. Accounts user records cash disbursement of full approved ₹10,000', async () => {
    const res = await fetch(`${BASE_URL}/disbursements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accountsToken}`,
      },
      body: JSON.stringify({
        requestId,
        disbursedAmount: 10000,
        paymentMode: 'Cash',
        paymentDate: new Date().toISOString().split('T')[0],
        paymentReference: 'VOUCHER-PC-2026-001',
        remarks: 'Cash handed over at accounts desk',
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('DISBURSED');
    disbursementId = body.data.id;

    // Verify balance is STILL 0 (disbursement pending employee receipt confirmation)
    const accRes = await fetch(`${BASE_URL}/custodian/active`, {
      headers: { Authorization: `Bearer ${custodianToken}` },
    });
    const accBody = await accRes.json();
    expect(accBody.data.current_balance).toBe(0);
  });

  // ------------------------------------------------------------
  // PHASE 5: Employee Receipt Confirmation
  // ------------------------------------------------------------
  it('10. Custodian confirms cash receipt, atomically crediting balance to ₹10,000', async () => {
    const idempotencyKey = 'IDEMP-TEST-KEY-001-A';
    const res = await fetch(`${BASE_URL}/receipts/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${custodianToken}`,
      },
      body: JSON.stringify({
        disbursementId,
        action: 'CONFIRM',
        idempotencyKey,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.newBalance).toBe(10000);

    // Verify account balance is exactly 10,000
    const accRes = await fetch(`${BASE_URL}/custodian/active`, {
      headers: { Authorization: `Bearer ${custodianToken}` },
    });
    const accBody = await accRes.json();
    expect(accBody.data.current_balance).toBe(10000);
  });

  it('11. Idempotency test: Re-submitting the same receipt confirmation does not double-credit', async () => {
    const idempotencyKey = 'IDEMP-TEST-KEY-001-A';
    const res = await fetch(`${BASE_URL}/receipts/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${custodianToken}`,
      },
      body: JSON.stringify({
        disbursementId,
        action: 'CONFIRM',
        idempotencyKey,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.newBalance).toBe(10000); // Still 10,000!
  });

  // ------------------------------------------------------------
  // PHASE 6: Daily Expenses & Balance Calculation
  // ------------------------------------------------------------
  it('12. Custodian records Day 1 Tea & Coffee expense of ₹300 -> Balance becomes ₹9,700', async () => {
    const res = await fetch(`${BASE_URL}/expenses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${custodianToken}`,
      },
      body: JSON.stringify({
        categoryId: 'cat-001',
        categoryName: 'Tea & Coffee',
        amount: 300,
        expenseDate: new Date().toISOString().split('T')[0],
        reason: 'Office morning and evening tea & biscuits for team',
        paymentMode: 'Cash',
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.newBalance).toBe(9700);
    expenseId = body.data.expense.id;
  });

  it('13. Custodian records Day 1 Stationery expense of ₹500 -> Balance becomes ₹9,200', async () => {
    const res = await fetch(`${BASE_URL}/expenses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${custodianToken}`,
      },
      body: JSON.stringify({
        categoryId: 'cat-002',
        categoryName: 'Stationery',
        amount: 500,
        expenseDate: new Date().toISOString().split('T')[0],
        reason: 'A4 printing paper rim and permanent markers',
        paymentMode: 'Cash',
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.newBalance).toBe(9200);
  });

  it('14. Rejects expense exceeding available balance (preventing negative balance)', async () => {
    const res = await fetch(`${BASE_URL}/expenses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${custodianToken}`,
      },
      body: JSON.stringify({
        categoryId: 'cat-006',
        categoryName: 'Office Maintenance',
        amount: 15000, // Exceeds 9,200 available balance
        expenseDate: new Date().toISOString().split('T')[0],
        reason: 'Emergency AC replacement',
        paymentMode: 'Cash',
      }),
    });
    expect(res.status).toBe(400); // Service rejects with insufficient balance
  });

  it('15. Rejects unauthorized employee attempting to submit expenses', async () => {
    const res = await fetch(`${BASE_URL}/expenses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${otherEmployeeToken}`,
      },
      body: JSON.stringify({
        categoryId: 'cat-004',
        categoryName: 'Local Transport',
        amount: 200,
        expenseDate: new Date().toISOString().split('T')[0],
        reason: 'Client delivery travel',
      }),
    });
    expect(res.status).toBe(400); // Rejected: not the assigned custodian
  });

  it('16. Reverses an incorrect expense with audit trail -> Balance restored from ₹9,200 to ₹9,500', async () => {
    const res = await fetch(`${BASE_URL}/expenses/${expenseId}/reverse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ceoToken}`,
      },
      body: JSON.stringify({
        reversalReason: 'Duplicate bill accidentally entered; vendor provided direct invoice',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.newBalance).toBe(9500); // 9,200 + 300 = 9,500
  });

  // ------------------------------------------------------------
  // PHASE 7: Ledger & Dashboard Metrics Verification
  // ------------------------------------------------------------
  it('17. Verifies full immutable financial ledger reconciliation', async () => {
    const res = await fetch(`${BASE_URL}/ledger`, {
      headers: { Authorization: `Bearer ${ceoToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(3); // Credit + 2 Debits + 1 Reversal

    // First entry is the latest reversal
    const latest = body.data[0];
    expect(latest.transaction_type).toBe('REVERSAL');
    expect(latest.balance_after).toBe(9500);
  });

  it('18. Verifies CEO Dashboard aggregates match ledger balance', async () => {
    const res = await fetch(`${BASE_URL}/dashboards/ceo`, {
      headers: { Authorization: `Bearer ${ceoToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.remainingBalance).toBe(9500);
    expect(body.data.activeCustodian.custodian_name).toBe('Karthik Custodian');
  });

  it('19. Verifies Accounts Dashboard metrics', async () => {
    const res = await fetch(`${BASE_URL}/dashboards/accounts`, {
      headers: { Authorization: `Bearer ${accountsToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.totalCashDisbursed).toBe(10000);
  });

  it('20. Verifies Custodian Dashboard metrics', async () => {
    const res = await fetch(`${BASE_URL}/dashboards/custodian`, {
      headers: { Authorization: `Bearer ${custodianToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.availableCash).toBe(9500);
  });

  // ------------------------------------------------------------
  // PHASE 8: Safe Custodian Handover & Reconciliation
  // ------------------------------------------------------------
  it('21. Rejects non-CEO attempt to reassign custodian', async () => {
    const res = await fetch(`${BASE_URL}/custodian/reconcile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accountsToken}`,
      },
      body: JSON.stringify({
        newEmployeeId: 'usr-new-cust-002',
        newEmployeeName: 'Vaishnavi V',
        newEmployeeCode: 'VRM-032',
        physicalCashCount: 9500,
        reconciliationNotes: 'Unauthorized handover attempt',
      }),
    });
    expect(res.status).toBe(403);
  });

  it('22. Rejects handing over to the same active custodian', async () => {
    const res = await fetch(`${BASE_URL}/custodian/reassign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ceoToken}`,
      },
      body: JSON.stringify({
        newEmployeeId: 'usr-cust-001',
        newEmployeeName: 'Karthik Custodian',
        newEmployeeCode: 'EMP-004',
        physicalCashCount: 9500,
        reconciliationNotes: 'Same custodian check',
      }),
    });
    expect(res.status).toBe(400);
  });

  it('23. CEO executes Safe Custodian Handover via /custodian/reconcile (Web legacy payload) preserving ₹9,500 balance', async () => {
    const res = await fetch(`${BASE_URL}/custodian/reconcile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ceoToken}`,
      },
      body: JSON.stringify({
        newEmployeeId: 'usr-new-cust-002',
        newEmployeeName: 'Vaishnavi V',
        newEmployeeCode: 'VRM-032',
        physicalCashCount: 9500,
        reconciliationNotes: 'change the petty cash member',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.previousAccount.status).toBe('TRANSFERRED');
    expect(body.data.previousAccount.reconciliation_status).toBe('RECONCILED');
    expect(body.data.previousAccount.current_balance).toBe(0);
    expect(body.data.newAccount.status).toBe('ACTIVE');
    expect(body.data.newAccount.custodian_name).toBe('Vaishnavi V');
    expect(body.data.newAccount.custodian_employee_id).toBe('VRM-032');
    expect(body.data.newAccount.current_balance).toBe(9500);

    // Active custodian endpoint immediately reflects Vaishnavi V with ₹9,500
    const activeRes = await fetch(`${BASE_URL}/custodian/active`, {
      headers: { Authorization: `Bearer ${ceoToken}` },
    });
    expect(activeRes.status).toBe(200);
    const activeBody = await activeRes.json();
    expect(activeBody.data.custodian_name).toBe('Vaishnavi V');
    expect(activeBody.data.current_balance).toBe(9500);
  });

  it('24. CEO executes subsequent handover via /custodian/reassign with explicit previousAccountId and fetches /custodian/history', async () => {
    const activeRes = await fetch(`${BASE_URL}/custodian/active`, {
      headers: { Authorization: `Bearer ${ceoToken}` },
    });
    const currentActive = (await activeRes.json()).data;

    const res = await fetch(`${BASE_URL}/custodian/reassign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ceoToken}`,
      },
      body: JSON.stringify({
        previousAccountId: currentActive.id,
        newEmployeeId: 'usr-new-cust-003',
        newEmployeeName: 'Arun Boopathi M',
        newEmployeeCode: 'VRM-013',
        physicalCashCounted: 9500,
        reconciliationNotes: 'Handover back after audit review',
        transferRemainingBalance: true,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.newAccount.custodian_name).toBe('Arun Boopathi M');
    expect(body.data.newAccount.current_balance).toBe(9500);

    const historyRes = await fetch(`${BASE_URL}/custodian/history`, {
      headers: { Authorization: `Bearer ${ceoToken}` },
    });
    expect(historyRes.status).toBe(200);
    const historyBody = await historyRes.json();
    expect(historyBody.success).toBe(true);
    expect(historyBody.data.length).toBeGreaterThanOrEqual(3);
  });
});
