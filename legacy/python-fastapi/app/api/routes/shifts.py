from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete as sa_delete
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ...core.database import get_db
from ...core.rbac import require_permission
from ...models.hr import Shift, ShiftAssignment, User
from ...schemas.common import Message

router = APIRouter(prefix="/shifts", tags=["shifts"])


class ShiftCreate(BaseModel):
    shift_name: str
    start_time: str
    end_time: str
    break_duration_mins: int = 0
    working_hours: float = 8
    grace_period_mins: int = 15
    color: str = "#3B82F6"


class ShiftOut(ShiftCreate):
    id: str
    assigned_employee_count: int = 0
    assignments: list[str] = []


class AssignEmployees(BaseModel):
    employee_ids: list[str]


def _to_out(shift: Shift) -> ShiftOut:
    return ShiftOut(
        id=shift.id,
        shift_name=shift.shift_name,
        start_time=shift.start_time,
        end_time=shift.end_time,
        break_duration_mins=shift.break_duration_mins,
        working_hours=shift.working_hours,
        grace_period_mins=shift.grace_period_mins,
        color=shift.color,
        assigned_employee_count=len(shift.assignments),
        assignments=[a.employee_id for a in shift.assignments],
    )


@router.get("", response_model=list[ShiftOut])
def list_shifts(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("shifts", "view")),
):
    shifts = db.execute(
        select(Shift).options(selectinload(Shift.assignments)).order_by(Shift.shift_name)
    ).scalars().all()
    return [_to_out(s) for s in shifts]


@router.post("", response_model=ShiftOut, status_code=status.HTTP_201_CREATED)
def create_shift(
    payload: ShiftCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("shifts", "create")),
):
    shift = Shift(**payload.model_dump())
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return _to_out(shift)


@router.put("/{shift_id}/assignments", response_model=ShiftOut)
def assign_employees(
    shift_id: str,
    payload: AssignEmployees,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("shifts", "edit")),
):
    shift = db.get(Shift, shift_id)
    if shift is None:
        raise HTTPException(status_code=404, detail="Shift not found")

    # Replace assignments atomically
    db.execute(sa_delete(ShiftAssignment).where(ShiftAssignment.shift_id == shift_id))
    for emp_id in dict.fromkeys(payload.employee_ids):  # dedupe, preserve order
        db.add(ShiftAssignment(shift_id=shift_id, employee_id=emp_id))
    db.commit()
    db.refresh(shift)
    return _to_out(shift)