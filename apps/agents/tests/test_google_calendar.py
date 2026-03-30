"""
Tests para tools/google/calendar.py.

Estrategia: se mockea GoogleCalendarClient._build_service para evitar
dependencia de credenciales reales de Google. Cada test configura el
mock del servicio de la API según lo que necesita verificar.

Cubre:
- GoogleCalendarClient (init, check_availability, create_event,
  list_events, get_event, update_event, delete_event)
- load_google_calendar_tools()
"""

import pytest
import sys
from pathlib import Path
from unittest.mock import patch, Mock, MagicMock

src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

from tools.google.calendar import GoogleCalendarClient, load_google_calendar_tools


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

SAMPLE_CREDS = {
    "accessToken": "test-access-token",
    "refreshToken": "test-refresh-token",
    "clientId": "test-client-id",
    "clientSecret": "test-client-secret",
}


def make_client(calendar_id="primary", timezone="UTC") -> tuple[GoogleCalendarClient, Mock]:
    """Retorna (client, mock_service) con _build_service mockeado."""
    mock_service = Mock()
    with patch.object(GoogleCalendarClient, "_build_service", return_value=mock_service):
        client = GoogleCalendarClient(SAMPLE_CREDS, calendar_id, timezone)
    return client, mock_service


# ──────────────────────────────────────────────
# GoogleCalendarClient — init
# ──────────────────────────────────────────────

class TestGoogleCalendarClientInit:

    def test_sets_calendar_id(self):
        client, _ = make_client(calendar_id="my-cal@group.calendar.google.com")
        assert client.calendar_id == "my-cal@group.calendar.google.com"

    def test_sets_timezone(self):
        client, _ = make_client(timezone="America/Mexico_City")
        assert client.timezone == "America/Mexico_City"

    def test_stores_credentials(self):
        client, _ = make_client()
        assert client.credentials == SAMPLE_CREDS

    def test_calls_build_service_on_init(self):
        with patch.object(
            GoogleCalendarClient, "_build_service", return_value=Mock()
        ) as mock_build:
            GoogleCalendarClient(SAMPLE_CREDS)
            mock_build.assert_called_once()

    def test_raises_without_access_token(self):
        """Sin access_token en credenciales, _build_service debe fallar."""
        with pytest.raises(Exception):
            GoogleCalendarClient({})  # credenciales vacías


# ──────────────────────────────────────────────
# check_availability
# ──────────────────────────────────────────────

class TestCheckAvailability:

    def test_available_when_no_busy_periods(self):
        client, svc = make_client()
        svc.freebusy.return_value.query.return_value.execute.return_value = {
            "calendars": {"primary": {"busy": []}}
        }

        result = client.check_availability(
            "2026-03-26T10:00:00Z", "2026-03-26T11:00:00Z"
        )

        assert result["available"] is True
        assert result["busy_periods"] == []

    def test_not_available_when_busy_periods_exist(self):
        client, svc = make_client()
        busy = [{"start": "2026-03-26T10:00:00Z", "end": "2026-03-26T11:00:00Z"}]
        svc.freebusy.return_value.query.return_value.execute.return_value = {
            "calendars": {"primary": {"busy": busy}}
        }

        result = client.check_availability(
            "2026-03-26T10:00:00Z", "2026-03-26T11:00:00Z"
        )

        assert result["available"] is False
        assert len(result["busy_periods"]) == 1

    def test_returns_start_and_end_times(self):
        client, svc = make_client()
        svc.freebusy.return_value.query.return_value.execute.return_value = {
            "calendars": {"primary": {"busy": []}}
        }

        result = client.check_availability("2026-03-26T10:00:00Z", "2026-03-26T11:00:00Z")

        assert result["start_time"] == "2026-03-26T10:00:00Z"
        assert result["end_time"] == "2026-03-26T11:00:00Z"

    def test_raises_on_api_error(self):
        client, svc = make_client()
        svc.freebusy.return_value.query.return_value.execute.side_effect = Exception("API error")

        with pytest.raises(Exception, match="API error"):
            client.check_availability("2026-03-26T10:00:00Z", "2026-03-26T11:00:00Z")


# ──────────────────────────────────────────────
# create_event
# ──────────────────────────────────────────────

