import type pg from "pg";
import { conflict } from "./errors.js";

export type PartnerStatus = "active" | "disabled";

export interface Partner {
  id: string;
  name: string;
  status: PartnerStatus;
  createdAt: string;
}

export interface PartnersRepo {
  list(): Promise<Partner[]>;
  get(id: string): Promise<Partner | null>;
  /** Throws a 409 HttpError when the id is taken. */
  create(input: { id: string; name: string }): Promise<Partner>;
  setStatus(id: string, status: PartnerStatus): Promise<Partner | null>;
  /** The subset of `ids` that exist and are active. */
  findActive(ids: readonly string[]): Promise<Set<string>>;
}

interface PartnerRecord {
  id: string;
  name: string;
  status: PartnerStatus;
  created_at: Date;
}

const COLUMNS = "id, name, status, created_at";
const UNIQUE_VIOLATION = "23505";

export function createPartnersRepo(pool: pg.Pool): PartnersRepo {
  return {
    async list() {
      const { rows } = await pool.query<PartnerRecord>(`SELECT ${COLUMNS} FROM partners ORDER BY id`);
      return rows.map(toPartner);
    },

    async get(id) {
      const { rows } = await pool.query<PartnerRecord>(`SELECT ${COLUMNS} FROM partners WHERE id = $1`, [id]);
      return rows[0] ? toPartner(rows[0]) : null;
    },

    async create({ id, name }) {
      try {
        const { rows } = await pool.query<PartnerRecord>(
          `INSERT INTO partners (id, name) VALUES ($1, $2) RETURNING ${COLUMNS}`,
          [id, name],
        );
        return toPartner(rows[0]!);
      } catch (error) {
        // The primary key decides under concurrency; checking first would race.
        if ((error as { code?: string }).code === UNIQUE_VIOLATION) throw conflict(`partner ${id} already exists`);
        throw error;
      }
    },

    async setStatus(id, status) {
      const { rows } = await pool.query<PartnerRecord>(
        `UPDATE partners SET status = $2 WHERE id = $1 RETURNING ${COLUMNS}`,
        [id, status],
      );
      return rows[0] ? toPartner(rows[0]) : null;
    },

    async findActive(ids) {
      if (ids.length === 0) return new Set();
      const { rows } = await pool.query<{ id: string }>(
        "SELECT id FROM partners WHERE id = ANY($1) AND status = 'active'",
        [ids],
      );
      return new Set(rows.map((row) => row.id));
    },
  };
}

function toPartner(record: PartnerRecord): Partner {
  return { id: record.id, name: record.name, status: record.status, createdAt: record.created_at.toISOString() };
}
