import uuid
from collections.abc import Awaitable, Callable

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

REQUEST_ID_HEADER = "X-Request-ID"

_logger = structlog.get_logger("app.request_context")


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Bind a request id, route, and method to the structlog context for the request.

    The request id is taken from an inbound X-Request-ID header if present,
    otherwise generated. It is echoed back as a response header and exposed on
    request.state.request_id so handlers can attach more context.

    On the way out we emit a single ``request_completed`` log line *while*
    contextvars are still bound, so request_id, user_id, org_id, etc. survive
    into the line. Other middleware can run outside of this one without losing
    the correlation id.
    """

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        inbound = request.headers.get(REQUEST_ID_HEADER)
        request_id = inbound if inbound else uuid.uuid4().hex
        request.state.request_id = request_id

        tokens = structlog.contextvars.bind_contextvars(
            request_id=request_id,
            path=request.url.path,
            method=request.method,
        )

        try:
            response = await call_next(request)
            _logger.info("request_completed", status_code=response.status_code)
            response.headers[REQUEST_ID_HEADER] = request_id
            return response
        finally:
            structlog.contextvars.reset_contextvars(**tokens)
