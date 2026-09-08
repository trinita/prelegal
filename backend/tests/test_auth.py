"""The fake login. No password is checked; the point is that the session works."""

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def test_login_creates_a_user_and_starts_a_session(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={"name": "Ada Lovelace"})

    assert response.status_code == 200
    assert response.json()["name"] == "Ada Lovelace"
    assert "prelegal_session" in response.cookies


def test_signing_in_again_with_the_same_name_returns_the_same_user(
    client: TestClient,
) -> None:
    first = client.post("/api/auth/login", json={"name": "Ada Lovelace"})
    client.post("/api/auth/logout")
    second = client.post("/api/auth/login", json={"name": "Ada Lovelace"})

    assert first.json()["id"] == second.json()["id"]


def test_different_names_are_different_users(client: TestClient) -> None:
    first = client.post("/api/auth/login", json={"name": "Ada Lovelace"})
    second = client.post("/api/auth/login", json={"name": "Grace Hopper"})

    assert first.json()["id"] != second.json()["id"]


def test_surrounding_whitespace_does_not_create_a_second_account(
    client: TestClient,
) -> None:
    first = client.post("/api/auth/login", json={"name": "Ada Lovelace"})
    second = client.post("/api/auth/login", json={"name": "  Ada Lovelace  "})

    assert first.json()["id"] == second.json()["id"]


def test_a_blank_name_is_rejected(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={"name": "   "})

    assert response.status_code == 422


def test_me_returns_the_signed_in_user(client: TestClient) -> None:
    client.post("/api/auth/login", json={"name": "Ada Lovelace"})

    response = client.get("/api/auth/me")

    assert response.status_code == 200
    assert response.json()["name"] == "Ada Lovelace"


def test_me_is_unauthorised_before_signing_in(client: TestClient) -> None:
    assert client.get("/api/auth/me").status_code == 401


def test_logout_ends_the_session(client: TestClient) -> None:
    client.post("/api/auth/login", json={"name": "Ada Lovelace"})

    logout = client.post("/api/auth/logout")

    assert logout.status_code == 204
    assert client.get("/api/auth/me").status_code == 401


def test_a_cookie_naming_a_missing_user_reads_as_signed_out(
    client: TestClient,
) -> None:
    # What every browser holds after a restart, since the database is rebuilt.
    client.cookies.set("prelegal_session", "4242")

    assert client.get("/api/auth/me").status_code == 401


def test_a_malformed_cookie_reads_as_signed_out(client: TestClient) -> None:
    client.cookies.set("prelegal_session", "not-a-user-id")

    assert client.get("/api/auth/me").status_code == 401


def test_the_cookie_name_comes_from_this_app_s_settings(tmp_path) -> None:
    """Routers must read the settings the app was built with.

    Resolving them from a process-wide cache instead would ignore whatever was
    passed to `create_app`, which is invisible while every value matches the
    default - and wrong the moment one does not.
    """
    settings = Settings(
        database_path=tmp_path / "prelegal.db",
        static_dir=tmp_path / "no-frontend-here",
        session_cookie_name="a_different_cookie",
    )

    with TestClient(create_app(settings)) as client:
        response = client.post("/api/auth/login", json={"name": "Ada Lovelace"})

        assert "a_different_cookie" in response.cookies
        assert client.get("/api/auth/me").status_code == 200
