import { z } from "zod";
import { badRequest } from "./errors.js";

export const PARTNER_ID = /^[a-z0-9][a-z0-9-]{1,30}$/;

export const partnerIdSchema = z.string().regex(PARTNER_ID, "partner id: 2-31 characters of a-z, 0-9 and -");

export const partnerIdParams = z.object({ partnerId: partnerIdSchema });

export const rangeQuery = z.object({ from: z.string().optional(), to: z.string().optional() });

/** Parses request input with a zod schema; a mismatch becomes a 400 with the list of issues. */
export function parseWith<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw badRequest("invalid request", {
      issues: result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }
  return result.data;
}
