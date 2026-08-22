"""
Aggregates all API route modules.

When new grammar types are added (e.g., adjectives), they should be
included here so that main.py only needs to import this single router.
"""

from fastapi import APIRouter

from app.api import nouns

api_router = APIRouter()
api_router.include_router(nouns.router)
