{
  "type": "agent",
  "graph": {
    "type": "react",
    "config": {
      "max_iterations": 10,
      "allow_interrupts": false
    }
  },
  "agents": {
    "default": {
      "model": "gpt-4o",
      "temperature": 0.7,
      "system_prompt": "Eres un asistente inteligente. Puedes realizar cálculos matemáticos, gestionar eventos en Google Calendar y escalar conversaciones a un humano cuando sea necesario.",
      "tools": [
        "5052004e-70e7-42f6-9388-1b82293983a0",
        "a3b2ca6c-c5ea-4716-8609-42116c63c5cb",
        "baaa5e1d-59fb-4e72-b1d8-bd1486522474"
      ]
    }
  }
}