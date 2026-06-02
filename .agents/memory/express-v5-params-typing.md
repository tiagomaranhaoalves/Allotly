---
name: Express v5 route param typing
description: Why req.params.X is typed string | string[] under @types/express v5 and how we handle it
---

# Express v5 `req.params` is `string | string[]`

Under `@types/express` v5, `ParamsDictionary` is `{ [key: string]: string | string[] }`.
Once any middleware is in the chain, route-param inference is lost and `req.params.X`
widens to `string | string[]`, which breaks Drizzle `eq(col, req.params.id)` calls and
any code expecting a plain `string`.

**Why:** This is the single largest source of TS errors in `server/routes.ts` (~48 of them).
It is not a bug in our code — it is the v5 type definition.

**How to apply:** Wrap with `String(req.params.X)` at the use site (e.g.
`eq(table.id, String(req.params.id))`). Do this rather than disabling the check or
casting `req.params` wholesale. `npm run check` (`tsc` + description-hash check) is the
gate that catches regressions — keep it green.
