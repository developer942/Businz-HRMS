from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete as sa_delete
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.rbac import require_permission
from ...core.scope import require_row_access, scoped_employee_id
from ...models.hr import AttendanceRecord, User
from ...schemas.attendance import AttendanceCreate, AttendanceOut, AttendanceReview
from ...types import ATTENDANCE_STATUSES

router = APIRouter(prefix="/attendance", tags=["attendance"])


def _to_out(rec: AttendanceRecord) -> AttendanceOut:
    return AttendanceOut(
        id=rec.id,
        employee_id=rec.employee_id,
        date=rec.date,
        check_in=rec.check_in,
        check_out=rec.check_out,
        working_hours=rec.working_hours,
        status=rec.status,
        late_status=rec.late_status,
        method=rec.method,
        in_geofence=rec.in_geofence,
    )


@router.get("", response_model=list[AttendanceOut])
def list_attendance(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("attendance", "view")),
):
    query = select(AttendanceRecord).order_by(AttendanceRecord.date.desc(), AttendanceRecord.employee_id)
    scoped = scoped_employee_id(user)
    if scoped:
        query = query.where(AttendanceRecord.employee_id == scoped)
    return [_to_out(r) for r in db.execute(query).scalars().all()]


@router.post("", response_model=AttendanceOut, status_code=status.HTTP_201_CREATED)
def record_attendance(
    payload: AttendanceCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("attendance", "create")),
):
    target = payload.date  # validated below
    if payload.status not in ATTENDANCE_STATUSES:
        raise HTTPException(status_code=422, detail=f"Unknown attendance status '{payload.status}'")

    existing = db.execute(
        select(AttendanceRecord).where(
            AttendanceRecord.employee_id == user.employee_id,
            AttendanceRecord.date == target,
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Attendance already recorded for this date")

    rec = AttendanceRecord(
        employee_id=user.employee_id or "UNASSIGNED",
        date=target,
        check_in=payload.check_in,
        check_out=payload.check_out,
        status=payload.status,
        method=payload.method,
        in_geofence=payload.in_geofence,
        location_lat=payload.location_lat,
        location_lng=payload.location_lng,
        location_address=payload.location_address,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return _to_out(rec)


@router.patch("/{record_id}/review", response_model=AttendanceOut)
def review_attendance(
    record_id: str,
    payload: AttendanceReview,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("attendance", "approve")),
):
    rec = db.get(AttendanceRecord, record_id)
    if rec is None:
        raise HTTPException(status_code=404, detail="Attendance record not found")
    require_row_access(user, rec.employee_id)
    if payload.status not in ATTENDANCE_STATUSES:
        raise HTTPException(status_code=422, detail=f"Unknown attendance status '{payload.status}'")
    rec.status = payload.status
    db.commit()
    db.refresh(rec)
    return _to_out(rec)