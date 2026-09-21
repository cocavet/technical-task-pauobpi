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

## Bloque 3: nuevos campos de lead — 21/09/2026

### Alcance y decisiones

Se añaden `phoneNumber`, `yearsAtCompany` y `linkedinUrl` de extremo a extremo:
Prisma y migración, API de alta/consulta/actualización/importación, tipos del
frontend, CSV y su vista previa, tabla y composición/generación de mensajes.
Se interpreta «AI» como API: este proyecto genera mensajes con plantillas y no
contiene una integración de IA. No se añade una nueva integración.

- Los tres campos son opcionales. La migración añade tres columnas nullable sin
  reconstruir la tabla ni modificar valores anteriores; los leads existentes
  reciben `null` en las nuevas columnas.
- `phoneNumber` es texto, nunca un número de JavaScript: conserva `+`, ceros
  iniciales, separadores y extensiones presentes en los CSV originales. Se
  recortan espacios exteriores. La validación de formato permite entre 3 y 20
  dígitos en el número principal, separadores habituales y extensión `x`/`ext`
  de hasta 6 dígitos, con un máximo de 64 caracteres. No verifica existencia.
- `yearsAtCompany` representa años completos en la empresa actual: entero entre
  0 y 2147483647 (límite de Prisma Int). `0` es válido y se conserva al importar,
  mostrar y generar mensajes. La API recibe un número; el parser convierte
  únicamente celdas CSV no vacías formadas por dígitos.
- `yearsInRole` significa años en el puesto actual, no en la empresa. Una persona
  puede llevar 8 años en la empresa y 2 en su puesto. No se renombra, convierte
  ni usa esa columna como alternativa a `yearsAtCompany`; sigue ignorada en los
  CSV antiguos. No se inventa antigüedad para los leads existentes.
- `linkedinUrl` admite una URL HTTP(S) de perfil `/in/...` en `linkedin.com` o sus
  subdominios, sin credenciales. Se rechazan otros protocolos, otros dominios,
  dominios que solo imitan LinkedIn y páginas de empresa.
- El backend valida los campos en alta, actualización e importación. En alta y
  actualización devuelve 400 antes de escribir; en importación informa los
  errores por fila y continúa con las demás, como el flujo existente. El modal
  ahora muestra esos fallos del backend. El CSV también detecta formatos inválidos.
- En actualización, omitir un campo conserva su valor; `null` o texto vacío lo
  borra. Se alinean dos desajustes necesarios para el recorrido: `firstName`
  del frontend se acepta conservando el alias `name`, y el cliente utiliza el
  `PATCH` existente, permitido también en CORS. Actualizar solo los nuevos campos
  ya no escribe `"undefined"` sobre nombre/email. El tipo de respuesta refleja
  el lead devuelto por la API. Al completar los valores iniciales del lead
  optimista se añade también `emailVerified: null`, resolviendo el error de
  compilación anterior en ese mismo objeto.
- Las nuevas variables son `{phoneNumber}`, `{yearsAtCompany}` y `{linkedinUrl}`.
  Se conserva la regla existente: si una plantilla pide un campo ausente, falla
  solo ese lead y no sustituye su mensaje anterior. Si no lo pide, genera
  normalmente. Los números se convierten a texto sin confundir `0` con ausencia.

### Composición y ejemplo

La fila de botones se sustituye por un selector desplegable con buscador sin
nuevas dependencias, manteniendo colores y estilos. Permite ratón, flechas,
Enter y Escape, informa cuando no hay resultados y devuelve el foco al editor.
Guarda la posición/selección antes de pasar al buscador, inserta en el cursor o
sustituye el texto seleccionado y deja el cursor después de la variable.

`docs/leads-new-fields.csv` contiene tres ejemplos: datos completos, campos
vacíos y cero años con teléfono que empieza por `00`.

### Verificación

- Backend: 71 pruebas correctas y compilación correcta. Se cubren los tres
  campos, valores inválidos, ausencia, borrado explícito, actualización parcial,
  importación y generación con errores parciales y cero años.
- Frontend: 38 pruebas correctas y compilación de producción correcta. Incluyen
  CSV antiguos, nuevos campos, separación de `yearsInRole`, búsqueda, inserción
  en el cursor, sustitución de selección e inserciones consecutivas con teclado.
- Recorrido real en navegador con el CSV de ejemplo: 3 filas válidas importadas;
  vista previa, tabla, API y SQLite conservaron los valores, incluidos `0034`,
  `0` y el nombre `Zoé`. Se comprobó buscar `PHONE` e insertar la variable en
  medio de un texto, conservando el cursor y devolviendo el foco al editor.