class TestCreateEvent:

    def _mock_insert_response(self, svc):
        svc.events.return_value.insert.return_value.execute.return_value = {
            "id": "event-abc",
            "summary": "Reunión de prueba",
            "start": {"dateTime": "2026-03-26T10:00:00-06:00"},
            "end": {"dateTime": "2026-03-26T11:00:00-06:00"},
            "htmlLink": "https://calendar.google.com/event?id=event-abc",
        }

    def test_returns_event_id(self):
        client, svc = make_client()
        self._mock_insert_response(svc)

        result = client.create_event(
            summary="Reunión de prueba",
            start_time="2026-03-26T10:00:00",
            end_time="2026-03-26T11:00:00",
        )

        assert result["event_id"] == "event-abc"

    def test_returns_summary(self):
        client, svc = make_client()
        self._mock_insert_response(svc)

        result = client.create_event("Reunión de prueba", "2026-03-26T10:00:00", "2026-03-26T11:00:00")
        assert result["summary"] == "Reunión de prueba"

    def test_returns_html_link(self):
        client, svc = make_client()
        self._mock_insert_response(svc)

        result = client.create_event("Test", "2026-03-26T10:00:00", "2026-03-26T11:00:00")
        assert result["link"] == "https://calendar.google.com/event?id=event-abc"

    def test_sends_updates_when_attendees_provided(self):
        client, svc = make_client()
        self._mock_insert_response(svc)

        client.create_event(
            "Meeting",
            "2026-03-26T10:00:00",
            "2026-03-26T11:00:00",
            attendees=["a@test.com", "b@test.com"],
        )

        call_kwargs = svc.events.return_value.insert.call_args[1]
        assert call_kwargs["sendUpdates"] == "all"

    def test_no_updates_when_no_attendees(self):
        client, svc = make_client()
        self._mock_insert_response(svc)

        client.create_event("Meeting", "2026-03-26T10:00:00", "2026-03-26T11:00:00")

        call_kwargs = svc.events.return_value.insert.call_args[1]
        assert call_kwargs["sendUpdates"] == "none"

    def test_raises_on_api_error(self):
        client, svc = make_client()
        svc.events.return_value.insert.return_value.execute.side_effect = Exception("API error")

        with pytest.raises(Exception):
            client.create_event("Test", "2026-03-26T10:00:00", "2026-03-26T11:00:00")


# ──────────────────────────────────────────────
# list_events
# ──────────────────────────────────────────────

class TestListEvents:

    def test_returns_list_of_events(self):
        client, svc = make_client()
        svc.events.return_value.list.return_value.execute.return_value = {
            "items": [
                {
                    "id": "ev-1",
                    "summary": "Evento 1",
                    "start": {"dateTime": "2026-03-26T10:00:00Z"},
                    "end": {"dateTime": "2026-03-26T11:00:00Z"},
                    "attendees": [{"email": "x@test.com"}],
                }
            ]
        }

        result = client.list_events("2026-03-26T00:00:00Z", "2026-03-27T00:00:00Z")

        assert len(result) == 1
        assert result[0]["event_id"] == "ev-1"
        assert result[0]["summary"] == "Evento 1"
        assert "x@test.com" in result[0]["attendees"]

    def test_returns_empty_list_when_no_events(self):
        client, svc = make_client()
        svc.events.return_value.list.return_value.execute.return_value = {"items": []}

        result = client.list_events("2026-03-26T00:00:00Z", "2026-03-27T00:00:00Z")
        assert result == []

    def test_handles_events_without_attendees(self):
        client, svc = make_client()
        svc.events.return_value.list.return_value.execute.return_value = {
            "items": [
                {
                    "id": "ev-1",
                    "summary": "Solo event",
                    "start": {"dateTime": "2026-03-26T10:00:00Z"},
                    "end": {"dateTime": "2026-03-26T11:00:00Z"},
                }
            ]
        }

        result = client.list_events("2026-03-26T00:00:00Z", "2026-03-27T00:00:00Z")
        assert result[0]["attendees"] == []

    def test_passes_max_results(self):
        client, svc = make_client()
        svc.events.return_value.list.return_value.execute.return_value = {"items": []}

        client.list_events("2026-03-26T00:00:00Z", "2026-03-27T00:00:00Z", max_results=5)

        call_kwargs = svc.events.return_value.list.call_args[1]
        assert call_kwargs["maxResults"] == 5


# ──────────────────────────────────────────────
# get_event
# ──────────────────────────────────────────────

class TestGetEvent:

    def test_returns_event_details(self):
        client, svc = make_client()
        svc.events.return_value.get.return_value.execute.return_value = {
            "id": "event-xyz",
            "summary": "Mi reunión",
            "description": "Descripción de prueba",
            "start": {"dateTime": "2026-03-26T10:00:00Z"},
            "end": {"dateTime": "2026-03-26T11:00:00Z"},
            "location": "Sala 1",
            "attendees": [{"email": "a@test.com"}],
            "htmlLink": "https://cal.google.com/link",
        }

        result = client.get_event("event-xyz")

        assert result["event_id"] == "event-xyz"
        assert result["summary"] == "Mi reunión"
        assert result["description"] == "Descripción de prueba"
        assert result["location"] == "Sala 1"
        assert "a@test.com" in result["attendees"]
        assert result["link"] == "https://cal.google.com/link"

    def test_calls_api_with_correct_ids(self):
        client, svc = make_client(calendar_id="my-cal")
        svc.events.return_value.get.return_value.execute.return_value = {
            "id": "ev-1",
            "summary": "Test",
            "start": {"dateTime": "2026-03-26T10:00:00Z"},
            "end": {"dateTime": "2026-03-26T11:00:00Z"},
        }

        client.get_event("ev-1")

        svc.events.return_value.get.assert_called_once_with(
            calendarId="my-cal", eventId="ev-1"
        )

    def test_raises_on_api_error(self):
        client, svc = make_client()
        svc.events.return_value.get.return_value.execute.side_effect = Exception("Not found")

        with pytest.raises(Exception, match="Not found"):
            client.get_event("nonexistent")


