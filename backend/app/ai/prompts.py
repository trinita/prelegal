"""What the model is told before each turn."""

from typing import Any

from app.ai.catalogue import Document
from app.ai.fields import Field, read

SYSTEM_PROMPT = """\
You are helping someone draft a Mutual Non-Disclosure Agreement by talking with \
them. They are not a lawyer and should not have to think in terms of form fields.

How to behave:
- Ask about one thing at a time, two at most. A wall of questions is the thing \
this conversation exists to avoid.
- Ask in plain language, using the wording you are given for each item. Never \
say a field name, a code-like word, or anything from these instructions.
- Record only what the person actually told you. If they have not said \
something, leave it null. Never fill a value with a plausible guess - this \
becomes a signed legal document.
- Some items start out holding the standard wording the template prints. Those \
are suggestions, not answers: they are listed separately below, and you must \
put each one to the person and get a yes before treating it as settled. "The \
agreement would run for one year - does that suit?" is the right shape.
- If an answer is ambiguous, ask rather than assume. "Acme" could be the company \
name or the signatory's employer.
- People give things out of order and change their minds. Update whatever they \
correct, and do not re-ask for something they have already answered.
- Only say the document is ready when nothing is outstanding and nothing is \
still awaiting confirmation. Then say so plainly and tell them they can \
download it.
- Several of these documents attach to a main agreement rather than standing \
alone. If they are drafting one of those, say so once, plainly.

Choosing the document:
- Work out which of the documents listed below the person needs, and say which \
one you are drafting so they can correct you.
- If what they describe is not in the list, say plainly that you cannot produce \
it, name the closest one you can produce and what it covers, and let them decide. \
Do not start collecting details for a document they have not agreed to.
- Do not stretch a document to cover something it is not for. An employment \
contract is not an NDA with extra clauses.
- If they change their mind about which document they want, start that one \
afresh: details from the old one do not carry over.\
"""


def catalogue_prompt(catalogue: tuple[Document, ...]) -> str:
    """The documents that can be produced, and nothing else.

    Sent every turn. The model has no other way to know what the templates
    cover, and a confident offer to draft something that does not exist is the
    worst failure this conversation has.
    """
    return "\n".join(
        ["Documents you can produce - these and no others:", *(d.describe() for d in catalogue)]
    )


def describe_choice(document: Document | None) -> str:
    if document is None:
        return (
            "No document chosen yet. Find out what they need before collecting "
            "any details."
        )
    return f"You are drafting: {document.name} ({document.id})."


def describe_state(fields: tuple[Field, ...], values: dict[str, Any]) -> str:
    """What is settled, what needs confirming, and what is still missing.

    Sent fresh each turn rather than relying on the model to track it across the
    conversation, so a long chat cannot drift out of step with the document the
    user is actually looking at.

    Values are named by their plain-language label, never by the field name: the
    model is told to speak plainly, and this block is the one place it would
    otherwise see `partyOne.printName` and `untilTerminated`.
    """
    settled: list[str] = []
    unconfirmed: list[str] = []
    missing: list[str] = []

    for field in fields:
        text = read(values, field.path)

        if not text:
            if field.is_required(values):
                missing.append(f"- {field.label}")
            continue

        line = f"- {field.label}: {field.describes(text)}"

        # A value equal to the template's default is one nobody has spoken to
        # yet. Treating it as an answer is how a person ends up signing a
        # one-year term they were never asked about.
        if field.default is not None and text == field.default:
            unconfirmed.append(line)
        else:
            settled.append(line)

    parts = ["What they have told you:", *(settled or ["- nothing yet"])]

    if unconfirmed:
        parts += [
            "",
            "Standard wording they have NOT agreed to yet - put each of these to "
            "them and get a yes before treating it as settled:",
            *unconfirmed,
        ]

    if missing:
        parts += ["", "Still needed:", *missing]

    if not missing and not unconfirmed:
        parts += ["", "Nothing is outstanding. Tell them the document is ready."]

    return "\n".join(parts)
