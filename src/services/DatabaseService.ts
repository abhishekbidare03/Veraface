/**
 * DatabaseService.ts  (v2)
 * SQLite + SQLCipher encrypted local DB.
 * Uses react-native-sqlite-storage with promise API.
 */

import SQLite from 'react-native-sqlite-storage';

SQLite.enablePromise(true);
SQLite.DEBUG(false); // disable verbose SQL logging in prod

const DB_NAME = 'veraface_v1.db';
// In production derive from Android Keystore / iOS Secure Enclave via react-native-keychain
const DB_ENC_KEY = 'VF_ENC_KEY_2024_CHANGE_BEFORE_DEPLOY';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Person {
  id: string;
  name: string;
  emp_id: string;
  /** base64-encoded 128×float32 embedding blob (512 bytes) */
  embedding: string;
  enrolled_at: number;
}

export interface AttendanceRecord {
  id: string;
  person_id: string;
  timestamp: number;
  confidence: number;
  liveness_ok: number; // 0 or 1
  lat: number | null;
  lon: number | null;
  synced: number;      // 0 = pending, 1 = synced
}

// ─── DatabaseService ──────────────────────────────────────────────────────────

class DatabaseService {
  private db: SQLite.SQLiteDatabase | null = null;

  async initialize(): Promise<void> {
    this.db = await SQLite.openDatabase({
      name: DB_NAME,
      key:  DB_ENC_KEY,
      location: 'default',
    });
    await this.runMigrations();
    console.log('[DB] Initialized and migrations applied');
  }

  private async runMigrations(): Promise<void> {
    const exec = (sql: string, params: any[] = []) =>
      this.db!.executeSql(sql, params);

    await exec(`CREATE TABLE IF NOT EXISTS persons (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      emp_id      TEXT UNIQUE NOT NULL,
      embedding   TEXT NOT NULL,
      enrolled_at INTEGER NOT NULL
    )`);

    await exec(`CREATE TABLE IF NOT EXISTS attendance_log (
      id          TEXT NOT NULL,
      person_id   TEXT NOT NULL,
      timestamp   INTEGER NOT NULL,
      confidence  REAL NOT NULL DEFAULT 0,
      liveness_ok INTEGER NOT NULL DEFAULT 0,
      lat         REAL,
      lon         REAL,
      synced      INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      FOREIGN KEY (person_id) REFERENCES persons(id)
    )`);

    await exec(`CREATE INDEX IF NOT EXISTS idx_attendance_synced
      ON attendance_log(synced)`);

    await exec(`CREATE INDEX IF NOT EXISTS idx_attendance_ts
      ON attendance_log(timestamp DESC)`);
  }

  // ─── Persons ────────────────────────────────────────────────────────────────

  async enrollPerson(person: Omit<Person, 'enrolled_at'>): Promise<void> {
    await this.db!.executeSql(
      `INSERT OR REPLACE INTO persons (id, name, emp_id, embedding, enrolled_at)
       VALUES (?, ?, ?, ?, ?)`,
      [person.id, person.name, person.emp_id, person.embedding, Date.now()],
    );
  }

  async getAllPersons(): Promise<Person[]> {
    const [res] = await this.db!.executeSql(`SELECT * FROM persons`);
    const out: Person[] = [];
    for (let i = 0; i < res.rows.length; i++) out.push(res.rows.item(i));
    return out;
  }

  async getPersonById(id: string): Promise<Person | null> {
    const [res] = await this.db!.executeSql(
      `SELECT * FROM persons WHERE id = ? LIMIT 1`, [id],
    );
    return res.rows.length > 0 ? (res.rows.item(0) as Person) : null;
  }

  async deletePerson(id: string): Promise<void> {
    await this.db!.executeSql(`DELETE FROM persons WHERE id = ?`, [id]);
  }

  async countPersons(): Promise<number> {
    const [res] = await this.db!.executeSql(`SELECT COUNT(*) as cnt FROM persons`);
    return res.rows.item(0).cnt as number;
  }

  // ─── Attendance Log ──────────────────────────────────────────────────────────

  async logAttendance(record: Omit<AttendanceRecord, 'id' | 'synced'>): Promise<string> {
    const id = this.genId();
    await this.db!.executeSql(
      `INSERT INTO attendance_log (id, person_id, timestamp, confidence, liveness_ok, lat, lon, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [id, record.person_id, record.timestamp, record.confidence,
       record.liveness_ok, record.lat, record.lon],
    );
    return id;
  }

  async getPendingAttendance(limit = 100): Promise<AttendanceRecord[]> {
    const [res] = await this.db!.executeSql(
      `SELECT * FROM attendance_log WHERE synced = 0 ORDER BY timestamp ASC LIMIT ?`,
      [limit],
    );
    const out: AttendanceRecord[] = [];
    for (let i = 0; i < res.rows.length; i++) out.push(res.rows.item(i));
    return out;
  }

  async getAllAttendance(limit = 500): Promise<Array<AttendanceRecord & { person_name: string; emp_id: string }>> {
    const [res] = await this.db!.executeSql(
      `SELECT al.*, p.name as person_name, p.emp_id
       FROM attendance_log al
       LEFT JOIN persons p ON p.id = al.person_id
       ORDER BY al.timestamp DESC
       LIMIT ?`,
      [limit],
    );
    const out = [];
    for (let i = 0; i < res.rows.length; i++) out.push(res.rows.item(i));
    return out;
  }

  async getPendingCount(): Promise<number> {
    const [res] = await this.db!.executeSql(
      `SELECT COUNT(*) as cnt FROM attendance_log WHERE synced = 0`,
    );
    return res.rows.item(0).cnt as number;
  }

  async markSynced(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    await this.db!.executeSql(
      `UPDATE attendance_log SET synced = 1 WHERE id IN (${placeholders})`,
      ids,
    );
  }

  /** Delete synced records older than 30 days. Returns count deleted. */
  async purgeOldRecords(): Promise<number> {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const [res] = await this.db!.executeSql(
      `DELETE FROM attendance_log WHERE synced = 1 AND timestamp < ?`,
      [cutoff],
    );
    return res.rowsAffected;
  }

  // ─── Utils ───────────────────────────────────────────────────────────────────

  /** Generate a random hex ID without requiring uuid package */
  private genId(): string {
    const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
    return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-${hex()}-${hex()}${hex()}${hex()}`;
  }

  async close(): Promise<void> {
    await this.db?.close();
    this.db = null;
  }

  get isOpen(): boolean {
    return this.db !== null;
  }
}

export const db = new DatabaseService();
export default db;
