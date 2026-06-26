import { createServerFn } from "@tanstack/react-start";

async function withDb<T>(fn: (db: import("@libsql/client/web").Client) => Promise<T>): Promise<T> {
  const { getDb, ensureSchema } = await import("./db.server");
  await ensureSchema();
  return fn(getDb());
}

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export type UserRow = {
  id: string;
  rfid_code: string;
  name: string;
  role: "OFICIAL" | "SARGENTO" | "PERSONAL";
  is_active: number;
};

export type WeaponRow = {
  id: string;
  serial_number: string;
  name: string;
  characteristics: string;
  current_status: "DISPONIBLE" | "PRESTADA" | "MANTENIMIENTO";
};

export const getDashboardData = createServerFn({ method: "GET" }).handler(async () => {
  return withDb(async (db) => {
    const users = await db.execute("SELECT id, rfid_code, name, role, is_active FROM users ORDER BY role, name");
    const weapons = await db.execute("SELECT id, serial_number, name, characteristics, current_status FROM weapons ORDER BY name, serial_number");
    const activeShift = await db.execute(`
      SELECT a.id, a.user_id, a.check_in_timestamp, u.name, u.role, u.rfid_code
      FROM attendance_logs a JOIN users u ON u.id = a.user_id
      WHERE a.check_out_timestamp IS NULL
      ORDER BY a.check_in_timestamp ASC
    `);
    const activeLoans = await db.execute(`
      SELECT t.id, t.loaned_at_timestamp, w.serial_number, w.name as weapon_name,
             ru.name as recipient_name, au.name as authorizer_name, ou.name as co_officer_name
      FROM weapon_transactions t
      JOIN weapons w ON w.id = t.weapon_id
      JOIN users ru ON ru.id = t.recipient_user_id
      JOIN users au ON au.id = t.authorizing_user_id
      LEFT JOIN users ou ON ou.id = t.co_authorizing_officer_id
      WHERE t.returned_at_timestamp IS NULL
      ORDER BY t.loaned_at_timestamp DESC
    `);
    return {
      users: users.rows as unknown as UserRow[],
      weapons: weapons.rows as unknown as WeaponRow[],
      activeShift: activeShift.rows as any[],
      activeLoans: activeLoans.rows as any[],
    };
  });
});

export const createUser = createServerFn({ method: "POST" })
  .inputValidator((d: { name: string; role: "OFICIAL" | "SARGENTO" | "PERSONAL"; rfid: string }) => d)
  .handler(async ({ data }) => {
    const name = (data.name ?? "").trim();
    const rfid = (data.rfid ?? "").trim();
    if (name.length < 3 || name.length > 100) throw new Error("El nombre debe tener entre 3 y 100 caracteres.");
    if (!/^[A-Za-z0-9\-_.]{3,50}$/.test(rfid)) throw new Error("El código RFID es inválido (3–50 caracteres, sin espacios).");
    if (!["OFICIAL", "SARGENTO", "PERSONAL"].includes(data.role)) throw new Error("Rol inválido.");
    return withDb(async (db) => {
      const exists = await db.execute({ sql: "SELECT id FROM users WHERE rfid_code = ?", args: [rfid] });
      if (exists.rows.length > 0) throw new Error("Ya existe una persona con ese código RFID.");
      const id = uid("u");
      await db.execute({
        sql: "INSERT INTO users (id, rfid_code, name, role) VALUES (?, ?, ?, ?)",
        args: [id, rfid, name, data.role],
      });
      return { ok: true, message: `Persona registrada: ${name} (${data.role}).` };
    });
  });

