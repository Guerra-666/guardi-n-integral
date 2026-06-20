import { createClient, type Client } from "@libsql/client/web";

let _client: Client | null = null;
let _initPromise: Promise<void> | null = null;

export function getDb(): Client {
  if (_client) return _client;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error("TURSO_DATABASE_URL no está configurado");
  _client = createClient({ url, authToken });
  return _client;
}

const SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    rfid_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT CHECK(role IN ('OFICIAL','SARGENTO','PERSONAL')) NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS attendance_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    check_in_timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    check_out_timestamp TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
  )`,
  `CREATE TABLE IF NOT EXISTS weapons (
    id TEXT PRIMARY KEY,
    serial_number TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    characteristics TEXT NOT NULL,
    current_status TEXT CHECK(current_status IN ('DISPONIBLE','PRESTADA','MANTENIMIENTO')) DEFAULT 'DISPONIBLE',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS weapon_transactions (
    id TEXT PRIMARY KEY,
    weapon_id TEXT NOT NULL,
    recipient_user_id TEXT NOT NULL,
    authorizing_user_id TEXT NOT NULL,
    co_authorizing_officer_id TEXT,
    loaned_at_timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    returned_at_timestamp TEXT,
    return_received_by_user_id TEXT,
    FOREIGN KEY (weapon_id) REFERENCES weapons(id) ON DELETE RESTRICT,
    FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (authorizing_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (co_authorizing_officer_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (return_received_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_users_rfid ON users(rfid_code)`,
  `CREATE INDEX IF NOT EXISTS idx_weapons_serial ON weapons(serial_number)`,
];

const SEED_USERS = [
  { id: "u-of-001", rfid_code: "RFID-OF-001", name: "Cap. Ricardo Mendoza", role: "OFICIAL" },
  { id: "u-of-002", rfid_code: "RFID-OF-002", name: "Tte. Alejandra Vargas", role: "OFICIAL" },
  { id: "u-sg-001", rfid_code: "RFID-SG-001", name: "Sgto. Hugo Ramírez", role: "SARGENTO" },
  { id: "u-sg-002", rfid_code: "RFID-SG-002", name: "Sgto. Luisa Treviño", role: "SARGENTO" },
  { id: "u-sg-003", rfid_code: "RFID-SG-003", name: "Sgto. Mario Castañeda", role: "SARGENTO" },
  { id: "u-ps-001", rfid_code: "RFID-PS-001", name: "Sdo. Juan Pérez", role: "PERSONAL" },
  { id: "u-ps-002", rfid_code: "RFID-PS-002", name: "Sdo. María López", role: "PERSONAL" },
  { id: "u-ps-003", rfid_code: "RFID-PS-003", name: "Sdo. Carlos Gómez", role: "PERSONAL" },
  { id: "u-ps-004", rfid_code: "RFID-PS-004", name: "Sdo. Diana Soto", role: "PERSONAL" },
];

const SEED_WEAPONS = [
  { id: "w-001", serial: "FX-AR15-0001", name: "Fusil AR-15", chars: "Calibre 5.56mm, cargador 30 cartuchos" },
  { id: "w-002", serial: "FX-AR15-0002", name: "Fusil AR-15", chars: "Calibre 5.56mm, cargador 30 cartuchos" },
  { id: "w-003", serial: "GL-17-0010", name: "Pistola Glock 17", chars: "Calibre 9mm, cargador 17 cartuchos" },
  { id: "w-004", serial: "GL-17-0011", name: "Pistola Glock 17", chars: "Calibre 9mm, cargador 17 cartuchos" },
  { id: "w-005", serial: "BR-870-0003", name: "Escopeta Beretta 870", chars: "Calibre 12, capacidad 7 cartuchos" },
  { id: "w-006", serial: "HK-MP5-0007", name: "Subfusil HK MP5", chars: "Calibre 9mm, cargador 30 cartuchos" },
];

export async function ensureSchema(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const db = getDb();
    for (const sql of SCHEMA_SQL) await db.execute(sql);
    const { rows } = await db.execute("SELECT COUNT(*) as c FROM users");
    const count = Number((rows[0] as any).c);
    if (count === 0) {
      for (const u of SEED_USERS) {
        await db.execute({
          sql: "INSERT INTO users (id, rfid_code, name, role) VALUES (?, ?, ?, ?)",
          args: [u.id, u.rfid_code, u.name, u.role],
        });
      }
      for (const w of SEED_WEAPONS) {
        await db.execute({
          sql: "INSERT INTO weapons (id, serial_number, name, characteristics) VALUES (?, ?, ?, ?)",
          args: [w.id, w.serial, w.name, w.chars],
        });
      }
    }
  })();
  return _initPromise;
}
