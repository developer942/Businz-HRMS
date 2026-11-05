import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { Server } from 'http';

let server: Server;
const PORT = 8012;
const BASE_URL = `http://localhost:${PORT}/api/v1/field-advances`;

function createToken(payload: {
  id: string;
  email: string;
  role: string;
  employeeId: string;
  name: string;
  company_id?: string;
  department?: string;
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
  department: 'Management',
});

const accountsToken = createToken({
  id: 'usr-acc-001',
  email: 'accounts@businz.com',
  role: 'Finance Manager',
  employeeId: 'EMP-002',
  name: 'Finance Head',
  department: 'Accounts',
});

const employeeToken = createToken({
  id: 'usr-emp-001',
  email: 'dhanasekar@businz.com',
  role: 'Employee',
  employeeId: 'EMP-042',
  name: 'Dhanasekar J',
  department: 'Sales',
});

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(PORT, () => {
      resolve();
    });
  });
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe('Field Visit Advance, Personal Expense Claim & Settlement System', () => {
  // =========================================================================
  // SCENARIO 1: ADVANCE WITH UNUSED BALANCE
  // Request ₹6,000 -> Approved ₹6,000 -> Disbursed ₹6,000
  // Expenses: Travel ₹1,000 + Room ₹2,000 + Food ₹500 = ₹3,500
  // Balance: +₹2,500 due back to Accounts -> Employee returns -> Accounts confirms -> Completed
  // =========================================================================
  it('Scenario 1: Full lifecycle of advance with unused balance return', async () => {
    // 1. Employee creates field visit requesting ₹6,000 company advance
    const createRes = await fetch(`${BASE_URL}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${employeeToken}`,
      },
      body: JSON.stringify({
        employee_id: 'EMP-042',
        employee_code: 'VRM-042',
        employee_name: 'Dhanasekar J',
        department_name: 'Sales',
        purpose: 'Client Onsite Inspection and Contract Renewal',
        client_name: 'Apex Industrial Corp',
        destination: 'Coimbatore',
        start_date: '2026-11-10',
        end_date: '2026-11-12',
        funding_type: 'advance',
        requested_amount: 6000,
        travel_mode: 'Train',
        justification: 'Site visit for machinery maintenance validation',
      }),
    });

    const createJson = (await createRes.json()) as any;
    expect(createRes.status).toBe(201);
    expect(createJson.success).toBe(true);
    const visitId = createJson.data.id;
    expect(createJson.data.status).toBe('Pending Advance Approval');
    expect(createJson.data.requested_amount).toBe(6000);
    expect(createJson.data.disbursed_amount).toBe(0);

    // 2. CEO approves ₹6,000 advance
    const approveRes = await fetch(`${BASE_URL}/${visitId}/approve-advance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ceoToken}`,
      },
      body: JSON.stringify({
        decision: 'Approved',
        approved_amount: 6000,
        reason: 'Authorized for client visit',
      }),
    });
    const approveJson = (await approveRes.json()) as any;
    expect(approveRes.status).toBe(200);
    expect(approveJson.data.status).toBe('Advance Approved');
    expect(approveJson.data.approved_amount).toBe(6000);

    // 3. Accounts disburses ₹6,000
    const disburseRes = await fetch(`${BASE_URL}/${visitId}/disburse-advance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accountsToken}`,
      },
      body: JSON.stringify({
        amount: 6000,
        payment_method: 'Bank Transfer',
        payment_reference: 'NEFT-88492019',
        remarks: 'Advance credited to salary bank account',
      }),
    });
    const disburseJson = (await disburseRes.json()) as any;
    expect(disburseRes.status).toBe(200);
    expect(disburseJson.data.status).toBe('Active');
    expect(disburseJson.data.disbursed_amount).toBe(6000);

    // 4. Employee records daily expenses:
    // Travel: ₹1,000
    const exp1Res = await fetch(`${BASE_URL}/${visitId}/expenses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${employeeToken}`,
      },
      body: JSON.stringify({
        expense_date: '2026-11-10',
        category: 'Travel',
        amount: 1000,
        description: 'Train tickets Chennai to Coimbatore roundtrip',
      }),
    });
    expect(exp1Res.status).toBe(201);

    // Accommodation: ₹2,000
    const exp2Res = await fetch(`${BASE_URL}/${visitId}/expenses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${employeeToken}`,
      },
      body: JSON.stringify({
        expense_date: '2026-11-11',
        category: 'Accommodation',
        amount: 2000,
        description: 'Hotel residency 2 nights',
      }),
    });
    expect(exp2Res.status).toBe(201);

    // Food: ₹500
    const exp3Res = await fetch(`${BASE_URL}/${visitId}/expenses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${employeeToken}`,
      },
      body: JSON.stringify({
        expense_date: '2026-11-11',
        category: 'Food',
        amount: 500,
        description: 'Lunch and dinner during client meetings',
      }),
    });
    expect(exp3Res.status).toBe(201);

    // 5. Employee submits settlement
    const submitRes = await fetch(`${BASE_URL}/${visitId}/submit-settlement`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${employeeToken}`,
      },
      body: JSON.stringify({
        remarks: 'Trip concluded successfully. Returning remaining balance ₹2,500.',
      }),
    });
    const submitJson = (await submitRes.json()) as any;
    expect(submitRes.status).toBe(200);
    expect(submitJson.data.total_disbursed).toBe(6000);
    expect(submitJson.data.total_recorded_expense).toBe(3500);
    expect(submitJson.data.provisional_balance).toBe(2500); // 6000 - 3500 = +2500

    // 6. CEO approves settlement
    const reviewRes = await fetch(`${BASE_URL}/${visitId}/review-settlement`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ceoToken}`,
      },
      body: JSON.stringify({
        decision: 'Approved',
        approval_reason: 'All receipts verified and bills eligible.',
      }),
    });
    const reviewJson = (await reviewRes.json()) as any;
    expect(reviewRes.status).toBe(200);
    expect(reviewJson.data.visit.status).toBe('Pending Balance Collection');
    expect(reviewJson.data.settlement.return_due).toBe(2500);
    expect(reviewJson.data.settlement.reimbursement_due).toBe(0);

    // 7. Employee reports return of ₹2,500 cash handover
    const returnReportRes = await fetch(`${BASE_URL}/${visitId}/report-return`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${employeeToken}`,
      },
      body: JSON.stringify({
        employee_reported_amount: 2500,
        payment_method: 'Cash Handover',
        handover_date: '2026-11-13',
        employee_remarks: 'Handed over cash ₹2,500 to Accounts cashier',
      }),
    });
    const returnReportJson = (await returnReportRes.json()) as any;
    expect(returnReportRes.status).toBe(201);
    const returnId = returnReportJson.data.id;
    expect(returnReportJson.data.status).toBe('Awaiting Confirmation');

    // 8. Accounts confirms receipt of ₹2,500
    const confirmRes = await fetch(`${BASE_URL}/returns/${returnId}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accountsToken}`,
      },
      body: JSON.stringify({
        actual_received_amount: 2500,
        receipt_date: '2026-11-13',
        accounts_remarks: 'Cash received and deposited to office safe',
        status: 'Confirmed',
      }),
    });
    const confirmJson = (await confirmRes.json()) as any;
    expect(confirmRes.status).toBe(200);
    expect(confirmJson.data.status).toBe('Confirmed');

    // 9. Verify visit detail shows Completed status and reconciled financials
    const detailRes = await fetch(`${BASE_URL}/${visitId}`, {
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    const detailJson = (await detailRes.json()) as any;
    expect(detailRes.status).toBe(200);
    expect(detailJson.data.visit.status).toBe('Completed');
    expect(detailJson.data.settlement.settlement_status).toBe('Completed');
    expect(detailJson.data.settlement.actual_returned).toBe(2500);
  });

  // =========================================================================
  // SCENARIO 2: EXPENSES EXCEED ADVANCE (NEGATIVE PROVISIONAL BALANCE)
  // Advance: ₹6,000. Expenses: ₹7,000.
  // Provisional Balance: -₹1,000.
  // Reimbursement Due: ₹1,000 -> Accounts pays employee -> Completed
  // =========================================================================
  it('Scenario 2: Negative balance allowed when expenses exceed advance, followed by reimbursement payout', async () => {
    // 1. Create visit with ₹6,000 advance
    const createRes = await fetch(`${BASE_URL}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${employeeToken}`,
      },
      body: JSON.stringify({
        employee_id: 'EMP-042',
        employee_code: 'VRM-042',
        employee_name: 'Dhanasekar J',
        department_name: 'Sales',
        purpose: 'Urgent Client Site Troubleshooting',
        client_name: 'Alpha Forge Systems',
        destination: 'Bangalore',
        start_date: '2026-11-15',
        end_date: '2026-11-18',
        funding_type: 'advance',
        requested_amount: 6000,
      }),
    });
    const createJson = (await createRes.json()) as any;
    const visitId = createJson.data.id;

    // 2. CEO approves ₹6,000
    await fetch(`${BASE_URL}/${visitId}/approve-advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ceoToken}` },
      body: JSON.stringify({ decision: 'Approved', approved_amount: 6000 }),
    });

    // 3. Accounts disburses ₹6,000
    await fetch(`${BASE_URL}/${visitId}/disburse-advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accountsToken}` },
      body: JSON.stringify({ amount: 6000, payment_method: 'Cash' }),
    });

    // 4. Employee records expenses totalling ₹7,000:
    // Travel: ₹2,000
    await fetch(`${BASE_URL}/${visitId}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({
        expense_date: '2026-11-15',
        category: 'Travel',
        amount: 2000,
        description: 'Interstate AC bus and taxi',
      }),
    });
    // Food: ₹2,000
    await fetch(`${BASE_URL}/${visitId}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({
        expense_date: '2026-11-16',
        category: 'Food',
        amount: 2000,
        description: 'Meals during stay',
      }),
    });
    // Accommodation: ₹3,000
    await fetch(`${BASE_URL}/${visitId}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({
        expense_date: '2026-11-17',
        category: 'Accommodation',
        amount: 3000,
        description: 'Hotel room 3 nights',
      }),
    });

    // 5. Submit settlement: verify negative balance (-1000)
    const submitRes = await fetch(`${BASE_URL}/${visitId}/submit-settlement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({ remarks: 'Excess expenses incurred due to extended stay' }),
    });
    const submitJson = (await submitRes.json()) as any;
    expect(submitJson.success).toBe(true);
    expect(submitJson.data.total_disbursed).toBe(6000);
    expect(submitJson.data.total_recorded_expense).toBe(7000);
    expect(submitJson.data.provisional_balance).toBe(-1000); // NEGATIVE BALANCE ALLOWED!

    // 6. CEO approves settlement
    const reviewRes = await fetch(`${BASE_URL}/${visitId}/review-settlement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ceoToken}` },
      body: JSON.stringify({ decision: 'Approved', approval_reason: 'Approved extra day expense' }),
    });
    const reviewJson = (await reviewRes.json()) as any;
    expect(reviewJson.data.visit.status).toBe('Pending Reimbursement');
    expect(reviewJson.data.settlement.return_due).toBe(0);
    expect(reviewJson.data.settlement.reimbursement_due).toBe(1000); // 1000 to be reimbursed

    // 7. Accounts reimburses ₹1,000 to employee
    const reimbRes = await fetch(`${BASE_URL}/${visitId}/disburse-reimbursement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accountsToken}` },
      body: JSON.stringify({
        amount: 1000,
        payment_method: 'UPI',
        payment_reference: 'UPI/612089401/dhanasekar',
        remarks: 'Reimbursement for excess expense claim',
      }),
    });
    const reimbJson = (await reimbRes.json()) as any;
    expect(reimbRes.status).toBe(200);
    expect(reimbJson.data.status).toBe('Completed');

    // 8. Verify completed status
    const detailRes = await fetch(`${BASE_URL}/${visitId}`, {
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    const detailJson = (await detailRes.json()) as any;
    expect(detailJson.data.visit.status).toBe('Completed');
    expect(detailJson.data.settlement.actual_reimbursed).toBe(1000);
  });

  // =========================================================================
  // SCENARIO 3: NO ADVANCE, EMPLOYEE SPENDS PERSONAL MONEY
  // funding_type: 'personal'. Requested advance: 0. Disbursed advance: 0.
  // Skips advance approval queue directly into Active!
  // Records ₹4,500 expenses -> Submits claim -> CEO approves -> Accounts pays ₹4,500 -> Completed
  // =========================================================================
  it('Scenario 3: Personal money visit skips advance approval queue and reimburses full amount', async () => {
    // 1. Employee creates field visit with funding_type: 'personal'
    const createRes = await fetch(`${BASE_URL}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${employeeToken}`,
      },
      body: JSON.stringify({
        employee_id: 'EMP-042',
        employee_code: 'VRM-042',
        employee_name: 'Dhanasekar J',
        department_name: 'Sales',
        purpose: 'Vendor Assessment Meeting',
        client_name: 'Precision Tools Ltd',
        destination: 'Madurai',
        start_date: '2026-11-20',
        end_date: '2026-11-21',
        funding_type: 'personal',
        requested_amount: 0,
      }),
    });
    const createJson = (await createRes.json()) as any;
    expect(createRes.status).toBe(201);
    const visitId = createJson.data.id;
    // CRITICAL REQUIREMENT: Must not enter advance approval queue! Immediately Active.
    expect(createJson.data.status).toBe('Active');
    expect(createJson.data.requested_amount).toBe(0);
    expect(createJson.data.disbursed_amount).toBe(0);

    // 2. Employee records personal expenses totaling ₹4,500
    await fetch(`${BASE_URL}/${visitId}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({
        expense_date: '2026-11-20',
        category: 'Travel',
        amount: 2500,
        description: 'Fuel and toll charges for car drive',
      }),
    });
    await fetch(`${BASE_URL}/${visitId}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({
        expense_date: '2026-11-20',
        category: 'Food',
        amount: 2000,
        description: 'Client dinner and hospitality',
      }),
    });

    // 3. Employee submits settlement
    const submitRes = await fetch(`${BASE_URL}/${visitId}/submit-settlement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({ remarks: 'Personal expense claim submitted with fuel bills and restaurant tax invoice' }),
    });
    const submitJson = (await submitRes.json()) as any;
    expect(submitJson.data.total_disbursed).toBe(0);
    expect(submitJson.data.total_recorded_expense).toBe(4500);
    expect(submitJson.data.provisional_balance).toBe(-4500); // 0 - 4500 = -4500

    // 4. CEO approves eligible claim
    const reviewRes = await fetch(`${BASE_URL}/${visitId}/review-settlement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ceoToken}` },
      body: JSON.stringify({ decision: 'Approved', approval_reason: 'Tax invoices verified and approved' }),
    });
    const reviewJson = (await reviewRes.json()) as any;
    expect(reviewJson.data.visit.status).toBe('Pending Reimbursement');
    expect(reviewJson.data.settlement.reimbursement_due).toBe(4500);

    // 5. Accounts pays ₹4,500 reimbursement
    const reimbRes = await fetch(`${BASE_URL}/${visitId}/disburse-reimbursement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accountsToken}` },
      body: JSON.stringify({
        amount: 4500,
        payment_method: 'Bank Transfer',
        payment_reference: 'IMPS-99023411',
        remarks: 'Reimbursement for personal travel expenses',
      }),
    });
    const reimbJson = (await reimbRes.json()) as any;
    expect(reimbJson.success).toBe(true);

    // 6. Verify completed visit
    const detailRes = await fetch(`${BASE_URL}/${visitId}`, {
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    const detailJson = (await detailRes.json()) as any;
    expect(detailJson.data.visit.status).toBe('Completed');
    expect(detailJson.data.settlement.actual_reimbursed).toBe(4500);
  });

  // =========================================================================
  // RBAC & SECURITY PERMISSION TESTS
  // =========================================================================
  it('Permission checks: Regular employee cannot approve advance or disburse payments', async () => {
    // 1. Employee cannot approve advance
    const unauthApprove = await fetch(`${BASE_URL}/fva-dummy/approve-advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({ decision: 'Approved', approved_amount: 1000 }),
    });
    expect(unauthApprove.status).toBe(403);

    // 2. Employee cannot disburse advance
    const unauthDisburse = await fetch(`${BASE_URL}/fva-dummy/disburse-advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({ amount: 1000, payment_method: 'Cash' }),
    });
    expect(unauthDisburse.status).toBe(403);

    // 3. Employee cannot confirm balance return
    const unauthConfirm = await fetch(`${BASE_URL}/returns/ret-dummy/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({ actual_received_amount: 1000, receipt_date: '2026-11-01', status: 'Confirmed' }),
    });
    expect(unauthConfirm.status).toBe(403);
  });
});

