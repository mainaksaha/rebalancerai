import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# Hardcoded demo user until auth is added
DEMO_USER_ID = "00000000-0000-0000-0000-000000000001"

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        url = os.environ.get("SUPABASE_URL", "")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env")
        _client = create_client(url, key)
    return _client
