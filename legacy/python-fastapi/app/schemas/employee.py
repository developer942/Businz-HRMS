from datetime import date
from typing import Any

from pydantic import BaseModel, Field


class EmployeeBase(BaseModel):
    employee_id: str | None = None
    first_name: str
    last_name: str
    email: str
    phone: str | None = None
    dob: date | None = None
    gender: str = "Other"
    department: str | None = None
    designation: str | None = None
    joining_date: date | None = None
    employment_type: str = "Full-Time"
    status: str = "Active"
    total_salary: float = 0
    attendance_method: str = "Face Scan"
    gps_allowed: bool = True


class EmployeeCreate(EmployeeBase):
    pass


class EmployeeUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    dob: date | None = None
    gender: str | None = None
    department: str | None = None
    designation: str | None = None
    joining_date: date | None = None
    employment_type: str | None = None
    status: str | None = None
    total_salary: float | None = None
    attendance_method: str | None = None
    gps_allowed: bool | None = None


class EmployeeOut(BaseModel):
    id: str
    employee_id: str
    first_name: str
    last_name: str
    email: str
    phone: str | None = None
    dob: date | None = None
    gender: str
    department: str | None = None
    designation: str | None = None
    joining_date: date | None = None
    employment_type: str
    status: str
    is_active: bool = True
    total_salary: float = 0
    attendance_method: str
    gps_allowed: bool = True


class EmployeePayload(BaseModel):
    """REST write payload (snake_case; acceptable for a governed backend contract)."""

    data: dict[str, Any] = Field(default_factory=dict)