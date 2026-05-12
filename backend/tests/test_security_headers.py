from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.security_headers import SECURITY_HEADERS, SecurityHeadersMiddleware


def test_security_headers_applied_to_all_responses() -> None:
    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware)

    @app.get("/ping")
    def ping() -> dict[str, str]:
        return {"status": "ok"}

    with TestClient(app) as client:
        response = client.get("/ping")
    assert response.status_code == 200
    for header, value in SECURITY_HEADERS.items():
        assert response.headers[header] == value
