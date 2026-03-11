from __future__ import annotations

from collections import Counter
from typing import Any


def build_query_brief_markdown(
    query_result: dict[str, Any],
    *,
    title: str | None = None,
) -> str:
    query = query_result.get("query", "")
    results = query_result.get("results", [])
    heading = title or f"Query Brief: {query}"

    top_levels = Counter(item.get("top_level", "") for item in results if item.get("top_level"))
    extensions = Counter(item.get("extension", "") for item in results if item.get("extension"))

    lines = [
        f"# {heading}",
        "",
        "## Director View",
        "",
        f"- Query: `{query}`",
        f"- Matched documents: {len(results)}",
    ]

    if results:
        lines.append(
            "- Coverage: "
            + ", ".join(f"`{name}` ({count})" for name, count in top_levels.most_common(5))
        )
        lines.append(
            "- File mix: "
            + ", ".join(f"`{name}` ({count})" for name, count in extensions.most_common(5))
        )
        lines.append(
            f"- Strongest hit: `{results[0].get('path', '')}`"
        )
    else:
        lines.append("- No evidence was found in the current local index for this query.")

    lines.extend(
        [
            "",
            "## Operational Readout",
            "",
        ]
    )

    if results:
        newest = max(results, key=lambda item: item.get("modified_at", ""))
        largest = max(results, key=lambda item: item.get("size_bytes", 0))
        lines.append(f"- Newest matching file: `{newest.get('path', '')}` | {newest.get('modified_at', '')}")
        lines.append(f"- Largest matching file: `{largest.get('path', '')}` | {largest.get('size_bytes', 0)} bytes")
        if len(top_levels) == 1:
            lines.append(f"- Concentration: all current hits sit inside `{next(iter(top_levels))}`.")
        else:
            lines.append("- Concentration: the current hits span more than one working area, so this topic crosses functions.")
    else:
        lines.append("- The current index may be too narrow for this question, or the term may need a more specific query.")

    lines.extend(
        [
            "",
            "## Granular Evidence",
            "",
        ]
    )

    if results:
        for item in results:
            lines.append(
                f"- `{item.get('path', '')}` | {item.get('modified_at', '')} | {item.get('size_bytes', 0)} bytes | {item.get('snippet', '')}"
            )
    else:
        lines.append("- No matching indexed documents.")

    lines.extend(
        [
            "",
            "## Planning Output",
            "",
        ]
    )

    if results:
        lines.append(f"- Review `{results[0].get('path', '')}` first because it is the strongest direct hit.")
        if len(top_levels) > 1:
            lines.append("- Compare the top hits across folders to separate accounting detail, sales detail, and strategy context.")
        else:
            lines.append("- Expand the search with adjacent terms or index more folders if you need broader context.")
        lines.append("- Use the evidence list above as the source-linked pack for any next summary, memo, or follow-up question.")
    else:
        lines.append("- Re-run `search-index` with more top-level folders, then try a narrower business term.")
        lines.append("- Add Gmail once OAuth is working so this topic can include email context, not just files.")

    lines.append("")
    return "\n".join(lines)


def build_gmail_brief_markdown(
    profile_name: str,
    profile_result: dict[str, Any],
    *,
    title: str | None = None,
) -> str:
    results = profile_result.get("messages", [])
    query = profile_result.get("query", "")
    heading = title or f"Gmail Brief: {profile_name}"

    senders = Counter(item.get("from", "") for item in results if item.get("from"))
    recipients = Counter(item.get("to", "") for item in results if item.get("to"))

    lines = [
        f"# {heading}",
        "",
        "## Director View",
        "",
        f"- Profile: `{profile_name}`",
        f"- Query: `{query}`",
        f"- Matched emails: {len(results)}",
    ]

    if results:
        lines.append(
            "- Main senders: "
            + ", ".join(f"`{name}` ({count})" for name, count in senders.most_common(5))
        )
        lines.append(
            f"- Newest sampled email: `{results[0].get('subject', '')}` | {results[0].get('date', '')}"
        )
    else:
        lines.append("- No emails matched this profile in the current mailbox view.")

    lines.extend(
        [
            "",
            "## Operational Readout",
            "",
        ]
    )

    if results:
        lines.append(
            "- Primary recipients: "
            + ", ".join(f"`{name}` ({count})" for name, count in recipients.most_common(5))
        )
        unique_threads = len({item.get("thread_id", "") for item in results if item.get("thread_id")})
        lines.append(f"- Distinct sampled threads: {unique_threads}")
        if senders:
            lines.append(f"- Sender concentration: the top sender is `{senders.most_common(1)[0][0]}`.")
    else:
        lines.append("- Recheck the profile terms or widen the mailbox date range.")

    lines.extend(
        [
            "",
            "## Granular Evidence",
            "",
        ]
    )

    if results:
        for item in results:
            lines.append(
                f"- `{item.get('date', '')}` | From: `{item.get('from', '')}` | Subject: `{item.get('subject', '')}` | {item.get('snippet', '')}"
            )
    else:
        lines.append("- No matching emails.")

    lines.extend(
        [
            "",
            "## Planning Output",
            "",
        ]
    )

    if results:
        lines.append("- Review the newest and the most repeated sender threads first.")
        lines.append("- Cross-check the email evidence with the file index when a sender mentions invoices, quotations, shipments, or cash.")
        lines.append("- Use this brief as the email evidence pack for a follow-up summary or action list.")
    else:
        lines.append("- Expand the profile or confirm the mailbox you authenticated is the one you expect.")
        lines.append("- If supplier or internal email still seems missing, add more sender aliases to the profile query.")

    lines.append("")
    return "\n".join(lines)
