import { existsSync, rmSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, openDb } from '../db.js';
import type { InternalDb } from '../types.js';

const TEST_DB = './test-db-phase1';
const REOPEN_DB = './test-db-phase1-reopen';
const TEST_SCHEMA = './schema.esdl';

function removeDir(dir: string): void {
  if (existsSync(dir)) rmSync(dir, { recursive: true });
}

describe('openDb', () => {
  let db: InternalDb;
  let createdDataDir = false;

  beforeAll(async () => {
    removeDir(TEST_DB);
    db = (await openDb(TEST_DB, TEST_SCHEMA)) as InternalDb;
    createdDataDir = existsSync(TEST_DB);
  });

  afterAll(async () => {
    await closeDb(db);
    removeDir(TEST_DB);
  });

  it('creates the data directory if it does not exist', () => {
    expect(createdDataDir).toBe(true);
  });

  it('loads pgvector extension so vector columns can be created', async () => {
    const result = await db.pglite.query<{ extname: string }>(
      `SELECT extname FROM pg_extension WHERE extname = 'vector'`,
    );
    expect(result.rows[0]?.extname).toBe('vector');
  });

  it('creates _edgelite_migrations table on first open', async () => {
    const result = await db.pglite.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE tablename = '_edgelite_migrations'`,
    );
    expect(result.rows[0]?.tablename).toBe('_edgelite_migrations');
  });

  it('throws EdgeLiteConcurrencyError when called while in flight', async () => {
    const inFlightDb = db as unknown as Record<string, unknown>;
    inFlightDb.inFlight = true;
    try {
      await expect(db.run({})).rejects.toThrow('db.run() called while another query is in flight');
    } finally {
      inFlightDb.inFlight = false;
    }
  });
});

describe('reopening a data directory', () => {
  afterEach(() => {
    removeDir(REOPEN_DB);
  });

  it('does not error if _edgelite_migrations already exists (idempotent open)', async () => {
    const firstDb = await openDb(REOPEN_DB, TEST_SCHEMA);
    await closeDb(firstDb);
    const secondDb = await openDb(REOPEN_DB, TEST_SCHEMA);
    expect(secondDb).toBeDefined();
    await closeDb(secondDb);
  });

  it('accepts autoMigrate: true without throwing when no pending migrations exist', async () => {
    const db = await openDb(REOPEN_DB, TEST_SCHEMA, { autoMigrate: true });
    expect(db).toBeDefined();
    await closeDb(db);
  });
});
