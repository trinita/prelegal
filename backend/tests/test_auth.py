"""Registering, signing in, and the session cookie.

PL-7's login took a name and trusted it. These tests describe what replaced it:
an account with a password that is actually checked, and a cookie that cannot be
written by hand.
"""

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.models import AuthSession
from tests.conftest import ACCOUNT


def test_signing_up_creates_an_account_and_signs_it_in(client: TestClient) -> None:
    response = client.post("/api/auth/signup", json=ACCOUNT)

    assert response.status_code == 201
    assert response.json()["email"] == "ada@example.com"
    assert response.json()["name"] == "Ada Lovelace"
    assert "prelegal_session" in response.cookies
    assert client.get("/api/auth/me").status_code == 200


def test_the_password_is_never_sent_back(client: TestClient) -> None:
    body = client.post("/api/auth/signup", json=ACCOUNT).json()

    assert "password" not in body
    assert "password_hash" not in body


def test_a_second_account_cannot_take_the_same_address(client: TestClient) -> None:
    client.post("/api/auth/signup", json=ACCOUNT)

    response = client.post("/api/auth/signup", json={**ACCOUNT, "name": "Imposter"})

    assert response.status_code == 409


def test_the_address_is_matched_regardless_of_case(client: TestClient) -> None:
    client.post("/api/auth/signup", json=ACCOUNT)

    taken = client.post("/api/auth/signup", json={**ACCOUNT, "email": "ADA@example.com"})

    assert taken.status_code == 409


def test_a_short_password_is_rejected(client: TestClient) -> None:
    response = client.post("/api/auth/signup", json={**ACCOUNT, "password": "short"})

    assert response.status_code == 422


def test_an_address_without_an_at_sign_is_rejected(client: TestClient) -> None:
    response = client.post("/api/auth/signup", json={**ACCOUNT, "email": "ada"})

    assert response.status_code == 422


def test_a_blank_name_is_rejected(client: TestClient) -> None:
    response = client.post("/api/auth/signup", json={**ACCOUNT, "name": "   "})

    assert response.status_code == 422


def test_signing_in_with_the_right_password_returns_the_same_account(
    client: TestClient,
) -> None:
    registered = client.post("/api/auth/signup", json=ACCOUNT)
    client.post("/api/auth/logout")

    signed_in = client.post(
        "/api/auth/login",
        json={"email": ACCOUNT["email"], "password": ACCOUNT["password"]},
    )

    assert signed_in.status_code == 200
    assert signed_in.json()["id"] == registered.json()["id"]


def test_the_wrong_password_is_refused(client: TestClient) -> None:
    client.post("/api/auth/signup", json=ACCOUNT)
    client.post("/api/auth/logout")

    response = client.post(
        "/api/auth/login", json={"email": ACCOUNT["email"], "password": "not it"}
    )

    assert response.status_code == 401
    assert client.get("/api/auth/me").status_code == 401


def test_an_unknown_address_is_refused_in_the_same_words_as_a_wrong_password(
    client: TestClient,
) -> None:
    """Otherwise the sign-in form answers "does this person have an account?"."""
    client.post("/api/auth/signup", json=ACCOUNT)
    client.post("/api/auth/logout")

    wrong_password = client.post(
        "/api/auth/login", json={"email": ACCOUNT["email"], "password": "not it"}
    )
    unknown_address = client.post(
        "/api/auth/login", json={"email": "nobody@example.com", "password": "not it"}
    )

    assert wrong_password.status_code == unknown_address.status_code == 401
    assert wrong_password.json()["detail"] == unknown_address.json()["detail"]


def test_me_returns_the_signed_in_user(signed_in: TestClient) -> None:
    assert signed_in.get("/api/auth/me").json()["name"] == "Ada Lovelace"


def test_me_is_unauthorised_before_signing_in(client: TestClient) -> None:
    assert client.get("/api/auth/me").status_code == 401


def test_logout_ends_the_session(signed_in: TestClient) -> None:
    assert signed_in.post("/api/auth/logout").status_code == 204
    assert signed_in.get("/api/auth/me").status_code == 401


def test_logout_deletes_the_session_row_not_just_the_cookie(
    signed_in: TestClient, session_factory
) -> None:
    """A token whose row survives is still a live credential to anyone holding it.

    Clearing the cookie only tells the browser to forget it; this is what makes
    signing out mean something to the server as well.
    """
    with session_factory() as db:
        assert db.query(AuthSession).count() == 1

    signed_in.post("/api/auth/logout")

    with session_factory() as db:
        assert db.query(AuthSession).count() == 0


def test_logging_out_when_already_signed_out_is_not_an_error(
    client: TestClient,
) -> None:
    assert client.post("/api/auth/logout").status_code == 204


def test_a_forged_cookie_does_not_sign_anyone_in(signed_in: TestClient) -> None:
    """The hole PL-7 left open, closed.

    Its cookie held a plain user id, so typing `1` was enough to become the
    first person who ever signed up. The value is a random token now, and one
    that was never issued names nobody.
    """
    signed_in.cookies.set("prelegal_session", "1")

    assert signed_in.get("/api/auth/me").status_code == 401


def test_a_tampered_token_does_not_sign_anyone_in(signed_in: TestClient) -> None:
    issued = signed_in.cookies["prelegal_session"]
    signed_in.cookies.set("prelegal_session", "A" + issued[1:])

    assert signed_in.get("/api/auth/me").status_code == 401


def test_a_cookie_from_before_a_restart_reads_as_signed_out(
    client: TestClient,
) -> None:
    """What every browser holds after a restart, since the database is rebuilt."""
    client.cookies.set("prelegal_session", "a-token-nobody-issued")

    assert client.get("/api/auth/me").status_code == 401


def test_signing_out_of_one_browser_leaves_another_signed_in(
    client: TestClient,
) -> None:
    client.post("/api/auth/signup", json=ACCOUNT)
    first = client.cookies["prelegal_session"]
    client.post(
        "/api/auth/login",
        json={"email": ACCOUNT["email"], "password": ACCOUNT["password"]},
    )

    client.post("/api/auth/logout")
    client.cookies.set("prelegal_session", first)

    assert client.get("/api/auth/me").status_code == 200


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
        response = client.post("/api/auth/signup", json=ACCOUNT)

        assert "a_different_cookie" in response.cookies
        assert client.get("/api/auth/me").status_code == 200