export const scanCheckIn = createServerFn({ method: "POST" })
  .inputValidator((d: { rfid: string }) => d)
  .handler(async ({ data }) => {
    return withDb(async (db) => {
      const u = await db.execute({ sql: "SELECT * FROM users WHERE rfid_code = ?", args: [data.rfid] });
      if (u.rows.length === 0) throw new Error("Tarjeta RFID no reconocida.");
      const user = u.rows[0] as any as UserRow;
      if (!user.is_active) throw new Error("El usuario está inactivo.");
      if (user.role === "PERSONAL") throw new Error("Solo OFICIAL y SARGENTO pueden iniciar turno.");

      const open = await db.execute({
        sql: "SELECT id FROM attendance_logs WHERE user_id = ? AND check_out_timestamp IS NULL",
        args: [user.id],
      });
      if (open.rows.length > 0) throw new Error("Este usuario ya tiene un turno activo.");

      const active = await db.execute(`
        SELECT u.role FROM attendance_logs a JOIN users u ON u.id = a.user_id
        WHERE a.check_out_timestamp IS NULL
      `);
      const roles = active.rows.map((r: any) => r.role);
      if (roles.length >= 3) throw new Error("Límite alcanzado: máximo 3 personas en turno simultáneo.");
      const oficiales = roles.filter((r) => r === "OFICIAL").length;
      const sargentos = roles.filter((r) => r === "SARGENTO").length;
      if (user.role === "OFICIAL" && oficiales >= 1) throw new Error("Ya hay 1 OFICIAL en turno activo.");
      if (user.role === "SARGENTO" && sargentos >= 2) throw new Error("Ya hay 2 SARGENTOS en turno activo.");

      await db.execute({
        sql: "INSERT INTO attendance_logs (id, user_id) VALUES (?, ?)",
        args: [uid("att"), user.id],
      });
      return { ok: true, message: `Turno iniciado para ${user.name}.` };
    });
  });

export const scanCheckOut = createServerFn({ method: "POST" })
  .inputValidator((d: { rfid: string }) => d)
  .handler(async ({ data }) => {
    return withDb(async (db) => {
      const u = await db.execute({ sql: "SELECT * FROM users WHERE rfid_code = ?", args: [data.rfid] });
      if (u.rows.length === 0) throw new Error("Tarjeta RFID no reconocida.");
      const user = u.rows[0] as any as UserRow;
      const open = await db.execute({
        sql: "SELECT id FROM attendance_logs WHERE user_id = ? AND check_out_timestamp IS NULL",
        args: [user.id],
      });
      if (open.rows.length === 0) throw new Error("No hay turno activo para este usuario.");

      // Bloquear cierre si tiene préstamos pendientes
      const loans = await db.execute({
        sql: "SELECT id FROM weapon_transactions WHERE recipient_user_id = ? AND returned_at_timestamp IS NULL",
        args: [user.id],
      });
      if (loans.rows.length > 0) throw new Error("No puede terminar el turno: tiene armamento sin devolver.");

      await db.execute({
        sql: "UPDATE attendance_logs SET check_out_timestamp = CURRENT_TIMESTAMP WHERE id = ?",
        args: [(open.rows[0] as any).id],
      });
      return { ok: true, message: `Turno finalizado para ${user.name}.` };
    });
  });

export const createLoan = createServerFn({ method: "POST" })
  .inputValidator((d: { weaponId: string; recipientRfid: string; authorizerRfid: string; coOfficerRfid?: string }) => d)
  .handler(async ({ data }) => {
    return withDb(async (db) => {
      const w = await db.execute({ sql: "SELECT * FROM weapons WHERE id = ?", args: [data.weaponId] });
      if (w.rows.length === 0) throw new Error("Arma no encontrada.");
      const weapon = w.rows[0] as any as WeaponRow;
      if (weapon.current_status !== "DISPONIBLE") throw new Error(`El arma no está disponible (estado: ${weapon.current_status}).`);

      const recipient = await getUserByRfid(db, data.recipientRfid, "Receptor");
      const authorizer = await getUserByRfid(db, data.authorizerRfid, "Autorizante");

      // El autorizante debe estar en turno activo
      const authShift = await db.execute({
        sql: "SELECT id FROM attendance_logs WHERE user_id = ? AND check_out_timestamp IS NULL",
        args: [authorizer.id],
      });
      if (authShift.rows.length === 0) throw new Error("El autorizante debe estar en turno activo.");
      if (authorizer.role === "PERSONAL") throw new Error("El autorizante debe ser OFICIAL o SARGENTO.");

      let coOfficerId: string | null = null;
      if (authorizer.role === "SARGENTO") {
        if (!data.coOfficerRfid) throw new Error("Validación dual requerida: escanee el RFID de un OFICIAL.");
        const officer = await getUserByRfid(db, data.coOfficerRfid, "Oficial co-autorizante");
        if (officer.role !== "OFICIAL") throw new Error("El co-autorizante debe ser un OFICIAL.");
        const oShift = await db.execute({
          sql: "SELECT id FROM attendance_logs WHERE user_id = ? AND check_out_timestamp IS NULL",
          args: [officer.id],
        });
        if (oShift.rows.length === 0) throw new Error("El OFICIAL co-autorizante debe estar en turno activo.");
        coOfficerId = officer.id;
      }

      const txId = uid("tx");
      await db.execute({
        sql: `INSERT INTO weapon_transactions
          (id, weapon_id, recipient_user_id, authorizing_user_id, co_authorizing_officer_id)
          VALUES (?, ?, ?, ?, ?)`,
        args: [txId, weapon.id, recipient.id, authorizer.id, coOfficerId],
      });
      await db.execute({
        sql: "UPDATE weapons SET current_status = 'PRESTADA' WHERE id = ?",
        args: [weapon.id],
      });
      return { ok: true, message: `Préstamo registrado: ${weapon.name} → ${recipient.name}.` };
    });
  });

