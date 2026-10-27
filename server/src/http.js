// server/src/http.js
// Small helpers for route handlers.

// Throw inside a handler (or a transaction, which rolls it back) to send a specific error
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Wraps a handler so HttpErrors become JSON responses; other errors reach the 500 handler.
// translate(err) can turn known database errors into HttpErrors.
export const handle = (fn, translate = (err) => err) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    const e = translate(err);
    if (!(e instanceof HttpError)) throw e;
    res.status(e.status).json({ error: e.message });
  }
};

export function parseId(value, notFoundMessage = 'Not found.') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, notFoundMessage);
  return id;
}

export function parseBody(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  return parsed.data;
}
