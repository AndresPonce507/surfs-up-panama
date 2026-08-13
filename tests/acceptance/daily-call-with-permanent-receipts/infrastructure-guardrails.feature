@feature-daily-call-with-permanent-receipts
Feature: The protection check preserves yesterday's archive and the site's spending limits

  A site owner protects the prediction archive and the safeguards that keep
  the site affordable. The check names what it inspected, so a passing result
  is evidence from the production-owned local-CI composition, not a test report.

  Background:
    Given the site owner protects yesterday's prediction archive and spending limits

  @slice-02 @driving_port @real-io @contract-shape:bounded-change @covers-R35
  Scenario: The documented infrastructure job is default-gated
    When the site owner reads the local CI job inventory and starts the documented infrastructure job
    Then the documented infrastructure job is part of the default local gate
    And the documented infrastructure job reports its production guardrail test and credential-free synth
    And the documented infrastructure job identifies the real infrastructure root, lifecycle rules, and Lambda guardrail values it inspected

  @slice-02 @driving_port @real-io @negative @error @contract-shape:bounded-change @covers-R35
  Scenario: The public infrastructure job rejects a changed declaration in its own contained checkout
    When the site owner starts the documented infrastructure job from a contained checkout with a unique missing concurrency declaration
    Then the public infrastructure job rejects that contained checkout before it reports protected production phases
    And the public infrastructure job names the contained infrastructure root and its unique missing concurrency value

  @slice-02 @driving_port @real-io @contract-shape:bounded-change @covers-R35 @covers-R49
  Scenario: A clean declaration inspection reports no prediction-reaching lifecycle rules
    When the site owner inspects a clean contained declaration fixture
    Then the protection check finishes successfully without cloud credentials
    And the produced result identifies the controlled fixture, its unrelated lifecycle rules, and zero prediction-reaching lifecycle rules
    And the produced result names the prediction archive "predictions/" and its no-overlap protection
    And the produced result limits Anthropic and CloudFront statements to external audits
    And the produced result carries no bare success message
    And the contained declaration source remains unexecuted
    And the declaration-only result records zero child commands, package imports, deployment actions, and network operations

  @slice-02 @driving_port @real-io @contract-shape:bounded-change @covers-R35 @covers-R49
  Scenario: The sole exact prediction transition remains allowed
    When the site owner introduces the exact 90-day Glacier Instant Retrieval transition in a contained declaration fixture
    Then the protection check finishes successfully without cloud credentials
    And the produced result names the sole allowed prediction transition at "predictions/" after 90 days

  @slice-02 @driving_port @real-io @negative @error @coupled @contract-shape:bounded-change @covers-R35 @covers-R49
  Scenario: Every archive-reaching lifecycle variation is rejected with its own explanation
    When the site owner checks each contained lifecycle variation
      | witness                                  | source value | regressed value                         |
      | bucket-wide expiration                   | no prefix    | expiration after 1 day                 |
      | exact prediction expiration              | predictions/ | expiration after 1 day                 |
      | descendant prediction transition         | predictions/v1/dt=2026-08-08/ | Glacier Instant Retrieval after 90 days |
      | 89-day Glacier Instant Retrieval         | predictions/ | Glacier Instant Retrieval after 89 days |
      | 91-day Glacier Instant Retrieval         | predictions/ | Glacier Instant Retrieval after 91 days |
      | Glacier Flexible Retrieval                | predictions/ | Glacier Flexible Retrieval after 90 days |
      | parent prediction transition             | predictions  | Glacier Instant Retrieval after 90 days |
      | descendant exact-day prediction transition | predictions/v1/dt=2026-08-08/ | Glacier Instant Retrieval after 90 days |
    Then declaration-only failures leave the source fixture, repository infrastructure, and local CI logs unchanged
    And each lifecycle variation is rejected with its own offending rule, reason, and removal guidance

  @slice-02 @driving_port @real-io @negative @error @coupled @contract-shape:bounded-change @covers-R35
  Scenario: Every in-scope safeguard group retains its concrete declarations
    When the site owner checks each contained safeguard regression
      | safeguard group | witness | required value | regressed value |
      | Lambda capacity | Lambda reserved concurrency | 2 | 3 |
      | Lambda capacity | missing Lambda reserved concurrency | 2 | missing |
      | Lambda timeouts | fetch timeout | 60 seconds | 61 seconds |
      | Lambda timeouts | missing fetch timeout | 60 seconds | missing |
      | Lambda timeouts | build timeout | 420 seconds | 421 seconds |
      | Lambda timeouts | report timeout | 5 seconds | 6 seconds |
      | Lambda timeouts | mint timeout | 5 seconds | 6 seconds |
      | Lambda timeouts | push timeout | 5 seconds | 6 seconds |
      | Lambda timeouts | photo-presign timeout | 5 seconds | 6 seconds |
      | Lambda timeouts | resize timeout | 60 seconds | 61 seconds |
      | Lambda timeouts | dispatcher timeout | 10 seconds | 11 seconds |
      | Lambda timeouts | notify/export timeout | 120 seconds | 121 seconds |
      | Lambda timeouts | breaker timeout | 10 seconds | 11 seconds |
      | Log retention | log retention | 14 days | 7 days |
      | Log retention | missing log retention | 14 days | missing |
      | Non-prediction lifecycle | raw archive expiration | 30 days | 31 days |
      | Non-prediction lifecycle | missing raw archive expiration | 30 days | missing |
      | Non-prediction lifecycle | photo expiration | 90 days | 91 days |
      | Non-prediction lifecycle | incomplete multipart abort | 7 days | 8 days |
    Then declaration-only failures leave the source fixture, repository infrastructure, and local CI logs unchanged
    And each safeguard regression is rejected with its own safeguard, value, and restoration guidance

  @slice-02 @driving_port @real-io @negative @error @contract-shape:bounded-change @covers-R35 @covers-R49
  Scenario: An unavailable infrastructure declaration cannot be reported as protected
    When the site owner inspects a contained declaration fixture without its site declaration
    Then the protection check does not succeed
    And declaration-only failures leave the source fixture, repository infrastructure, and local CI logs unchanged
    And the produced result names the unavailable site declaration, why it matters, and how to restore it

  @slice-02 @driving_port @real-io @negative @error @contract-shape:bounded-change @covers-R35
  Scenario: A malformed infrastructure declaration cannot be reported as protected
    When the site owner inspects a contained declaration fixture with an unreadable guardrail declaration
    Then the protection check does not succeed
    And declaration-only failures leave the source fixture, repository infrastructure, and local CI logs unchanged
    And the produced result names the unreadable guardrail declaration, why it cannot be inspected, and how to restore it
