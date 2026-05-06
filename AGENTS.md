# Agent Instructions

## Core Rules
- Follow project architecture and conventions
- Prefer simple, maintainable solutions
- Always use RED GREEN TDD
- Do not make destructive changes without approval

## Documentation
- /docs contains committed project documentation
- shared personal skills and references are provided through the configured skills system
- all native-ios docs should be save in the native-ios dir in docs

## Deferred Todos
- Use `docs/workstreams/active/native-ios-deferred-todos.md` to track native iOS work that is intentionally postponed.
- When deferring a non-blocking native iOS task, add a todo to that file instead of leaving it only in chat.
- Each deferred todo must include a copy-ready prompt wrapped with clear `START PROMPT` and `END PROMPT` markers.
- Keep deferred prompts self-contained: include relevant docs to read, the goal, constraints, verification commands, and done criteria.
- Do not implement deferred todos unless the user explicitly asks for that todo or names the deferred todos workstream.

## Errors
- when addressing errors and fixing them, be very specific about focusing that error only and not changing any code that is working fine

## Workstream usage
Only use workstreams from:
docs/workstreams/active/
Do not use workstreams from:
docs/workstreams/archive/
docs/workstreams/archived/
docs/workstreams/legacy/
docs/workstreams/completed/
unless the prompt explicitly names one of those files.
When implementing a task, treat the named workstream file as the source of truth.
Do not infer requirements from similarly named older workstreams.
When a workstream is completed move it to the completed dir
Keep all native-ios workstream in the native-ios dir docs

## UI Work
- Use the ui-design skill
- Use the ui-review skill when evaluating or revising interfaces

## Swift - IOS dev
Use current Swift and SwiftUI best practices aligned with Apple guidelines: prefer declarative UI, unidirectional data flow, and state-driven updates; structure code with small, composable views; use native frameworks over custom abstractions; ensure performance, accessibility, and consistency with the Human Interface Guidelines; write clear, type-safe, and maintainable code with minimal side effects.
