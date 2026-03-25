from __future__ import annotations

import re
from typing import Any


def _normalize_text(*parts: str) -> str:
    return " ".join(str(part or "").strip().lower() for part in parts if str(part or "").strip())


def _dedupe(values: list[str]) -> list[str]:
    output: list[str] = []
    seen: set[str] = set()
    for value in values:
        cleaned = str(value or "").strip()
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            output.append(cleaned)
    return output


def _archetype(searchable: str) -> str:
    if re.search(r"(factory|manufactur|industrial|plant|warehouse|raw material|production)", searchable):
        return "factory"
    if re.search(r"(distributor|wholesale|trading|retail|dealer|import|export|buyer)", searchable):
        return "distribution"
    if re.search(r"(spa|clinic|hotel|restaurant|school|agency|studio|salon|service)", searchable):
        return "services"
    return "owner_led_business"


def _pain_signals(archetype: str, searchable: str) -> list[str]:
    signals: list[str] = []
    if archetype == "factory":
        signals.extend(
            [
                "Operational follow-up is likely split across chat, inbox, and spreadsheets.",
                "Supplier, receiving, stock, and quality risk probably show up too late.",
            ]
        )
    elif archetype == "distribution":
        signals.extend(
            [
                "Commercial and supply follow-up are likely fragmented across inboxes and trackers.",
                "Cash, stock, and sales signals probably sit in separate sheets with weak ownership.",
            ]
        )
    else:
        signals.extend(
            [
                "Daily work is likely managed through ad hoc messages, spreadsheets, and manual follow-up.",
                "Leadership visibility is probably weak once the owner is not personally chasing every task.",
            ]
        )

    if re.search(r"(facebook|instagram|tiktok|booking|appointment)", searchable):
        signals.append("Customer communication and demand signals are likely happening outside any structured control layer.")
    if re.search(r"(import|shipment|customs|eta)", searchable):
        signals.append("Inbound timing and supplier communication likely create surprise delays.")
    return _dedupe(signals)


def _offer_for_archetype(archetype: str) -> dict[str, Any]:
    if archetype == "factory":
        return {
            "service_pack": "Factory Control",
            "wedge": "Action OS",
            "starter_modules": ["Receiving Control", "Inventory Pulse", "Supplier Watch"],
            "semi_products": ["Document Intake", "Director Flash", "Attendance Check-In"],
            "pilot_scope": "Launch one manager board, one inbound receipt board, and one stock watch queue for a single site or function.",
            "why_now": "This gives the team one operating layer first, then removes blind spots around incoming materials and execution risk.",
        }
    if archetype == "distribution":
        return {
            "service_pack": "Commercial Control",
            "wedge": "Action OS",
            "starter_modules": ["Cash Watch", "Sales Signal", "Supplier Watch"],
            "semi_products": ["Document Intake", "Reply Draft", "Director Flash"],
            "pilot_scope": "Launch one action board, one overdue or follow-up queue, and one sales or supplier watch layer.",
            "why_now": "This cuts manual chasing and makes commercial risk visible before it becomes a cash or supply problem.",
        }
    return {
        "service_pack": "Owner / Director OS",
        "wedge": "Action OS",
        "starter_modules": ["Cash Watch", "Sales Signal"],
        "semi_products": ["Director Flash", "Document Intake", "Reply Draft"],
        "pilot_scope": "Launch one action board, one director flash, and one targeted control module around the business bottleneck.",
        "why_now": "This is the fastest path from owner-dependent follow-up to a repeatable operating rhythm.",
    }


def _discovery_questions(archetype: str) -> list[str]:
    common = [
        "Where do important follow-ups get missed today?",
        "Which updates still depend on one person chasing everyone manually?",
        "What is the first queue you wish you could see every morning?",
    ]
    if archetype == "factory":
        common.extend(
            [
                "How do you currently track incoming receipt, stock variance, and hold status?",
                "Which supplier or quality issues usually get noticed too late?",
            ]
        )
    elif archetype == "distribution":
        common.extend(
            [
                "How do you track overdue follow-up, promised payments, and sales signals today?",
                "Where do supplier updates and stock pressure currently live?",
            ]
        )
    else:
        common.extend(
            [
                "Which daily updates would you most want turned into one manager board?",
                "What customer or operational signals currently live outside any system?",
            ]
        )
    return common[:5]


def _outreach_message(name: str, offer: dict[str, Any], pain_signals: list[str]) -> str:
    top_signal = pain_signals[0] if pain_signals else "manual follow-up is eating time"
    return (
        f"Hi {name} team, we build lightweight AI operating systems for companies still running on Gmail, Drive, "
        f"Sheets, and manual follow-up. From your public profile, it looks like {top_signal.lower()} "
        f"We would start with {offer['wedge']} and a short {offer['service_pack']} pilot so you get one live board first, "
        f"then add {', '.join(offer['starter_modules'][:2])}. If useful, we can show a 14-day rollout plan on your current workflow."
    )


def build_lead_to_pilot_pack(*, leads: list[dict[str, Any]], campaign_goal: str = "") -> dict[str, Any]:
    opportunities: list[dict[str, Any]] = []
    sector_counts: dict[str, int] = {}

    for lead in leads:
        name = str(lead.get("name") or "Unknown lead").strip()
        searchable = _normalize_text(
            name,
            str(lead.get("snippet") or ""),
            str(lead.get("website") or ""),
            str(lead.get("source_url") or ""),
            " ".join(str(item) for item in lead.get("fit_reasons") or []),
        )
        archetype = _archetype(searchable)
        sector_counts[archetype] = sector_counts.get(archetype, 0) + 1
        offer = _offer_for_archetype(archetype)
        pains = _pain_signals(archetype, searchable)

        opportunities.append(
            {
                "name": name,
                "archetype": archetype,
                "service_pack": offer["service_pack"],
                "wedge_product": offer["wedge"],
                "starter_modules": offer["starter_modules"],
                "semi_products": offer["semi_products"],
                "pain_signals": pains,
                "why_now": offer["why_now"],
                "pilot_scope": offer["pilot_scope"],
                "outreach_subject": f"{name}: {offer['wedge']} + {offer['service_pack']} pilot",
                "outreach_message": _outreach_message(name, offer, pains),
                "discovery_questions": _discovery_questions(archetype),
                "source_url": str(lead.get("source_url") or lead.get("website") or "").strip(),
                "contact_hint": str(lead.get("email") or lead.get("phone") or lead.get("website") or "Public source only").strip(),
            }
        )

    dominant_archetype = max(sector_counts, key=sector_counts.get) if sector_counts else "owner_led_business"
    dominant_offer = _offer_for_archetype(dominant_archetype)

    summary = (
        f"SuperMega should approach this shortlist with {dominant_offer['wedge']} as the wedge and "
        f"{dominant_offer['service_pack']} as the commercial framing. "
        f"Use the free proof tools to open the conversation, then sell one live board plus the first control module."
    )
    if campaign_goal:
        summary = f"{summary} Campaign goal: {campaign_goal.strip()}."

    return {
        "status": "ready",
        "campaign_goal": campaign_goal.strip(),
        "summary": summary,
        "dominant_archetype": dominant_archetype,
        "recommended_play": {
            "wedge_product": dominant_offer["wedge"],
            "service_pack": dominant_offer["service_pack"],
            "starter_modules": dominant_offer["starter_modules"],
            "semi_products": dominant_offer["semi_products"],
        },
        "opportunity_count": len(opportunities),
        "opportunities": opportunities,
    }
