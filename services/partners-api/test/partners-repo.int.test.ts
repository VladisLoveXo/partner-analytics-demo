import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../src/db.js";
import { HttpError } from "../src/errors.js";
import { createPartnersRepo, type PartnersRepo } from "../src/partners-repo.js";
import { MIGRATIONS_DIR, startPostgres, type TestPostgres } from "./helpers/containers.js";

let pg: TestPostgres;
let repo: PartnersRepo;

beforeAll(async () => {
  pg = await startPostgres();
  repo = createPartnersRepo(pg.pool);
});

afterAll(async () => {
  await pg?.stop();
});

describe("migrations", () => {
  it("apply nothing the second time", async () => {
    expect(await runMigrations(pg.pool, MIGRATIONS_DIR)).toEqual([]);
  });
});

describe("partners repository", () => {
  it("creates a partner and reads it back", async () => {
    const created = await repo.create({ id: "acme", name: "Acme" });

    expect(created).toMatchObject({ id: "acme", name: "Acme", status: "active" });
    expect(await repo.get("acme")).toEqual(created);
    expect((await repo.list()).map((partner) => partner.id)).toContain("acme");
  });

  it("answers 409 when the id is taken", async () => {
    await repo.create({ id: "taken", name: "First" });

    const error = await repo.create({ id: "taken", name: "Second" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(409);
  });

  it("returns null for an unknown partner", async () => {
    expect(await repo.get("missing")).toBeNull();
    expect(await repo.setStatus("missing", "disabled")).toBeNull();
  });

  it("finds only active partners among the given ids", async () => {
    await repo.create({ id: "on", name: "On" });
    await repo.create({ id: "off", name: "Off" });
    await repo.setStatus("off", "disabled");

    expect(await repo.findActive(["on", "off", "nope"])).toEqual(new Set(["on"]));
  });
});
