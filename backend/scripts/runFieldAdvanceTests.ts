process.env.NODE_ENV = 'test';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import jwt from 'jsonwebtoken';
import { Server } from 'http';

const PORT = 8015;
const BASE_URL = `http://localhost:${PORT}/api/v1/field-allowance`;

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
      company_id: payload.company_id || 'company-test-fa',
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

const hrToken = createToken({
  id: 'usr-hr-001',
  email: 'hr@businz.com',
  role: 'HR Manager',
  employeeId: 'EMP-005',
  name: 'Priya HR',
  department: 'HR',
});

const hr2Token = createToken({
  id: 'usr-hr-002',
  email: 'hr2@businz.com',
  role: 'HR',
  employeeId: 'EMP-006',
  name: 'Karthik HR',
  department: 'Human Resources',
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

async function run() {
  console.log('--- Starting BUSINZ HRMS Field Allowance Module Verification (10 Mandatory Phase 13 Tests) ---');
  let server: Server;
  await new Promise<void>((resolve) => {
    server = app.listen(PORT, () => {
      console.log(`[TEST-SERVER] Listening on ${PORT}`);
      resolve();
    });
  });

  try {
    // =============================================================
    // TEST 1 — ADVANCE WITH UNUSED BALANCE
    // Advance = ₹6,000, Expenses = ₹5,000 (Travel ₹1,000, Food ₹2,000, Room ₹2,000), Balance = +₹1,000
    // =============================================================
    console.log('\n[TEST 1] Advance ₹6,000 -> Spent ₹5,000 -> Balance +₹1,000 -> Employee returns ₹1,000');
    const create1Res = await fetch(`${BASE_URL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({
        employee_id: 'EMP-042',
        employee_code: 'VRM-042',
        employee_name: 'Dhanasekar J',
        department_name: 'Sales',
        purpose: 'Client Inspection & Contract Renewal',
        client_name: 'Apex Industrial Corp',
        destination: 'Chennai -> Nellore',
        start_date: '2026-11-10',
        end_date: '2026-11-12',
        funding_type: 'advance',
        requested_amount: 6000,
        travel_mode: 'Train',
      }),
    });
    const create1 = (await create1Res.json()) as any;
    if (create1Res.status !== 201 || create1.data.status !== 'Pending Advance Approval') {
      throw new Error(`Failed to create advance visit: ${JSON.stringify(create1)}`);
    }
    const visit1Id = create1.data.id;

    // CEO approves ₹6,000
    const approve1Res = await fetch(`${BASE_URL}/${visit1Id}/approve-advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ceoToken}` },
      body: JSON.stringify({ decision: 'Approved', approved_amount: 6000, reason: 'Approved for client site' }),
    });
    const approve1 = (await approve1Res.json()) as any;
    if (approve1.data.status !== 'Advance Approved') throw new Error(`Approval failed: ${JSON.stringify(approve1)}`);

    // Accounts disburses ₹6,000
    const disb1Res = await fetch(`${BASE_URL}/${visit1Id}/disburse-advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accountsToken}` },
      body: JSON.stringify({ amount: 6000, payment_method: 'Bank Transfer', payment_reference: 'NEFT-88492' }),
    });
    const disb1 = (await disb1Res.json()) as any;
    if (disb1.data.status !== 'Active' || disb1.data.disbursed_amount !== 6000) {
      throw new Error(`Disbursement failed: ${JSON.stringify(disb1)}`);
    }

    // Add 3 expenses (Travel ₹1,000 + Food ₹2,000 + Accommodation / Room ₹2,000 = ₹5,000)
    await fetch(`${BASE_URL}/${visit1Id}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({ expense_date: '2026-11-10', category: 'Travel', amount: 1000, description: 'Train tickets' }),
    });
    await fetch(`${BASE_URL}/${visit1Id}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({ expense_date: '2026-11-11', category: 'Food', amount: 2000, description: 'Daily food allowance' }),
    });
    await fetch(`${BASE_URL}/${visit1Id}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({ expense_date: '2026-11-11', category: 'Accommodation / Room', amount: 2000, description: 'Hotel room 2 nights' }),
    });

    // Submit settlement
    const submit1Res = await fetch(`${BASE_URL}/${visit1Id}/submit-settlement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({ remarks: 'Returning unused advance ₹1,000' }),
    });
    const submit1 = (await submit1Res.json()) as any;
    if (submit1.data.provisional_balance !== 1000) throw new Error(`Expected +1000 provisional balance, got: ${JSON.stringify(submit1)}`);

    // CEO approves settlement
    const rev1Res = await fetch(`${BASE_URL}/${visit1Id}/review-settlement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ceoToken}` },
      body: JSON.stringify({ decision: 'Approved', approval_reason: 'All verified' }),
    });
    const rev1 = (await rev1Res.json()) as any;
    if (rev1.data.visit.status !== 'Pending Balance Collection' || rev1.data.settlement.return_due !== 1000) {
      throw new Error(`Review failed: ${JSON.stringify(rev1)}`);
    }

    // Employee reports cash return
    const ret1Res = await fetch(`${BASE_URL}/${visit1Id}/report-return`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({
        employee_reported_amount: 1000,
        payment_method: 'Cash Handover',
        handover_date: '2026-11-13',
        employee_remarks: 'Cash handed to accounts cashier',
      }),
    });
    const ret1 = (await ret1Res.json()) as any;
    const returnId = ret1.data.id;

    // Accounts confirms receipt
    const conf1Res = await fetch(`${BASE_URL}/returns/${returnId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accountsToken}` },
      body: JSON.stringify({ actual_received_amount: 1000, receipt_date: '2026-11-13', status: 'Confirmed' }),
    });
    const conf1 = (await conf1Res.json()) as any;
    if (conf1.data.status !== 'Confirmed') throw new Error(`Confirmation failed: ${JSON.stringify(conf1)}`);

    const det1Res = await fetch(`${BASE_URL}/${visit1Id}`, { headers: { Authorization: `Bearer ${employeeToken}` } });
    const det1 = (await det1Res.json()) as any;
    if (det1.data.visit.status !== 'Completed' || det1.data.settlement.actual_returned !== 1000) {
      throw new Error(`Test 1 completion check failed: ${JSON.stringify(det1)}`);
    }
    console.log(`✓ TEST 1 PASSED: Allocated ₹6,000, Spent ₹5,000, Balance +₹1,000, Returned ₹1,000, Status: ${det1.data.visit.status}`);

    // =============================================================
    // TEST 2 — ADVANCE EXCEEDED (NEGATIVE BALANCE)
    // Advance = ₹6,000, Expenses = ₹7,000 (Travel ₹1,000, Food ₹2,000, Room ₹2,000, Bus ₹2,000), Balance = −₹1,000
    // =============================================================
    console.log('\n[TEST 2] Advance ₹6,000 -> Spent ₹7,000 -> Balance −₹1,000 -> Reimbursed ₹1,000');
    const create2Res = await fetch(`${BASE_URL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({
        employee_id: 'EMP-042',
        employee_code: 'VRM-042',
        employee_name: 'Dhanasekar J',
        department_name: 'Sales',
        purpose: 'Site Troubleshooting',
        client_name: 'Alpha Forge Systems',
        destination: 'Chennai -> Nellore',
        start_date: '2026-11-15',
        end_date: '2026-11-18',
        funding_type: 'advance',
        requested_amount: 6000,
      }),
    });
    const visit2Id = ((await create2Res.json()) as any).data.id;
    await fetch(`${BASE_URL}/${visit2Id}/approve-advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ceoToken}` },
      body: JSON.stringify({ decision: 'Approved', approved_amount: 6000 }),
    });
    await fetch(`${BASE_URL}/${visit2Id}/disburse-advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accountsToken}` },
      body: JSON.stringify({ amount: 6000, payment_method: 'Cash' }),
    });

    // Expenses = 1000 + 2000 + 2000 + 2000 = 7000
    await fetch(`${BASE_URL}/${visit2Id}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({ expense_date: '2026-11-15', category: 'Travel', amount: 1000, description: 'Local travel' }),
    });
    await fetch(`${BASE_URL}/${visit2Id}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({ expense_date: '2026-11-16', category: 'Food', amount: 2000, description: 'Meals' }),
    });
    await fetch(`${BASE_URL}/${visit2Id}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({ expense_date: '2026-11-17', category: 'Accommodation / Room', amount: 2000, description: 'Room stay' }),
    });
    await fetch(`${BASE_URL}/${visit2Id}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({ expense_date: '2026-11-18', category: 'Bus', amount: 2000, description: 'Extra bus travel' }),
    });

    const submit2Res = await fetch(`${BASE_URL}/${visit2Id}/submit-settlement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({ remarks: 'Extra bus travel ₹2,000 paid from own pocket' }),
    });
    const submit2 = (await submit2Res.json()) as any;
    if (submit2.data.provisional_balance !== -1000) {
      throw new Error(`Negative balance check failed! Expected -1000, got ${submit2.data.provisional_balance}`);
    }

    const rev2Res = await fetch(`${BASE_URL}/${visit2Id}/review-settlement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ceoToken}` },
      body: JSON.stringify({ decision: 'Approved', approval_reason: 'Approved extra bus travel' }),
    });
    const rev2 = (await rev2Res.json()) as any;
    if (rev2.data.visit.status !== 'Pending Reimbursement' || rev2.data.settlement.reimbursement_due !== 1000) {
      throw new Error(`Review scenario 2 failed: ${JSON.stringify(rev2)}`);
    }

    const reimb2Res = await fetch(`${BASE_URL}/${visit2Id}/disburse-reimbursement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accountsToken}` },
      body: JSON.stringify({ amount: 1000, payment_method: 'UPI', payment_reference: 'UPI/9982441' }),
    });
    const reimb2 = (await reimb2Res.json()) as any;
    if (reimb2.data.status !== 'Completed') throw new Error(`Reimbursement failed: ${JSON.stringify(reimb2)}`);

    const det2Res = await fetch(`${BASE_URL}/${visit2Id}`, { headers: { Authorization: `Bearer ${employeeToken}` } });
    const det2 = (await det2Res.json()) as any;
    if (det2.data.visit.status !== 'Completed' || det2.data.settlement.actual_reimbursed !== 1000) {
      throw new Error(`Test 2 completion check failed`);
    }
    console.log(`✓ TEST 2 PASSED: Allocated ₹6,000, Spent ₹7,000, Balance −₹1,000, Reimbursed ₹1,000, Status: ${det2.data.visit.status}`);

    // =============================================================
    // TEST 3 — OWN MONEY CLAIM (NO ADVANCE)
    // Advance = ₹0, Expenses = ₹2,000, Balance = −₹2,000 -> Reimbursed ₹2,000
    // =============================================================
    console.log('\n[TEST 3] Own-Money Claim: Advance ₹0 -> Spent ₹2,000 -> Balance −₹2,000 -> Reimbursed ₹2,000');
    const create3Res = await fetch(`${BASE_URL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({
        employee_id: 'EMP-042',
        employee_code: 'VRM-042',
        employee_name: 'Dhanasekar J',
        department_name: 'Sales',
        purpose: 'Vendor Assessment',
        client_name: 'Precision Tools Ltd',
        destination: 'Madurai',
        start_date: '2026-11-20',
        end_date: '2026-11-21',
        funding_type: 'personal',
        requested_amount: 0,
      }),
    });
    const create3 = (await create3Res.json()) as any;
    const visit3Id = create3.data.id;
    if (create3.data.status !== 'Active' || create3.data.requested_amount !== 0 || create3.data.disbursed_amount !== 0) {
      throw new Error(`Personal money visit must skip advance queue and be Active immediately! Got: ${JSON.stringify(create3)}`);
    }

    await fetch(`${BASE_URL}/${visit3Id}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({ expense_date: '2026-11-20', category: 'Travel', amount: 1200, description: 'Bus & taxi' }),
    });
    await fetch(`${BASE_URL}/${visit3Id}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({ expense_date: '2026-11-20', category: 'Food', amount: 800, description: 'Meals' }),
    });

    const submit3Res = await fetch(`${BASE_URL}/${visit3Id}/submit-settlement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({ remarks: 'Own money field expense claim ₹2,000' }),
    });
    const submit3 = (await submit3Res.json()) as any;
    if (submit3.data.provisional_balance !== -2000) throw new Error(`Expected -2000 provisional balance`);

    const rev3Res = await fetch(`${BASE_URL}/${visit3Id}/review-settlement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ceoToken}` },
      body: JSON.stringify({ decision: 'Approved', approval_reason: 'Approved personal claim' }),
    });
    const rev3 = (await rev3Res.json()) as any;
    if (rev3.data.visit.status !== 'Pending Reimbursement' || rev3.data.settlement.reimbursement_due !== 2000) {
      throw new Error(`Review scenario 3 failed`);
    }

    const reimb3Res = await fetch(`${BASE_URL}/${visit3Id}/disburse-reimbursement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accountsToken}` },
      body: JSON.stringify({ amount: 2000, payment_method: 'Bank Transfer', payment_reference: 'IMPS-99023' }),
    });
    const reimb3 = (await reimb3Res.json()) as any;
    if (reimb3.data.status !== 'Completed') throw new Error(`Reimbursement failed`);
    console.log(`✓ TEST 3 PASSED: Advance ₹0, Spent ₹2,000, Balance −₹2,000, Reimbursed ₹2,000`);

    // =============================================================
    // TEST 4 — EXACT SPEND
    // Advance = ₹3,000, Expenses = ₹3,000, Balance = ₹0 -> Completed with no further settlement
    // =============================================================
    console.log('\n[TEST 4] Exact Spend: Advance ₹3,000 -> Spent ₹3,000 -> Balance ₹0 -> Completed');
    const create4Res = await fetch(`${BASE_URL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({
        employee_id: 'EMP-042',
        employee_code: 'VRM-042',
        employee_name: 'Dhanasekar J',
        department_name: 'Sales',
        purpose: 'Trichy Dealer Meet',
        destination: 'Trichy',
        start_date: '2026-11-22',
        end_date: '2026-11-23',
        funding_type: 'advance',
        requested_amount: 3000,
      }),
    });
    const visit4Id = ((await create4Res.json()) as any).data.id;
    await fetch(`${BASE_URL}/${visit4Id}/approve-advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ceoToken}` },
      body: JSON.stringify({ decision: 'Approved', approved_amount: 3000 }),
    });
    await fetch(`${BASE_URL}/${visit4Id}/disburse-advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accountsToken}` },
      body: JSON.stringify({ amount: 3000, payment_method: 'UPI', payment_reference: 'UPI-3000-EXACT' }),
    });
    await fetch(`${BASE_URL}/${visit4Id}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({ expense_date: '2026-11-22', category: 'Travel', amount: 1500, description: 'Bus fare' }),
    });
    await fetch(`${BASE_URL}/${visit4Id}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({ expense_date: '2026-11-23', category: 'Accommodation / Room', amount: 1500, description: 'Hotel stay' }),
    });
    const submit4 = (await (await fetch(`${BASE_URL}/${visit4Id}/submit-settlement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({ remarks: 'Exact spend' }),
    })).json()) as any;
    if (submit4.data.provisional_balance !== 0) throw new Error(`Expected 0 balance, got ${submit4.data.provisional_balance}`);

    const rev4 = (await (await fetch(`${BASE_URL}/${visit4Id}/review-settlement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ceoToken}` },
      body: JSON.stringify({ decision: 'Approved', approval_reason: 'Exact spend verified' }),
    })).json()) as any;
    if (rev4.data.visit.status !== 'Completed' || rev4.data.settlement.return_due !== 0 || rev4.data.settlement.reimbursement_due !== 0) {
      throw new Error(`Expected immediate Completed status on exact spend, got: ${JSON.stringify(rev4)}`);
    }
    console.log(`✓ TEST 4 PASSED: Exact spend ₹3,000 -> Balance ₹0 -> Immediately Completed`);

    // =============================================================
    // TEST 5 — PARTIALLY REJECTED EXPENSES
    // Advance = ₹6,000, Recorded = ₹7,000, Approved = ₹5,500, Rejected = ₹1,500
    // Displayed Spend = ₹7,000, Approved Settlement requires ₹500 return
    // =============================================================
    console.log('\n[TEST 5] Partially Rejected Expenses: Advance ₹6,000, Recorded ₹7,000, Approved ₹5,500 -> ₹500 Return Due');
    const create5Res = await fetch(`${BASE_URL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({
        employee_id: 'EMP-042',
        employee_code: 'VRM-042',
        employee_name: 'Dhanasekar J',
        department_name: 'Sales',
        purpose: 'Salem Industrial Visit',
        destination: 'Salem',
        start_date: '2026-11-24',
        end_date: '2026-11-25',
        funding_type: 'advance',
        requested_amount: 6000,
      }),
    });
    const visit5Id = ((await create5Res.json()) as any).data.id;
    await fetch(`${BASE_URL}/${visit5Id}/approve-advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ceoToken}` },
      body: JSON.stringify({ decision: 'Approved', approved_amount: 6000 }),
    });
    await fetch(`${BASE_URL}/${visit5Id}/disburse-advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accountsToken}` },
      body: JSON.stringify({ amount: 6000, payment_method: 'Bank Transfer', payment_reference: 'NEFT-6000-SALEM' }),
    });
    const e5a = (await (await fetch(`${BASE_URL}/${visit5Id}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({ expense_date: '2026-11-24', category: 'Travel', amount: 5500, description: 'Approved travel & stay' }),
    })).json()) as any;
    const e5b = (await (await fetch(`${BASE_URL}/${visit5Id}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({ expense_date: '2026-11-25', category: 'Other', amount: 1500, description: 'Unverified personal purchase' }),
    })).json()) as any;

    await fetch(`${BASE_URL}/${visit5Id}/submit-settlement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({ remarks: 'Submitting ₹7,000 expenses' }),
    });

    const rev5 = (await (await fetch(`${BASE_URL}/${visit5Id}/review-settlement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ceoToken}` },
      body: JSON.stringify({
        decision: 'Approved',
        approval_reason: 'Approved ₹5,500; rejected ₹1,500 personal item',
        item_decisions: [
          { expense_id: e5a.data.id, status: 'Approved', approved_amount: 5500 },
          { expense_id: e5b.data.id, status: 'Rejected', approved_amount: 0, rejection_reason: 'Personal item not eligible' },
        ],
      }),
    })).json()) as any;

    if (
      rev5.data.settlement.total_recorded_expense !== 7000 ||
      rev5.data.settlement.total_eligible_expense !== 5500 ||
      rev5.data.settlement.return_due !== 500 ||
      rev5.data.visit.status !== 'Pending Balance Collection'
    ) {
      throw new Error(`Test 5 failed! Got: ${JSON.stringify(rev5)}`);
    }
    console.log(`✓ TEST 5 PASSED: Recorded Spend = ₹${rev5.data.settlement.total_recorded_expense}, Approved = ₹${rev5.data.settlement.total_eligible_expense}, Return Due = ₹${rev5.data.settlement.return_due}`);

    // =============================================================
    // TEST 6 — HR REQUEST APPROVAL RESTRICTION (CEO ONLY)
    // HR submits ₹3,000 advance -> HR cannot approve (403) -> Another HR cannot approve (403) -> CEO approves (200)
    // =============================================================
    console.log('\n[TEST 6] HR Request Approval Restriction: HR submits ₹3,000 advance -> Only CEO can approve');
    const createHrRes = await fetch(`${BASE_URL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hrToken}` },
      body: JSON.stringify({
        employee_id: 'EMP-005',
        employee_code: 'VRM-005',
        employee_name: 'Priya HR',
        department_name: 'HR',
        purpose: 'Campus Recruitment Drive',
        destination: 'Coimbatore',
        start_date: '2026-11-26',
        end_date: '2026-11-27',
        funding_type: 'advance',
        requested_amount: 3000,
      }),
    });
    const hrVisitId = ((await createHrRes.json()) as any).data.id;

    // Self-approval attempt by HR
    const hrSelfApprove = await fetch(`${BASE_URL}/${hrVisitId}/approve-advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hrToken}` },
      body: JSON.stringify({ decision: 'Approved', approved_amount: 3000 }),
    });
    if (hrSelfApprove.status !== 403) {
      throw new Error(`Expected 403 when HR tries to approve own advance, got ${hrSelfApprove.status}`);
    }

    // Peer HR approval attempt on HR request
    const hrPeerApprove = await fetch(`${BASE_URL}/${hrVisitId}/approve-advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hr2Token}` },
      body: JSON.stringify({ decision: 'Approved', approved_amount: 3000 }),
    });
    if (hrPeerApprove.status !== 403) {
      throw new Error(`Expected 403 when another HR tries to approve HR advance, got ${hrPeerApprove.status}`);
    }

    // CEO approves HR request
    const ceoApproveHr = await fetch(`${BASE_URL}/${hrVisitId}/approve-advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ceoToken}` },
      body: JSON.stringify({ decision: 'Approved', approved_amount: 3000, reason: 'CEO approved HR recruitment trip' }),
    });
    if (ceoApproveHr.status !== 200) {
      throw new Error(`Expected 200 when CEO approves HR advance, got ${ceoApproveHr.status}`);
    }
    console.log(`✓ TEST 6 PASSED: HR self-approval (403) & peer-HR approval (403) blocked; CEO approval succeeded (200)`);

    // =============================================================
    // TEST 7 — CEO CLAIM RESTRICTION
    // CEO cannot create advance requests or expense claims (403 FORBIDDEN)
    // =============================================================
    console.log('\n[TEST 7] CEO Claim Restriction: CEO cannot create field allowance requests or expenses');
    const ceoCreateAttempt = await fetch(`${BASE_URL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ceoToken}` },
      body: JSON.stringify({
        employee_id: 'EMP-000',
        purpose: 'CEO Test Visit',
        destination: 'Mumbai',
        start_date: '2026-11-28',
        end_date: '2026-11-29',
        funding_type: 'advance',
        requested_amount: 5000,
      }),
    });
    if (ceoCreateAttempt.status !== 403) {
      throw new Error(`Expected 403 when CEO attempts to create field visit, got ${ceoCreateAttempt.status}`);
    }
    const ceoExpenseAttempt = await fetch(`${BASE_URL}/${visit1Id}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ceoToken}` },
      body: JSON.stringify({ expense_date: '2026-11-10', category: 'Food', amount: 500, description: 'Test' }),
    });
    if (ceoExpenseAttempt.status !== 403) {
      throw new Error(`Expected 403 when CEO attempts to add expense, got ${ceoExpenseAttempt.status}`);
    }
    console.log(`✓ TEST 7 PASSED: CEO blocked from creating visits (403) and adding expenses (403)`);

    // =============================================================
    // TEST 8 — ACCOUNTS APPROVAL RESTRICTION
    // Accounts cannot approve advances or expense claims (403 FORBIDDEN)
    // =============================================================
    console.log('\n[TEST 8] Accounts Approval Restriction: Accounts cannot approve advances or settlements');
    const accApproveAdvance = await fetch(`${BASE_URL}/${hrVisitId}/approve-advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accountsToken}` },
      body: JSON.stringify({ decision: 'Approved', approved_amount: 3000 }),
    });
    if (accApproveAdvance.status !== 403) {
      throw new Error(`Expected 403 when Accounts tries to approve advance, got ${accApproveAdvance.status}`);
    }
    const accReviewSettlement = await fetch(`${BASE_URL}/${visit1Id}/review-settlement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accountsToken}` },
      body: JSON.stringify({ decision: 'Approved', approval_reason: 'Accounts attempt' }),
    });
    if (accReviewSettlement.status !== 403) {
      throw new Error(`Expected 403 when Accounts tries to review settlement, got ${accReviewSettlement.status}`);
    }
    console.log(`✓ TEST 8 PASSED: Accounts blocked from approving advances (403) and settlements (403)`);

    // =============================================================
    // TEST 9 — CEO MASTER ANALYTICS & DAILY EXPENSE REPORT API
    // =============================================================
    console.log('\n[TEST 9] CEO Master Analytics & Daily Expense Report API');
    const analyticsRes = await fetch(`${BASE_URL}/analytics`, { headers: { Authorization: `Bearer ${ceoToken}` } });
    const analyticsJson = (await analyticsRes.json()) as any;
    if (analyticsRes.status !== 200 || typeof analyticsJson.data.totalAllocatedMembers !== 'number') {
      throw new Error(`Analytics check failed: ${JSON.stringify(analyticsJson)}`);
    }
    const dailyExpRes = await fetch(`${BASE_URL}/daily-expenses`, { headers: { Authorization: `Bearer ${ceoToken}` } });
    const dailyExpJson = (await dailyExpRes.json()) as any;
    if (dailyExpRes.status !== 200 || !Array.isArray(dailyExpJson.data) || dailyExpJson.data.length === 0) {
      throw new Error(`Daily expenses check failed: ${JSON.stringify(dailyExpJson)}`);
    }
    console.log(`✓ TEST 9 PASSED: CEO Analytics (Members=${analyticsJson.data.totalAllocatedMembers}, Distributed=₹${analyticsJson.data.totalAdvancesDistributed}, Spent=₹${analyticsJson.data.totalDailyExpenses}) & ${dailyExpJson.data.length} Daily Expenses verified`);

    // =============================================================
    // TEST 10 — DUPLICATE PAYMENT PROTECTION
    // Duplicate advance disbursement, duplicate return confirmation, and duplicate reimbursement are blocked with 409 Conflict
    // =============================================================
    console.log('\n[TEST 10] Duplicate Payment Protection (409 Conflict)');
    const dupDisbRes = await fetch(`${BASE_URL}/${visit1Id}/disburse-advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accountsToken}` },
      body: JSON.stringify({ amount: 6000, payment_method: 'Bank Transfer', payment_reference: 'NEFT-88492-DUP' }),
    });
    if (dupDisbRes.status !== 409) {
      throw new Error(`Expected 409 Conflict on duplicate advance disbursement, got ${dupDisbRes.status}`);
    }

    const dupReturnConfirmRes = await fetch(`${BASE_URL}/returns/${returnId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accountsToken}` },
      body: JSON.stringify({ actual_received_amount: 1000, receipt_date: '2026-11-13', status: 'Confirmed' }),
    });
    if (dupReturnConfirmRes.status !== 409) {
      throw new Error(`Expected 409 Conflict on duplicate return confirmation, got ${dupReturnConfirmRes.status}`);
    }

    const dupReimbRes = await fetch(`${BASE_URL}/${visit2Id}/disburse-reimbursement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accountsToken}` },
      body: JSON.stringify({ amount: 1000, payment_method: 'UPI', payment_reference: 'UPI-9982441-DUP' }),
    });
    if (dupReimbRes.status !== 409) {
      throw new Error(`Expected 409 Conflict on duplicate reimbursement payout, got ${dupReimbRes.status}`);
    }
    console.log(`✓ TEST 10 PASSED: Duplicate advance disbursement (409), duplicate return confirmation (409), and duplicate reimbursement (409) all blocked!`);

    console.log('\n====================================================================');
    console.log('ALL 10 MANDATORY PHASE 13 FIELD ALLOWANCE TESTS PASSED 100%!');
    console.log('====================================================================');
  } finally {
    server.close();
  }
}

run().catch((err) => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
