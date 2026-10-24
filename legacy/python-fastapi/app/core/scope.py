from fastapi import HTTPException, status

from .config import settings
from ..models.hr import User


def is_self_service(user: User) -> bool:
    """Roles whose data access is restricted to their own employee record.
    Derived from config (dynamic), defaults to the Employee role key."""
    return user.role is not None and user.role.key in settings.SELF_SERVICE_ROLE_KEYS


def require_row_access(user: User, target_employee_id: str | None) -> None:
    """Backend row-level guard: Employee-style users may only access their own
    rows. The employee id is validated against the *authenticated user*, never
    taken from the client as an authority."""
    if not is_self_service(user):
        return
    own = user.employee_id
    if not target_employee_id or own != target_employee_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: your role only permits access to your own records.",
        )


def scoped_employee_id(user: User) -> str | None:
    """None means 'all employees' (privileged); a concrete id for self-service."""
    if is_self_service(user):
        return user.employee_id
    return None