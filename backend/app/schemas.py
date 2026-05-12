from pydantic import BaseModel, ConfigDict


class HealthResponse(BaseModel):
    model_config = ConfigDict(strict=True)

    status: str


class ReadyDependency(BaseModel):
    model_config = ConfigDict(strict=True)

    name: str
    ok: bool


class ReadyResponse(BaseModel):
    model_config = ConfigDict(strict=True)

    status: str
    dependencies: list[ReadyDependency]
