"""
HTTP endpoint for noun declensions.
"""

from fastapi import APIRouter, HTTPException, Query

from app import services
from app.models import NounLookupResponse

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
