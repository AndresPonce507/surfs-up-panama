# Build le entrega el bundle fresco a un publicador acotado, y la plantilla sintetizada prueba el límite
ID: EXP-weather-to-site-bridge-2 · Spec rows: slice-02 · Persona: Andres, el operador que va a desplegar esto y necesita leer el límite en la plantilla, no en una promesa

## Intent
The hour Build logs build.success it synchronously invokes the Publisher with the bundle it just
wrote, and the synthesized CloudFormation template proves the boundary: one bounded container
function, invoked by Build and by nothing else, PUT-only permissions, and a dead-man alarm so a
silently stale site pages a human.

## Preconditions
Honesty first: this slice has NO page. Its observables are the synthesized template and the
Build handler's behavior against fake ports.

1. `cd /Users/andres/psb-weather-bridge`, all commands from this root.
2. `npm ci` has run; Docker is up (CDK bundling).
3. Run `npm run test:at -- --tags "@feature-weather-to-site-bridge and @slice-02"`, then
   `npm run synth:infra` and `npm run test:infra`. Capture the real exit codes.
4. No AWS credential is required by anything in this exam; a step that demands one is itself a
   finding (`synth:infra` is credential-free by contract).

## Charter
Read the synthesized template like the person who must deploy it. Is the Publisher exactly as
bounded as the ADR says: reserved concurrency 1, timeout 300 s, ARM64 image, production origin
in its environment? Is Build the ONLY thing that can start it: no schedule targets it, no bucket
notification exists, no queue appears anywhere? Do its permissions read as PUT-only, with no
Delete action in any statement? Then check the seam from the other side: Build's declared
timeout covers the synchronous wait and its guardrail test moved in the same commit, and an
invoke failure logs an event line instead of retrying.

## Expected observations (oracle)
- Los escenarios @slice-02 corren en verde; `npm run synth:infra` y `npm run test:infra` salen
  con código cero sin ninguna credencial.
- La plantilla lleva la función del publicador: imagen de contenedor ARM64, concurrencia
  reservada 1, timeout 300 s, y el origen de producción en su ambiente.
- Ningún Schedule apunta al publicador, no existe ninguna notificación de bucket, y no hay
  ninguna cola en ninguna plantilla. El único camino de entrada es la invocación de Build.
- Ninguna sentencia IAM del publicador contiene una acción Delete. La única acción ListBucket está
  limitada a `v1/*` y `site/published-surface.json`, para distinguir un objeto inicial ausente de
  una lectura denegada; las escrituras son put sobre las rutas publicadas y el estado durable.
- El timeout declarado de Build sube a 420 s con su prueba de guardrail actualizada en el mismo
  cambio; `retryAttempts` sigue en 0 para ambas funciones.
- Un fallo del invoke se registra como línea de evento y no se reintenta en el ciclo; el filtro
  de métricas `PublishSuccess` y la alarma de hombre-muerto del publicador siguen el patrón
  existente de Build y publican al mismo tópico SNS.
- Negative: cualquier trigger nuevo (schedule propio, evento S3, cola) es FALLA por definición
  de la decisión grabada, aunque funcione.
- Negative: una plantilla que le dé al publicador s3:DeleteObject, o ListBucket fuera de `v1/*`
  y `site/published-surface.json`, es FALLA de contrato.
- Negative: desplegar cualquier stack o correr `cdk diff` durante este examen es FALLA del
  proceso del carril (sube assets); la prueba es local por diseño.

If synth or the infra tests cannot run, the verdict is INDETERMINATE with that observation
written down. Never a PASS by absence.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
