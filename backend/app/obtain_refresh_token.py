"""
One-off script to obtain a Gmail OAuth2 refresh token.

Prerequisites:
- Register http://localhost:8080/ as an Authorized redirect URI in Google Cloud Console
  (Credentials → your OAuth 2.0 Client ID → Authorized redirect URIs)
- Download the OAuth client JSON and save it as client_secret.json next to this script

Usage:
    uv pip install google-auth-oauthlib
    python app/obtain_refresh_token.py
"""

from google_auth_oauthlib.flow import InstalledAppFlow
import pathlib

SCOPES = ["https://www.googleapis.com/auth/gmail.send"]
CLIENT_SECRET_FILE = pathlib.Path(__file__).parent.parent / "client_secret.json"

flow = InstalledAppFlow.from_client_secrets_file(
    CLIENT_SECRET_FILE,
    scopes=SCOPES,
)

creds = flow.run_local_server(port=8080, access_type="offline", prompt="consent")

print()
print("Add these to your .env file:")
print(f"GMAIL_CLIENT_ID={creds.client_id}")
print(f"GMAIL_CLIENT_SECRET={creds.client_secret}")
print(f"GMAIL_REFRESH_TOKEN={creds.refresh_token}")
