import sys

import httpx


def main() -> int:
    try:
        with httpx.Client(timeout=3) as client:
            response = client.get("http://127.0.0.1:8000/health/ready")
            response.raise_for_status()
            payload = response.json()
            return 0 if payload.get("status") == "ok" else 1
    except Exception:
        return 1


if __name__ == "__main__":
    sys.exit(main())
