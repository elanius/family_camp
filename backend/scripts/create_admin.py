"""
Create an admin user in the database.

Usage (from the backend/ directory):
    uv run python scripts/create_admin.py --username admin --password secret
"""

import argparse
import asyncio
import sys
from pathlib import Path

# Ensure the backend package is importable when run from any directory.
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import close_db, get_db
from app.services.auth import hash_password


async def create_admin(username: str, password: str) -> None:
    db = get_db()
    collection = db["admin_users"]

    existing = await collection.find_one({"username": username})
    if existing:
        print(f"Error: admin user '{username}' already exists.")
        sys.exit(1)

    await collection.insert_one({"username": username, "hashed_password": hash_password(password)})
    print(f"Admin user '{username}' created successfully.")
    await close_db()


def main() -> None:
    parser = argparse.ArgumentParser(description="Create an admin user.")
    parser.add_argument("--username", required=True, help="Admin username")
    parser.add_argument("--password", required=True, help="Admin password (will be hashed)")
    args = parser.parse_args()

    if len(args.password) < 8:
        print("Error: password must be at least 8 characters.")
        sys.exit(1)

    asyncio.run(create_admin(args.username, args.password))


if __name__ == "__main__":
    main()