- Generación real con las tres variables: 2 mensajes generados (5 y 0 años),
  y error explícito por teléfono ausente para Luis. Al cambiar la plantilla a
  `Hi {firstName}`, se generaron correctamente los 3 mensajes.
- API real: actualización parcial, rechazo de teléfono numérico, antigüedad
  negativa y dominio LinkedIn falso; borrado explícito y consulta posterior.
- Se retiraron exclusivamente los tres leads de prueba (IDs 36–38). La comparación
  con la instantánea anterior a la migración confirma que los 29 leads originales
  conservan todos sus valores previos y tienen los nuevos campos a `null`.

Bloque 3 cerrado. Sin nuevas dependencias ni refactorizaciones ajenas al recorrido.

### Ajuste solicitado: validadores compartidos y `finally` — 21/09/2026

Se crea `shared/utils/validators.ts` en la raíz, con el nombre de carpeta
corregido por el usuario. Centraliza las comprobaciones de formato de email, teléfono,
LinkedIn, país y antigüedad. Frontend y backend importan directamente este
archivo; se eliminan las expresiones y comprobaciones duplicadas. La
normalización, obligatoriedad y presentación de errores siguen en cada flujo.
Se mantienen las reglas existentes: el CSV convierte texto de años válido y la
API exige un número; cero sigue siendo válido. El email y el país conservan su
alcance de validación anterior, sin imponer nuevas restricciones a la API.

En la lectura del CSV se mueve `setIsProcessing(false)` a `finally`, para
restablecer el estado tanto en éxito como en error, sin repetirlo en `try` y
`catch`. La conexión con Temporal ya tenía su cierre en `finally`; las funciones
puras de validación no necesitan una operación de limpieza.

Para compilar el TypeScript común sin dependencias nuevas, ambos proyectos
incluyen `shared`. El backend amplía `rootDir` y su arranque utiliza
`dist/backend/src/index.js`; el modo desarrollo observa también `../shared`.
Vite permite servir los archivos compartidos desde la raíz del proyecto.

Verificación: las 71 pruebas del backend y 38 del frontend siguen pasando;
ambos proyectos compilan. Se ejecutó también el validador del backend compilado,
confirmando que resuelve el módulo común y conserva teléfono con ceros iniciales,
antigüedad cero y URL de LinkedIn. No se modifican los leads en este ajuste.

### Renombrado de la carpeta común a `shared` — 21/09/2026

Tras el renombrado del usuario, se corrigen los imports, las inclusiones de
TypeScript y la carpeta observada por el modo desarrollo del backend. La
ubicación definitiva es `shared/utils/validators.ts` y las referencias de este
documento se actualizan para reflejarla.

Verificación: 71 pruebas del backend y 38 del frontend correctas, compilaciones
correctas y carga del módulo compartido desde el backend compilado comprobada.

## Bloque 4: búsqueda de teléfono con Temporal — 21/09/2026

### Ejecución y proveedores

Se reutilizan el worker y la cola existentes. `enrichPhoneWorkflow` consulta
**Orion → Astra → Nimbus**, con una actividad por proveedor y parada al encontrar
un teléfono válido. `backend/src/phone/providers.ts` encapsula entradas,
autenticación y normalización de cada respuesta. Se conserva literalmente
`https://api.enginy.ai/api/tmp/numbusLookup` del README. Las claves de ejemplo
son las del README y pueden sobrescribirse con `ORION_API_KEY`, `ASTRA_API_KEY`
y `NIMBUS_API_KEY`, exclusivamente en backend.

- HTTP: 4 segundos con aborto y limpieza del temporizador en `finally`.
- Proveedor: 5 segundos por intento, como máximo 3 intentos, backoff de 1 y 2
  segundos y 20 segundos totales incluyendo cola. Se reintentan red, timeout,
  429 y 5xx. Otros errores HTTP, JSON inválido o teléfono inválido no se reintentan.
- Workflow: 90 segundos y un único intento; no reinicia toda la cadena.
- Lectura/persistencia: actividades independientes, hasta 3 intentos y 10 segundos
  totales. Si falla guardar el teléfono no se consulta a otro proveedor para
  ocultar ese fallo: falla la ejecución y la consulta de estado lo informa.

Agotados los intentos de un proveedor se registra su fallo y se continúa.
`found` significa teléfono encontrado; `not_found`, consultas completas sin
resultado; `error`, sin teléfono y con algún fallo técnico; `missing_input`,
sin teléfono ni fallos técnicos pero con proveedores omitidos por datos faltantes.
`preserved` indica que se conservó un teléfono añadido durante la búsqueda.

