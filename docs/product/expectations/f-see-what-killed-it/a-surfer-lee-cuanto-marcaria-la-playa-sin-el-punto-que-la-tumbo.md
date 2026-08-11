# Cada día explica cuánto marcaría sin su punto débil, sin prometer un mar distinto

ID: EXP-f-see-what-killed-it-3 · Spec rows: slice-03 step 03-05 · Persona: Surfista que ya sabe qué bajó el día y quiere entender cuánto cambiaría esa misma llamada sin esa causa

## Intent

En la página propia de una playa, cada día con una mejora honesta publicada
completa la frase de su causa con un puntaje entero, por ejemplo: `Sin él,
hoy marcaría 93.` Es una lectura del mismo modelo y de la misma mañana, no una
promesa de que el mar será distinto. Hoy y mañana llevan su propio número y no
se lo prestan entre sí.

Cuando esa mejora no se puede mostrar honestamente, la frase de la causa queda
entera y la parte nueva desaparece. Un día perfecto no tiene llamada. Una
igualdad de redondeo no repite el mismo puntaje. Una mañana antigua con la
causa pero sin la mejora nueva no inventa nada.

## Preconditions

1. Desde el árbol bajo prueba, ejecutar `npm run build`.
2. Servir el resultado y abrir la página propia de una playa a 390 px.
3. Usar una playa que publique causa y mejora distintas para hoy y mañana.

## Charter

En la playa de nombre más largo, lee las dos frases despacio. La de hoy debe
nombrar su causa y decir cuánto marcaría ese día sin ella; la de mañana debe
hacer lo mismo con su propia causa y su propio puntaje. Ninguna debe sonar como
una garantía, una nota de programador o una segunda predicción.

Busca también una igualdad donde el nuevo número redondeado sería igual al que
ya se ve, y un día perfecto. En ambos casos no debe quedar una frase cortada,
una cifra repetida ni un hueco. Si existe una mañana anterior que nombra la
causa pero no lleva la mejora, la oración sigue tranquila sin inventar una
cifra.

Repite la lectura a 390 px en tema claro y oscuro, con movimiento reducido.
Comprueba que las frases largas siguen sobre su fondo real con contraste
legible, que la página no se sale lateralmente, que no aparece ningún control
pequeño, que no hay carga ni movimiento artificial, que la escala de letra y
los espacios siguen el sistema de la página, y que el botón para contar si
estuviste continúa al alcance.

## Expected observations (oracle)

- En una misma playa leo una frase tranquila por hoy y otra por mañana. Cada
  una contiene la causa escrita y su propio puntaje entero sin esa causa.
- Nunca veo que hoy tome el número de mañana ni que mañana tome el de hoy.
- En un día perfecto, una igualdad de redondeo o una mañana antigua sin la
  mejora, no aparece una cifra inventada, repetida o huérfana. La frase que sí
  queda se lee completa.
- A 390 px, en los dos temas y con movimiento reducido, la explicación se ve
  terminada y legible sobre su fondo real, sin recorte ni desborde; el llamado
  para reportar sigue cómodo de tocar.
- No veo `null`, `undefined`, `NaN`, palabras internas, inglés, llaves,
  corchetes ni guiones largos.

## U8 observation

La segunda frase se siente como una explicación tranquila de la misma llamada.
Hoy y mañana usan sus propias palabras y números, sin parecer una promesa
técnica ni una nota de programador.

## Session log (append-only)

| date | examiner | verdict | observations |
|------|----------|---------|--------------|
| 2026-08-11 | Vera | INDETERMINATE | The required `npm run build` start step printed `health.publish.counterfactual_field_missing` publish logs into the examiner session. The source-blind boundary prohibits reading logs, so no public-surface observation was made. |
| 2026-08-11 | Vera | PASS | At 390 px on Santa Catalina - La Punta, in light and dark with reduced motion, today reads “Lo que lo tumba: el tamaño, a 0.18. Sin él, hoy marcaría 57.” and tomorrow independently reads “Lo que lo tumba: el tamaño, a 0.11. Sin él, mañana marcaría 83.” Both cards stayed inside the 390 px viewport, the text was clear on its card, and the large “¿ESTUVISTE? CUÉNTANOS” button remained reachable. The specified dated page `/ayer.html` rendered a complete 63-point report at 390 px with no invented counterfactual number. No null, undefined, NaN, internal wording, English, braces, brackets, or em dashes appeared. |
