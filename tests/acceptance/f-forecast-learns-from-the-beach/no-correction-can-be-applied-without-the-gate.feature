@feature-f-forecast-learns-from-the-beach
Feature: No correction can be marked applied except by the gate, and no wind claim can ship without its own noise floor

  Two safety rules that no single test run can prove, because they are claims
  about the whole source, not about one execution. Both are examined mechanically
  over a named source universe, and both are watched refusing a universe that
  breaks them as well as accepting one that keeps them, because a rule never
  seen firing proves nothing.

  The second rule exists because its gap once opened by silence: wind carries no
  residual, so it has no bias, no standard error and nothing for a significance
  gate to weigh. Nothing states that in code. If a wind residual is ever added,
  the examination refuses it until it brings its own noise floor, derived from
  how often the wind word itself is misread rather than borrowed from height.

  @slice-01 @driving_port @in-memory @security @covers-R15
  Scenario: Nothing in the shipped source can mark a correction applied
    Given the shipped source of this product
    When its learning declarations are examined
    Then the examination reports no violation
    And the only place that can mark a correction applied is the gate itself

  @slice-01 @driving_port @in-memory @security @negative @covers-R15
  Scenario Outline: Only the gate may mark a correction applied
    Given the prepared source universe "<universe>"
    When its learning declarations are examined
    Then the examination <verdict> it over the rule that only the gate may mark a correction applied

    Examples: a universe that must be refused
      | universe                                | verdict |
      | applied-marked-outside-the-gate         | refuses |

    Examples: a universe that must be accepted
      | universe                                | verdict |
      | applied-marked-only-inside-the-gate     | accepts |

  @slice-01 @driving_port @in-memory @security @covers-R16 @covers-R2
  Scenario: The shipped source forms no residual for wind at all
    Given the shipped source of this product
    When its learning declarations are examined
    Then it finds exactly the two declared residual forms, for height and for the score
    And it declares no noise floor for wind, because wind makes no numeric claim

  @slice-01 @driving_port @in-memory @security @negative @covers-R16
  Scenario Outline: A wind residual may not ship without its own noise floor
    Given the prepared source universe "<universe>"
    When its learning declarations are examined
    Then the examination <verdict> it over the rule that a wind residual must bring its own noise floor

    Examples: a universe that must be refused
      | universe                             | verdict |
      | wind-residual-without-a-noise-floor  | refuses |

    Examples: a universe that must be accepted
      | universe                             | verdict |
      | wind-residual-with-its-own-noise-floor | accepts |
