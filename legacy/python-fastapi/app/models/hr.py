import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.database import Base


def new_uuid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


# ---------------------------------------------------------------
# RBAC (normalized, mirrors schema.sql `roles` + `permissions`)
# ---------------------------------------------------------------
class Role(Base):
    __tablename__ = "roles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    key: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    permissions: Mapped[list["Permission"]] = relationship(back_populates="role", cascade="all, delete-orphan")
    users: Mapped[list["User"]] = relationship(back_populates="role")


class Permission(Base):
    __tablename__ = "permissions"
    __table_args__ = (UniqueConstraint("role_id", "module", "action", name="uq_role_module_action"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    role_id: Mapped[str] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), nullable=False)
    module: Mapped[str] = mapped_column(String(80), nullable=False)
    action: Mapped[str] = mapped_column(String(30), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    role: Mapped[Role] = relationship(back_populates="permissions")


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role_id: Mapped[str] = mapped_column(ForeignKey("roles.id", ondelete="RESTRICT"), nullable=False)
    employee_id: Mapped[str | None] = mapped_column(String(60), unique=True, nullable=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    role: Mapped[Role] = relationship(back_populates="users")


# ---------------------------------------------------------------
# Master data
# ---------------------------------------------------------------
class Department(TimestampMixin, Base):
    __tablename__ = "departments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    head_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    budget: Mapped[float] = mapped_column(Float, default=0)


class Designation(TimestampMixin, Base):
    __tablename__ = "designations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    department_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    level: Mapped[str | None] = mapped_column(String(80), nullable=True)


class Employee(TimestampMixin, Base):
    __tablename__ = "employees"
    __table_args__ = (UniqueConstraint("email", name="uq_employee_email"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    employee_id: Mapped[str] = mapped_column(String(60), unique=True, nullable=False, index=True)
    first_name: Mapped[str] = mapped_column(String(150), nullable=False)
    last_name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    dob: Mapped[str | None] = mapped_column(Date, nullable=True)
    gender: Mapped[str] = mapped_column(String(20), default="Other")
    address: Mapped[str | None] = mapped_column(Text, nullable=True)

    department: Mapped[str | None] = mapped_column(String(150), nullable=True)
    department_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    designation: Mapped[str | None] = mapped_column(String(150), nullable=True)
    designation_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    joining_date: Mapped[str | None] = mapped_column(Date, nullable=True)
    employment_type: Mapped[str] = mapped_column(String(40), default="Full-Time")
    status: Mapped[str] = mapped_column(String(30), default="Active")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Salary (earnings are derived from totalSalary via percentage structure)
    total_salary: Mapped[float] = mapped_column(Float, default=0)
    basic_salary: Mapped[float] = mapped_column(Float, default=0)  # denormalized/cache
    gross_salary: Mapped[float] = mapped_column(Float, default=0)

    attendance_method: Mapped[str] = mapped_column(String(40), default="Face Scan")
    gps_allowed: Mapped[bool] = mapped_column(Boolean, default=True)
    face_registered: Mapped[bool] = mapped_column(Boolean, default=False)
    work_shift_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    bank_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    account_number: Mapped[str | None] = mapped_column(String(60), nullable=True)
    ifsc_code: Mapped[str | None] = mapped_column(String(30), nullable=True)


# ---------------------------------------------------------------
# Time & attendance
# ---------------------------------------------------------------
class AttendanceRecord(TimestampMixin, Base):
    __tablename__ = "attendance_records"
    __table_args__ = (UniqueConstraint("employee_id", "date", name="uq_employee_attendance_date"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    employee_id: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False)  # YYYY-MM-DD
    check_in: Mapped[str | None] = mapped_column(String(19), nullable=True)
    check_out: Mapped[str | None] = mapped_column(String(19), nullable=True)
    working_hours: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(30), default="Present")
    late_status: Mapped[str] = mapped_column(String(30), default="On Time")
    method: Mapped[str] = mapped_column(String(40), default="Face Scan")
    in_geofence: Mapped[bool] = mapped_column(Boolean, default=True)
    location_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    location_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    location_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    face_verified: Mapped[bool] = mapped_column(Boolean, default=False)


class LeaveRequest(TimestampMixin, Base):
    __tablename__ = "leave_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    employee_id: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    leave_type: Mapped[str] = mapped_column(String(80), nullable=False)
    start_date: Mapped[str] = mapped_column(String(10), nullable=False)
    end_date: Mapped[str] = mapped_column(String(10), nullable=False)
    days_count: Mapped[int] = mapped_column(Integer, default=1)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="Pending")
    applied_date: Mapped[str] = mapped_column(String(10), default=lambda: datetime.now(timezone.utc).date().isoformat())
    approved_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)


class Shift(TimestampMixin, Base):
    __tablename__ = "shifts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    shift_name: Mapped[str] = mapped_column(String(150), nullable=False)
    start_time: Mapped[str] = mapped_column(String(5), nullable=False)
    end_time: Mapped[str] = mapped_column(String(5), nullable=False)
    break_duration_mins: Mapped[int] = mapped_column(Integer, default=0)
    working_hours: Mapped[float] = mapped_column(Float, default=8)
    grace_period_mins: Mapped[int] = mapped_column(Integer, default=15)
    color: Mapped[str] = mapped_column(String(20), default="#3B82F6")

    assignments: Mapped[list["ShiftAssignment"]] = relationship(back_populates="shift", cascade="all, delete-orphan")


class ShiftAssignment(Base):
    __tablename__ = "shift_assignments"
    __table_args__ = (UniqueConstraint("shift_id", "employee_id", name="uq_shift_employee"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    shift_id: Mapped[str] = mapped_column(ForeignKey("shifts.id", ondelete="CASCADE"), nullable=False)
    employee_id: Mapped[str] = mapped_column(String(60), nullable=False, index=True)

    shift: Mapped[Shift] = relationship(back_populates="assignments")


# ---------------------------------------------------------------
# Payroll
# ---------------------------------------------------------------
class PayrollSettings(TimestampMixin, Base):
    """Singleton (id='global') fully dynamic statutory & salary structure config."""

    __tablename__ = "payroll_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default="global")
    # {"basic_percentage":40,"da_percentage":20,"conveyance_percentage":5,"hra_percentage":35}
    structure: Mapped[dict] = mapped_column(JSON, default=dict)
    # {"enabled":true,"rate":12.0,"wage_base":"PF_WAGE","wage_components":["BASIC","DA","CONVEYANCE"],"wage_ceiling":15000}
    pf: Mapped[dict] = mapped_column(JSON, default=dict)
    # {"enabled":true,"rate":0.75,"wage_base":"GROSS","wage_ceiling":21000}
    esi: Mapped[dict] = mapped_column(JSON, default=dict)
    # {"enabled":true,"amount":200}
    pt: Mapped[dict] = mapped_column(JSON, default=dict)
    # {"name":"VRM...","address":"...","registrationNo":...,"gstNo":...}
    company: Mapped[dict] = mapped_column(JSON, default=dict)
    standard_working_days: Mapped[int] = mapped_column(Integer, default=26)
    payroll_cycle_day: Mapped[int] = mapped_column(Integer, default=1)


class SalaryStructureOverride(Base):
    """Per-employee override of the global salary structure. Fully optional."""

    __tablename__ = "salary_structure_overrides"
    __table_args__ = (UniqueConstraint("employee_id", name="uq_structure_employee"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    employee_id: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    total_salary: Mapped[float | None] = mapped_column(Float, nullable=True)
    percentages: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    pf: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    esi: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class PayrollRecord(Base):
    __tablename__ = "payroll_records"
    __table_args__ = (UniqueConstraint("employee_id", "payroll_month", name="uq_employee_payroll_month"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    employee_id: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    employee_name: Mapped[str] = mapped_column(String(255), nullable=False)
    department: Mapped[str | None] = mapped_column(String(150), nullable=True)
    designation: Mapped[str | None] = mapped_column(String(150), nullable=True)
    payroll_month: Mapped[str] = mapped_column(String(7), nullable=False)  # "2026-08"

    total_salary: Mapped[float] = mapped_column(Float, default=0)
    basic_salary: Mapped[float] = mapped_column(Float, default=0)
    dearness_allowance: Mapped[float] = mapped_column(Float, default=0)
    conveyance: Mapped[float] = mapped_column(Float, default=0)
    hra: Mapped[float] = mapped_column(Float, default=0)
    bonus: Mapped[float] = mapped_column(Float, default=0)
    reward_earnings: Mapped[float] = mapped_column(Float, default=0)

    pf_wage: Mapped[float] = mapped_column(Float, default=0)
    pf_rate: Mapped[float] = mapped_column(Float, default=0)
    pf_amount: Mapped[float] = mapped_column(Float, default=0)
    esi_wage: Mapped[float] = mapped_column(Float, default=0)
    esi_rate: Mapped[float] = mapped_column(Float, default=0)
    esi_amount: Mapped[float] = mapped_column(Float, default=0)
    professional_tax: Mapped[float] = mapped_column(Float, default=0)
    attendance_deduction: Mapped[float] = mapped_column(Float, default=0)
    leave_deduction: Mapped[float] = mapped_column(Float, default=0)
    loan_deduction: Mapped[float] = mapped_column(Float, default=0)
    total_deductions: Mapped[float] = mapped_column(Float, default=0)

    net_salary: Mapped[float] = mapped_column(Float, default=0)
    working_days: Mapped[int] = mapped_column(Integer, default=0)
    present_days: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(30), default="Pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)