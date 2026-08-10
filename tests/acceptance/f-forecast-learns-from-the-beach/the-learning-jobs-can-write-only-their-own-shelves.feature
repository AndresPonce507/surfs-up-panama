@feature-f-forecast-learns-from-the-beach
Feature: The learning jobs exist as declarations whose write fences are enforced by the gate, not by discipline

  Packaging, not new math. The nightly fit and the monthly evaluation become
  deployable jobs whose clocks, memory and write fences are declared beside
  the other infrastructure guardrails, and the same local gate that already
  protects the archive and the bill rejects any drift in those declarations,
  credential-free, before any deploy could happen. Nothing in this file
  deploys anything: AWS deploys are walled for this project (CloudFormation
  writes are denied to the CLI identity, feature-delta Pre-requisite 4), so
  every scenario here proves the fences the way the house always has —
  against declarations and a contained fixture copy, never a live account.

  These scenarios were authored ahead of their slice's turn on the owner's
  2026-08-10 instruction and are parked behind the scaffold skip-marker in
  steps/support/pending-slices.ts until slice-06 enters DELIVER.

  Background:
    Given the site owner protects the numbers the learning jobs may touch

  @slice-06 @driving_port @real-io @covers-R36 @covers-R40
  Scenario: The infrastructure gate names the learning jobs, their clocks and their write fences
    When the site owner examines the repository's infrastructure declarations for the learning jobs
    Then the learning-infra examination finishes successfully
    And the produced result names the nightly fit's two write shelves and the denied complement
    And the produced result names the monthly evaluation's one metrics shelf
    And the produced result names both schedules and the credential-free proof

  @slice-06 @driving_port @real-io @negative @security @covers-R36 @covers-R37
  Scenario: A contained declaration whose nightly job could write into the prediction archive is rejected
    When the site owner inspects a contained learning-infra fixture whose nightly write fence reaches the prediction archive
    Then the learning-infra check does not succeed
    And the rejection names the forbidden shelf and why the archive is untouchable
    And the source fixture and the repository infrastructure are left unchanged

  @slice-06 @driving_port @real-io @negative @error @covers-R36
  Scenario: A contained declaration with no nightly clock at all is rejected
    When the site owner inspects a contained learning-infra fixture with no nightly schedule declared
    Then the learning-infra check does not succeed
    And the rejection says the nightly schedule is missing entirely
    And the source fixture and the repository infrastructure are left unchanged

  @slice-06 @driving_port @real-io @negative @security @covers-R36
  Scenario: A contained declaration letting the monthly evaluation rewrite corrections is rejected
    When the site owner inspects a contained learning-infra fixture whose monthly job could rewrite corrections
    Then the learning-infra check does not succeed
    And the rejection names the monthly job's one legal shelf
    And the source fixture and the repository infrastructure are left unchanged
