# Decisiones

## Bug: países en la importación CSV — 21/09/2026

### Evidencia y causa

La reproducción identificó `12` y `XXX` en `docs/leads-with-errors.csv`
(líneas 14, 16 y 18). El parser los marcaba válidos y llegaban sin cambios
a SQLite, a la API y a la tabla. No se reprodujo corrupción de UTF-8:
`Iñaki Álvarez` ya se leía correctamente.

### Corrección mínima

Validar en `frontend/src/utils/csvParser.ts` que un país informado tenga
dos letras ASCII mayúsculas (`^[A-Z]{2}$`), después del trim existente.
La fila incorrecta utiliza el mecanismo de errores que ya muestra el modal
y queda excluida de la petición de importación. El país sigue siendo opcional.
No se transforman países ni caracteres acentuados.

Se valida el formato, no la pertenencia a un catálogo ISO. Esto conserva
la convención existente de dos letras, incluido `UK` en los datos iniciales,
sin añadir dependencias ni decidir nuevas reglas sobre países admitidos.
El alcance es el flujo CSV de la aplicación: no se añaden restricciones a
otros consumidores de la API ni se reparan registros históricos.

### Verificación

- Regresión que carga el CSV original: las cinco filas con país inválido
  (6, 11, 14, 16 y 18) reciben un error de país. La prueba falló antes del
  cambio y pasó después.
- Los tres archivos `leads-ok-*.csv` conservan todos sus códigos y siguen
  siendo válidos. Se comprueban también país vacío, espacios y campos
  acentuados (`Iñaki`, `Álvarez`, `Técnico`, `Compañía Ñ`, `Zoé`, `Muñoz`, `Éxito`).
- `pnpm test --run` en frontend: 24/24 pruebas correctas.
- Las pruebas del parser se agrupan en `frontend/tests/csvParser.test.ts`,
  a petición del usuario, separadas de las utilidades de producción.
- Recorrido real en navegador: selección de un archivo UTF-8 con cinco
  filas identificadas por `CSVFIX20260921`; el modal mostró tres válidas
  (`ES`, `US`, vacío) y dos inválidas (`12`, `XXX`). Se pulsó importar y
  se verificaron las tres filas en SQLite, en `GET /leads` y en la tabla.
  Países y acentos permanecieron intactos; las dos filas inválidas no
  llegaron a la base de datos ni a la tabla.
- Las tres filas temporales se retiraron al acabar. Los 29 registros
  anteriores, incluidos los de la reproducción previa, se conservaron.
- `pnpm build` sigue fallando por el error previo TS2741 de `emailVerified`
  en `src/api/mutations/useApiMutation.ts:64`, ajeno a este cambio.

Bloque CSV cerrado sin modificar emails ni añadir nuevos campos.

## Bug: verificación de emails sin fin ni feedback — 21/09/2026

### Causa y decisión

La actividad simulada tarda 20 segundos para `jane.smith`, pero el workflow
permitía solo 1 segundo por intento, con reintentos ilimitados. El endpoint
esperaba el resultado secuencialmente y la interfaz ignoraba los errores parciales.
El usuario confirmó que un fallo debe permitir continuar con los demás leads.

Se conserva el endpoint síncrono y el esquema de datos. Los leads se procesan
en paralelo, cada uno con su propio resultado o error. No se introduce un sistema
de jobs, polling ni nuevas dependencias.

### Límites y duplicados

- Actividad: 5 segundos por intento, como máximo 2 intentos, espera inicial
  de 1 segundo y 12 segundos de tiempo total incluyendo cola y reintentos.
- Workflow: 15 segundos de ejecución total, incluso si no hay un worker disponible.
- Endpoint: conexión con Temporal limitada a 3 segundos y deadline de 20 segundos
  para la llamada de cada lead. La conexión se cierra en `finally`.
- Petición del navegador: timeout de 25 segundos exclusivo para este endpoint.
  La actualización posterior de la tabla no mantiene la mutación pendiente.
- ID estable por lead con `USE_EXISTING`: las solicitudes simultáneas reutilizan
  el workflow activo. Después de terminar se permite una nueva verificación.
- La interfaz indica progreso global y por fila, bloquea otra verificación y el
  borrado mientras está pendiente y permite volver a intentarlo al finalizar.

### Resultado y errores

`true` significa email válido; `false`, email inválido. Ambos son comprobaciones
completadas. Una excepción o timeout va en `errors`, no en `results`, y no escribe
`false` en la base de datos: conserva el estado anterior del lead. La respuesta
marca `success: false` cuando hay fallos técnicos, manteniendo los resultados parciales.
La interfaz muestra los recuentos de válidos, inválidos y fallos técnicos, identifica
los leads fallidos y evita notificar un éxito global cuando hay errores.

El tipo de `emailVerified` en los resultados de esta operación es `boolean`,
alineado con el backend; así los recuentos usan el valor y su negación directamente.
El estado persistido del lead sigue admitiendo `null` para emails no verificados.

El error técnico se muestra durante la sesión de la interfaz; no se persiste un
historial de intentos. El timeout de Temporal termina la espera del workflow, pero
no interrumpe por fuerza el código de una actividad que no coopere con cancelación.
Una finalización tardía de esta actividad no actualiza el lead: esa escritura solo
ocurre en el endpoint cuando obtiene un resultado correcto.

### Verificación

- Backend: 31 pruebas correctas y compilación correcta. Las nuevas pruebas están
  en `backend/tests`; cubren límites, propagación de fallo, casos reales de la
  actividad, resultados parciales, continuidad del lote y fallo de conexión.
- Frontend: 26 pruebas correctas, incluidas las regresiones de CSV y dos nuevas
  pruebas de progreso, bloqueo de duplicados, errores parciales y fallo de petición.
  Las pruebas nuevas están en `frontend/tests`.
- Recorrido real desde la interfaz con tres leads temporales `EMAILFIX20260921`:
  válido y no válido se guardaron mientras el lento seguía pendiente. Este terminó
  en 11,08 segundos; Temporal confirmó `MAXIMUM_ATTEMPTS_REACHED` y workflow `FAILED`.
  La tabla mostró `Valid`, `Invalid` y `Verification failed` por separado, junto
  al aviso de dos comprobados y un fallo técnico.
- Una segunda petición simultánea para el lento reutilizó el mismo workflow:
  se confirmó una sola ejecución en Temporal, sin reintentos pendientes al terminar.
- Se retiraron solo las tres filas creadas para la prueba y se compararon los 29
  registros anteriores para confirmar que permanecen intactos.
- El frontend sigue sin compilar por el TS2741 preexistente de `emailVerified`
  en `useApiMutation.ts:64`. No se amplía este bloque para corregirlo.

Bloque de verificación de emails cerrado.
