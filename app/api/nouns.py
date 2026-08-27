"""
HTTP endpoint for noun declensions.
"""

from fastapi import APIRouter, HTTPException, Query
from pymysql import MySQLError

from app import services
from app.models import NounLookupResponse
from app.models import NounBatchRequest, NounBatchResponse, NounBatchItem

router = APIRouter(prefix="/nouns", tags=["nouns"])


@router.get(
    "/{word}/declensions",
    response_model=NounLookupResponse,
    summary="Get noun declensions",
    description=(
        "Returns the full declension table for a Russian noun. "
        "The input may be in dictionary form or any declined form. "
        "Use strict=true to require dictionary form."
    ),
)
def get_noun_declensions(
    word: str,
    strict: bool = Query(
        False,
        description="If true, the word must be in dictionary form.",
    ),
):
    """
    GET /nouns/{word}/declensions

    Args:
        word: The Russian noun to look up (Cyrillic, UTF-8).
        strict: If True, return 404 if the word is not in dictionary form.

    Returns:
        NounLookupResponse with the full declension table.

    Raises:
        HTTPException 404 if the word is not found or strict mode fails.
    """
    try:
        return services.get_noun_declensions(word=word, strict=strict)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post(
    "/batch",
    response_model=NounBatchResponse,
    summary="Batch noun declensions",
    description=(
        "Returns declension tables for multiple Russian nouns. "
        "Each word is processed independently; lookup failures (word not "
        "found, strict mode violations) are returned as per-item errors "
        "with HTTP 200. Non-200 responses occur only for system errors "
        "(malformed request, database unreachable)."
    ),
)
def get_batch_noun_declensions(request: NounBatchRequest):
    """
    POST /nouns/batch

    Args:
        request: NounBatchRequest containing the words and strict flag.

    Returns:
        NounBatchResponse with one result per input word.
    """
    results = []

    # request includes a simple list of lookup words; query each one
    for word in request.words:
        try:
            lookup_result = services.get_noun_declensions(word=word, strict=request.strict)
            status = "success"
            error = None
        except LookupError as e:
            status = "error"
            lookup_result = None
            error = str(e)
        except MySQLError:
            raise HTTPException(status_code=503, detail="Database unavailable")

        results.append(
            NounBatchItem(
                word=word,
                status=status,
                result=lookup_result,
                error=error,
            )
        )

    return NounBatchResponse(results=results)
