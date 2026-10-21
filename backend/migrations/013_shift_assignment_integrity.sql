ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS company_id TEXT NOT NULL DEFAULT 'company-a';

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS company_id TEXT NOT NULL DEFAULT 'company-a';

ALTER TABLE public.shift_assignments
  ADD COLUMN IF NOT EXISTS company_id TEXT NOT NULL DEFAULT 'company-a',
  ADD COLUMN IF NOT EXISTS effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS effective_to DATE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.employees
SET company_id = 'company-b'
WHERE employee_id LIKE 'EMP-B%' OR lower(email) LIKE '%nexus%';

UPDATE public.shift_assignments assignment
SET company_id = employee.company_id
FROM public.employees employee
WHERE employee.id = assignment.employee_id
  AND assignment.company_id IS DISTINCT FROM employee.company_id;

WITH ranked AS (
  SELECT
    assignment.id,
    row_number() OVER (
      PARTITION BY assignment.employee_id
      ORDER BY
        CASE WHEN employee.work_shift = shift.shift_name OR employee.work_shift = shift.id::text THEN 0 ELSE 1 END,
        assignment.effective_from DESC,
        assignment.created_at DESC,
        assignment.id DESC
    ) AS assignment_rank
  FROM public.shift_assignments assignment
  JOIN public.employees employee ON employee.id = assignment.employee_id
  JOIN public.shifts shift ON shift.id = assignment.shift_id
  WHERE assignment.effective_to IS NULL OR assignment.effective_to >= CURRENT_DATE
)
UPDATE public.shift_assignments assignment
SET effective_to = CURRENT_DATE - 1, updated_at = NOW()
FROM ranked
WHERE ranked.id = assignment.id AND ranked.assignment_rank > 1;

INSERT INTO public.shift_assignments (shift_id, employee_id, company_id, effective_from)
SELECT shift.id, employee.id, employee.company_id, CURRENT_DATE
FROM public.employees employee
JOIN public.shifts shift
  ON shift.company_id = employee.company_id
 AND (employee.work_shift = shift.shift_name OR employee.work_shift = shift.id::text)
WHERE employee.status = 'Active'
  AND NOT EXISTS (
    SELECT 1
    FROM public.shift_assignments assignment
    WHERE assignment.employee_id = employee.id
      AND assignment.effective_from <= CURRENT_DATE
      AND (assignment.effective_to IS NULL OR assignment.effective_to >= CURRENT_DATE)
  );

ALTER TABLE public.shift_assignments DROP CONSTRAINT IF EXISTS unique_shift_employee;

CREATE UNIQUE INDEX IF NOT EXISTS uq_shift_assignment_employee_effective
  ON public.shift_assignments(employee_id, effective_from);
CREATE INDEX IF NOT EXISTS idx_shift_assignment_current_company
  ON public.shift_assignments(company_id, effective_from, effective_to, shift_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_employees_company_status
  ON public.employees(company_id, status, id);
CREATE INDEX IF NOT EXISTS idx_shifts_company
  ON public.shifts(company_id, id);

CREATE OR REPLACE FUNCTION public.get_shift_assignment_summary(
  p_company_id TEXT,
  p_business_date DATE,
  p_scope_level TEXT DEFAULT 'all',
  p_scope_employee_id TEXT DEFAULT NULL,
  p_scope_department TEXT DEFAULT NULL
)
RETURNS TABLE (shift_id UUID, shift_name TEXT, employee_count BIGINT, employees JSONB)
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  WITH ranked_assignments AS (
    SELECT assignment.shift_id, employee.id, employee.employee_id, employee.first_name, employee.last_name,
      department.name AS department_name,
      row_number() OVER (PARTITION BY employee.id ORDER BY assignment.effective_from DESC, assignment.created_at DESC, assignment.id DESC) AS assignment_rank
    FROM public.shift_assignments assignment
    JOIN public.employees employee ON employee.id = assignment.employee_id
    LEFT JOIN public.departments department ON department.id = employee.department_id
    WHERE assignment.company_id = p_company_id
      AND employee.company_id = p_company_id
      AND employee.status = 'Active'
      AND assignment.effective_from <= p_business_date
      AND (assignment.effective_to IS NULL OR assignment.effective_to >= p_business_date)
      AND (
        COALESCE(p_scope_level, 'all') NOT IN ('own', 'department', 'team')
        OR (p_scope_level = 'own' AND p_scope_employee_id IS NOT NULL AND (employee.id::TEXT = p_scope_employee_id OR employee.employee_id = p_scope_employee_id))
        OR (p_scope_level IN ('department', 'team') AND p_scope_department IS NOT NULL AND lower(COALESCE(department.name, '')) = lower(p_scope_department))
      )
  ), current_assignments AS (
    SELECT * FROM ranked_assignments WHERE assignment_rank = 1
  )
  SELECT shift.id, shift.shift_name, count(current.id),
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', current.id,
      'employeeId', current.employee_id,
      'name', btrim(concat_ws(' ', current.first_name, current.last_name)),
      'department', current.department_name
    ) ORDER BY current.employee_id) FILTER (WHERE current.id IS NOT NULL), '[]'::JSONB)
  FROM public.shifts shift
  LEFT JOIN current_assignments current ON current.shift_id = shift.id
  WHERE shift.company_id = p_company_id
  GROUP BY shift.id, shift.shift_name, shift.created_at
  ORDER BY shift.created_at;
$$;
