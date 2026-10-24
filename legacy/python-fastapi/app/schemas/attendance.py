from pydantic import BaseModel


class AttendanceCreate(BaseModel):
    date: str  # YYYY-MM-DD
    check_in: str | None = None
    check_out: str | None = None
    status: str = "Present"
    method: str = "Face Scan"
    in_geofence: bool = True
    location_lat: float | None = None
    location_lng: float | None = None
    location_address: str | None = None


class AttendanceOut(BaseModel):
    id: str
    employee_id: str
    date: str
    check_in: str | None = None
    check_out: str | None = None
    working_hours: float = 0
    status: str
    late_status: str
    method: str
    in_geofence: bool = True


class AttendanceReview(BaseModel):
    status: str
    comment: str | None = None