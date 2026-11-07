# Modelos OpenAI (docs oficiales leídas el 07/11/2026; precios Standard por 1M tokens)
| id | estado | input | cached | output | contexto | Structured Outputs |
| gpt-6-luna | vigente ("most efficient model for focused, high-volume tasks"; recomendado por la página de modelos para cargas sensibles al costo) | 0.10 | 0.01 | 0.50 | 1.05M / 128k | sí |
| gpt-5.6-terra | vigente (equivale al tier "mini" anterior; recomendado para baja latencia) | 2 | 0.2 | 12 | 1.05M / 128k | sí |
| gpt-5.4-nano | DEPRECADO | 0.20 | 0.02 | 1.25 | 400k | sí |
| gpt-5-mini | DEPRECADO | 0.25 | 0.025 | 2 | 400k | sí |
Fuentes: https://developers.openai.com/api/docs/pricing , /api/docs/models , /models/gpt-6-luna , /models/gpt-5.6-terra , /models/gpt-5.4-nano , /models/gpt-5-mini
Decisión propuesta: ruteo — reglas determinísticas primero (sin IA); IA corta/clasificación/respuestas: gpt-6-luna; explicaciones complejas/análisis largo: gpt-6-luna con más esfuerzo o gpt-5.6-terra sólo si hace falta (configurable por env, con presupuesto). Sin gasto nuevo: usa la clave y la cuenta existentes; cuotas por usuario/org y tope diario.
