"""Domain vocabulary shared across the backend. All names are dynamic / DB driven."""

# Modules mirroring the frontend permission matrix (superset, extendable).
MODULES: tuple[str, ...] = (
    "dashboard",
    "employees",
    "face_attendance",
    "attendance",
    "gps_geofence",
    "leaves",
    "shifts",
    "performance",
    "tasks",
    "recruitment",
    "finance",
    "notifications",
    "payroll",
    "advance_salary",
    "reports",
    "organization",
    "assets",
    "settings",
    "profile",
)

ACTIONS: tuple[str, ...] = ("view", "create", "edit", "delete", "approve", "export")

# Attendance statuses / methods vocabularies (dynamic strings, kept aligned with schema.sql enums).
ATTENDANCE_STATUSES: tuple[str, ...] = ("Present", "Absent", "Late", "Half Day", "Work From Home", "On Leave")
ATTENDANCE_METHODS: tuple[str, ...] = ("Face Scan", "GPS Location", "Manual", "Biometric", "Face", "Manual Punch")
LATE_STATUSES: tuple[str, ...] = ("On Time", "Late", "Very Late")

LEAVE_TYPES: tuple[str, ...] = ("Casual Leave", "Sick Leave", "Paid Leave", "Unpaid Leave", "Work From Home")
LEAVE_STATUSES: tuple[str, ...] = ("Pending", "Approved", "Rejected")

PAYROLL_STATUSES: tuple[str, ...] = ("Pending", "Verified", "Processed", "Paid")