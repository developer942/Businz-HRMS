from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..api.deps import get_current_user
from ..core.config import settings
from ..core.database import get_db
from ..models.hr import Permission, User


def role_has_full_access(user: User) -> bool:
    return user.role is not None and user.role.key in settings.FULL_ACCESS_ROLE_KEYS


def employee_id_of(user: User) -> str | None:
    """The employee scope an authenticated user maps to. This is NEVER taken
    from the client; it is derived server-side from the authenticated user."""
    return user.employee_id


def user_has_permission(db: Session, user: User, module: str, action: str) -> bool:
    if role_has_full_access(user):
        return True
    # Any authenticated user always sees their own profile & can open settings (view only).
    if module == "profile":
        return True
    if module == "settings" and action == "view":
        return True
    if user.role is None:
        return False
    row = db.execute(
        select(Permission.id).where(
            Permission.role_id == user.role_id,
            Permission.module == module,
            Permission.action == action,
        )
    ).first()
    return row is not None


def require_permission(module: str, action: str) -> Callable:
    """FastAPI dependency: rejects 403 when the authenticated user's role
    lacks (module, action) in the DB permission matrix. Hiding is not enough —
    this is the backend authorization gate."""

    def checker(
        db: Session = Depends(get_db),
        user: User = Depends(get_current_user),
    ) -> User:
        if not user_has_permission(db, user, module, action):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Forbidden: your role ('{user.role.name if user.role else '?'}') is not "
                    f"granted '{action}' permission on module '{module}'."
                ),
            )
        return user

    return checker