# Specification-Driven Development (SDD)

This project records expected behavior before planning and implementing features. The specification is the product reference; the plan describes the technical solution; tasks break the work into verifiable steps.

## Workflow

1. **Understand:** identify the request, scope, affected users, and unresolved decisions.
2. **Specify:** create or update `docs/specs/<id>-<slug>/spec.md`. Describe observable behavior, requirements, and acceptance criteria without prematurely prescribing technical details.
3. **Review:** make questions and relevant alternatives explicit. Do not assume decisions that affect scope, cost, privacy, or user experience.
4. **Approve:** mark the specification as `Approved` only after the necessary decisions have been confirmed.
5. **Plan:** for an approved specification, document architecture, interfaces, data, risks, and validation in `plan.md`.
6. **Break down:** create `tasks.md` with small tasks traceable to requirements and clear completion criteria.
7. **Implement and validate:** complete the tasks, add tests, and run the checks appropriate to the project.
8. **Complete:** update affected documentation and mark the specification as `Completed` once all acceptance criteria are met.

Do not create plans or tasks as if a draft specification were already approved. If implementation reveals a necessary behavior change, update the specification and get approval before expanding the scope.

## Structure

```text
docs/
  SDD.md
  specs/
    0001-discord-music-bot/
      spec.md
      plan.md      # after approval
      tasks.md     # after plan approval
```

Use sequential numeric identifiers (`0002`, `0003`...) and short kebab-case slugs for new features. Small changes already covered by a specification may update it; independent features should get a new directory.

## Specification contents

Use this outline in `spec.md`:

```markdown
# <Feature name>

- **Status:** Draft | Approved | In Progress | Completed
- **Approver:** <person or team>

## Context and goal
## Users and preconditions
## Functional requirements
## Non-functional requirements
## Acceptance criteria
## Out of scope
## Open decisions
```

Number requirements (`FR-001`, `NFR-001`) to enable traceability. Acceptance criteria must be verifiable and should preferably describe a scenario, action, and expected result. Record approved decisions and update the status accordingly; do not erase relevant decision history.
