"""Password hashing. Nothing here touches the database or the API."""

from app.security import hash_password, verify_password


def test_a_password_verifies_against_its_own_hash() -> None:
    assert verify_password("correct horse", hash_password("correct horse"))


def test_a_wrong_password_does_not_verify() -> None:
    assert not verify_password("Correct horse", hash_password("correct horse"))


def test_the_password_is_not_recoverable_from_the_hash() -> None:
    assert "correct horse" not in hash_password("correct horse")


def test_the_same_password_hashes_differently_every_time() -> None:
    """Salted, so identical passwords do not produce identical rows.

    Without this, the users table would quietly report which accounts share a
    password to anyone who could read it.
    """
    assert hash_password("correct horse") != hash_password("correct horse")


def test_the_hash_records_the_parameters_it_used() -> None:
    """So a hash stays readable after the cost is raised for new ones."""
    algorithm, cost, block_size, parallelism, salt, key = hash_password("x").split("$")

    assert algorithm == "scrypt"
    assert (int(cost), int(block_size), int(parallelism)) == (16384, 8, 1)
    assert len(bytes.fromhex(salt)) == 16
    assert len(bytes.fromhex(key)) == 32


def test_an_unreadable_stored_hash_is_a_mismatch_not_a_crash() -> None:
    """A corrupt row should refuse the sign-in, not 500 on the way past it."""
    for damaged in ["", "not-a-hash", "scrypt$only$four$parts", "bcrypt$1$1$1$aa$bb"]:
        assert not verify_password("correct horse", damaged)
