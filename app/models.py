"""
Pydantic response schemas for the ruslovar API.

These models define the JSON structure returned by the API. They serve two
purposes:

1. Validation — FastAPI ensures that the data returned by services matches
   these schemas before sending it to the client.

2. Documentation — FastAPI auto-generates OpenAPI docs from these models,
   so the interactive /docs endpoint shows the exact response shape.

The structural keys are in English for developer accessibility, while the
values (gender, case names, words) remain in Russian. See docs/api.md for
the full rationale.
"""

from pydantic import BaseModel


class CaseForms(BaseModel):
    """
    Declension forms for a single grammatical number (singular or plural).

    All six standard Russian cases are always present. If a particular form
    does not exist for a given noun, the value is None. An empty object is
    used when the entire number (e.g., plural for singular-only nouns) is
    absent.
    """

    nominative: str | None = None
    genitive: str | None = None
    dative: str | None = None
    accusative: str | None = None
    instrumental: str | None = None
    prepositional: str | None = None


class AdditionalForms(BaseModel):
    """
    Rare or archaic case forms that appear for a small subset of nouns.

    These are always present in the response for schema stability, but are
    None unless the noun has such a form.
    """

    partitive: str | None = None  # парт — e.g., чаю
    locative: str | None = None  # мест — e.g., в лесу
    vocative: str | None = None  # зват — e.g., боже
    counting: str | None = None  # счет — e.g., два часа


class NounDeclensionResponse(BaseModel):
    """
    Full declension table for a Russian noun.

    Fields:
        word: The surface form submitted by the client.
        root: The dictionary form (lemma) resolved from word.
        gender: Grammatical gender (муж, жен, ср, общ) or None.
        animacy: True for animate, False for inanimate, None for unknown.
        singular: Singular declensions. Empty if the noun has no singular.
        plural: Plural declensions. Empty if the noun has no plural.
        additional_forms: Rare/archaic forms. Always present.
    """

    word: str
    root: str
    invariant: bool
    gender: str | None = None
    animacy: bool | None = None
    singular: CaseForms
    plural: CaseForms
    additional_forms: AdditionalForms
