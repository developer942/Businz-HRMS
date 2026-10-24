from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.rbac import require_permission
from ...core.scope import require_row_access, scoped_employee_id
from ...models.hr import Employee, User
from ...schemas.employee import EmployeeCreate, EmployeeOut, EmployeeUpdate

router = APIRouter(prefix="/employees", tags=["employees"])


def _to_out(emp: Employee) -> EmployeeOut:
    return EmployeeOut(
        id=emp.id,
        employee_id=emp.employee_id,
        first_name=emp.first_name,
        last_name=emp.last_name,
        email=emp.email,
        phone=emp.phone,
        dob=emp.dob,
        gender=emp.gender,
        department=emp.department,
        designation=emp.designation,
        joining_date=emp.joining_date,
        employment_type=emp.employment_type,
        status=emp.status,
        is_active=emp.is_active,
        total_salary=emp.total_salary,
        attendance_method=emp.attendance_method,
        gps_allowed=emp.gps_allowed,
    )


@router.get("", response_model=list[EmployeeOut])
def list_employees(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("employees", "view")),
):
    """Employee role → only own record; privileged roles → everyone."""
    query = select(Employee).order_by(Employee.employee_id)
    scoped = scoped_employee_id(user)
    if scoped:
        query = query.where(Employee.employee_id == scoped)
    return [_to_out(e) for e in db.execute(query).scalars().all()]


@router.get("/{employee_id}", response_model=EmployeeOut)
def get_employee(
    employee_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("employees", "view")),
):
    require_row_access(user, employee_id)
    emp = db.execute(
        select(Employee).where(Employee.employee_id == employee_id)
    ).scalar_one_or_none()
    if emp is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    return _to_out(emp)


@router.post("", response_model=EmployeeOut, status_code=status.HTTP_201_CREATED)
def create_employee(
    payload: EmployeeCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("employees", "create")),
):
    if payload.employee_id:
        exists = db.execute(
            select(Employee).where(Employee.employee_id == payload.employee_id)
        ).scalar_one_or_none()
        if exists:
            raise HTTPException(status_code=409, detail="employeeId already exists")
        employee_id = payload.employee_id
    else:
        # Dynamic employee id allocation (never trusts a client boundary blindly)
        prefix = payload.employee_id or "EMP"
        employee_id = f"{prefix}-{len(db.execute(select(Employee)).scalars().all()) + 1:03d}"

    emp = Employee(
        employee_id=employee_id,
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=payload.email,
        phone=payload.phone,
        dob=payload.dob,
        gender=payload.gender,
        department=payload.department,
        designation=payload.designation,
        joining_date=payload.joining_date,
        employment_type=payload.employment_type,
        status=payload.status,
        total_salary=payload.total_salary,
        attendance_method=payload.attendance_method,
        gps_allowed=payload.gps_allowed,
    )
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return _to_out(emp)


_EMPLOYEE_SELF_EDITABLE = {"phone", "gender", "dob"}


@router.patch("/{employee_id}", response_model=EmployeeOut)
def update_employee(
    employee_id: str,
    payload: EmployeeUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("employees", "edit")),
):
    require_row_access(user, employee_id)
    emp = db.execute(
        select(Employee).where(Employee.employee_id == employee_id)
    ).scalar_one_or_none()
    if emp is None:
        raise HTTPException(status_code=404, detail="Employee not found")

    data = payload.model_dump(exclude_unset=True)
    if user.role and user.role.key in ("EMPLOYEE",):
        # Self-service employees may only touch their own basic contact fields.
        data = {k: v for k, v in data.items() if k in _EMPLOYEE_SELF_EDITABLE}

    for key, value in data.items():
        setattr(emp, key, value)
    db.commit()
    db.refresh(emp)
    return _to_out(emp)


@router.delete("/{employee_id}")
def delete_employee(
    employee_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("employees", "delete")),
):
    emp = db.execute(
        select(Employee).where(Employee.employee_id == employee_id)
    ).scalar_one_or_none()
    if emp is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    db.delete(emp)
    db.commit()
    return {"message": f"Employee {employee_id} deleted"}