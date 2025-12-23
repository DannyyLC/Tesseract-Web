"""
Google Calendar Tools

DOCUMENTACIÓN OFICIAL:
https://developers.google.com/calendar/api/v3/reference

AUTENTICACIÓN:
Usa OAuth 2.0. Las credenciales deben incluir:
- access_token: Token de acceso (expira en ~1 hora)
- refresh_token: Para obtener nuevos access_tokens
- client_id: ID de cliente OAuth
- client_secret: Secret de cliente OAuth

CONFIGURACIÓN (TenantTool.config):
{
    "calendar_id": "primary",  # O ID específico del calendario
    "timezone": "America/Mexico_City"
}

TOOLS DISPONIBLES:
1. check_availability: Verifica si un slot está disponible
2. create_event: Crea un nuevo evento
3. list_events: Lista eventos en un rango de fechas
4. get_event: Obtiene detalles de un evento específico
5. update_event: Actualiza un evento existente
6. delete_event: Elimina un evento
"""

from typing import Any, Optional
from langchain_core.tools import BaseTool, tool
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)


# ==========================================
# Cliente de Google Calendar
# ==========================================
class GoogleCalendarClient:
    """
    Cliente wrapper para Google Calendar API.
    
    Maneja la autenticación y proporciona métodos
    para interactuar con el calendario.
    """
    
    def __init__(
        self,
        credentials: dict[str, Any],
        calendar_id: str = "primary",
        timezone: str = "UTC"
    ):
        """
        Inicializa el cliente de Google Calendar.
        
        Args:
            credentials: Dict con access_token, refresh_token, client_id, client_secret
            calendar_id: ID del calendario (default: "primary")
            timezone: Zona horaria (default: "UTC")
        """
        self.calendar_id = calendar_id
        self.timezone = timezone
        self.credentials = credentials
        
        # Inicializar servicio
        self.service = self._build_service()
    
    def _build_service(self):
        """
        Construye el servicio de Google Calendar con autenticación.
        
        Returns:
            Resource: Servicio de Google Calendar
        """
        try:
            from google.oauth2.credentials import Credentials
            from googleapiclient.discovery import build
            
            # Crear credenciales OAuth
            creds = Credentials(
                token=self.credentials["access_token"],
                refresh_token=self.credentials.get("refresh_token"),
                token_uri="https://oauth2.googleapis.com/token",
                client_id=self.credentials.get("client_id"),
                client_secret=self.credentials.get("client_secret"),
                scopes=["https://www.googleapis.com/auth/calendar"]
            )
            
            # Construir servicio
            service = build('calendar', 'v3', credentials=creds)
            
            logger.info(f"Google Calendar service initialized for calendar: {self.calendar_id}")
            return service
        
        except ImportError:
            logger.error(
                "Google Calendar dependencies not installed. "
                "Run: poetry add google-auth google-auth-oauthlib google-api-python-client"
            )
            raise
        
        except Exception as e:
            logger.error(f"Failed to initialize Google Calendar service: {e}")
            raise
    
    def check_availability(self, start_time: str, end_time: str) -> dict:
        """
        Verifica disponibilidad en un rango de tiempo.
        
        Args:
            start_time: Tiempo inicio en formato ISO 8601 (YYYY-MM-DDTHH:MM:SS)
            end_time: Tiempo fin en formato ISO 8601
        
        Returns:
            Dict con información de disponibilidad
        """
        try:
            # Usar freebusy API para verificar disponibilidad
            body = {
                "timeMin": start_time,
                "timeMax": end_time,
                "timeZone": self.timezone,
                "items": [{"id": self.calendar_id}]
            }
            
            response = self.service.freebusy().query(body=body).execute()
            
            # Obtener períodos ocupados
            busy_periods = response['calendars'][self.calendar_id].get('busy', [])
            
            is_available = len(busy_periods) == 0
            
            return {
                "available": is_available,
                "busy_periods": busy_periods,
                "start_time": start_time,
                "end_time": end_time
            }
        
        except Exception as e:
            logger.error(f"Error checking availability: {e}")
            raise
    
    def create_event(
        self,
        summary: str,
        start_time: str,
        end_time: str,
        description: Optional[str] = None,
        attendees: Optional[list[str]] = None,
        location: Optional[str] = None
    ) -> dict:
        """
        Crea un nuevo evento en el calendario.
        
        Args:
            summary: Título del evento
            start_time: Tiempo inicio (ISO 8601)
            end_time: Tiempo fin (ISO 8601)
            description: Descripción opcional
            attendees: Lista de emails de asistentes
            location: Ubicación del evento
        
        Returns:
            Dict con información del evento creado
        """
        try:
            event = {
                'summary': summary,
                'start': {
                    'dateTime': start_time,
                    'timeZone': self.timezone,
                },
                'end': {
                    'dateTime': end_time,
                    'timeZone': self.timezone,
                },
            }
            
            if description:
                event['description'] = description
            
            if location:
                event['location'] = location
            
            if attendees:
                event['attendees'] = [{'email': email} for email in attendees]
            
            # Crear evento
            result = self.service.events().insert(
                calendarId=self.calendar_id,
                body=event,
                sendUpdates='all' if attendees else 'none'
            ).execute()
            
            logger.info(f"Event created: {result['id']}")
            
            return {
                "event_id": result['id'],
                "summary": result['summary'],
                "start": result['start']['dateTime'],
                "end": result['end']['dateTime'],
                "link": result.get('htmlLink')
            }
        
        except Exception as e:
            logger.error(f"Error creating event: {e}")
            raise
    
    def list_events(
        self,
        time_min: str,
        time_max: str,
        max_results: int = 10
    ) -> list[dict]:
        """
        Lista eventos en un rango de tiempo.
        
        Args:
            time_min: Tiempo mínimo (ISO 8601)
            time_max: Tiempo máximo (ISO 8601)
            max_results: Número máximo de resultados
        
        Returns:
            Lista de eventos
        """
        try:
            events_result = self.service.events().list(
                calendarId=self.calendar_id,
                timeMin=time_min,
                timeMax=time_max,
                maxResults=max_results,
                singleEvents=True,
                orderBy='startTime'
            ).execute()
            
            events = events_result.get('items', [])
            
            return [
                {
                    "event_id": event['id'],
                    "summary": event.get('summary', 'No title'),
                    "start": event['start'].get('dateTime', event['start'].get('date')),
                    "end": event['end'].get('dateTime', event['end'].get('date')),
                    "attendees": [a['email'] for a in event.get('attendees', [])]
                }
                for event in events
            ]
        
        except Exception as e:
            logger.error(f"Error listing events: {e}")
            raise
    
    def get_event(self, event_id: str) -> dict:
        """
        Obtiene detalles de un evento específico.
        
        Args:
            event_id: ID del evento
        
        Returns:
            Dict con información del evento
        """
        try:
            event = self.service.events().get(
                calendarId=self.calendar_id,
                eventId=event_id
            ).execute()
            
            return {
                "event_id": event['id'],
                "summary": event.get('summary'),
                "description": event.get('description'),
                "start": event['start'].get('dateTime', event['start'].get('date')),
                "end": event['end'].get('dateTime', event['end'].get('date')),
                "location": event.get('location'),
                "attendees": [a['email'] for a in event.get('attendees', [])],
                "link": event.get('htmlLink')
            }
        
        except Exception as e:
            logger.error(f"Error getting event {event_id}: {e}")
            raise
    
    def update_event(
        self,
        event_id: str,
        summary: Optional[str] = None,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        description: Optional[str] = None,
        attendees: Optional[list[str]] = None,
        location: Optional[str] = None
    ) -> dict:
        """
        Actualiza un evento existente.
        
        Args:
            event_id: ID del evento
            summary: Nuevo título (opcional)
            start_time: Nueva hora inicio (opcional)
            end_time: Nueva hora fin (opcional)
            description: Nueva descripción (opcional)
            attendees: Nueva lista de emails de asistentes (opcional)
            location: Nueva ubicación (opcional)
        
        Returns:
            Dict con información actualizada
        """
        try:
            # Primero obtener el evento actual
            event = self.service.events().get(
                calendarId=self.calendar_id,
                eventId=event_id
            ).execute()
            
            # Actualizar campos proporcionados
            if summary:
                event['summary'] = summary
            
            if start_time:
                event['start']['dateTime'] = start_time
            
            if end_time:
                event['end']['dateTime'] = end_time
            
            if description:
                event['description'] = description
            
            if attendees is not None:
                event['attendees'] = [{'email': email} for email in attendees]
            
            if location:
                event['location'] = location
            
            # Actualizar evento
            updated_event = self.service.events().update(
                calendarId=self.calendar_id,
                eventId=event_id,
                body=event
            ).execute()
            
            logger.info(f"Event updated: {event_id}")
            
            return {
                "event_id": updated_event['id'],
                "summary": updated_event['summary'],
                "start": updated_event['start']['dateTime'],
                "end": updated_event['end']['dateTime']
            }
        
        except Exception as e:
            logger.error(f"Error updating event {event_id}: {e}")
            raise
    
    def delete_event(self, event_id: str) -> bool:
        """
        Elimina un evento.
        
        Args:
            event_id: ID del evento a eliminar
        
        Returns:
            True si se eliminó correctamente
        """
        try:
            self.service.events().delete(
                calendarId=self.calendar_id,
                eventId=event_id
            ).execute()
            
            logger.info(f"Event deleted: {event_id}")
            return True
        
        except Exception as e:
            logger.error(f"Error deleting event {event_id}: {e}")
            raise