export const returnWeapon = createServerFn({ method: "POST" })
  .inputValidator((d: { transactionId: string; receiverRfid: string }) => d)
  .handler(async ({ data }) => {
    return withDb(async (db) => {
      const receiver = await getUserByRfid(db, data.receiverRfid, "Receptor de devolución");
      if (receiver.role === "PERSONAL") throw new Error("Quien recibe la devolución debe ser OFICIAL o SARGENTO.");
      const shift = await db.execute({
        sql: "SELECT id FROM attendance_logs WHERE user_id = ? AND check_out_timestamp IS NULL",
        args: [receiver.id],
      });
      if (shift.rows.length === 0) throw new Error("El receptor debe estar en turno activo.");

      const tx = await db.execute({ sql: "SELECT * FROM weapon_transactions WHERE id = ?", args: [data.transactionId] });
      if (tx.rows.length === 0) throw new Error("Transacción no encontrada.");
      const t = tx.rows[0] as any;
      if (t.returned_at_timestamp) throw new Error("Esta transacción ya fue devuelta.");

      await db.execute({
        sql: "UPDATE weapon_transactions SET returned_at_timestamp = CURRENT_TIMESTAMP, return_received_by_user_id = ? WHERE id = ?",
        args: [receiver.id, t.id],
      });
      await db.execute({
        sql: "UPDATE weapons SET current_status = 'DISPONIBLE' WHERE id = ?",
        args: [t.weapon_id],
      });
      return { ok: true, message: "Devolución registrada correctamente." };
    });
  });

async function getUserByRfid(db: any, rfid: string, label: string) {
  const r = await db.execute({ sql: "SELECT * FROM users WHERE rfid_code = ?", args: [rfid] });
  if (r.rows.length === 0) throw new Error(`${label}: tarjeta RFID no reconocida.`);
  const user = r.rows[0] as UserRow;
  if (!user.is_active) throw new Error(`${label}: usuario inactivo.`);
  return user;
}

export const getReports = createServerFn({ method: "GET" }).handler(async () => {
  return withDb(async (db) => {
    const attendance = await db.execute(`
      SELECT a.id, a.check_in_timestamp, a.check_out_timestamp, u.name, u.role, u.rfid_code
      FROM attendance_logs a JOIN users u ON u.id = a.user_id
      ORDER BY a.check_in_timestamp DESC LIMIT 200
    `);
    const transactions = await db.execute(`
      SELECT t.id, t.loaned_at_timestamp, t.returned_at_timestamp,
             w.serial_number, w.name as weapon_name,
             ru.name as recipient_name, au.name as authorizer_name,
             ou.name as co_officer_name, rcv.name as receiver_name
      FROM weapon_transactions t
      JOIN weapons w ON w.id = t.weapon_id
      JOIN users ru ON ru.id = t.recipient_user_id
      JOIN users au ON au.id = t.authorizing_user_id
      LEFT JOIN users ou ON ou.id = t.co_authorizing_officer_id
      LEFT JOIN users rcv ON rcv.id = t.return_received_by_user_id
      ORDER BY t.loaned_at_timestamp DESC LIMIT 200
    `);
    return {
      attendance: attendance.rows as any[],
      transactions: transactions.rows as any[],
    };
  });
});
