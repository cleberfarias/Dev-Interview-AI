#!/usr/bin/env python3
"""Utility: create a Firebase Auth user (RH) via Admin SDK.

Usage:
  python create_rh_user.py <email> <password> [display_name]

The script uses the project's Firebase Admin credentials (GOOGLE_APPLICATION_CREDENTIALS
or FIREBASE_SERVICE_ACCOUNT_PATH / FIREBASE_SERVICE_ACCOUNT_JSON).
"""
import sys
from backend.app.firebase_admin import init_firebase
from firebase_admin import auth


def main():
    if len(sys.argv) < 3:
        print("Usage: create_rh_user.py <email> <password> [display_name]")
        sys.exit(2)

    email = sys.argv[1]
    password = sys.argv[2]
    display_name = sys.argv[3] if len(sys.argv) > 3 else None

    init_firebase()

    try:
        user = auth.create_user(email=email, password=password, display_name=display_name)
        print(f"Created user: uid={user.uid} email={user.email}")
    except auth.EmailAlreadyExistsError:
        print("Error: email already in use")
    except Exception as exc:
        print("Failed to create user:", exc)


if __name__ == '__main__':
    main()