# ==========================================
# Tools para LangChain
# ==========================================
def load_google_calendar_tools(
    credentials: dict[str, Any],
    config: dict[str, Any]
) -> list[BaseTool]:
    """
    Carga todas las tools de Google Calendar.
    
    Args:
        credentials: OAuth credentials con access_token, refresh_token, etc
        config: Configuración del tenant (calendar_id, timezone)
    
    Returns:
        Lista de tools de Google Calendar
    """
    
    # Extraer configuración
    calendar_id = config.get("calendar_id", "primary")
    timezone = config.get("timezone", "UTC")
    
    logger.info(
        f"Loading Google Calendar tools for calendar: {calendar_id}, "
        f"timezone: {timezone}"
    )
    
    # Inicializar cliente
    try:
        client = GoogleCalendarClient(credentials, calendar_id, timezone)
    except Exception as e:
        logger.error(f"Failed to initialize Google Calendar client: {e}")
        # Retornar lista vacía si falla la inicialización
        return []
    
    # ==========================================
    # Definir tools
    # ==========================================
    @tool
    def check_calendar_availability(date: str, time: str, duration_minutes: int = 60) -> str:
        """
        Verifica si un slot está disponible en Google Calendar.
        
        Args:
            date: Fecha en formato YYYY-MM-DD (ej: "2025-12-25")
            time: Hora en formato HH:MM (ej: "15:00")
            duration_minutes: Duración en minutos (default: 60)
        
        Returns:
            Mensaje indicando si está disponible o ocupado
        """
        try:
            # Convertir a formato ISO 8601
            start_dt = datetime.fromisoformat(f"{date}T{time}:00")
            end_dt = start_dt + timedelta(minutes=duration_minutes)
            
            start_iso = start_dt.isoformat()
            end_iso = end_dt.isoformat()
            
            result = client.check_availability(start_iso, end_iso)
            
            if result['available']:
                return f"Disponible: {date} a las {time} por {duration_minutes} minutos"
            else:
                busy_info = ", ".join([
                    f"{b['start']} - {b['end']}"
                    for b in result['busy_periods']
                ])
                return f"Ocupado: {date} a las {time}. Períodos ocupados: {busy_info}"
        
        except Exception as e:
            return f"Error verificando disponibilidad: {str(e)}"
    
    @tool
    def create_calendar_event(
        title: str,
        date: str,
        start_time: str,
        duration_minutes: int = 60,
        description: str = "",
        attendees: str = "",
        location: str = ""
    ) -> str:
        """
        Crea un nuevo evento en Google Calendar.
        
        Args:
            title: Título del evento
            date: Fecha en formato YYYY-MM-DD
            start_time: Hora inicio en formato HH:MM
            duration_minutes: Duración en minutos
            description: Descripción del evento
            attendees: Emails de asistentes separados por comas
            location: Ubicación del evento
        
        Returns:
            Confirmación con ID y link del evento
        """
        try:
            # Convertir a formato ISO 8601
            start_dt = datetime.fromisoformat(f"{date}T{start_time}:00")
            end_dt = start_dt + timedelta(minutes=duration_minutes)
            
            start_iso = start_dt.isoformat()
            end_iso = end_dt.isoformat()
            
            # Procesar attendees
            attendee_list = [
                email.strip()
                for email in attendees.split(",")
                if email.strip()
            ] if attendees else None
            
            result = client.create_event(
                summary=title,
                start_time=start_iso,
                end_time=end_iso,
                description=description or None,
                attendees=attendee_list,
                location=location or None
            )
            
            return (
                f"Evento creado: '{result['summary']}'\n"
                f"{result['start']} - {result['end']}\n"
                f"{result['link']}\n"
                f"ID: {result['event_id']}"
            )
        
        except Exception as e:
            return f"Error creando evento: {str(e)}"
    
    @tool
    def list_calendar_events(start_date: str, end_date: str, max_results: int = 10) -> str:
        """
        Lista eventos en un rango de fechas.
        
        Args:
            start_date: Fecha inicio (YYYY-MM-DD)
            end_date: Fecha fin (YYYY-MM-DD)
            max_results: Máximo número de eventos a retornar
        
        Returns:
            Lista formateada de eventos
        """
        try:
            # Convertir a ISO 8601
            start_iso = f"{start_date}T00:00:00"
            end_iso = f"{end_date}T23:59:59"
            
            events = client.list_events(start_iso, end_iso, max_results)
            
            if not events:
                return f"No hay eventos entre {start_date} y {end_date}"
            
            result = [f"Eventos encontrados ({len(events)}):"]
            for event in events:
                attendees_str = f" - Asistentes: {', '.join(event['attendees'])}" if event['attendees'] else ""
                result.append(
                    f"\n{event['summary']}\n"
                    f"{event['start']}{attendees_str}"
                )
            
            return "\n".join(result)
        
        except Exception as e:
            return f"Error listando eventos: {str(e)}"
    
    @tool
    def delete_calendar_event(event_id: str) -> str:
        """
        Elimina un evento de Google Calendar.
        
        Args:
            event_id: ID del evento a eliminar
        
        Returns:
            Confirmación de eliminación
        """
        try:
            client.delete_event(event_id)
            return f"Evento {event_id} eliminado correctamente"
        
        except Exception as e:
            return f"Error eliminando evento: {str(e)}"
    
    @tool
    def update_calendar_event(
        event_id: str,
        title: str = "",
        date: str = "",
        start_time: str = "",
        duration_minutes: int = 0,
        description: str = "",
        attendees: str = "",
        location: str = ""
    ) -> str:
        """
        Actualiza un evento existente en Google Calendar.
        
        Args:
            event_id: ID del evento a actualizar (requerido)
            title: Nuevo título del evento (opcional)
            date: Nueva fecha en formato YYYY-MM-DD (opcional)
            start_time: Nueva hora inicio en formato HH:MM (opcional)
            duration_minutes: Nueva duración en minutos (opcional)
            description: Nueva descripción (opcional)
            attendees: Nuevos asistentes (emails separados por comas) (opcional)
            location: Nueva ubicación (opcional)
        
        Returns:
            Confirmación con los cambios realizados
        """
        try:
            # Preparar parámetros a actualizar
            update_params = {"event_id": event_id}
            
            if title:
                update_params["summary"] = title
            
            if date and start_time:
                start_dt = datetime.fromisoformat(f"{date}T{start_time}:00")
                update_params["start_time"] = start_dt.isoformat()
                
                if duration_minutes > 0:
                    end_dt = start_dt + timedelta(minutes=duration_minutes)
                    update_params["end_time"] = end_dt.isoformat()
            
            if description:
                update_params["description"] = description
            
            if attendees:
                attendee_list = [
                    email.strip()
                    for email in attendees.split(",")
                    if email.strip()
                ]
                update_params["attendees"] = attendee_list
            
            if location:
                update_params["location"] = location
            
            # Actualizar evento
            result = client.update_event(**update_params)
            
            return (
                f"Evento actualizado: '{result['summary']}'\n"
                f"{result['start']} - {result['end']}\n"
                f"ID: {result['event_id']}"
            )
        
        except Exception as e:
            return f"Error actualizando evento: {str(e)}"
    
    @tool
    def get_calendar_event_details(event_id: str) -> str:
        """
        Obtiene detalles completos de un evento.
        
        Args:
            event_id: ID del evento
        
        Returns:
            Información detallada del evento
        """
        try:
            event = client.get_event(event_id)
            
            result = [
                f"{event['summary']}",
                f"{event['start']} - {event['end']}",
            ]
            
            if event.get('description'):
                result.append(f"{event['description']}")
            
            if event.get('location'):
                result.append(f"{event['location']}")
            
            if event.get('attendees'):
                result.append(f"Asistentes: {', '.join(event['attendees'])}")
            
            if event.get('link'):
                result.append(f"{event['link']}")
            
            return "\n".join(result)
        
        except Exception as e:
            return f"Error obteniendo evento: {str(e)}"
    
    # Retornar todas las tools
    return [
        check_calendar_availability,
        create_calendar_event,
        list_calendar_events,
        update_calendar_event,
        delete_calendar_event,
        get_calendar_event_details,
    ]
