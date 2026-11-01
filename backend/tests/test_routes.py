"""Tests for the HTTP layer that need no database: status codes and error mapping."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.db import get_session
from app.main import app
from app.metrics import service


@pytest.fixture
def client():
    app.dependency_overrides[get_session] = lambda: None
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_health_returns_200_with_counts(client, monkeypatch):
    counts = {"candidates": 1500, "jobs": 80, "applications": 6000, "recruiter_events": 11758}
    monkeypatch.setattr(service, "health", lambda session: {"status": "ok", "tables": counts})

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "tables": counts}


def test_health_returns_503_when_the_database_is_down(client, monkeypatch):
    def down(session):
        raise OperationalError("SELECT 1", {}, Exception("connection refused"))

    monkeypatch.setattr(service, "health", down)

    response = client.get("/api/health")

    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}


def test_unknown_dimension_is_a_422(client):
    assert client.get("/api/segments", params={"dimension": "bogus"}).status_code == 422
