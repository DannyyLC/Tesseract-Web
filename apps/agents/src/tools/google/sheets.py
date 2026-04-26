"""
Google Sheets Tools

DOCUMENTACIÓN OFICIAL:
https://developers.google.com/sheets/api/reference/rest

AUTENTICACIÓN:
Usa OAuth 2.0. Las credenciales deben incluir:
- access_token: Token de acceso
- refresh_token: Para obtener nuevos access_tokens
- client_id: ID de cliente OAuth
- client_secret: Secret de cliente OAuth

CONFIGURACIÓN (TenantTool.config):
{
    "spreadsheet_id": "ID_DE_LA_HOJA_DE_CALCULO"  # Opcional
}

TOOLS DISPONIBLES:
1. read_sheet: Lee valores de un rango
2. update_sheet_range: Actualiza valores en un rango
3. append_row: Añade una fila al final
4. create_spreadsheet: Crea un nuevo archvo
5. add_sheet: Añade una nueva pestaña
6. delete_sheet: Elimina una pestaña
7. clear_sheet_range: Borra valores de un rango
8. format_cells: Da formato básico a un rango
"""

from typing import Any, Optional
from langchain_core.tools import BaseTool, tool
import logging

logger = logging.getLogger(__name__)

class GoogleSheetsClient:
    """
    Cliente wrapper para Google Sheets API.
    """
    def __init__(self, credentials: dict[str, Any], default_spreadsheet_id: Optional[str] = None):
        self.credentials = credentials
        self.default_spreadsheet_id = default_spreadsheet_id
        self.service = self._build_service()

    def _build_service(self):
        try:
            from google.oauth2.credentials import Credentials
            from googleapiclient.discovery import build

            access_token = self.credentials.get("accessToken") or self.credentials.get("access_token")
            if not access_token:
                raise ValueError("Missing access token in credentials")

            creds = Credentials(
                token=access_token,
                refresh_token=self.credentials.get("refreshToken") or self.credentials.get("refresh_token"),
                token_uri="https://oauth2.googleapis.com/token",
                client_id=self.credentials.get("clientId") or self.credentials.get("client_id"),
                client_secret=self.credentials.get("clientSecret") or self.credentials.get("client_secret"),
                scopes=["https://www.googleapis.com/auth/spreadsheets"]
            )

            service = build('sheets', 'v4', credentials=creds)
            logger.info("Google Sheets service initialized")
            return service
        except ImportError:
            logger.error("Dependencies not installed. Run: poetry add google-auth google-api-python-client")
            raise
        except Exception as e:
            logger.error(f"Failed to initialize Google Sheets service: {e}")
            raise

    # ---- DATOS ----
    def read_sheet(self, spreadsheet_id: str, range_name: str) -> list[list[Any]]:
        try:
            sheet = self.service.spreadsheets()
            result = sheet.values().get(spreadsheetId=spreadsheet_id, range=range_name).execute()
            values = result.get('values', [])
            return values
        except Exception as e:
            logger.error(f"Error reading sheet {spreadsheet_id} range {range_name}: {e}")
            raise

    def append_row(self, spreadsheet_id: str, range_name: str, values: list[Any]) -> dict:
        try:
            body = {'values': [values]}
            result = self.service.spreadsheets().values().append(
                spreadsheetId=spreadsheet_id,
                range=range_name,
                valueInputOption='RAW',
                body=body
            ).execute()
            return result
        except Exception as e:
            logger.error(f"Error appending row: {e}")
            raise

    def update_sheet(self, spreadsheet_id: str, range_name: str, values: list[list[Any]]) -> dict:
        try:
            body = {'values': values}
            result = self.service.spreadsheets().values().update(
                spreadsheetId=spreadsheet_id,
                range=range_name,
                valueInputOption='RAW',
                body=body
            ).execute()
            return result
        except Exception as e:
            logger.error(f"Error updating sheet: {e}")
            raise

    def clear_range(self, spreadsheet_id: str, range_name: str) -> dict:
        try:
            result = self.service.spreadsheets().values().clear(
                spreadsheetId=spreadsheet_id,
                range=range_name,
                body={}
            ).execute()
            return result
        except Exception as e:
            logger.error(f"Error clearing range: {e}")
            raise

    # ---- ESTRUCTURA ----
    def create_spreadsheet(self, title: str) -> dict:
        try:
            spreadsheet = {'properties': {'title': title}}
            spreadsheet = self.service.spreadsheets().create(
                body=spreadsheet,
                fields='spreadsheetId,spreadsheetUrl'
            ).execute()
            return spreadsheet
        except Exception as e:
            logger.error(f"Error creating spreadsheet: {e}")
            raise

    def add_sheet(self, spreadsheet_id: str, title: str) -> dict:
        try:
            body = {
                "requests": [{
                    "addSheet": {
                        "properties": {"title": title}
                    }
                }]
            }
            result = self.service.spreadsheets().batchUpdate(
                spreadsheetId=spreadsheet_id,
                body=body
            ).execute()
            return result
        except Exception as e:
            logger.error(f"Error adding sheet: {e}")
            raise

    def delete_sheet(self, spreadsheet_id: str, sheet_id: int) -> dict:
        try:
            body = {
                "requests": [{
                    "deleteSheet": {
                        "sheetId": sheet_id
                    }
                }]
            }
            result = self.service.spreadsheets().batchUpdate(
                spreadsheetId=spreadsheet_id,
                body=body
            ).execute()
            return result
        except Exception as e:
            logger.error(f"Error deleting sheet: {e}")
            raise

    def format_cells(self, spreadsheet_id: str, range_obj: dict, format_dict: dict) -> dict:
        """
        Aplica un CellFormat básico. 
        range_obj espera algo como: {"sheetId": 0, "startRowIndex": 0, "endRowIndex": 1, "startColumnIndex": 0, "endColumnIndex": 4}
        """
        try:
            body = {
                "requests": [{
                    "repeatCell": {
                        "range": range_obj,
                        "cell": {
                            "userEnteredFormat": format_dict
                        },
                        "fields": "userEnteredFormat(backgroundColor,textFormat)"
                    }
                }]
            }
            result = self.service.spreadsheets().batchUpdate(
                spreadsheetId=spreadsheet_id,
                body=body
            ).execute()
            return result
        except Exception as e:
            logger.error(f"Error formatting cells: {e}")
            raise


