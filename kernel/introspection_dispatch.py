"""Dispatch read-only introspection envelopes to the kernel introspection layer."""

from typing import Any, Dict

from kernel.introspection import IntrospectionLayer


_INTROSPECTION_PREFIX = "introspection."


def handle_introspection(
    envelope: Dict[str, Any],
    layer: IntrospectionLayer,
) -> Dict[str, Any]:
    """Handle a Worker/kernel introspection envelope.

    Worker envelopes carry the operation in ``type`` and query options in
    ``payload``.  The standalone console contract may provide ``kind``
    directly, so both representations are accepted without changing the
    canonical kernel envelope format.
    """
    if not isinstance(envelope, dict):
        raise ValueError("introspection envelope must be an object")

    raw_kind = envelope.get("kind")
    if raw_kind is None:
        message_type = envelope.get("type")
        if not isinstance(message_type, str) or not message_type.startswith(_INTROSPECTION_PREFIX):
            raise ValueError("introspection envelope must include a valid kind")
        raw_kind = message_type[len(_INTROSPECTION_PREFIX):]

    if not isinstance(raw_kind, str):
        raise ValueError("introspection kind must be a string")

    payload = envelope.get("payload", {})
    if not isinstance(payload, dict):
        raise ValueError("introspection payload must be an object")

    filters = payload.get("filters", payload)
    if not isinstance(filters, dict):
        filters = {}

    limit = payload.get("limit", 100)
    offset = payload.get("offset", 0)
    if not isinstance(limit, int) or isinstance(limit, bool) or not 0 <= limit <= 1000:
        raise ValueError("introspection limit must be an integer from 0 to 1000")
    if not isinstance(offset, int) or isinstance(offset, bool) or offset < 0:
        raise ValueError("introspection offset must be a non-negative integer")

    return layer.handle_introspection(raw_kind, filters, limit=limit, offset=offset)
