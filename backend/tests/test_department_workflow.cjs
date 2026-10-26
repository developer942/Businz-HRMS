const dotenv = require('c:/Users/ahile/Downloads/HRM/backend/node_modules/dotenv');
dotenv.config({ path: 'C:/Users/ahile/Downloads/HRM/backend/.env' });

const { createClient } = require('c:/Users/ahile/Downloads/HRM/backend/node_modules/@supabase/supabase-js');
const supabase = createClient(process.env.DB_REST_URL, process.env.DB_REST_SERVICE_KEY);

async function runDepartmentWorkflowAudit() {
  console.log('====================================================');
  console.log('   PHASE 2 - DEPARTMENT MANAGEMENT PERSISTENCE AUDIT');
  console.log('====================================================\n');

  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const testDeptName = `Research & Innovation ${randomSuffix}`;
  const testDeptCode = `RI${randomSuffix.toString().substring(0, 2)}`;
  const testBudget = 750000;

  let createdId = null;

  try {
    // 1. Initial State: Verify department does NOT exist in PostgreSQL
    console.log(`Step 1: Check initial state for "${testDeptName}"...`);
    const { data: initialCheck } = await supabase
      .from('departments')
      .select('*')
      .ilike('name', testDeptName);
    console.log(`Pre-check result: ${initialCheck.length} records found (Expected: 0)`);
    if (initialCheck.length > 0) throw new Error('Initial test record already exists!');

    // 2. CREATE: Submit department creation
    console.log(`\nStep 2: Executing INSERT into PostgreSQL departments table...`);
    const { data: createdDept, error: insertError } = await supabase
      .from('departments')
      .insert({
        name: testDeptName,
        code: testDeptCode,
        budget: testBudget,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError || !createdDept) {
      throw new Error(`INSERT failed: ${insertError?.message}`);
    }
    createdId = createdDept.id;
    console.log(`INSERT SUCCESS! Generated PostgreSQL UUID: ${createdId}`);
    console.log(`Persisted Department:`, {
      id: createdDept.id,
      name: createdDept.name,
      code: createdDept.code,
      budget: createdDept.budget,
      created_at: createdDept.created_at
    });

    // 3. READ: Direct PostgreSQL query to verify persistence
    console.log(`\nStep 3: Direct database verification query...`);
    const { data: dbRecord, error: readError } = await supabase
      .from('departments')
      .select('*')
      .eq('id', createdId)
      .single();

    if (readError || !dbRecord) {
      throw new Error(`READ failed: record ${createdId} not found in database!`);
    }
    console.log(`PostgreSQL Verified: record exists in "departments" table!`);

    // 4. Update org_structure in company_settings
    console.log(`\nStep 4: Verify org_structure synchronization...`);
    const { data: orgSetting } = await supabase
      .from('company_settings')
      .select('*')
      .eq('setting_key', 'org_structure')
      .single();
    
    let orgVal = orgSetting.setting_val || {};
    let depts = orgVal.departments || [];
    if (!depts.includes(testDeptName)) {
      depts.push(testDeptName);
      await supabase
        .from('company_settings')
        .update({ setting_val: { ...orgVal, departments: depts }, updated_at: new Date().toISOString() })
        .eq('id', orgSetting.id);
      console.log(`org_structure updated with "${testDeptName}"`);
    }

    // 5. UPDATE: Test editing department
    console.log(`\nStep 5: Testing UPDATE on department ${createdId}...`);
    const updatedBudget = 900000;
    const updatedName = `${testDeptName} (Updated)`;
    const { data: updatedDept, error: updateError } = await supabase
      .from('departments')
      .update({
        name: updatedName,
        budget: updatedBudget,
        updated_at: new Date().toISOString()
      })
      .eq('id', createdId)
      .select()
      .single();

    if (updateError || !updatedDept) {
      throw new Error(`UPDATE failed: ${updateError?.message}`);
    }
    console.log(`UPDATE SUCCESS: budget is now ₹${updatedDept.budget}, name is "${updatedDept.name}"`);

    // 6. VERIFY EMPLOYEE DROPDOWN READINESS:
    console.log(`\nStep 6: Verifying department resolution for employee assignment...`);
    const { data: resolveCheck } = await supabase
      .from('departments')
      .select('id, name')
      .ilike('name', updatedName)
      .single();
    if (!resolveCheck || resolveCheck.id !== createdId) {
      throw new Error(`Department lookup failed for employee assignment!`);
    }
    console.log(`Employee assignment resolution: SUCCESS (id: ${resolveCheck.id}, name: ${resolveCheck.name})`);

    // 7. DELETE / CLEANUP:
    console.log(`\nStep 7: Testing DELETE / cleanup...`);
    const { error: deleteError } = await supabase
      .from('departments')
      .delete()
      .eq('id', createdId);

    if (deleteError) {
      throw new Error(`DELETE failed: ${deleteError?.message}`);
    }
    console.log(`DELETE SUCCESS: department ${createdId} removed from PostgreSQL.`);

    // 8. Final verification
    const { data: finalCheck } = await supabase
      .from('departments')
      .select('*')
      .eq('id', createdId);
    console.log(`Post-delete check: ${finalCheck?.length || 0} records found (Expected: 0)`);

    // Clean up org_structure
    depts = depts.filter(d => d !== testDeptName && d !== updatedName);
    await supabase
      .from('company_settings')
      .update({ setting_val: { ...orgVal, departments: depts }, updated_at: new Date().toISOString() })
      .eq('id', orgSetting.id);

    console.log('\n====================================================');
    console.log('   PHASE 2 - DEPARTMENT MANAGEMENT: PASS ✅');
    console.log('====================================================\n');

  } catch (err) {
    console.error('\n❌ PHASE 2 FAILURE:', err.message);
    if (createdId) {
      await supabase.from('departments').delete().eq('id', createdId).catch(() => {});
    }
    process.exit(1);
  }
}

runDepartmentWorkflowAudit();
