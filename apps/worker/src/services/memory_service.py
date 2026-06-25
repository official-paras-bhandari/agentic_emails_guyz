import requests
import json
from typing import Dict, Any, List, Optional
from src.config import config

class MemoryService:
    def __init__(self):
        # Derive API URL from WEBHOOK_URL or similar
        # If WEBHOOK_URL is http://localhost:3000/api/webhooks/worker
        # We want http://localhost:3000/api/worker/memory
        base_url = config.WEBHOOK_URL.split("/api/webhooks/worker")[0]
        self.api_url = f"{base_url}/api/worker/memory"
        self.headers = {"X-Internal-Api-Key": config.INTERNAL_API_KEY} if config.INTERNAL_API_KEY else {}

    def get_relevant_memory(self, workspace_id: str, lead_id: str, campaign_id: Optional[str] = None) -> Dict[str, Any]:
        params = {
            "workspaceId": workspace_id,
            "leadId": lead_id
        }
        if campaign_id:
            params["campaignId"] = campaign_id
            
        try:
            response = requests.get(self.api_url, params=params, headers=self.headers, timeout=10)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"Error fetching memory: {e}")
            return {"workspace": [], "lead": [], "campaign": [], "outcomes": []}

    def get_workspace_memory(self, workspace_id: str) -> List[Dict[str, Any]]:
        params = {"workspaceId": workspace_id}
        try:
            response = requests.get(self.api_url, params=params, headers=self.headers, timeout=10)
            response.raise_for_status()
            return response.json().get("workspace", [])
        except Exception as e:
            print(f"Error fetching workspace memory: {e}")
            return []

    def create_memory(self, memory_type: str, data: Dict[str, Any]):
        """
        memory_type: workspace_memory | lead_memory | campaign_memory | outcome_memory
        """
        payload = {
            "type": memory_type,
            "data": data
        }
        try:
            response = requests.post(self.api_url, json=payload, headers=self.headers, timeout=10)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"Error creating memory: {e}")
            return None

memory_service = MemoryService()