def load_google_sheets_tools(
    credentials: dict[str, Any],
    config: dict[str, Any]
) -> list[BaseTool]:
    """
    Carga todas las tools de Google Sheets.
    """
    default_spreadsheet_id = config.get("spreadsheet_id", None)
    
    logger.info("Loading Google Sheets tools")
    
    try:
        client = GoogleSheetsClient(credentials, default_spreadsheet_id)
    except Exception as e:
        logger.error(f"Failed to initialize Google Sheets client: {e}")
        return []

    def _get_spreadsheet_id(provided_id: str) -> str:
        s_id = provided_id or default_spreadsheet_id
        if not s_id:
            raise ValueError("Spreadsheet ID not provided and no default configured.")
        return s_id

    # -- TOOLS DE DATOS --
    @tool
    def read_sheet(range_name: str, spreadsheet_id: str = "") -> str:
        """
        Lee datos de una hoja de cálculo en Google Sheets.
        Args:
            range_name: Rango a leer (ej: 'Hoja1!A1:D10' o 'Hoja1').
            spreadsheet_id: ID de la hoja de cálculo.
        Returns:
            Representación en texto de los valores leídos.
        """
        try:
            s_id = _get_spreadsheet_id(spreadsheet_id)
            values = client.read_sheet(s_id, range_name)
            if not values:
                return "No data found."
            lines = [", ".join([str(cell) for cell in row]) for row in values]
            return "\\n".join(lines)
        except Exception as e:
            return f"Error reading spreadsheet: {str(e)}"

    @tool
    def append_row(range_name: str, values_str: str, spreadsheet_id: str = "") -> str:
        """
        Añade una fila al final de una hoja de cálculo.
        Args:
            range_name: Rango donde agregar (ej: 'Hoja1').
            values_str: Valores separados por comas (ej: "Juan,Perez,25").
            spreadsheet_id: ID de la hoja de cálculo.
        """
        try:
            s_id = _get_spreadsheet_id(spreadsheet_id)
            values = [v.strip() for v in values_str.split(",")]
            result = client.append_row(s_id, range_name, values)
            return f"Row added. Updated cells: {result.get('updates', {}).get('updatedCells', 0)}"
        except Exception as e:
            return f"Error adding row: {str(e)}"
    
    @tool
    def update_sheet_range(range_name: str, values_json: str, spreadsheet_id: str = "") -> str:
        """
        Actualiza un rango en Google Sheets.
        Args:
            range_name: Rango a actualizar (ej: 'Hoja1!A1:B2').
            values_json: Arreglo 2D en JSON string (ej: '[["A", "B"], ["C", "D"]]').
            spreadsheet_id: ID de la hoja de cálculo.
        """
        try:
            import json
            s_id = _get_spreadsheet_id(spreadsheet_id)
            values = json.loads(values_json)
            result = client.update_sheet(s_id, range_name, values)
            return f"Range updated. Updated cells: {result.get('updatedCells', 0)}"
        except Exception as e:
            return f"Error updating range: {str(e)}"

    @tool
    def clear_sheet_range(range_name: str, spreadsheet_id: str = "") -> str:
        """
        Limpia un rango en Google Sheets.
        Args:
            range_name: Rango a borrar (ej: 'Hoja1!A1:B10').
            spreadsheet_id: ID de la hoja de cálculo.
        """
        try:
            s_id = _get_spreadsheet_id(spreadsheet_id)
            client.clear_range(s_id, range_name)
            return f"Rango {range_name} limpiado exitosamente."
        except Exception as e:
            return f"Error clearing range: {str(e)}"

    # -- TOOLS DE ESTRUCTURA --
    @tool
    def create_spreadsheet(title: str) -> str:
        """
        Crea un nuevo archivo de Google Sheets.
        Args:
            title: Título del nuevo documento.
        Returns:
            ID y URL del nuevo documento.
        """
        try:
            res = client.create_spreadsheet(title)
            return f"Spreadsheet '{title}' creado. ID: {res.get('spreadsheetId')} URL: {res.get('spreadsheetUrl')}"
        except Exception as e:
            return f"Error creating spreadsheet: {str(e)}"

    @tool
    def add_sheet(title: str, spreadsheet_id: str = "") -> str:
        """
        Añade una pestaña a una hoja de cálculo existente.
        Args:
            title: Nombre de la nueva pestaña.
            spreadsheet_id: ID de la hoja de cálculo.
        """
        try:
            s_id = _get_spreadsheet_id(spreadsheet_id)
            res = client.add_sheet(s_id, title)
            return f"Pestaña '{title}' añadida correctamente."
        except Exception as e:
            return f"Error adding sheet: {str(e)}"

    @tool
    def delete_sheet(sheet_id: int, spreadsheet_id: str = "") -> str:
        """
        Elimina una pestaña en Google Sheets a través de su sheetId numérico.
        Args:
            sheet_id: ID (entero numérico) de la pestaña (No confundir con el texto).
            spreadsheet_id: ID de la hoja de cálculo.
        """
        try:
            s_id = _get_spreadsheet_id(spreadsheet_id)
            client.delete_sheet(s_id, sheet_id)
            return f"Pestaña eliminada correctamente."
        except Exception as e:
            return f"Error deleting sheet: {str(e)}"

    @tool
    def format_cells(sheet_id: int, start_row: int, end_row: int, start_col: int, end_col: int, is_bold: bool = False, hex_color: str = "", spreadsheet_id: str = "") -> str:
        """
        Aplica un formato básico (negritas o color) a un rango indicándolo mediante índices.
        Args:
            sheet_id: ID numérico de la pestaña.
            start_row, end_row: Índices de fila (inician en 0).
            start_col, end_col: Índices de columna (inician en 0).
            is_bold: true para hacer el texto negrito.
            hex_color: color de fondo en hex (p. ej. #FF0000). Si está vacío, no aplica color.
            spreadsheet_id: ID de la hoja de cálculo.
        """
        try:
            s_id = _get_spreadsheet_id(spreadsheet_id)
            range_obj = {
                "sheetId": sheet_id,
                "startRowIndex": start_row,
                "endRowIndex": end_row,
                "startColumnIndex": start_col,
                "endColumnIndex": end_col
            }
            
            format_dict = {}
            if is_bold:
                format_dict["textFormat"] = {"bold": True}
                
            if hex_color and len(hex_color) == 7 and hex_color.startswith('#'):
                # convierte a RGB 0-1
                r = int(hex_color[1:3], 16) / 255.0
                g = int(hex_color[3:5], 16) / 255.0
                b = int(hex_color[5:7], 16) / 255.0
                format_dict["backgroundColor"] = {"red": r, "green": g, "blue": b}

            if not format_dict:
                return "No format options provided."

            client.format_cells(s_id, range_obj, format_dict)
            return "Formato aplicado exitosamente."
        except Exception as e:
            return f"Error formatting cells: {str(e)}"

    return [
        read_sheet,
        append_row,
        update_sheet_range,
        clear_sheet_range,
        create_spreadsheet,
        add_sheet,
        delete_sheet,
        format_cells
    ]
