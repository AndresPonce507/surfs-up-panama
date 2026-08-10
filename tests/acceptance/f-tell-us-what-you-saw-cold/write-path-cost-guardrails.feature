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

  @slice-02 @driving_port @real-io @negative @error @coupled @covers-R12 @covers-R13 @covers-R14 @covers-R15 @covers-R16 @covers-R17 @covers-R18
  Scenario: Every one-value write safeguard regression is rejected with a useful repair
    When the site owner checks each controlled write safeguard regression
      | safeguard | declared value | changed value |
      | allowed site origin | https://preview.surfsuppanama.example | https://other.example |
      | report limit | 2 | missing |
      | table billing mode | PROVISIONED | PAY_PER_REQUEST |
      | table read capacity | 25 | 26 |
      | write breaker count | 4 | 3 |
      | subscription device limit | 20 | missing |
      | quota identity | device-only | per-IP |
      | sizing source | system-architecture.md section 6.1 | 07-write-path.md section 12 |
    Then each write safeguard regression is rejected naming what changed, the required value, why it matters and how to restore it
