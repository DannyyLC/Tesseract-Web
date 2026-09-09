/*
  El nombre `maxTokensPerExecution` sugería un presupuesto de consumo de la ejecución.
  En realidad mide el historial de conversación que entra al payload (lo que compara
  `estimateMessageHistoryTokens`, tanto en la compactación como en el hard cap); el
  fan-out, el sintetizador y las tools no suman nada ahí. El comportamiento siempre fue
  correcto, solo el nombre engañaba. Ver docs/todo.md punto 3.

  Es un RENAME simple: mismo significado, mismos valores, sin cambio de comportamiento.
*/
ALTER TABLE "workflows" RENAME COLUMN "maxTokensPerExecution" TO "maxHistoryTokens";
