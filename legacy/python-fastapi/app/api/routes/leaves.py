from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.rbac import require_permission
from ...core.scope import require_row_access, scoped_employee_id
from ...models.hr import Employee, LeaveRequest, User
from ...schemas.leave import LeaveCreate, LeaveOut, LeaveReview
from ...types import LEAVE_STATUSES

router = APIRouter(prefix="/leaves", tags=["leaves"])


def _to_out(req: LeaveRequest) -> LeaveOut:
    return LeaveOut(
        id=req.id,
        employee_id=req.employee_id,
        leave_type=req.leave_type,
        start_date=req.start_date,
        end_date=req.end_date,
        days_count=req.days_count,
        reason=req.reason,
        status=req.status,
        applied_date=req.applied_date,
        approved_by=req.approved_by,
        comment=req.comment,
    )


def _employee_name(db: Session, employee_id: str) -> str | None:
    emp = db.execute(
        select(Employee).where(Employee.employee_id == employee_id)
    ).scalar_one_or_none()
    return f"{emp.first_name} {emp.last_name}" if emp else None


@router.get("", response_model=list[LeaveOut])
def list_leaves(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("leaves", "view")),
):
    query = select(LeaveRequest).order_by(LeaveRequest.applied_date.desc())
    scoped = scoped_employee_id(user)
    if scoped:
        query = query.where(LeaveRequest.employee_id == scoped)
    rows = db.execute(query).scalars().all()
    results = []
    for r in rows:
        out = _to_out(r)
        out.employee_name = _employee_name(db, r.employee_id)
        results.append(out)
    return results


@router.post("", response_model=LeaveOut, status_code=status.HTTP_201_CREATED)
def create_leave(
    payload: LeaveCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("leaves", "create")),
):
    s = date.fromisoformat(payload.start_date)
    e = date.fromisoformat(payload.end_date)
    if e < s:
        raise HTTPException(status_code=422, detail="end_date must be >= start_date")
    days = (e - s).days + 1

    req = LeaveRequest(
        employee_id=user.employee_id or "UNASSIGNED",
        leave_type=payload.leave_type,
        start_date=payload.start_date,
        end_date=payload.end_date,
        days_count=days,
        reason=payload.reason,
        status="Pending",
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return _to_out(req)


@router.patch("/{leave_id}/decision", response_model=LeaveOut)
def review_leave(
    leave_id: str,
    payload: LeaveReview,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("leaves", "approve")),
):
    req = db.get(LeaveRequest, leave_id)
    if req is None:
        raise HTTPException(status_code=404, detail="Leave request not found")
    require_row_access(user, req.employee_id)
    if payload.decision not in ("approved", "rejected"):
        raise HTTPException(status_code=422, detail="decision must be 'approved' or 'rejected'")
    req.status = "Approved" if payload.decision == "approved" else "Rejected"
    req.comment = payload.comment
    req.approved_by = f"{user.full_name} ({user.role.name if user.role else ''})"
    db.commit()
    db.refresh(req)
    return _to_out(req)