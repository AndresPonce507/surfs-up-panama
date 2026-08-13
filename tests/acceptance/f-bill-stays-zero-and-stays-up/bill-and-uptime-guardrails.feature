@feature-f-bill-stays-zero-and-stays-up
Feature: A deploy is rejected before it can freeze the forecast, drop the archive's recovery path, or let a write flood outrun the bill

  The site owner protects the irreplaceable prediction archive and the
  signals that keep the site affordable. Declarations live in
  infra/lib/guardrail-declarations.ts; the default `infra` job of
  `npm run ci:local` rejects a deploy whose declarations drift, naming
  what broke, why it matters, and how to restore it.

  Background:
    Given the site owner protects the prediction archive and the site's spending limits

  @slice-01 @driving_port @real-io @covers-R1 @covers-R3 @covers-R4
  Scenario: The default infrastructure job proves the real archive bucket ships with versioning
    When the site owner starts the documented infrastructure job against the real repository
    Then the infrastructure job finishes successfully
    And the produced result names the archive bucket versioning as enabled and why it matters
    And the produced result reports its production guardrail test and credential-free synth

  @slice-01 @driving_port @real-io @negative @error @covers-R1 @covers-R2
  Scenario: A contained declaration missing archive bucket versioning is rejected
    When the site owner inspects a contained bill-declaration fixture with archive bucket versioning suspended
    Then the bill-declaration check does not succeed
    And declaration-only failures leave the source fixture and the repository infrastructure unchanged
    And the produced result names the archive bucket versioning, the observed and required values, and why it matters

  @slice-02 @driving_port @real-io @covers-R5 @covers-R6 @covers-R7 @covers-R8 @covers-R9 @covers-R10 @covers-R11
  Scenario: The default infrastructure job names the dead-man's switch's four load-bearing properties
    When the site owner starts the documented infrastructure job against the real repository
    Then the infrastructure job finishes successfully
    And the produced result names the dead-man's switch metric, its BREACHING handling, its evaluation periods, its actions, and the honest detection floor

  @slice-02 @driving_port @real-io @negative @error @coupled @covers-R6 @covers-R7 @covers-R8 @covers-R9 @covers-R10 @covers-R11
  Scenario: Every dead-man's switch property regression is rejected naming exactly that property
    When the site owner checks each contained dead-man's-switch property regression
      | witness                | required value | regressed value |
      | watched metric         | IngestSuccess   | IngestFailure    |
      | missing-data handling  | BREACHING       | RECOVERY_POINTS |
      | evaluation periods     | 2               | 1                |
      | ALARM action           | present         | missing          |
      | OK action              | present         | missing          |
    Then declaration-only failures leave the source fixture and the repository infrastructure unchanged
    And each dead-man's-switch regression is rejected naming its own property, observed value, and required value

  @slice-02 @driving_port @real-io @negative @error @covers-R5 @covers-R11
  Scenario: A contained declaration with no dead-man's switch at all is rejected
    When the site owner inspects a contained bill-declaration fixture with no dead-man's switch declared
    Then the bill-declaration check does not succeed
    And declaration-only failures leave the source fixture and the repository infrastructure unchanged
    And the produced result says the dead-man's switch declaration is missing entirely

  @slice-03 @driving_port @real-io @covers-R12 @covers-R13 @covers-R14 @covers-R15 @covers-R16 @covers-R17
  Scenario: The default infrastructure job names the five money lines, the created-not-imported $20 line, and the exact deny scope
    When the site owner starts the documented infrastructure job against the real repository
    Then the infrastructure job finishes successfully
    And the produced result names the five money lines and that the $20 line is created by this project, never imported
    And the produced result names the deny scope as exactly the four write Function URLs, the ingest role deliberately excluded, and that those URLs do not exist yet
    And the produced result names the project cost-allocation tag

  @slice-03 @driving_port @real-io @negative @error @coupled @covers-R12 @covers-R13 @covers-R14 @covers-R15 @covers-R17
  Scenario: Every money-line or deny-scope regression is rejected naming exactly what broke
    When the site owner checks each contained money-line or deny-scope regression
      | witness                        | observed value                     |
      | $18 threshold drift            | 25                                  |
      | $20 last line claims import    | imported-from-account               |
      | deny scope widened             | write-report-function-url, write-mint-function-url, write-push-function-url, write-photo-presign-function-url, write-extra-function-url |
      | deny scope names the ingest role | write-report-function-url, write-mint-function-url, write-push-function-url, write-photo-presign-function-url, ingest-lambda-execution-role |
    Then declaration-only failures leave the source fixture and the repository infrastructure unchanged
    And each money-line or deny-scope regression is rejected naming its own witness and observed value
    And the ingest-role regression names the prediction archive as the reason

  # Slice-04 reads recorded evidence of the live account. The evidence is a
  # real production outage of 2026-08-11 to 13, NOT the synthetic drill this
  # slice originally planned: nobody disabled a schedule. Both switches went
  # ALARM and then OK for real, which is better evidence than a drill and is
  # different evidence, so the report says which is which and refuses the two
  # claims the incident cannot support: a stopwatch detection time, and a read
  # email.

  @slice-04 @driving_port @real-io @covers-R18 @covers-R19
  Scenario: Both dead-man's switches are proven alive by a complete ALARM then OK cycle on the live account
    When the site owner reads the recorded alarm-probe capture of the live incident
    Then the alarm probe finishes successfully
    And the produced report names each dead-man's switch, the instant it raised ALARM, the instant OK closed it, and the region
    And the produced report quotes the state reason that filled each ALARM mail and each OK mail
    And the produced report names the one confirmed subscription on the alarm topic

  @slice-04 @driving_port @real-io @covers-R18
  Scenario: The report proves the 2 to 3 hour detection floor from the deployed switch, never from a stopwatch
    When the site owner reads the recorded alarm-probe capture of the live incident
    Then the alarm probe finishes successfully
    And the produced report reads the detection floor off the deployed switch: 2 consecutive 1 h periods with missing data treated as breaching
    And the produced report says both switches raised ALARM on their first evaluation with no run behind them, so the wait from a last good run to the mail was never measured here
    And the produced report never promises the site owner hears about a stall within the hour

  @slice-04 @driving_port @real-io @covers-R19
  Scenario: The report proves the mail reached the subscription and never claims anyone read it
    When the site owner reads the recorded alarm-probe capture of the live incident
    Then the alarm probe finishes successfully
    And the produced report says a delivery was recorded in the hour of every state change and that no delivery failed in the window
    And the produced report says the mail body was never opened, so its wording stays unproven

  @slice-04 @driving_port @real-io @covers-R18 @covers-R19
  Scenario: The report says a real outage produced this cycle and that no schedule was ever disabled to stage it
    When the site owner reads the recorded alarm-probe capture of the live incident
    Then the alarm probe finishes successfully
    And the produced report says the cycle came from a real production incident, never from a staged drill
    And the produced report says no ingest schedule was disabled or re-enabled to produce it

  @slice-04 @driving_port @real-io @negative @error @coupled @covers-R18 @covers-R19
  Scenario: Every half-proven capture is rejected naming what it leaves unproven
    When the site owner checks each incomplete alarm-probe capture
      | witness                                        | the rejection must name              |
      | an ALARM that no OK ever closed                | no OK transition                     |
      | a switch with no OK action to send the all-clear | OK action                          |
      | a subscription that was never confirmed        | unconfirmed subscription             |
      | a delivery to the subscription that failed     | failed delivery                      |
      | a watched switch missing from the capture      | surfs-up-panama-build-dead-mans-switch |
    Then the recorded evidence capture is left unchanged
    And each incomplete capture is rejected naming exactly what it leaves unproven
