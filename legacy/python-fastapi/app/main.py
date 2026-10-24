from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import seed
from .api.routes import attendance, auth, employees, leaves, payroll, shifts
from .api.routes import settings as settings_routes
from .core.config import settings
from .core.database import Base, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    if settings.ENABLE_DEMO_SEED:
        seed.run_seed()
    yield


app = FastAPI(title=settings.APP_NAME, version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

PREFIX = settings.API_V1_PREFIX

app.include_router(auth.router, prefix=PREFIX)
app.include_router(employees.router, prefix=PREFIX)
app.include_router(attendance.router, prefix=PREFIX)
app.include_router(leaves.router, prefix=PREFIX)
app.include_router(shifts.router, prefix=PREFIX)
app.include_router(payroll.router, prefix=PREFIX)
app.include_router(settings_routes.router, prefix=PREFIX)


@app.get("/health", tags=["system"])
def health():
    return {"status": "ok", "app": settings.APP_NAME}