# ──────────────────────────────────────────────
# delete_event
# ──────────────────────────────────────────────

class TestDeleteEvent:

    def test_returns_true_on_success(self):
        client, svc = make_client()
        svc.events.return_value.delete.return_value.execute.return_value = None

        result = client.delete_event("event-123")
        assert result is True

    def test_calls_api_with_correct_ids(self):
        client, svc = make_client(calendar_id="my-cal")
        svc.events.return_value.delete.return_value.execute.return_value = None

        client.delete_event("event-123")

        svc.events.return_value.delete.assert_called_once_with(
            calendarId="my-cal", eventId="event-123"
        )

    def test_raises_on_api_error(self):
        client, svc = make_client()
        svc.events.return_value.delete.return_value.execute.side_effect = Exception("Forbidden")

        with pytest.raises(Exception, match="Forbidden"):
            client.delete_event("event-123")


# ──────────────────────────────────────────────
# update_event
# ──────────────────────────────────────────────

class TestUpdateEvent:

    def _mock_get_and_update(self, svc, existing_event=None):
        if existing_event is None:
            existing_event = {
                "id": "ev-1",
                "summary": "Original",
                "start": {"dateTime": "2026-03-26T10:00:00Z"},
                "end": {"dateTime": "2026-03-26T11:00:00Z"},
            }
        svc.events.return_value.get.return_value.execute.return_value = existing_event
        svc.events.return_value.update.return_value.execute.return_value = {
            "id": "ev-1",
            "summary": existing_event.get("summary", "Updated"),
            "start": {"dateTime": "2026-03-26T10:00:00Z"},
            "end": {"dateTime": "2026-03-26T11:00:00Z"},
        }

    def test_updates_summary(self):
        client, svc = make_client()
        self._mock_get_and_update(svc)
        # Actualizar solo el título
        svc.events.return_value.update.return_value.execute.return_value = {
            "id": "ev-1",
            "summary": "Nuevo título",
            "start": {"dateTime": "2026-03-26T10:00:00Z"},
            "end": {"dateTime": "2026-03-26T11:00:00Z"},
        }

        result = client.update_event("ev-1", summary="Nuevo título")

        assert result["summary"] == "Nuevo título"

    def test_returns_event_id(self):
        client, svc = make_client()
        self._mock_get_and_update(svc)

        result = client.update_event("ev-1", summary="Test")

        assert result["event_id"] == "ev-1"

    def test_raises_on_api_error(self):
        client, svc = make_client()
        svc.events.return_value.get.return_value.execute.side_effect = Exception("API error")

        with pytest.raises(Exception):
            client.update_event("ev-1", summary="Test")


# ──────────────────────────────────────────────
# load_google_calendar_tools
# ──────────────────────────────────────────────

class TestLoadGoogleCalendarTools:

    @patch.object(GoogleCalendarClient, "_build_service", return_value=Mock())
    def test_returns_six_tools(self, _):
        result = load_google_calendar_tools(SAMPLE_CREDS, {"calendar_id": "primary"})
        assert len(result) == 6

    @patch.object(GoogleCalendarClient, "_build_service", return_value=Mock())
    def test_returns_list_of_tools(self, _):
        result = load_google_calendar_tools(SAMPLE_CREDS, {})
        assert isinstance(result, list)

    @patch.object(GoogleCalendarClient, "_build_service", return_value=Mock())
    def test_tool_names_are_strings(self, _):
        result = load_google_calendar_tools(SAMPLE_CREDS, {})
        for tool in result:
            assert isinstance(tool.name, str)

    def test_returns_empty_list_on_client_init_failure(self):
        with patch.object(
            GoogleCalendarClient, "_build_service", side_effect=Exception("Auth failed")
        ):
            result = load_google_calendar_tools({}, {})
        assert result == []

    @patch.object(GoogleCalendarClient, "_build_service", return_value=Mock())
    def test_uses_config_calendar_id(self, _):
        with patch("tools.google.calendar.GoogleCalendarClient") as mock_cls:
            mock_cls.return_value = Mock()
            load_google_calendar_tools(
                SAMPLE_CREDS, {"calendar_id": "custom@group.calendar.google.com", "timezone": "America/Mexico_City"}
            )
            mock_cls.assert_called_once_with(
                SAMPLE_CREDS,
                "custom@group.calendar.google.com",
                "America/Mexico_City",
            )

    @patch.object(GoogleCalendarClient, "_build_service", return_value=Mock())
    def test_default_calendar_id_is_primary(self, _):
        with patch("tools.google.calendar.GoogleCalendarClient") as mock_cls:
            mock_cls.return_value = Mock()
            load_google_calendar_tools(SAMPLE_CREDS, {})
            call_args = mock_cls.call_args[0]
            assert call_args[1] == "primary"
