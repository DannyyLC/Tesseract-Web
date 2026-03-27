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
        "5638af38-83ed-434a-b3fe-04c89034ac4e",
        "64a9e818-b45c-44da-8b28-0c76978f0fe7",
        "b9ba2680-5f28-4762-aa76-55e35ecfcc7e"
      ]
    }
  }
}