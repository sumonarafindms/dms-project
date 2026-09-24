/**
 * Reading a JSON request body without letting a bad one become a 500.
 *
 * v202: every write route did `await req.json()`. An empty body, a body that
 * is not JSON, or a body of `null` / `[]` / `5` threw — either in the parse or
 * on the first `b.field` — and the route answered with a server error and a
 * stack trace in the log. The app's own screens always send an object, so this
 * only ever came from outside callers, but a 500 is still the wrong answer to
 * "you sent nonsense".
 *
 * This always returns a plain object. Anything that is not a JSON object reads
 * as `{}`, so the route's own checks refuse it with their usual 400 ("Which
 * date?", "Give the product a name." …) instead of crashing.
 *
 * The return type is deliberately as loose as `req.json()`'s was, so no route's
 * field handling changes: each still validates its own fields.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JsonBody = Record<string, any>;

export async function readJson(req: Request): Promise<JsonBody> {
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  // A body can name "__proto__"; JSON.parse makes it an own key, which is
  // harmless, but copying into a null-prototype object keeps it that way.
  return Object.assign(Object.create(null), parsed) as JsonBody;
}
