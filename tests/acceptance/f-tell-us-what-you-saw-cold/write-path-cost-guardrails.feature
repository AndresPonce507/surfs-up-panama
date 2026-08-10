@feature-f-tell-us-what-you-saw-cold
Feature: The owner can stop an unsafe write path before it reaches the bill

  Before a write path can be deployed, the site owner runs the documented
  local infrastructure gate. The gate works without credentials and says
  exactly which declared protection it checked or could not check.

  Background:
    Given the site owner is protecting the write-path budget before deployment

  @slice-02 @driving_port @real-io @covers-R12 @covers-R13 @covers-R14 @covers-R15 @covers-R16 @covers-R17 @covers-R18
  Scenario: The local gate names every protection that keeps a write flood bounded
    When the site owner starts the documented infrastructure job against this checkout
    Then the report write infrastructure job finishes successfully
    And the result names the four write addresses, their one allowed site origin and their public posture
    And the result names the report limit of 2 and the mint, push and photo limits of 1
    And the result names the table's fixed 25 reads and 25 writes
    And the result names all four write breakers and the device-only daily limits
    And the result says it checked local declarations without AWS credentials and does not claim a console audit
    And the result cites the corrected cost sizing, not the falsified write-path arithmetic

  @slice-02 @driving_port @real-io @negative @error @covers-R17
  Scenario: A gate that cannot inspect declarations says so instead of claiming the write path is safe
    When the site owner starts the infrastructure job with its declaration file unavailable
    Then the report write infrastructure job does not succeed
    And the result says it could not inspect the declaration file and how to restore it

  @slice-02 @driving_port @real-io @negative @error @covers-R12 @covers-R17
  Scenario Outline: Each write address rejects a changed public posture or origin
    When the site owner changes controlled write declaration "<key>" from "<declared>" to "<changed>"
    Then the report write preflight rejects "<label>" with observed "<changed>", required "<declared>", why "<why>" and repair "<repair>"
    And restoring controlled write declaration "<key>" to "<declared>" makes the report write preflight green

    Examples:
      | label | key | declared | changed | why | repair |
      | report Function URL auth | report-url-auth | NONE | AWS_IAM | anonymous reports must not need a sign-in route | restore report-url-auth |
      | mint Function URL auth | mint-url-auth | NONE | AWS_IAM | anonymous reports must not need a sign-in route | restore mint-url-auth |
      | push Function URL auth | push-url-auth | NONE | AWS_IAM | delivery subscriptions must be callable from the site | restore push-url-auth |
      | photo-presign Function URL auth | photo-presign-url-auth | NONE | AWS_IAM | the public write address must retain its settled posture | restore photo-presign-url-auth |
      | report Function URL origin | report-url-origin | https://preview.surfsuppanama.example | https://other.example | a loose origin lets another site spend the write budget | restore report-url-origin |
      | mint Function URL origin | mint-url-origin | https://preview.surfsuppanama.example | https://other.example | a loose origin lets another site spend the write budget | restore mint-url-origin |
      | push Function URL origin | push-url-origin | https://preview.surfsuppanama.example | https://other.example | a loose origin lets another site spend the write budget | restore push-url-origin |
      | photo-presign Function URL origin | photo-presign-url-origin | https://preview.surfsuppanama.example | https://other.example | a loose origin lets another site spend the write budget | restore photo-presign-url-origin |

  @slice-02 @driving_port @real-io @negative @error @covers-R13 @covers-R17
  Scenario Outline: Each write worker rejects a changed concurrency ceiling
    When the site owner changes controlled write declaration "<key>" from "<declared>" to "<changed>"
    Then the report write preflight rejects "<label>" with observed "<changed>", required "<declared>", why "<why>" and repair "<repair>"
    And restoring controlled write declaration "<key>" to "<declared>" makes the report write preflight green

    Examples:
      | label | key | declared | changed | why | repair |
      | report reserved concurrency | report-limit | 2 | 3 | the report flood ceiling is no longer bounded | restore report-limit |
      | mint reserved concurrency | mint-limit | 1 | 2 | mint traffic can outrun its cost ceiling | restore mint-limit |
      | push reserved concurrency | push-limit | 1 | 2 | push traffic can outrun its cost ceiling | restore push-limit |
      | photo-presign reserved concurrency | photo-presign-limit | 1 | 2 | presign traffic can outrun its cost ceiling | restore photo-presign-limit |

  @slice-02 @driving_port @real-io @negative @error @covers-R14 @covers-R17
  Scenario Outline: The write store rejects every changed fixed capacity value
    When the site owner changes controlled write declaration "<key>" from "<declared>" to "<changed>"
    Then the report write preflight rejects "<label>" with observed "<changed>", required "<declared>", why "<why>" and repair "<repair>"
    And restoring controlled write declaration "<key>" to "<declared>" makes the report write preflight green

    Examples:
      | label | key | declared | changed | why | repair |
      | write table billing mode | table-billing-mode | PROVISIONED | PAY_PER_REQUEST | on-demand writes make the bill the only limit | restore table-billing-mode |
      | write table read capacity | table-read-capacity | 25 | 26 | the fixed free-tier read ceiling must not drift | restore table-read-capacity |
      | write table write capacity | table-write-capacity | 25 | 26 | the fixed free-tier write ceiling must not drift | restore table-write-capacity |

  @slice-02 @driving_port @real-io @negative @error @covers-R15 @covers-R17
  Scenario Outline: Each named write breaker alarm must remain declared
    When the site owner changes controlled write declaration "<key>" from "<declared>" to "<changed>"
    Then the report write preflight rejects "<label>" with observed "<changed>", required "<declared>", why "<why>" and repair "<repair>"
    And restoring controlled write declaration "<key>" to "<declared>" makes the report write preflight green

    Examples:
      | label | key | declared | changed | why | repair |
      | report breaker alarm | report-breaker-alarm | declared | missing | a report flood can keep spending without an alarm | restore report-breaker-alarm |
      | mint breaker alarm | mint-breaker-alarm | declared | missing | a mint flood can keep spending without an alarm | restore mint-breaker-alarm |
      | push breaker alarm | push-breaker-alarm | declared | missing | a push flood can keep spending without an alarm | restore push-breaker-alarm |
      | photo-presign breaker alarm | photo-presign-breaker-alarm | declared | missing | a presign flood can keep spending without an alarm | restore photo-presign-breaker-alarm |

  @slice-02 @driving_port @real-io @negative @error @covers-R16 @covers-R17
  Scenario Outline: Each device-only quota limit rejects a changed identity or allowance
    When the site owner changes controlled write declaration "<key>" from "<declared>" to "<changed>"
    Then the report write preflight rejects "<label>" with observed "<changed>", required "<declared>", why "<why>" and repair "<repair>"
    And restoring controlled write declaration "<key>" to "<declared>" makes the report write preflight green

    Examples:
      | label | key | declared | changed | why | repair |
      | report device daily limit | report-device-limit | 20 | 21 | anonymous reports need the settled daily device ceiling | restore report-device-limit |
      | presign device daily limit | presign-device-limit | 10 | 11 | photo grants need the settled daily device ceiling | restore presign-device-limit |
      | subscription device daily limit | subscription-device-limit | 20 | 21 | subscription writes need the settled daily device ceiling | restore subscription-device-limit |
      | quota identity | quota-identity | device-only | per-IP | per-IP quotas do not match the anonymous credential boundary | restore quota-identity |

  @slice-02 @driving_port @real-io @negative @error @covers-R18 @covers-R17
  Scenario Outline: The guard rejects the falsified sizing source
    When the site owner changes controlled write declaration "<key>" from "<declared>" to "<changed>"
    Then the report write preflight rejects "<label>" with observed "<changed>", required "<declared>", why "<why>" and repair "<repair>"
    And restoring controlled write declaration "<key>" to "<declared>" makes the report write preflight green

    Examples:
      | label | key | declared | changed | why | repair |
      | corrected sizing source | sizing-source | system-architecture.md section 6.1 | 07-write-path.md section 12 | the write-path arithmetic is falsified and cannot set a budget guard | restore sizing-source |
