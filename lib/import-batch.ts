import { prisma } from "./prisma";

/**
 * The batch that already holds this file's hash — if it still counts (v200).
 *
 * The batch row, with its unique hash, is written BEFORE the import's
 * transaction. When that transaction failed, the batch was only marked
 * FAILED; when the route was killed at its time limit, not even that — it
 * stayed PROCESSING for ever. Either way the hash stayed taken, and every
 * later upload of the same file was answered "This exact file was already
 * imported. No GA was counted twice" — although nothing had been stored.
 * OB, which had no duplicate check at all, crashed on the unique hash with a
 * raw database error.
 *
 * So a FAILED batch, or a PROCESSING one older than any import can run, gives
 * its hash up: it is renamed (kept for the upload history, never deleted) and
 * the upload goes ahead. A COMPLETED batch — or one still genuinely running —
 * is still the duplicate it always was.
 */
const STALE_AFTER_MS = 15 * 60_000;

export async function priorImport(hash: string) {
  const prior = await prisma.importBatch.findUnique({ where: { hash } });
  if (!prior) return null;
  const stale = prior.status === "PROCESSING" && Date.now() - prior.uploadedAt.getTime() > STALE_AFTER_MS;
  if (prior.status === "FAILED" || stale) {
    await prisma.importBatch.update({
      where: { id: prior.id },
      data: { hash: `${hash}#retired-${prior.id}`, ...(stale ? { status: "FAILED" } : {}) },
    });
    return null;
  }
  return prior;
}
