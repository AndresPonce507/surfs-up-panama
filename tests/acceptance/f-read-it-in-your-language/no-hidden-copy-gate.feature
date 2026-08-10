@feature-f-read-it-in-your-language
Feature: Nobody can hide a string from the translation pass

  An inline Spanish literal in a page template is precisely the string the
  one translation pass will silently miss, because no key-based pass can
  see it. This check refuses user-facing copy that does not flow from a
  registered copy home, naming file and line. Its hard part is the
  false-positive surface: class names, accessibility tokens, data markers,
  time formats, styles and comments are string literals that are NOT copy,
  and a check that cries wolf gets deleted. Anything genuinely ambiguous
  goes into the shared exceptions file with a written reason, never a
  silent skip: a guard that silently stops looking is worse than a
  failing one.

  @READ-03 @slice-03 @driving_port @real-io @negative @error @covers-R13 @covers-R12
  Scenario: An inline Spanish sentence in a page template is refused by file and line
    Given a contained page fixture carrying an inline Spanish sentence in its template
    When the hidden-copy check inspects the contained fixture
    Then the hidden-copy check does not succeed
    And the refusal names the file and the line carrying the inline sentence
    And the seeded fixture and the repository stay unchanged

  @READ-03 @slice-03 @driving_port @real-io @covers-R13
  Scenario: Copy flowing from a registered copy home is legal
    Given a contained page fixture whose every visible string flows from a registered copy home
    When the hidden-copy check inspects the contained fixture
    Then the hidden-copy check succeeds and names no offender

  @READ-03 @slice-03 @driving_port @real-io @negative @covers-R14
  Scenario: Strings that are not copy never trigger the check
    Given a contained page fixture carrying a class name, an accessibility token, a data marker, a time format and a style block
    When the hidden-copy check inspects the contained fixture
    Then the hidden-copy check succeeds and names no offender

  @READ-03 @slice-03 @driving_port @real-io @negative @error @covers-R15
  Scenario: An ambiguous literal is legal only with a written reason
    Given a contained page fixture carrying a genuinely ambiguous literal absent from the exceptions file
    When the hidden-copy check inspects the contained fixture
    Then the hidden-copy check does not succeed
    And the same literal with a written debt line and reason passes as measured debt
