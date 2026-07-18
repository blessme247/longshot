import { z } from "zod";

export const pickBodySchema = z.object({
  userId: z.string().min(1).max(64).optional(),
  fixtureId: z.number().int().positive(),
  outcome: z.enum(["home", "draw", "away"]),
});

export const verifyBodySchema = z.object({
  pubkey: z.string().min(32).max(44),
  signature: z.string().min(64).max(128),
  nonce: z.string().uuid(),
});

export const linkBodySchema = z.object({
  guestId: z.string().uuid(),
});

export const proofQuerySchema = z.object({
  fixtureId: z.coerce.number().int().positive(),
  identity: z.string().min(1).max(64),
});
