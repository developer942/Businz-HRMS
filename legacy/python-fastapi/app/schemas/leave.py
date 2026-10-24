from pydantic import BaseModel


class LeaveCreate(BaseModel):
    leave_type: str
    start_date: str  # YYYY-MM-DD
    end_date: str  # YYYY-MM-DD
    reason: str | None = None


class LeaveReview(BaseModel):
    decision: str  # approved | rejected
    comment: str | None = None


class LeaveOut(BaseModel):
    id: str
    employee_id: str
    employee_name: str | None = None
    leave_type: str
    start_date: str
    end_date: str
    days_count: int
    reason: str | None = None
    status: str
    applied_date: str
    approved_by: str | None = None
    comment: str | None = None