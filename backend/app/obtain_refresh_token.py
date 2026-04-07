# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "google-auth-oauthlib",
#   "python-dotenv",
# ]
# ///
"""
One-off script to obtain a Gmail OAuth2 refresh token.

Prerequisites:
- Register http://localhost:8080/ as an Authorized redirect URI in Google Cloud Console
  (Credentials → your OAuth 2.0 Client ID → Authorized redirect URIs)
- Make sure GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET are set in backend/.env

Usage:
    uv run app/obtain_refresh_token.py
"""

import pathlib
import sys

from dotenv import dotenv_values
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/gmail.send"]

env_path = pathlib.Path(__file__).parent.parent / ".env"
env = dotenv_values(env_path)

client_id = env.get("GMAIL_CLIENT_ID", "")
client_secret = env.get("GMAIL_CLIENT_SECRET", "")

if not client_id or not client_secret:
    print(f"ERROR: GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set in {env_path}")
    sys.exit(1)

client_config = {
    "installed": {
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uris": ["http://localhost:8080/"],
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
    }
}

flow = InstalledAppFlow.from_client_config(
    client_config,
    scopes=SCOPES,
)

creds = flow.run_local_server(port=8080, access_type="offline", prompt="consent")

print()
print("Add these to your .env file:")
print(f"GMAIL_CLIENT_ID={creds.client_id}")
print(f"GMAIL_CLIENT_SECRET={creds.client_secret}")
print(f"GMAIL_REFRESH_TOKEN={creds.refresh_token}")
