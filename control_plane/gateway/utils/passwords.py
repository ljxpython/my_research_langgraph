from __future__ import annotations

import hashlib
import hmac
import os


def hash_password(password: str) -> str:
    """PBKDF2 password hash.

Avoids binary deps (bcrypt/argon2) for Phase-1 bootstrap.
Format: pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>
"""

    iterations = 200_000
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${dk.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algo, iter_s, salt_hex, hash_hex = password_hash.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        iterations = int(iter_s)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(hash_hex)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False
