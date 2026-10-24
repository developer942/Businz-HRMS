from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.rbac import require_permission
from ...models.hr import PayrollSettings, User
from ...services.payroll import normalize_settings

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/company")
def get_company(db: Session = Depends(get_db), user: User = Depends(require_permission("settings", "view"))):
    normalized = normalize_settings(db.get(PayrollSettings, "global"))
    return {"company": normalized.company or {}}


@router.put("/company")
def update_company(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("settings", "edit")),
):
    settings_row = db.get(PayrollSettings, "global")
    if settings_row is None:
        from ...models.hr import PayrollSettings as PS

        settings_row = PS(id="global")
    normalized = normalize_settings(settings_row)
    normalized.company = {**(normalized.company or {}), **payload.get("company", {})}
    db.add(normalized)
    db.commit()
    return {"company": normalized.company}