Orion acepta ausencia explícita con `phone: null`; Astra, `phoneNmbr` nulo o
ausente. Se interpreta HTTP 204 como ausencia explícita de contenido. El README
no define una respuesta JSON vacía de Nimbus: JSON inesperado, incluido
`number: null`, es error, no ausencia. Su número debe ser entero positivo seguro;
se guarda como texto sin inventar prefijos a partir de `countryCode`. Esta
adaptación no puede recuperar ceros que el proveedor ya haya perdido al enviarlo
como número. No se añaden reglas de rate limiting fuera del alcance acordado.

### Datos y protección de escrituras

La migración añade `companyWebsite` opcional y metadatos de estado, proveedor,
diagnóstico, inicio/finalización e identificadores de solicitud y ejecución.
`companyWebsite` recorre API, CSV, tipos, vista previa y tabla. El validador común
acepta dominio o URL HTTP(S) y extrae su dominio; nunca lo deduce de empresa o
email. Sin web explícita se omite Orion; sin email/jobTitle requerido se omiten
los proveedores correspondientes y se continúa con los disponibles.

Los leads con teléfono se omiten. La admisión usa una actualización condicional
atómica en SQLite antes de iniciar Temporal. Las actividades comprueban la
solicitud vigente y la escritura final es transaccional y condicionada a que el
campo siga vacío. Un reintento, una respuesta tardía o una búsqueda anterior no
sobrescriben ni borran un teléfono. No se incorpora una acción de reemplazo.

### API, duplicados y feedback

`POST /leads/enrich-phones` devuelve **202** tras iniciar las ejecuciones, sin
esperar su resultado. Deduplica los IDs de la petición. Usa ID estable
`enrich-phone-{leadId}`, conflicto `USE_EXISTING` y reutilización
`ALLOW_DUPLICATE`: una búsqueda activa se reutiliza y una terminada permite una
nueva búsqueda manual si sigue sin teléfono. Una solicitud con inicio ambiguo
queda marcada como error y se invalida para evitar escrituras tardías; si aún
hay una ejecución anterior terminando, se informa y se puede volver a intentar.

`GET /leads/phone-enrichment` devuelve los estados persistidos y contrasta los
activos con Temporal. Repara estados pendientes cuando la ejecución ha fallado,
expirado o no llegó a iniciarse, sin modificar resultados ya guardados ni
solicitudes posteriores. Una caída de conexión se informa como estado temporalmente
no disponible; no se convierte en «sin datos». Las conexiones se cierran en `finally`.

La tabla muestra proveedor en curso, resultado y diagnóstico. React Query
consulta cada 2 segundos mientras hay búsquedas activas y recupera el estado al
recargar. Si falla la consulta muestra un aviso y permite reintentar. Se bloquea
buscar de nuevo o borrar la selección mientras tiene búsquedas activas, y buscar
cuando todos los seleccionados ya tienen teléfono. Se mantienen estilos y no
se añaden dependencias.

### Verificación

- 109 pruebas de backend y 44 de frontend correctas; ambas compilaciones pasan.
- Integración con Temporal real, SQLite aislado y proveedores HTTP simulados:
  éxito en cada proveedor, orden, parada temprana, ausencia, entradas faltantes,
  errores transitorios/permanentes, respuesta malformada, timeout HTTP, tres
  intentos con esperas de 1/2 segundos y tres solicitudes duplicadas concurrentes.
- Se comprobó respuesta 202 antes de terminar, nueva ejecución al repetir una
  búsqueda vacía, conservación de teléfonos existentes y añadidos durante la
  búsqueda, y recuperación del timeout de un workflow sin worker.
- SQLite real: una respuesta de una solicitud antigua no escribe sobre la nueva;
  repetir la persistencia no sustituye un resultado ya guardado.
- Navegador contra el entorno aislado: importación de `companyWebsite`, inicio
  desde «Find phone», recarga durante Orion, progreso recuperado, controles
  bloqueados, éxito posterior con Astra, ausencia y falta de entradas diferenciadas,
  repetición manual de una búsqueda vacía y protección del teléfono encontrado.
- Simulación en `backend/tests/fixtures/phoneFetch.cjs`, cargada solo por el proceso
  de prueba; recorrido reproducible en `backend/tests/phoneEnrichment.integration.cjs`.
  Para aislarlo se permiten `DATABASE_URL`, `PORT` y `TASK_QUEUE`; los valores
  normales del proyecto se mantienen cuando no se proporcionan.
- No se consultaron proveedores externos durante las pruebas. Los 29 leads
  originales se comparan con la instantánea previa y conservan sus datos.

Bloque 4 cerrado dentro del diseño acordado.
