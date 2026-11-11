# Evaluación de seguridad · Puriq Lite

Fecha: 10 de noviembre de 2026 · Alcance: versión Lite (demo con datos ficticios), uso por agente comunitaria en Quinua.

## Pruebas corridas

| Prueba | Resultado |
|---|---|
| Flujo completo en navegador (llenar a mano y con audio) | Pasa: sin caja "Revise" al llenar a mano, botón "Grabar visita", aviso a la posta con "Llamar a la posta", sin 106 y sin compromiso |
| 14 pruebas automáticas (`pytest`) | Pasan |
| Detección de signos de alarma **sin IA** (19 frases coloquiales y en quechua) | Antes: 5 de 14 signos presentes. **Ahora: todos**, con negaciones bien leídas ("no tengo dolor de cabeza") |
| Leer archivos fuera de `app/` (path traversal) | Bloqueado (404) |
| HTML/JS dentro de una transcripción | Se muestra como texto; el frontend escapa todo |
| Audio vacío, corrupto o de más de 15 MB | Rechazado con mensaje claro (422 / 413) |
| Abuso de Whisper o de la IA (muchas llamadas seguidas) | **Antes sin límite. Ahora 20 por minuto por IP** (429) |
| Claves o secretos en el historial de git | No hay |

## Seguridad clínica (riesgo para la gestante)

| Riesgo | Estado | Control |
|---|---|---|
| La app no detecta un signo de alarma (falso negativo) | **Mitigado** | Palabras clave ampliadas + **no se puede avanzar si un signo quedó en "No se habló"**: la agente debe preguntar y marcar los 6 |
| La IA inventa respuestas | Mitigado | Lo no dicho queda "No se habló"; se muestra la frase que respalda cada respuesta; la agente revisa |
| La IA da un consejo médico equivocado | Mitigado | Los mensajes los eligen reglas basadas en la norma; la IA solo los reescribe y tiene prohibido agregar indicaciones |
| Que la promotora no avise a la posta | **Mitigado** | Botones WhatsApp / SMS (sin datos) / Llamar con las apps del celular; **no se puede guardar la visita sin avisar** |
| La posta no responde (zona rural) | Pendiente | Versión completa: confirmación "visto / atendida" y reintento |
| Conversación en quechua | Parcial | Algunas frases en quechua para signos; Whisper está configurado en castellano |
| Mensajes de orientación sin validar | Pendiente | Validar los textos con obstetra / PROMSA antes del piloto |

## Seguridad de datos (privacidad)

| Riesgo | Estado | Qué hacer antes de usar datos reales |
|---|---|---|
| Acceso a los datos | **Mitigado** | Activación por la posta (token firmado), clave de 4 números verificada en el celular, bloqueo a los 7 min, 5 intentos, desactivación remota. Límite: en una app web la clave protege del uso casual (hijos), no de alguien que examine el celular a fondo; para eso, app nativa con almacenamiento cifrado del sistema |
| La transcripción se envía a la API de Claude cuando hay clave | Riesgo | Consentimiento informado que lo diga; acuerdo de tratamiento de datos; o modelo local |
| Datos en el aviso a la posta | **Mitigado** | Mensaje corto (cabe en un SMS) sin DNI ni dirección exacta; lo envía la promotora desde su WhatsApp o SMS; queda registrado el canal y la hora |
| Datos de salud = datos sensibles (Ley 29733) | Pendiente | Consentimiento expreso, inscripción del banco de datos ante la ANPD, contrato con la DIRESA/municipio |
| El audio se procesa en el servidor | OK | No se guarda; solo se transcribe |
| Estado en memoria compartido entre todos los que abren el demo | Aceptable en demo | Base de datos con control de acceso por establecimiento |
| `/api/docs` expuesto | Aceptable en demo | Ocultarlo en producción |

## Veredicto

**Apta para demostrar con datos ficticios.** **No apta todavía para datos reales**: falta consentimiento y acuerdos de datos (Ley 29733), envío real del aviso con confirmación, y validación clínica de los mensajes.
