"""Password hashing.

`hashlib.scrypt` rather than bcrypt or argon2: it is memory-hard, it is what
OpenSSL already provides, and it keeps the backend's dependency list to the five
libraries the application genuinely cannot run without. A password hasher is not
in that category - this file is the whole story, short enough to read start to
finish, with no library defaults to take on trust.

The cost parameters travel inside each hash rather than living in a constant, so
a stored hash stays readable after they are raised. Nothing here depends on the
database being durable; it is written the way it would need to be written if it
were.
"""

import hmac
from hashlib import scrypt
from secrets import token_bytes

#: OWASP's baseline for scrypt: 16 MiB of memory per hash.
_COST = 2**14
_BLOCK_SIZE = 8
_PARALLELISM = 1
_SALT_BYTES = 16
_KEY_BYTES = 32

_ALGORITHM = "scrypt"


def hash_password(password: str) -> str:
    """A self-describing hash: algorithm, cost parameters, salt, key."""
    salt = token_bytes(_SALT_BYTES)
    key = _derive(password, salt, _COST, _BLOCK_SIZE, _PARALLELISM)
    return "$".join(
        [
            _ALGORITHM,
            str(_COST),
            str(_BLOCK_SIZE),
            str(_PARALLELISM),
            salt.hex(),
            key.hex(),
        ]
    )


def verify_password(password: str, encoded: str) -> bool:
    """Whether `password` produced `encoded`.

    A stored value this cannot parse reads as "does not match" rather than
    raising. The alternative would turn a corrupt row into a 500 on the sign-in
    path, which tells an attacker more than it tells the user.
    """
    try:
        algorithm, cost, block_size, parallelism, salt_hex, key_hex = encoded.split("$")
        if algorithm != _ALGORITHM:
            return False
        expected = bytes.fromhex(key_hex)
        candidate = _derive(
            password,
            bytes.fromhex(salt_hex),
            int(cost),
            int(block_size),
            int(parallelism),
        )
    except (ValueError, TypeError):
        return False

    # Constant-time, so the comparison itself leaks nothing about the hash.
    return hmac.compare_digest(candidate, expected)


def _derive(
    password: str, salt: bytes, cost: int, block_size: int, parallelism: int
) -> bytes:
    return scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=cost,
        r=block_size,
        p=parallelism,
        dklen=_KEY_BYTES,
        # scrypt needs n * r * 128 bytes; the default ceiling is below what
        # these parameters ask for, so it is raised to match rather than the
        # cost being lowered to fit it.
        maxmem=cost * block_size * 256,
    )
