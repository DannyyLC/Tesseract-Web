"""
Tests para conversión de mensajes.
"""

import pytest
import sys
from pathlib import Path
from unittest.mock import Mock

src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

from api.routes import (
    convert_message_history_to_langchain,
    convert_langchain_messages_to_dict
)
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage


class TestMessageConversion:
    """Tests para conversión de mensajes."""
    
    def test_convert_dict_to_langchain_human(self):
        """Prueba conversión de mensaje human."""
        messages = [{"role": "user", "content": "Hola"}]
        result = convert_message_history_to_langchain(messages)
        
        assert len(result) == 1
        assert isinstance(result[0], HumanMessage)
        assert result[0].content == "Hola"
    
    def test_convert_dict_to_langchain_assistant(self):
        """Prueba conversión de mensaje assistant."""
        messages = [{"role": "assistant", "content": "¡Hola!"}]
        result = convert_message_history_to_langchain(messages)
        
        assert len(result) == 1
        assert isinstance(result[0], AIMessage)
        assert result[0].content == "¡Hola!"
    
    def test_convert_dict_to_langchain_system(self):
        """Prueba conversión de mensaje system."""
        messages = [{"role": "system", "content": "Eres un asistente."}]
        result = convert_message_history_to_langchain(messages)
        
        assert len(result) == 1
        assert isinstance(result[0], SystemMessage)
    
    def test_convert_dict_to_langchain_mixed(self):
        """Prueba conversión de múltiples mensajes."""
        messages = [
            {"role": "user", "content": "Hola"},
            {"role": "assistant", "content": "¿Cómo estás?"},
            {"role": "user", "content": "Bien"}
        ]
        result = convert_message_history_to_langchain(messages)
        
        assert len(result) == 3
        assert isinstance(result[0], HumanMessage)
        assert isinstance(result[1], AIMessage)
        assert isinstance(result[2], HumanMessage)
    
    def test_convert_langchain_to_dict_filters_system(self):
        """Prueba que SystemMessage se filtra."""
        messages = [
            SystemMessage(content="System prompt"),
            HumanMessage(content="Hola"),
            AIMessage(content="¡Hola!")
        ]
        result = convert_langchain_messages_to_dict(messages)
        
        # System message debe ser filtrado
        assert len(result) == 2
        assert result[0]["role"] == "user"
        assert result[1]["role"] == "assistant"
    
    def test_convert_langchain_to_dict_filters_tool(self):
        """Prueba que ToolMessage se filtra."""
        messages = [
            HumanMessage(content="¿Cuánto es 2+2?"),
            AIMessage(content=""),
            ToolMessage(content="4", tool_call_id="test"),
            AIMessage(content="El resultado es 4")
        ]
        result = convert_langchain_messages_to_dict(messages)
        
        # Tool message y AI vacío deben ser filtrados
        assert len(result) == 2
        assert result[0]["role"] == "user"
        assert result[1]["role"] == "assistant"
        assert result[1]["content"] == "El resultado es 4"
    
    def test_convert_langchain_to_dict_filters_empty_ai(self):
        """Prueba que AIMessage vacíos se filtran."""
        messages = [
            HumanMessage(content="Hola"),
            AIMessage(content=""),
            AIMessage(content="   "),
            AIMessage(content="¡Hola!")
        ]
        result = convert_langchain_messages_to_dict(messages)
        
        # Solo deben quedar el human y el último AI
        assert len(result) == 2
        assert result[0]["role"] == "user"
        assert result[1]["role"] == "assistant"
        assert result[1]["content"] == "¡Hola!"
