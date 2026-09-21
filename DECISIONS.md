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

Bloque cerrado. No se modifica el bug de emails ni se implementan nuevos campos.
