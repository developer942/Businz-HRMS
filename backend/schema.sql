-- ============================================================
-- ApexHRMS — Supabase Database Schema (Corrected)
-- Targets: PostgreSQL 15+ / Supabase
-- Safely re-runnable: all definitions are CREATE IF NOT EXISTS
--   / DROP IF EXISTS / ON CONFLICT DO NOTHING.
-- Notes:
--   * All PKs & FKs are UUID.
--   * Auth link: employees.auth_id -> auth.users(id).
--   * Historical HR records are protected (RESTRICT / SET NULL,
--     never CASCADE off employees).
--   * Frontend fields NOT dropped without a replacement
--     (see performance.goal_achievement & performance_history).
--   * MONEY & ALL NUMERIC VALUES are DOUBLE PRECISION (float8) so that
--     PostgREST / Supabase JSON serializes them as native numbers
--     (a `numeric` column is returned as a STRING by the API, which
--     breaks client-side arithmetic). Business calculations that
--     must not be trusted to the frontend live in DB functions/triggers
--     (e.g. calculate_attendance_hours()).
-- ============================================================

BEGIN;

-- ============================================================
-- 0. Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. Helper Functions & Triggers
-- ============================================================

-- Keep updated_at fresh on any UPDATE.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Compute working_hours from check_in/check_out on the server
-- (frontend must NOT be trusted to calculate it blindly).
CREATE OR REPLACE FUNCTION public.calculate_attendance_hours()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.check_in IS NOT NULL AND NEW.check_out IS NOT NULL THEN
        NEW.working_hours := ROUND(
            EXTRACT(EPOCH FROM (NEW.check_out - NEW.check_in)) / 3600.0,
            2
        );
    ELSIF NEW.check_in IS NULL OR NEW.check_out IS NULL THEN
        NEW.working_hours := 0.00;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;



-- ============================================================
-- 2. Enumerated Types (enforce valid values at the DB layer)
-- ============================================================
DROP TYPE IF EXISTS public.hr_employment_type CASCADE;
CREATE TYPE public.hr_employment_type AS ENUM ('Full-Time', 'Part-Time', 'Contract', 'Intern');
DROP TYPE IF EXISTS public.hr_employee_status CASCADE;
CREATE TYPE public.hr_employee_status AS ENUM ('Active', 'On Leave', 'Terminated');
DROP TYPE IF EXISTS public.hr_gender CASCADE;
CREATE TYPE public.hr_gender AS ENUM ('Male', 'Female', 'Other');
DROP TYPE IF EXISTS public.hr_attendance_status CASCADE;
CREATE TYPE public.hr_attendance_status AS ENUM ('Present', 'Absent', 'Late', 'Half Day', 'Work From Home', 'On Leave');
DROP TYPE IF EXISTS public.hr_leave_type CASCADE;
CREATE TYPE public.hr_leave_type AS ENUM ('Casual Leave', 'Sick Leave', 'Paid Leave', 'Unpaid Leave', 'Work From Home', 'Emergency Leave');
DROP TYPE IF EXISTS public.hr_request_status CASCADE;
CREATE TYPE public.hr_request_status AS ENUM ('Pending', 'Approved', 'Rejected');
DROP TYPE IF EXISTS public.hr_task_status CASCADE;
CREATE TYPE public.hr_task_status AS ENUM ('To Do', 'In Progress', 'Completed', 'Overdue');
DROP TYPE IF EXISTS public.hr_task_overall_status CASCADE;
CREATE TYPE public.hr_task_overall_status AS ENUM ('OPEN', 'IN PROGRESS', 'PARTIALLY COMPLETED', 'COMPLETED', 'CLOSED', 'OVERDUE', 'CANCELLED');
DROP TYPE IF EXISTS public.hr_assignee_status CASCADE;
CREATE TYPE public.hr_assignee_status AS ENUM ('Pending', 'In Progress', 'Under Review', 'Completed', 'Blocked');
DROP TYPE IF EXISTS public.hr_assignee_role CASCADE;
CREATE TYPE public.hr_assignee_role AS ENUM ('Responsible', 'Assignee', 'Reviewer', 'Watcher');
DROP TYPE IF EXISTS public.hr_source_type CASCADE;
CREATE TYPE public.hr_source_type AS ENUM ('Direct', 'MOM', 'Audit', 'Project', 'Incident');
DROP TYPE IF EXISTS public.hr_task_priority CASCADE;
CREATE TYPE public.hr_task_priority AS ENUM ('Low', 'Medium', 'High', 'Urgent');
DROP TYPE IF EXISTS public.hr_expense_status CASCADE;
CREATE TYPE public.hr_expense_status AS ENUM ('Pending Manager', 'Pending Finance', 'Approved', 'Rejected', 'Reimbursed');
DROP TYPE IF EXISTS public.hr_payroll_status CASCADE;
CREATE TYPE public.hr_payroll_status AS ENUM ('Pending', 'Verified', 'Processed', 'Paid');
DROP TYPE IF EXISTS public.hr_asset_status CASCADE;
CREATE TYPE public.hr_asset_status AS ENUM ('Assigned', 'Available', 'Under Maintenance', 'Retired');
DROP TYPE IF EXISTS public.hr_asset_condition CASCADE;
CREATE TYPE public.hr_asset_condition AS ENUM ('New', 'Good', 'Fair', 'Needs Repair');
DROP TYPE IF EXISTS public.hr_workflow_format CASCADE;
CREATE TYPE public.hr_workflow_format AS ENUM ('HR_ONLY', 'MANAGER_HR_DUAL', 'AUTO_APPROVE_LOW');

-- ============================================================
-- 3. Core Tables
-- ============================================================

-- --- roles ---
CREATE TABLE IF NOT EXISTS public.roles (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    key        TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- permissions (normalized RBAC: one row per role/module/action) ---
CREATE TABLE IF NOT EXISTS public.permissions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id    UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    module     TEXT NOT NULL,
    action     TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_role_module_action UNIQUE (role_id, module, action)
);

-- --- departments (head_id added as deferred circular FK below) ---
CREATE TABLE IF NOT EXISTS public.departments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    code       TEXT NOT NULL UNIQUE,
    head_id    UUID,
    budget     DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- employees ---
CREATE TABLE IF NOT EXISTS public.employees (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_id             UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
    employee_id         TEXT NOT NULL UNIQUE,
    first_name          TEXT NOT NULL,
    last_name           TEXT NOT NULL,
    email               TEXT NOT NULL UNIQUE,
    phone               TEXT,
    dob                 DATE,
    gender              public.hr_gender,
    address             TEXT,
    department_id       UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    designation         TEXT,
    reporting_manager_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    -- Denormalized display name for the reporting manager (kept; the
    -- frontend add-employee form submits it as free text and the list/
    -- profile views read it directly — see EmployeeList/EmployeeProfile).
    reporting_manager_name TEXT,
    joining_date        DATE,
    employment_type     public.hr_employment_type NOT NULL DEFAULT 'Full-Time',
    status              public.hr_employee_status NOT NULL DEFAULT 'Active',
    avatar_url          TEXT,
    basic_salary        DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    allowances_hra      DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    allowances_transport DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    allowances_medical  DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    allowances_special  DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    bank_name           TEXT,
    account_number      TEXT,
    ifsc_code           TEXT,
    branch              TEXT,
    attendance_method   TEXT NOT NULL DEFAULT 'Face Scan',
    gps_allowed         BOOLEAN NOT NULL DEFAULT TRUE,
    face_registered     BOOLEAN NOT NULL DEFAULT FALSE,
    face_photo_url      TEXT,
    must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
    account_status      TEXT NOT NULL DEFAULT 'ACTIVE',
    credential_email_status TEXT NOT NULL DEFAULT 'PENDING',
    credential_email_sent_at TIMESTAMPTZ,
    last_login_at       TIMESTAMPTZ,
    role_id             UUID NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_employees_phone CHECK (phone IS NULL OR (length(phone) = 10 AND phone ~ '^[6-9][0-9]{9}$')),
    CONSTRAINT chk_employees_first_name_length CHECK (length(trim(first_name)) >= 2 AND length(first_name) <= 100),
    CONSTRAINT chk_employees_first_name_chars CHECK (first_name ~ '^[A-Za-z][A-Za-z\s.''-]*$'),
    CONSTRAINT chk_employees_last_name_length CHECK (last_name IS NULL OR length(last_name) <= 100),
    CONSTRAINT chk_employees_basic_salary_non_negative CHECK (basic_salary >= 0)
);

