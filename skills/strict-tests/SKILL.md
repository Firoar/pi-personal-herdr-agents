---
name: strict-tests
description: Write tests that would fail if the feature were wrong or deleted; red first, exact assertions, real boundaries, no weakening.
---

# Strict tests

A test is strict when it fails for the right reason before the change and passes
for the right reason after it. Coverage percentage is not the goal; the goal is
that a wrong implementation cannot pass.

## The loop

1. Turn the requirement into a concrete input and an exact expected output.
2. Write the smallest test that fails without the change.
3. Run it. Confirm it fails for the intended reason, not a typo or a missing
   import.
4. Implement or fix the behavior.
5. Run the focused test, then the suite. Confirm the test now passes and the
   rest still passes.
6. If you had to weaken an assertion to pass, stop and escalate.

## What to cover

- the happy path with a realistic input
- the boundaries: empty, one, many, maximum, zero, negative
- the error paths: invalid input, missing dependency, timeout, permission
- the cases the implementation is most likely to get wrong: ordering,
  duplicates, partial failure, retries, cleanup
- the regression that motivated the change

## What to avoid

- snapshots of large objects when a few exact fields would do
- asserting on private structure instead of behavior
- `sleep` for synchronization; use the code's own completion signal
- shared mutable state between tests
- tests that pass when the feature is deleted
- mocks that replace the behavior under test
- weakening or deleting a failing test to make the suite green

## Naming and evidence

Name the test after the behavior and the condition, such as
`rejects a duplicate role name from two packs`. In the report, give the exact
command and the red and green results. If you could not run a case, say so
instead of implying it passed.
