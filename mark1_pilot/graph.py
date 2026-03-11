from __future__ import annotations

from typing import TypedDict

from .config import PilotConfig
from .connectors.gmail import GmailProbe
from .connectors.google_drive import GoogleDriveProbe
from .inventory import render_inventory_markdown, scan_local_root
from .review import build_review_markdown


class PilotState(TypedDict, total=False):
    config: PilotConfig
    inventory: dict
    inventory_markdown: str
    drive_probe: dict
    gmail_client: dict
    gmail_probe: dict
    review_markdown: str


def inventory_node(state: PilotState) -> PilotState:
    config = state["config"]
    inventory = scan_local_root(config.drive.local_root_path)
    return {
        "inventory": inventory,
        "inventory_markdown": render_inventory_markdown(inventory),
    }


def probe_node(state: PilotState) -> PilotState:
    config = state["config"]
    drive_probe = GoogleDriveProbe(
        service_account_json=config.drive.service_account_path,
        folder_id=config.drive.google_drive_folder_id,
    ).probe()
    gmail = GmailProbe(
        client_secret_json=config.gmail.client_secret_path,
        token_json=config.gmail.token_path,
    )
    gmail_client = gmail.validate_client_config()
    gmail_probe = gmail.probe()
    return {
        "drive_probe": drive_probe,
        "gmail_client": gmail_client,
        "gmail_probe": gmail_probe,
    }


def review_node(state: PilotState) -> PilotState:
    return {
        "review_markdown": build_review_markdown(
            config=state["config"],
            inventory=state["inventory"],
            drive_probe=state["drive_probe"],
            gmail_client=state["gmail_client"],
            gmail_probe=state["gmail_probe"],
        )
    }


def build_pilot_graph():
    try:
        from langgraph.graph import END, StateGraph
    except ImportError as exc:
        raise RuntimeError(
            "LangGraph is not installed. Install it with `pip install langgraph`."
        ) from exc

    graph = StateGraph(PilotState)
    graph.add_node("inventory", inventory_node)
    graph.add_node("probe", probe_node)
    graph.add_node("review", review_node)
    graph.set_entry_point("inventory")
    graph.add_edge("inventory", "probe")
    graph.add_edge("probe", "review")
    graph.add_edge("review", END)
    return graph.compile()
