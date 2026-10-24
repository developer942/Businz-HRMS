from pydantic import BaseModel, ConfigDict, EmailStr

from .auth import UserOut  # noqa: F401


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Message(BaseModel):
    message: str


class Detail(BaseModel):
    detail: str


class Paginated(BaseModel):
    total: int
    items: list


# Field-level string use (EmailStr needs email-validator package; keep plain str)
class LoginRequest(BaseModel):
    email: str
    password: str