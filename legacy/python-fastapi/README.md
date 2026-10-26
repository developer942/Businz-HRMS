# Legacy Python FastAPI HRMS Backend (Archived)

> [!NOTE]
> This folder contains the original prototype / initial implementation of the HRMS backend written in Python (FastAPI + SQLAlchemy + SQLite).
> 
> **Active Production Backend**:
> The active, production-grade backend service used by Businz HRMS is located in [`/backend`](../../backend/) and is built with **Node.js, Express, TypeScript, and PostgreSQL / PostgREST**.

---

### Contents
- `app/`: FastAPI application code (auth, employees, leaves, payroll, attendance, shifts)
- `requirements.txt`: Python package dependencies
- `tests/smoke_test.py`: Legacy SQLite smoke test suite
- `hrms.db`, `test_hrm.db`: Historical local SQLite databases

### Running (For Reference / Historical Testing Only)
```bash
pip install -r requirements.txt
python tests/smoke_test.py
```
