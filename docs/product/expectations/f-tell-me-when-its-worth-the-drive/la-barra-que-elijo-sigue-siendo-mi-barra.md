# La barra que elijo sigue siendo mi barra

ID: EXP-f-tell-me-when-its-worth-the-drive-4 · Spec rows: slice-04 · Persona: surfista para quien solo una mañana realmente excelente justifica manejar dos horas

## Intent

The surfer chooses the exact score that makes an aviso worthwhile. That choice is a whole number from 0 to 100, is saved only after the product accepts it, and remains the choice shown after returning. The phone must not claim a remembered value when the real avisos say otherwise.

## Preconditions

1. Open the production Playa Venao page on a phone-width screen, 390 px, with a real active subscription and deployed subscription storage available.
2. For the return check, have an authorised way to view the real saved value or use the product after changing it. A browser memory alone is never evidence.
3. For the later-notification check, use a controlled scheduled run or launch smoke. If the deployed sender is unavailable, record that observation INDETERMINATE.

## Charter

Choose 67. Leave and come back. The selected value should still be 67. Change it to 100, leave and return again. Attempt values below 0, above 100, and a decimal; each should leave the previous choice intact and explain the range in plain Spanish.

If a controlled morning can be run, compare a score exactly at the chosen number with one just below it. Finally, deliberately plant or retain an old phone-side remembered value before returning, while the real subscription has a different chosen value. The page must show the real value.

## Expected observations (oracle)

- The control accepts every whole number from 0 through 100 and saves the exact number chosen, not a rounded, defaulted, or nearby value.
- Invalid values do not alter the existing choice and receive a plain Spanish explanation.
- A later morning at the chosen number sends once; one point below does not send. This is the surfer’s filter only, not a different public score.
- Returning to Playa Venao shows the value stored for the real active subscription. An old remembered value in the phone never wins over it.
- U8: at 390 px in light and dark appearance, the choice feels like one deliberate part of the avisos line. It is readable, easy to adjust, and has clear saved and invalid states without making the page feel like a settings panel.
- Negative: do not PASS a return value merely because the phone remembered it, or a delivery outcome merely because a local test sender reported success. Those are FAIL unless the real stored subscription and deployed delivery path respectively support them.

## Session log (append-only)

| date | examiner | verdict | observations |
|------|----------|---------|--------------|
