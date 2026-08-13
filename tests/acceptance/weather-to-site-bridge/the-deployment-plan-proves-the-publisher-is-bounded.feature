@feature-weather-to-site-bridge
Feature: The deployment plan proves the publisher is bounded

  The operator who is going to deploy this reads the limit in the plan, not
  in a promise. So the plan of everything that would be deployed has to say
  it out loud: one publisher, carrying the project's own image, on the same
  processor family as the rest of the pipeline, running one cycle at a time
  and cut off after five minutes, told the production address of the site it
  publishes.

  And it has to say who may start it. Build, and nothing else. No timetable
  of its own, nothing watching the store for changes, no waiting line
  anywhere in any plan. Its permissions may add pages and read the bundle
  Build wrote; they may not erase anything. Their only ListBucket permission
  is scoped to distinguishing a missing bundle or durable surface from a
  denied read. Neither Build nor the publisher is ever quietly run twice for
  the same hour. Build's reviewed limit covers the wait it now takes on, and
  the limit a deployer reads is the limit that deploys. Finally, a site that
  quietly stops republishing has to page a human.

  Every scenario here reads the plan the project draws up with no cloud
  credential at all. Nothing is deployed, nothing is uploaded, and no live
  console is ever consulted: a plan is what a deployer can read before
  spending a cent, and that is exactly what these scenarios read.

  @slice-02 @driving_port @real-io
  Scenario: The plan carries the publisher bounded exactly as the decision says
    Given the deployment plan is drawn up with no cloud credential at all
    When the operator reads what would be deployed
    Then the plan carries a publisher that runs the project's own image on the same processor family as the rest of the pipeline
    And the publisher runs one cycle at a time and is cut off after five minutes
    And the publisher is told the production address of the site and the store it publishes into
    And no function that was already there runs any more cycles at once than it already did

  @slice-02 @driving_port @real-io @error
  Scenario: Build is the only thing that can start the publisher
    Given the deployment plan is drawn up with no cloud credential at all
    When the operator reads what would be deployed
    Then the plan carries a publisher
    And no timetable anywhere starts the publisher
    And nothing anywhere watches the store and starts work when it changes
    And there is no waiting line anywhere in any plan
    And Build is allowed to start the publisher

  @slice-02 @driving_port @real-io @error
  Scenario: The publisher may add pages, may never erase one, and scopes missing-object reads
    Given the deployment plan is drawn up with no cloud credential at all
    When the operator reads what would be deployed
    Then the plan carries a publisher
    And nothing the publisher is allowed to do can erase anything
    And the publisher may distinguish only its missing bundle or durable surface from a denied read
    And the publisher may read the bundle Build wrote and may write the durable archive and the published pages

  @slice-02 @driving_port @real-io @error
  Scenario: Neither Build nor the publisher is ever quietly run twice for the same hour
    Given the deployment plan is drawn up with no cloud credential at all
    When the operator reads what would be deployed
    Then the plan carries a publisher
    And a failed hour is never automatically repeated, for Build or for the publisher

  @slice-02 @driving_port @real-io
  Scenario: Build's reviewed limit covers the wait, and the limit a deployer reads is the limit that deploys
    Given the deployment plan is drawn up with no cloud credential at all
    When the operator reads what would be deployed
    Then Build's limit covers its own two minutes plus the whole time the publisher may take
    And the limit written in the reviewed declaration is the limit that would deploy

  @slice-02 @driving_port @real-io @kpi
  Scenario: A site that quietly stops republishing pages a human
    Given the deployment plan is drawn up with no cloud credential at all
    When the operator reads what would be deployed
    Then every finished publication is counted, read from the very line the publisher prints when it finishes one
    And two hours with no finished publication pages a human on the channel the rest of the pipeline already uses
    And that same channel is told when publication comes back
    And two hours of pure silence counts as failure, never as good news
