---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.sol"
  - "**/*.js"
---

# Coding rules

## Names

Write short fully qualified names. No acronyms. Rename `req`, `cfg` and `impl` to the words they
stand for.

## Comments

Write a comment only when it carries information the code cannot: the reason behind a choice, a
non-obvious constraint, a gotcha the next reader would trip on.

Keep every comment short, brief, and direct. One line is the target.

Leave bare: configuration files, imports, boilerplate, and any line whose name already says what it
does. If a comment restates the code, delete it and let the code speak.

Rename the symbol before you explain it. A clear name retires the comment.