-- --- auth_audit_logs (audit log for employee login lifecycle) ---
CREATE TABLE IF NOT EXISTS public.auth_audit_logs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action       TEXT NOT NULL,
    employee_id  TEXT NOT NULL,
    performed_by TEXT NOT NULL,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata     JSONB
);

-- --- password_resets (secure single-use OTP verification for password reset) ---
CREATE TABLE IF NOT EXISTS public.password_resets (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id   TEXT NOT NULL,
    otp_hash      TEXT NOT NULL,
    expires_at    TIMESTAMPTZ NOT NULL,
    attempt_count INT NOT NULL DEFAULT 0,
    is_used       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_lookup 
    ON public.password_resets(employee_id, is_used, expires_at);

DROP TRIGGER IF EXISTS trg_password_resets_updated_at ON public.password_resets;
CREATE TRIGGER trg_password_resets_updated_at
    BEFORE UPDATE ON public.password_resets
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Circular FK: departments.head_id -> employees.id
ALTER TABLE public.departments
    DROP CONSTRAINT IF EXISTS fk_departments_head;
ALTER TABLE public.departments
    ADD CONSTRAINT fk_departments_head
    FOREIGN KEY (head_id) REFERENCES public.employees(id) ON DELETE SET NULL;

-- ============================================================
-- 3b. RBAC and Auth Helper Functions (require employees, roles, permissions)
-- ============================================================
-- Guards against recursion in RLS policies: reads are SECURITY DEFINER
-- so they run with the definer's privileges and read the permission
-- tables without triggering their own RLS.
CREATE OR REPLACE FUNCTION public.get_employee_row()
RETURNS public.employees AS $$
    SELECT *
    FROM public.employees
    WHERE auth_id = auth.uid()
    LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_current_employee_id()
RETURNS UUID AS $$
    SELECT id FROM public.employees WHERE auth_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_current_role_key()
RETURNS TEXT AS $$
    SELECT r.key
    FROM public.employees e
    JOIN public.roles r ON r.id = e.role_id
    WHERE e.auth_id = auth.uid()
    LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- RBAC engine: does the current user's role allow <module:action>?
CREATE OR REPLACE FUNCTION public.has_permission(p_module TEXT, p_action TEXT)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.employees e
        JOIN public.permissions p ON p.role_id = e.role_id
        WHERE e.auth_id = auth.uid()
          AND p.module = p_module
          AND p.action = p_action
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Convenience: is the current user a Super Admin or HR Admin?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
    SELECT public.get_current_role_key() IN ('super_admin', 'hr_admin');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- --- designations ---
CREATE TABLE IF NOT EXISTS public.designations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title         TEXT NOT NULL,
    department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
    level         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- employee_documents (file metadata; files live in Supabase Storage) ---
CREATE TABLE IF NOT EXISTS public.employee_documents (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    type        TEXT,
    url         TEXT NOT NULL, -- storage path e.g. employee-documents/<emp>/<file>
    upload_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- shifts ---
CREATE TABLE IF NOT EXISTS public.shifts (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_name         TEXT NOT NULL,
    start_time         TIME NOT NULL,
    end_time           TIME NOT NULL,
    break_duration_mins INT NOT NULL DEFAULT 0,
    working_hours      DOUBLE PRECISION NOT NULL DEFAULT 8.00,
    grace_period_mins  INT NOT NULL DEFAULT 15,
    color              TEXT NOT NULL DEFAULT '#3B82F6',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- attendance_records ---
CREATE TABLE IF NOT EXISTS public.attendance_records (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id      UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    shift_id         UUID REFERENCES public.shifts(id) ON DELETE SET NULL,
    shift_date       DATE NOT NULL,
    date             DATE NOT NULL,
    check_in         TIMESTAMPTZ,
    check_out        TIMESTAMPTZ,
    working_hours    DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    status           public.hr_attendance_status NOT NULL DEFAULT 'Present',
    late_status      TEXT NOT NULL DEFAULT 'On Time',
    location_lat     DOUBLE PRECISION,
    location_lng     DOUBLE PRECISION,
    location_address TEXT,
    in_geofence      BOOLEAN NOT NULL DEFAULT TRUE,
    face_verified    BOOLEAN NOT NULL DEFAULT FALSE,
    method           TEXT NOT NULL DEFAULT 'Face',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_employee_shift_date UNIQUE (employee_id, shift_id, shift_date)
);

-- --- face_logs ---
CREATE TABLE IF NOT EXISTS public.face_logs (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id      UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    timestamp        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    type             TEXT NOT NULL, -- Check-In / Check-Out
    status           TEXT NOT NULL, -- Success / No Match / Spoof Detected
    photo_url        TEXT,          -- storage path face-photos/...
    confidence_score DOUBLE PRECISION,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- leave_requests ---
CREATE TABLE IF NOT EXISTS public.leave_requests (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
    leave_type  public.hr_leave_type NOT NULL,
    start_date  DATE NOT NULL,
    end_date    DATE NOT NULL,
    days_count  INT NOT NULL CHECK (days_count > 0),
    reason      TEXT,
    status      public.hr_request_status NOT NULL DEFAULT 'Pending',
    applied_date DATE NOT NULL DEFAULT CURRENT_DATE,
    approved_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    comment     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT check_leave_dates CHECK (end_date >= start_date)
);

-- --- shift_assignments (join: shifts <-> employees) ---
CREATE TABLE IF NOT EXISTS public.shift_assignments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id    UUID NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    CONSTRAINT unique_shift_employee UNIQUE (shift_id, employee_id)
);

-- --- shift_requests ---
CREATE TABLE IF NOT EXISTS public.shift_requests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id         UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    current_shift_id    UUID NOT NULL REFERENCES public.shifts(id) ON DELETE RESTRICT,
    requested_shift_id  UUID NOT NULL REFERENCES public.shifts(id) ON DELETE RESTRICT,
    requested_date      DATE NOT NULL,
    reason              TEXT,
    status              public.hr_request_status NOT NULL DEFAULT 'Pending',
    approved_by         UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- tasks & multi-assignee task manager architecture ---
CREATE TABLE IF NOT EXISTS public.tasks (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_number          TEXT NOT NULL UNIQUE,
    title                TEXT NOT NULL,
    task_date            DATE NOT NULL DEFAULT CURRENT_DATE,
    source_type          public.hr_source_type NOT NULL DEFAULT 'Direct',
    source_reference     TEXT,
    mom_id               TEXT,
    mom_item_id          TEXT,
    created_by           UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    assigned_by          UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    responsible_person_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
    department_id        UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    task_category        TEXT NOT NULL DEFAULT 'General',
    priority             public.hr_task_priority NOT NULL DEFAULT 'Medium',
    start_date           DATE,
    due_date             DATE,
    review_date          DATE,
    related_project      TEXT,
    description          TEXT,
    expected_output      TEXT,
    overall_progress     INT NOT NULL DEFAULT 0 CHECK (overall_progress >= 0 AND overall_progress <= 100),
    overall_status       public.hr_task_overall_status NOT NULL DEFAULT 'OPEN',
    is_reopened          BOOLEAN NOT NULL DEFAULT FALSE,
    reopen_reason        TEXT,
    closed_at            TIMESTAMPTZ,
    closed_by            UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    closure_remarks      TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- task_assignees (multi-employee assignment with independent progress) ---
CREATE TABLE IF NOT EXISTS public.task_assignees (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id                 UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    employee_id             UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    role                    public.hr_assignee_role NOT NULL DEFAULT 'Assignee',
    individual_status       public.hr_assignee_status NOT NULL DEFAULT 'Pending',
    progress_percentage     INT NOT NULL DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    actual_start_date       DATE,
    completed_date          DATE,
    latest_remark           TEXT,
    completion_evidence_url TEXT,
    completion_evidence_desc TEXT,
    assigned_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_task_employee UNIQUE (task_id, employee_id)
);

-- --- task_updates (historical progress updates per assignee) ---
CREATE TABLE IF NOT EXISTS public.task_updates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id             UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    assignee_id         UUID NOT NULL REFERENCES public.task_assignees(id) ON DELETE CASCADE,
    employee_id         UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
    status              public.hr_assignee_status NOT NULL,
    progress_percentage INT NOT NULL CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    remarks             TEXT,
    updated_by          UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- task_comments ---
CREATE TABLE IF NOT EXISTS public.task_comments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id    UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    user_id    UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    content    TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- task_attachments ---
CREATE TABLE IF NOT EXISTS public.task_attachments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id     UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    uploaded_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    file_name   TEXT NOT NULL,
    file_url    TEXT NOT NULL,
    file_type   TEXT,
    file_size   TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- task_timeline ---
CREATE TABLE IF NOT EXISTS public.task_timeline (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id     UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT,
    icon_type   TEXT NOT NULL DEFAULT 'created',
    actor_name  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- task_audit_logs (immutable audit trail) ---
CREATE TABLE IF NOT EXISTS public.task_audit_logs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id           UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    task_number       TEXT NOT NULL,
    action_type       TEXT NOT NULL,
    module            TEXT NOT NULL DEFAULT 'Task Management',
    old_value         TEXT,
    new_value         TEXT,
    performed_by      TEXT,
    performed_by_role TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- task_dependencies ---
CREATE TABLE IF NOT EXISTS public.task_dependencies (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id            UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    depends_on_task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    dependency_type    TEXT NOT NULL DEFAULT 'Finish-to-Start',
    CONSTRAINT unique_task_dependency UNIQUE (task_id, depends_on_task_id)
);

-- --- mom_meetings ---
CREATE TABLE IF NOT EXISTS public.mom_meetings (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_number TEXT NOT NULL UNIQUE,
    meeting_title  TEXT NOT NULL,
    meeting_date   DATE NOT NULL,
    start_time     TEXT,
    end_time       TEXT,
    location       TEXT,
    department_id  UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    organizer_id   UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    summary        TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- mom_action_items ---
CREATE TABLE IF NOT EXISTS public.mom_action_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mom_id          UUID NOT NULL REFERENCES public.mom_meetings(id) ON DELETE CASCADE,
    item_number     TEXT NOT NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    decision        TEXT,
    due_date        DATE,
    action_required BOOLEAN NOT NULL DEFAULT TRUE,
    department_id   UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    priority        public.hr_task_priority NOT NULL DEFAULT 'Medium',
    status          TEXT NOT NULL DEFAULT 'Pending',
    linked_task_id  UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- task_escalations ---
CREATE TABLE IF NOT EXISTS public.task_escalations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level               INT NOT NULL,
    trigger_event       TEXT NOT NULL,
    trigger_delay_hours INT NOT NULL DEFAULT 0,
    notify_roles        TEXT[] NOT NULL DEFAULT '{}',
    escalation_action   TEXT NOT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- task_masters ---
CREATE TABLE IF NOT EXISTS public.task_masters (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_type TEXT NOT NULL,
    name        TEXT NOT NULL,
    code        TEXT NOT NULL,
    color       TEXT,
    order_index INT NOT NULL DEFAULT 1,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- performance_scores ---
-- NOTE: goal_achievement is retained because PerformanceTracking.tsx
-- reads PerformanceScore.goalAchievement directly (must not be dropped).
CREATE TABLE IF NOT EXISTS public.performance_scores (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id          UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
    overall_score        DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    task_completion_rate DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    attendance_score     DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    goal_achievement     DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    manager_rating       DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    avatar_url           TEXT,
    period               TEXT NOT NULL, -- e.g. "2026-08"
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_employee_period UNIQUE (employee_id, period)
);

-- --- performance_history (replaces PerformanceScore.monthlyHistory[]) ---
CREATE TABLE IF NOT EXISTS public.performance_history (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    performance_id UUID NOT NULL REFERENCES public.performance_scores(id) ON DELETE CASCADE,
    month      TEXT NOT NULL,          -- e.g. "Aug"
    score      DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_performance_month UNIQUE (performance_id, month)
);

-- --- job_openings ---
CREATE TABLE IF NOT EXISTS public.job_openings (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title         TEXT NOT NULL,
    department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
    location      TEXT,
    type          TEXT NOT NULL DEFAULT 'Full-Time',
    experience    TEXT,
    positions     INT NOT NULL DEFAULT 1 CHECK (positions > 0),
    status        TEXT NOT NULL DEFAULT 'Active',
    posted_date   DATE NOT NULL DEFAULT CURRENT_DATE,
    salary_range  TEXT,
    description   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- candidates ---
CREATE TABLE IF NOT EXISTS public.candidates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id              UUID NOT NULL REFERENCES public.job_openings(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    email               TEXT NOT NULL,
    phone               TEXT,
    stage               TEXT NOT NULL DEFAULT 'Applied',
    applied_date        DATE NOT NULL DEFAULT CURRENT_DATE,
    referrer_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    referrer_name       TEXT,
    resume_url          TEXT, -- storage path resumes/...
    rating              DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- expenses ---
CREATE TABLE IF NOT EXISTS public.expenses (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
    category    TEXT NOT NULL,
    amount      DOUBLE PRECISION NOT NULL CHECK (amount >= 0),
    date        DATE NOT NULL,
    description TEXT,
    receipt_url TEXT, -- storage path receipts/...
    status      public.hr_expense_status NOT NULL DEFAULT 'Pending Manager',
    approved_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- notifications (broadcast-capable: many recipients via join) ---
CREATE TABLE IF NOT EXISTS public.notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title      TEXT NOT NULL,
    message    TEXT NOT NULL,
    timestamp  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    priority   TEXT NOT NULL DEFAULT 'Normal',
    category   TEXT NOT NULL DEFAULT 'Announcement',
    link       TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.notification_recipients (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
    employee_id     UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    read_at         TIMESTAMPTZ,
    CONSTRAINT unique_notification_employee UNIQUE (notification_id, employee_id)
);

-- --- payroll_records (payroll_month = first day of month, e.g. 2026-08-01) ---
CREATE TABLE IF NOT EXISTS public.payroll_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id     UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
    payroll_month   DATE NOT NULL,
    basic_salary    DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    allowances      DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    bonus           DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    tax_deduction   DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    leave_deduction DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    working_days    INT NOT NULL DEFAULT 0,
    present_days    INT NOT NULL DEFAULT 0,
    paid_leaves     INT NOT NULL DEFAULT 0,
    unpaid_leaves   INT NOT NULL DEFAULT 0,
    net_salary      DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    status          public.hr_payroll_status NOT NULL DEFAULT 'Pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_employee_payroll_month UNIQUE (employee_id, payroll_month)
);

-- --- assets ---
CREATE TABLE IF NOT EXISTS public.assets (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_tag            TEXT NOT NULL UNIQUE,
    name                 TEXT NOT NULL,
    category             TEXT NOT NULL,
    serial_number        TEXT UNIQUE,
    assigned_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    assigned_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    assigned_date        DATE,
    purchase_date        DATE,
    purchase_cost        DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    warranty_expiry      DATE,
    status               public.hr_asset_status NOT NULL DEFAULT 'Available',
    condition            public.hr_asset_condition NOT NULL DEFAULT 'Good',
    notes                TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- geofence_config (singleton row) ---
CREATE TABLE IF NOT EXISTS public.geofence_config (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enabled          BOOLEAN NOT NULL DEFAULT TRUE,
    office_name      TEXT NOT NULL,
    center_lat       DOUBLE PRECISION NOT NULL,
    center_lng       DOUBLE PRECISION NOT NULL,
    radius_meters    INT NOT NULL CHECK (radius_meters > 0),
    enforce_strictly BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- workflow_config (singleton row) ---
CREATE TABLE IF NOT EXISTS public.workflow_config (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    format                    public.hr_workflow_format NOT NULL DEFAULT 'MANAGER_HR_DUAL',
    format_name               TEXT NOT NULL,
    allow_employee_direct_edit BOOLEAN NOT NULL DEFAULT FALSE,
    require_hr_acceptance     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. Triggers
-- ============================================================
DROP TRIGGER IF EXISTS trg_departments_updated_at        ON public.departments;
DROP TRIGGER IF EXISTS trg_employees_updated_at          ON public.employees;
DROP TRIGGER IF EXISTS trg_designations_updated_at       ON public.designations;
DROP TRIGGER IF EXISTS trg_attendance_updated_at         ON public.attendance_records;
DROP TRIGGER IF EXISTS trg_attendance_hours              ON public.attendance_records;
DROP TRIGGER IF EXISTS trg_leave_requests_updated_at     ON public.leave_requests;
DROP TRIGGER IF EXISTS trg_shifts_updated_at             ON public.shifts;
DROP TRIGGER IF EXISTS trg_shift_requests_updated_at     ON public.shift_requests;
DROP TRIGGER IF EXISTS trg_tasks_updated_at              ON public.tasks;
DROP TRIGGER IF EXISTS trg_performance_updated_at        ON public.performance_scores;
DROP TRIGGER IF EXISTS trg_job_openings_updated_at       ON public.job_openings;
DROP TRIGGER IF EXISTS trg_candidates_updated_at         ON public.candidates;
DROP TRIGGER IF EXISTS trg_expenses_updated_at           ON public.expenses;
DROP TRIGGER IF EXISTS trg_payroll_updated_at            ON public.payroll_records;
DROP TRIGGER IF EXISTS trg_assets_updated_at             ON public.assets;
DROP TRIGGER IF EXISTS trg_geofence_updated_at           ON public.geofence_config;
DROP TRIGGER IF EXISTS trg_workflow_updated_at           ON public.workflow_config;

CREATE TRIGGER trg_departments_updated_at    BEFORE UPDATE ON public.departments        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_employees_updated_at      BEFORE UPDATE ON public.employees          FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_designations_updated_at   BEFORE UPDATE ON public.designations       FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_attendance_updated_at     BEFORE UPDATE ON public.attendance_records  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_attendance_hours          BEFORE INSERT OR UPDATE ON public.attendance_records FOR EACH ROW EXECUTE FUNCTION public.calculate_attendance_hours();
CREATE TRIGGER trg_leave_requests_updated_at BEFORE UPDATE ON public.leave_requests     FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_shifts_updated_at         BEFORE UPDATE ON public.shifts              FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_shift_requests_updated_at BEFORE UPDATE ON public.shift_requests     FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_tasks_updated_at          BEFORE UPDATE ON public.tasks               FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_performance_updated_at    BEFORE UPDATE ON public.performance_scores  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_job_openings_updated_at   BEFORE UPDATE ON public.job_openings       FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_candidates_updated_at     BEFORE UPDATE ON public.candidates         FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_expenses_updated_at       BEFORE UPDATE ON public.expenses           FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_payroll_updated_at        BEFORE UPDATE ON public.payroll_records    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_assets_updated_at         BEFORE UPDATE ON public.assets             FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_geofence_updated_at       BEFORE UPDATE ON public.geofence_config    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_workflow_updated_at       BEFORE UPDATE ON public.workflow_config    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Automatic system-derived overall task status and progress calculator
CREATE OR REPLACE FUNCTION public.calculate_task_overall_status()
RETURNS TRIGGER AS $$
DECLARE
    v_task_id UUID;
    v_total INT;
    v_completed INT;
    v_started INT;
    v_avg_progress INT;
    v_due_date DATE;
    v_current_status public.hr_task_overall_status;
    v_new_status public.hr_task_overall_status;
BEGIN
    v_task_id := COALESCE(NEW.task_id, OLD.task_id);
    SELECT due_date, overall_status INTO v_due_date, v_current_status FROM public.tasks WHERE id = v_task_id;
    
    IF v_current_status = 'CLOSED' THEN
        SELECT COALESCE(ROUND(AVG(progress_percentage)), 0) INTO v_avg_progress FROM public.task_assignees WHERE task_id = v_task_id;
        UPDATE public.tasks SET overall_progress = v_avg_progress, updated_at = NOW() WHERE id = v_task_id;
        RETURN NEW;
    END IF;

    SELECT COUNT(*), 
           COUNT(*) FILTER (WHERE individual_status = 'Completed' OR progress_percentage = 100),
           COUNT(*) FILTER (WHERE individual_status = 'In Progress' OR progress_percentage > 0),
           COALESCE(ROUND(AVG(progress_percentage)), 0)
    INTO v_total, v_completed, v_started, v_avg_progress
    FROM public.task_assignees
    WHERE task_id = v_task_id;

    IF v_total = 0 THEN
        v_new_status := 'OPEN';
        v_avg_progress := 0;
    ELSIF v_completed = v_total THEN
        v_new_status := 'COMPLETED';
    ELSIF v_completed > 0 THEN
        v_new_status := 'PARTIALLY COMPLETED';
    ELSIF v_started > 0 THEN
        v_new_status := 'IN PROGRESS';
    ELSE
        IF v_due_date IS NOT NULL AND v_due_date < CURRENT_DATE THEN
            v_new_status := 'OVERDUE';
        ELSE
            v_new_status := 'OPEN';
        END IF;
    END IF;

    UPDATE public.tasks
    SET overall_status = v_new_status,
        overall_progress = v_avg_progress,
        updated_at = NOW()
    WHERE id = v_task_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_task_assignees_calc_status ON public.task_assignees;
CREATE TRIGGER trg_task_assignees_calc_status
AFTER INSERT OR UPDATE OR DELETE ON public.task_assignees
FOR EACH ROW EXECUTE FUNCTION public.calculate_task_overall_status();

DROP TRIGGER IF EXISTS trg_task_assignees_updated_at ON public.task_assignees;
CREATE TRIGGER trg_task_assignees_updated_at BEFORE UPDATE ON public.task_assignees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_mom_meetings_updated_at ON public.mom_meetings;
CREATE TRIGGER trg_mom_meetings_updated_at BEFORE UPDATE ON public.mom_meetings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_mom_action_items_updated_at ON public.mom_action_items;
CREATE TRIGGER trg_mom_action_items_updated_at BEFORE UPDATE ON public.mom_action_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 5. Indexes (frequently queried FKs / fields)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_employees_auth_id            ON public.employees(auth_id);
CREATE INDEX IF NOT EXISTS idx_employees_department_id      ON public.employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_role_id            ON public.employees(role_id);
CREATE INDEX IF NOT EXISTS idx_employees_reporting_manager  ON public.employees(reporting_manager_id);

CREATE INDEX IF NOT EXISTS idx_attendance_employee          ON public.attendance_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date              ON public.attendance_records(date);
CREATE INDEX IF NOT EXISTS idx_attendance_shift_date        ON public.attendance_records(shift_id, shift_date);

CREATE INDEX IF NOT EXISTS idx_face_logs_employee           ON public.face_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_face_logs_timestamp          ON public.face_logs(timestamp);

CREATE INDEX IF NOT EXISTS idx_leave_requests_employee      ON public.leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status        ON public.leave_requests(status);

CREATE INDEX IF NOT EXISTS idx_shift_assignments_shift      ON public.shift_assignments(shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_employee   ON public.shift_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_shift_requests_employee      ON public.shift_requests(employee_id);

CREATE INDEX IF NOT EXISTS idx_tasks_responsible_person   ON public.tasks(responsible_person_id);
CREATE INDEX IF NOT EXISTS idx_tasks_department             ON public.tasks(department_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status                 ON public.tasks(overall_status);

CREATE INDEX IF NOT EXISTS idx_performance_employee         ON public.performance_scores(employee_id);
CREATE INDEX IF NOT EXISTS idx_performance_period           ON public.performance_scores(period);

CREATE INDEX IF NOT EXISTS idx_job_openings_department      ON public.job_openings(department_id);
CREATE INDEX IF NOT EXISTS idx_job_openings_status          ON public.job_openings(status);

CREATE INDEX IF NOT EXISTS idx_candidates_job               ON public.candidates(job_id);
CREATE INDEX IF NOT EXISTS idx_candidates_stage             ON public.candidates(stage);
CREATE INDEX IF NOT EXISTS idx_candidates_referrer          ON public.candidates(referrer_employee_id);

CREATE INDEX IF NOT EXISTS idx_expenses_employee            ON public.expenses(employee_id);
CREATE INDEX IF NOT EXISTS idx_expenses_status              ON public.expenses(status);

CREATE INDEX IF NOT EXISTS idx_payroll_employee             ON public.payroll_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_month                ON public.payroll_records(payroll_month);

CREATE INDEX IF NOT EXISTS idx_assets_assigned_employee     ON public.assets(assigned_employee_id);
CREATE INDEX IF NOT EXISTS idx_assets_assigned_department   ON public.assets(assigned_department_id);

CREATE INDEX IF NOT EXISTS idx_notifications_timestamp      ON public.notifications(timestamp);
CREATE INDEX IF NOT EXISTS idx_notif_recipients_employee    ON public.notification_recipients(employee_id);
CREATE INDEX IF NOT EXISTS idx_notif_recipients_is_read     ON public.notification_recipients(is_read);

CREATE INDEX IF NOT EXISTS idx_permissions_role             ON public.permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_permissions_module           ON public.permissions(module);

-- ============================================================
-- 6. Seed Data: Roles + Permission Matrix
-- ============================================================
INSERT INTO public.roles (name, key) VALUES
    ('Super Admin',      'super_admin'),
    ('HR Admin',         'hr_admin'),
    ('Dept Manager',     'dept_manager'),
    ('Employee',         'employee'),
    ('Finance Manager',  'finance_manager')
ON CONFLICT (key) DO NOTHING;

-- Permission matrix mirrors the frontend DEFAULT_PERMISSIONS in
-- HRMSContext.tsx so no existing functionality is lost.

-- Helper: bulk insert permission rows.
CREATE OR REPLACE FUNCTION public.seed_permissions(
    p_role UUID, p_modules TEXT[], p_actions TEXT[]
) RETURNS void AS $$
DECLARE m TEXT; a TEXT;
BEGIN
    FOREACH m IN ARRAY p_modules LOOP
        FOREACH a IN ARRAY p_actions LOOP
            INSERT INTO public.permissions (role_id, module, action)
            VALUES (p_role, m, a) ON CONFLICT DO NOTHING;
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    v_sa UUID; v_hr UUID; v_dm UUID; v_emp UUID; v_fm UUID;
    v_all17 TEXT[] := ARRAY['dashboard','employees','face_attendance','attendance',
                            'gps_geofence','leaves','shifts','performance','tasks',
                            'recruitment','finance','notifications','payroll',
                            'reports','organization','assets','settings'];
BEGIN
    SELECT id INTO v_sa  FROM public.roles WHERE key='super_admin';
    SELECT id INTO v_hr  FROM public.roles WHERE key='hr_admin';
    SELECT id INTO v_dm  FROM public.roles WHERE key='dept_manager';
    SELECT id INTO v_emp FROM public.roles WHERE key='employee';
    SELECT id INTO v_fm  FROM public.roles WHERE key='finance_manager';

    -- Super Admin: all 6 actions on all 17 modules.
    PERFORM public.seed_permissions(v_sa, v_all17, ARRAY['view','create','edit','delete','approve','export']);

    -- HR Admin
    PERFORM public.seed_permissions(v_hr, ARRAY['dashboard'], ARRAY['view','export']);
    PERFORM public.seed_permissions(v_hr, ARRAY['employees'], ARRAY['view','create','edit','delete','approve','export']);
    PERFORM public.seed_permissions(v_hr, ARRAY['face_attendance'], ARRAY['view','create','edit','export']);
    PERFORM public.seed_permissions(v_hr, ARRAY['attendance'], ARRAY['view','create','edit','approve','export']);
    PERFORM public.seed_permissions(v_hr, ARRAY['gps_geofence'], ARRAY['view','create','edit','approve','export']);
    PERFORM public.seed_permissions(v_hr, ARRAY['leaves'], ARRAY['view','create','edit','approve','export']);
    PERFORM public.seed_permissions(v_hr, ARRAY['shifts'], ARRAY['view','create','edit','approve','export']);
    PERFORM public.seed_permissions(v_hr, ARRAY['performance'], ARRAY['view','create','edit','export']);
    PERFORM public.seed_permissions(v_hr, ARRAY['tasks'], ARRAY['view','create','edit']);
    PERFORM public.seed_permissions(v_hr, ARRAY['recruitment'], ARRAY['view','create','edit','approve']);
    PERFORM public.seed_permissions(v_hr, ARRAY['finance'], ARRAY['view','create','edit','approve','export']);
    PERFORM public.seed_permissions(v_hr, ARRAY['notifications'], ARRAY['view','create']);
    PERFORM public.seed_permissions(v_hr, ARRAY['payroll'], ARRAY['view','create','edit','approve','export']);
    PERFORM public.seed_permissions(v_hr, ARRAY['reports'], ARRAY['view','export']);
    PERFORM public.seed_permissions(v_hr, ARRAY['organization'], ARRAY['view','create','edit','export']);
    PERFORM public.seed_permissions(v_hr, ARRAY['assets'], ARRAY['view','create','edit','delete','approve','export']);
    PERFORM public.seed_permissions(v_hr, ARRAY['settings'], ARRAY['view','edit']);

    -- Dept Manager
    PERFORM public.seed_permissions(v_dm, ARRAY['dashboard'], ARRAY['view']);
    PERFORM public.seed_permissions(v_dm, ARRAY['employees'], ARRAY['view']);
    PERFORM public.seed_permissions(v_dm, ARRAY['face_attendance'], ARRAY['view']);
    PERFORM public.seed_permissions(v_dm, ARRAY['attendance'], ARRAY['view','approve']);
    PERFORM public.seed_permissions(v_dm, ARRAY['leaves'], ARRAY['view','approve']);
    PERFORM public.seed_permissions(v_dm, ARRAY['shifts'], ARRAY['view','approve']);
    PERFORM public.seed_permissions(v_dm, ARRAY['performance'], ARRAY['view','edit']);
    PERFORM public.seed_permissions(v_dm, ARRAY['tasks'], ARRAY['view','create','edit','delete']);
    PERFORM public.seed_permissions(v_dm, ARRAY['recruitment'], ARRAY['view']);
    PERFORM public.seed_permissions(v_dm, ARRAY['finance'], ARRAY['view','approve']);
    PERFORM public.seed_permissions(v_dm, ARRAY['notifications'], ARRAY['view']);
    PERFORM public.seed_permissions(v_dm, ARRAY['reports'], ARRAY['view']);
    PERFORM public.seed_permissions(v_dm, ARRAY['organization'], ARRAY['view']);
    PERFORM public.seed_permissions(v_dm, ARRAY['assets'], ARRAY['view']);

    -- Employee
    PERFORM public.seed_permissions(v_emp, ARRAY['dashboard'], ARRAY['view']);
    PERFORM public.seed_permissions(v_emp, ARRAY['face_attendance'], ARRAY['view','create']);
    PERFORM public.seed_permissions(v_emp, ARRAY['attendance'], ARRAY['view']);
    PERFORM public.seed_permissions(v_emp, ARRAY['leaves'], ARRAY['view','create']);
    PERFORM public.seed_permissions(v_emp, ARRAY['shifts'], ARRAY['view','create']);
    PERFORM public.seed_permissions(v_emp, ARRAY['performance'], ARRAY['view']);
    PERFORM public.seed_permissions(v_emp, ARRAY['tasks'], ARRAY['view','edit']);
    PERFORM public.seed_permissions(v_emp, ARRAY['recruitment'], ARRAY['view','create']);
    PERFORM public.seed_permissions(v_emp, ARRAY['finance'], ARRAY['view','create']);
    PERFORM public.seed_permissions(v_emp, ARRAY['notifications'], ARRAY['view']);
    PERFORM public.seed_permissions(v_emp, ARRAY['payroll'], ARRAY['view']);
    PERFORM public.seed_permissions(v_emp, ARRAY['organization'], ARRAY['view']);
    PERFORM public.seed_permissions(v_emp, ARRAY['assets'], ARRAY['view']);

    -- Finance Manager
    PERFORM public.seed_permissions(v_fm, ARRAY['dashboard','employees','face_attendance','attendance','leaves','shifts','performance','tasks','organization'], ARRAY['view']);
    PERFORM public.seed_permissions(v_fm, ARRAY['finance'], ARRAY['view','create','edit','approve','export']);
    PERFORM public.seed_permissions(v_fm, ARRAY['notifications'], ARRAY['view','create']);
    PERFORM public.seed_permissions(v_fm, ARRAY['payroll'], ARRAY['view','create','edit','approve','export']);
    PERFORM public.seed_permissions(v_fm, ARRAY['reports'], ARRAY['view','export']);
    PERFORM public.seed_permissions(v_fm, ARRAY['assets'], ARRAY['view','export']);
    PERFORM public.seed_permissions(v_fm, ARRAY['settings'], ARRAY['view']);
END $$;

-- Seed singleton config rows.
INSERT INTO public.geofence_config (enabled, office_name, center_lat, center_lng, radius_meters, enforce_strictly)
VALUES (TRUE, 'VRM Structures India Pvt Ltd', 13.151968, 80.2086053, 200, TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO public.workflow_config (format, format_name, allow_employee_direct_edit, require_hr_acceptance)
VALUES ('MANAGER_HR_DUAL', 'Manager & HR Dual Approval', FALSE, TRUE)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 7. Row Level Security
-- ============================================================

-- Enable RLS on every application table (not storage).
ALTER TABLE public.roles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.designations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_documents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_assignments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_requests         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_scores     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_history    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_openings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_records        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geofence_config        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_config        ENABLE ROW LEVEL SECURITY;

-- Drop any pre-existing policies from prior runs (idempotent).
DO $$
DECLARE
    r RECORD; pol TEXT;
BEGIN
    FOR r IN SELECT schemaname, tablename, policyname
             FROM pg_policies
             WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    END LOOP;
END $$;

-- Roles & Permissions: visible to any authenticated user (read-only).
CREATE POLICY roles_select      ON public.roles         FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY permissions_select ON public.permissions  FOR SELECT TO authenticated USING (TRUE);

-- Departments / Designations: read for all, write for org editors.
CREATE POLICY departments_select ON public.departments  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY departments_write  ON public.departments  FOR ALL    TO authenticated USING (public.has_permission('organization','edit'));
CREATE POLICY designations_select ON public.designations FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY designations_write  ON public.designations FOR ALL    TO authenticated USING (public.has_permission('organization','edit'));

-- Employees
CREATE POLICY employees_select ON public.employees FOR SELECT TO authenticated USING (
    public.get_current_role_key() IN ('super_admin','hr_admin','dept_manager','finance_manager')
    OR id = public.get_current_employee_id()
);
CREATE POLICY employees_insert ON public.employees FOR INSERT TO authenticated WITH CHECK (
    public.has_permission('employees','create')
);
CREATE POLICY employees_update ON public.employees FOR UPDATE TO authenticated USING (
    public.has_permission('employees','edit') OR id = public.get_current_employee_id()
);
CREATE POLICY employees_delete ON public.employees FOR DELETE TO authenticated USING (
    public.has_permission('employees','delete')
);

-- Employee documents
CREATE POLICY docs_select ON public.employee_documents FOR SELECT TO authenticated USING (
    public.is_admin() OR employee_id = public.get_current_employee_id()
);
CREATE POLICY docs_insert ON public.employee_documents FOR INSERT TO authenticated WITH CHECK (
    public.has_permission('employees','create') OR employee_id = public.get_current_employee_id()
);

-- Attendance
CREATE POLICY attendance_select ON public.attendance_records FOR SELECT TO authenticated USING (
    public.has_permission('attendance','view') OR employee_id = public.get_current_employee_id()
);
CREATE POLICY attendance_insert ON public.attendance_records FOR INSERT TO authenticated WITH CHECK (
    public.has_permission('attendance','create') OR employee_id = public.get_current_employee_id()
);
CREATE POLICY attendance_update ON public.attendance_records FOR UPDATE TO authenticated USING (
    public.has_permission('attendance','edit') OR public.has_permission('attendance','approve')
);

-- Face logs
CREATE POLICY face_logs_select ON public.face_logs FOR SELECT TO authenticated USING (
    public.has_permission('face_attendance','view') OR employee_id = public.get_current_employee_id()
);
CREATE POLICY face_logs_insert ON public.face_logs FOR INSERT TO authenticated WITH CHECK (
    public.has_permission('face_attendance','create') OR employee_id = public.get_current_employee_id()
);

-- Leave requests
CREATE POLICY leaves_select ON public.leave_requests FOR SELECT TO authenticated USING (
    public.has_permission('leaves','view') OR employee_id = public.get_current_employee_id()
);
CREATE POLICY leaves_insert ON public.leave_requests FOR INSERT TO authenticated WITH CHECK (
    public.has_permission('leaves','create') OR employee_id = public.get_current_employee_id()
);
CREATE POLICY leaves_update ON public.leave_requests FOR UPDATE TO authenticated USING (
    public.has_permission('leaves','approve')
    OR (employee_id = public.get_current_employee_id() AND status = 'Pending')
);

-- Shifts & assignments
CREATE POLICY shifts_select ON public.shifts FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY shifts_write   ON public.shifts FOR ALL    TO authenticated USING (public.has_permission('shifts','edit'));
CREATE POLICY shift_assign_select ON public.shift_assignments FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY shift_assign_write  ON public.shift_assignments FOR ALL    TO authenticated USING (public.has_permission('shifts','edit'));

CREATE POLICY shift_requests_select ON public.shift_requests FOR SELECT TO authenticated USING (
    public.has_permission('shifts','view') OR employee_id = public.get_current_employee_id()
);
CREATE POLICY shift_requests_insert ON public.shift_requests FOR INSERT TO authenticated WITH CHECK (
    employee_id = public.get_current_employee_id()
);
CREATE POLICY shift_requests_update ON public.shift_requests FOR UPDATE TO authenticated USING (
    public.has_permission('shifts','approve')
);

-- Tasks
CREATE POLICY tasks_select ON public.tasks FOR SELECT TO authenticated USING (
    public.has_permission('tasks','view')
    OR responsible_person_id = public.get_current_employee_id()
    OR assigned_by = public.get_current_employee_id()
    OR EXISTS (
        SELECT 1 FROM public.task_assignees ta
        WHERE ta.task_id = public.tasks.id
          AND ta.employee_id = public.get_current_employee_id()
    )
);
CREATE POLICY tasks_insert ON public.tasks FOR INSERT TO authenticated WITH CHECK (
    public.has_permission('tasks','create')
);
CREATE POLICY tasks_update ON public.tasks FOR UPDATE TO authenticated USING (
    public.has_permission('tasks','edit')
    OR responsible_person_id = public.get_current_employee_id()
    OR assigned_by = public.get_current_employee_id()
    OR EXISTS (
        SELECT 1 FROM public.task_assignees ta
        WHERE ta.task_id = public.tasks.id
          AND ta.employee_id = public.get_current_employee_id()
    )
);

-- Performance (scores + history)
CREATE POLICY performance_select ON public.performance_scores FOR SELECT TO authenticated USING (
    public.has_permission('performance','view') OR employee_id = public.get_current_employee_id()
);
CREATE POLICY performance_write  ON public.performance_scores FOR ALL TO authenticated USING (
    public.has_permission('performance','edit')
);
CREATE POLICY performance_hist_select ON public.performance_history FOR SELECT TO authenticated USING (
    EXISTS ( SELECT 1 FROM public.performance_scores s
             WHERE s.id = performance_id
               AND (public.has_permission('performance','view') OR s.employee_id = public.get_current_employee_id()) )
);
CREATE POLICY performance_hist_write ON public.performance_history FOR ALL TO authenticated USING (
    public.has_permission('performance','edit')
);

-- Recruitment
CREATE POLICY job_openings_select ON public.job_openings FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY job_openings_write  ON public.job_openings FOR ALL    TO authenticated USING (public.has_permission('recruitment','edit'));

CREATE POLICY candidates_select ON public.candidates FOR SELECT TO authenticated USING (
    public.has_permission('recruitment','view') OR referrer_employee_id = public.get_current_employee_id()
);
CREATE POLICY candidates_insert ON public.candidates FOR INSERT TO authenticated WITH CHECK (
    public.has_permission('recruitment','create') OR referrer_employee_id = public.get_current_employee_id()
);
CREATE POLICY candidates_update ON public.candidates FOR UPDATE TO authenticated USING (
    public.has_permission('recruitment','approve')
);

-- Expenses
CREATE POLICY expenses_select ON public.expenses FOR SELECT TO authenticated USING (
    public.has_permission('finance','view') OR employee_id = public.get_current_employee_id()
);
CREATE POLICY expenses_insert ON public.expenses FOR INSERT TO authenticated WITH CHECK (
    employee_id = public.get_current_employee_id() OR public.has_permission('finance','create')
);
CREATE POLICY expenses_update ON public.expenses FOR UPDATE TO authenticated USING (
    public.has_permission('finance','approve')
);

-- Notifications (broadcast: recipients table decides visibility)
CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated USING (
    EXISTS ( SELECT 1 FROM public.notification_recipients nr
             WHERE nr.notification_id = notifications.id
               AND nr.employee_id = public.get_current_employee_id() )
    OR public.is_admin()
);
CREATE POLICY notifications_insert ON public.notifications FOR INSERT TO authenticated WITH CHECK (
    public.has_permission('notifications','create')
);

CREATE POLICY notif_recipients_select ON public.notification_recipients FOR SELECT TO authenticated USING (
    employee_id = public.get_current_employee_id() OR public.is_admin()
);
CREATE POLICY notif_recipients_update ON public.notification_recipients FOR UPDATE TO authenticated USING (
    employee_id = public.get_current_employee_id()
);

-- Payroll
CREATE POLICY payroll_select ON public.payroll_records FOR SELECT TO authenticated USING (
    public.has_permission('payroll','view') OR employee_id = public.get_current_employee_id()
);
CREATE POLICY payroll_write  ON public.payroll_records FOR ALL TO authenticated USING (
    public.has_permission('payroll','edit') OR public.has_permission('payroll','approve')
);

-- Assets
CREATE POLICY assets_select ON public.assets FOR SELECT TO authenticated USING (
    public.has_permission('assets','view') OR assigned_employee_id = public.get_current_employee_id()
);
CREATE POLICY assets_write  ON public.assets FOR ALL TO authenticated USING (
    public.has_permission('assets','edit')
);

-- Config singletons
CREATE POLICY geofence_select ON public.geofence_config FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY geofence_write  ON public.geofence_config FOR ALL    TO authenticated USING (public.has_permission('settings','edit'));
CREATE POLICY workflow_select ON public.workflow_config FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY workflow_write  ON public.workflow_config FOR ALL    TO authenticated USING (public.has_permission('settings','edit'));

-- ============================================================
-- 8. Storage Buckets & Policies
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES
    ('employee-documents', 'employee-documents', FALSE),
    ('face-photos',        'face-photos',        FALSE),
    ('resumes',            'resumes',            FALSE),
    ('receipts',           'receipts',           FALSE),
    ('avatars',            'avatars',            TRUE)
ON CONFLICT (id) DO NOTHING;

-- Public avatars: anyone can read; authenticated users can upload/update.
DROP POLICY IF EXISTS avatars_public_read ON storage.objects;
DROP POLICY IF EXISTS avatars_auth_write ON storage.objects;
CREATE POLICY avatars_public_read ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY avatars_auth_write  ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars');
CREATE POLICY avatars_auth_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars');

-- Private document buckets: authenticated users may read/write,
-- constrained by application logic. (Internal files, not public.)
DROP POLICY IF EXISTS docs_auth_access ON storage.objects;
CREATE POLICY docs_auth_access ON storage.objects FOR ALL TO authenticated USING (
    bucket_id IN ('employee-documents','face-photos','resumes','receipts')
);

-- ============================================================
-- 10. Field Duty & Live Travel Tracking (VRM Enterprise)
-- ============================================================

-- --- field_duty_assignments ---
CREATE TABLE IF NOT EXISTS public.field_duty_assignments (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id            UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
    department             TEXT,
    duty_type              TEXT NOT NULL, -- 'Site Visit', 'Customer Visit', 'Vendor Visit', 'Travel', 'Field Work', 'Other'
    schedule_type          TEXT NOT NULL DEFAULT 'One Day', -- 'One Day', 'Date Range', 'Weekly', 'Monthly', 'Custom Dates'
    start_date             DATE NOT NULL,
    end_date               DATE NOT NULL,
    start_time             TIME NOT NULL,
    end_time               TIME NOT NULL,
    customer_site_name     TEXT NOT NULL,
    site_address           TEXT,
    purpose                TEXT NOT NULL,
    tracking_required      BOOLEAN NOT NULL DEFAULT TRUE,
    travel_km_required     BOOLEAN NOT NULL DEFAULT TRUE,
    attendance_type        TEXT NOT NULL DEFAULT 'Site Geofence', -- 'Site Geofence', 'Flexible Field Check-in'
    site_lat               DOUBLE PRECISION,
    site_lng               DOUBLE PRECISION,
    allowed_radius_meters  INTEGER NOT NULL DEFAULT 200,
    notes                  TEXT,
    status                 TEXT NOT NULL DEFAULT 'Scheduled', -- 'Scheduled', 'Active', 'Completed', 'Cancelled'
    created_by             UUID REFERENCES public.employees(id),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- field_trip_sessions ---
CREATE TABLE IF NOT EXISTS public.field_trip_sessions (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id          UUID NOT NULL REFERENCES public.field_duty_assignments(id) ON DELETE CASCADE,
    employee_id            UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
    trip_start_time        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trip_end_time          TIMESTAMPTZ,
    start_lat              DOUBLE PRECISION NOT NULL,
    start_lng              DOUBLE PRECISION NOT NULL,
    start_address          TEXT,
    end_lat                DOUBLE PRECISION,
    end_lng                DOUBLE PRECISION,
    end_address            TEXT,
    total_km               DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    status                 TEXT NOT NULL DEFAULT 'Active', -- 'Active', 'Completed', 'Cancelled'
    check_in_time          TIMESTAMPTZ,
    check_out_time         TIMESTAMPTZ,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- field_location_points ---
CREATE TABLE IF NOT EXISTS public.field_location_points (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id                UUID NOT NULL REFERENCES public.field_trip_sessions(id) ON DELETE CASCADE,
    assignment_id          UUID NOT NULL REFERENCES public.field_duty_assignments(id) ON DELETE CASCADE,
    employee_id            UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
    recorded_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    latitude               DOUBLE PRECISION NOT NULL,
    longitude              DOUBLE PRECISION NOT NULL,
    accuracy               DOUBLE PRECISION,
    speed                  DOUBLE PRECISION,
    battery_level          DOUBLE PRECISION,
    synced_offline         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- field_tracking_alerts ---
CREATE TABLE IF NOT EXISTS public.field_tracking_alerts (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id          UUID REFERENCES public.field_duty_assignments(id) ON DELETE CASCADE,
    employee_id            UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
    alert_type             TEXT NOT NULL, -- 'GPS Disabled', 'Location Permission Denied', 'No Location Received', 'Low Accuracy', 'Tracking Interrupted'
    issue_start_time       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    issue_end_time         TIMESTAMPTZ,
    duration_minutes       INTEGER,
    last_known_location    TEXT,
    last_known_lat         DOUBLE PRECISION,
    last_known_lng         DOUBLE PRECISION,
    status                 TEXT NOT NULL DEFAULT 'Open', -- 'Open', 'Resolved'
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Triggers for updated_at
DROP TRIGGER IF EXISTS trg_field_duty_updated_at    ON public.field_duty_assignments;
DROP TRIGGER IF EXISTS trg_field_trips_updated_at   ON public.field_trip_sessions;
DROP TRIGGER IF EXISTS trg_field_alerts_updated_at  ON public.field_tracking_alerts;

CREATE TRIGGER trg_field_duty_updated_at   BEFORE UPDATE ON public.field_duty_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_field_trips_updated_at  BEFORE UPDATE ON public.field_trip_sessions    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_field_alerts_updated_at BEFORE UPDATE ON public.field_tracking_alerts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.field_duty_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_trip_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_location_points  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_tracking_alerts  ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Field Duty
CREATE POLICY field_duty_select ON public.field_duty_assignments FOR SELECT TO authenticated USING (
    public.get_current_role_key() IN ('super_admin','hr_admin','hr_manager','ceo','dept_manager')
    OR employee_id = public.get_current_employee_id()
);
CREATE POLICY field_duty_write ON public.field_duty_assignments FOR ALL TO authenticated USING (
    public.get_current_role_key() IN ('super_admin','hr_admin','hr_manager','ceo','dept_manager')
);

-- RLS Policies for Trip Sessions
CREATE POLICY field_trips_select ON public.field_trip_sessions FOR SELECT TO authenticated USING (
    public.get_current_role_key() IN ('super_admin','hr_admin','hr_manager','ceo','dept_manager')
    OR employee_id = public.get_current_employee_id()
);
CREATE POLICY field_trips_insert ON public.field_trip_sessions FOR INSERT TO authenticated WITH CHECK (
    employee_id = public.get_current_employee_id()
    OR public.get_current_role_key() IN ('super_admin','hr_admin','hr_manager','ceo')
);
CREATE POLICY field_trips_update ON public.field_trip_sessions FOR UPDATE TO authenticated USING (
    employee_id = public.get_current_employee_id()
    OR public.get_current_role_key() IN ('super_admin','hr_admin','hr_manager','ceo')
);

-- RLS Policies for Location Points
CREATE POLICY field_points_select ON public.field_location_points FOR SELECT TO authenticated USING (
    public.get_current_role_key() IN ('super_admin','hr_admin','hr_manager','ceo','dept_manager')
    OR employee_id = public.get_current_employee_id()
);
CREATE POLICY field_points_insert ON public.field_location_points FOR INSERT TO authenticated WITH CHECK (
    employee_id = public.get_current_employee_id()
    OR public.get_current_role_key() IN ('super_admin','hr_admin','hr_manager','ceo')
);

-- RLS Policies for Tracking Alerts
CREATE POLICY field_alerts_select ON public.field_tracking_alerts FOR SELECT TO authenticated USING (
    public.get_current_role_key() IN ('super_admin','hr_admin','hr_manager','ceo','dept_manager')
    OR employee_id = public.get_current_employee_id()
);
CREATE POLICY field_alerts_write ON public.field_tracking_alerts FOR ALL TO authenticated USING (
    public.get_current_role_key() IN ('super_admin','hr_admin','hr_manager','ceo')
);

-- ============================================================
-- 11. Re-runability cleanup
-- ============================================================
DROP FUNCTION IF EXISTS public.seed_permissions(UUID, TEXT[], TEXT[]);

COMMIT;
