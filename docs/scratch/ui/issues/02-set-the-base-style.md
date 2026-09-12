# Set the base style

Status: ready-for-agent Type: task Blocked by: none

`ui/src/index.css` still carries what `pnpm create vite` generated: a centred 1126px `#root`, a
`.counter` class, a `#social .button-icon` rule and a `--social-bg` token, none of which the page
uses. `App.css` then fights it with its own width and its own left alignment.

One base the later tickets build on: the tokens, the type scale and the spacing rhythm, stated
once. The rules are in `docs/scratch/ui/spec.md`.

The panels look the same afterwards. Only the stray centring and the dead rules go.

## Acceptance criteria

- [ ] No rule and no token in `ui/src/` is unused.
- [ ] The column width and the text alignment are set in one place, not two.
- [ ] Heading, body and note sizes come from the scale in the spec, with no one-off font sizes.
- [ ] Vertical rhythm is one spacing step and its multiples, not a different margin per rule.
- [ ] The page reads in both colour schemes, with every colour defined in each.
- [ ] The five panels render the same fields, in the same order, as before.

## Comments
