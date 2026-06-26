import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  getDashboardData,
  scanCheckIn,
  scanCheckOut,
  createLoan,
  returnWeapon,
  getReports,
  createUser,
  updateUser,
  deleteUser,
  createWeapon,
  updateWeapon,
  deleteWeapon,
} from "@/lib/armory.functions";
import logoArmas from "@/assets/logo-armas.png";
import logoUdefa from "@/assets/logo-udefa.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SICAR — Panel de Control" },
      { name: "description", content: "Panel de control militar de personal y armería." },
    ],
  }),
  component: Dashboard,
});

type Toast = { id: number; kind: "ok" | "err"; msg: string };

function fmt(ts?: string | null) {
  if (!ts) return "—";
  // SQLite CURRENT_TIMESTAMP is 'YYYY-MM-DD HH:MM:SS' UTC
  const iso = ts.includes("T") ? ts : ts.replace(" ", "T") + "Z";
  const d = new Date(iso);
  return d.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "medium" });
}

function Dashboard() {
  const qc = useQueryClient();
  const fetchDash = useServerFn(getDashboardData);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchDash(),
    refetchInterval: 5000,
  });

  const [tab, setTab] = useState<"turno" | "armeria" | "prestamo" | "personal" | "reportes">("turno");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = (kind: Toast["kind"], msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: ["dashboard"] });

  // RFID simulator selected card (shared across panels)
  const [simRfid, setSimRfid] = useState<string>("");

  const activeOfficers = (data?.activeShift ?? []).filter((r: any) => r.role === "OFICIAL");
  const isOperatorOfficer = activeOfficers.length > 0;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-8 py-6 print-area">
        <RfidSimulator users={data?.users ?? []} value={simRfid} onChange={setSimRfid} />

        <nav className="no-print mt-6 flex flex-wrap gap-2 border-b border-border">
          {[
            { id: "turno", label: "Control de Turno" },
            { id: "armeria", label: "Armería" },
            { id: "prestamo", label: "Préstamo / Devolución" },
            { id: "personal", label: "Registrar Personal" },
            { id: "reportes", label: "Reportes" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as any)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="mt-6 space-y-6">
          {isLoading && <div className="text-muted-foreground">Cargando datos…</div>}

          {tab === "turno" && data && (
            <ShiftPanel
              data={data}
              simRfid={simRfid}
              onDone={invalidate}
              toast={pushToast}
            />
          )}

          {tab === "armeria" && data && <ArmoryPanel weapons={data.weapons} />}

          {tab === "prestamo" && data && (
            <LoanPanel
              data={data}
              simRfid={simRfid}
              onDone={invalidate}
              toast={pushToast}
            />
          )}

          {tab === "personal" && (
            <PersonnelPanel onDone={invalidate} toast={pushToast} users={data?.users ?? []} />
          )}

          {tab === "reportes" && (
            <ReportsPanel allowed={isOperatorOfficer} />
          )}
        </div>
      </main>

      <footer className="no-print py-4 text-center text-xs text-muted-foreground border-t border-border">
        SICAR · Sistema de Control de Armería · Uso restringido
      </footer>

      {/* Toasts */}
      <div className="no-print fixed bottom-4 right-4 flex flex-col gap-2 z-50">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-3 rounded-md shadow-lg text-sm font-medium max-w-sm ${
              t.kind === "ok"
                ? "bg-success text-success-foreground"
                : "bg-destructive text-destructive-foreground"
            }`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="bg-primary text-primary-foreground border-b-4 border-accent print:bg-white print:text-black print:border-black">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 flex items-center gap-4">
        <img src={logoUdefa} alt="Escudo U.D.E.F.A." className="h-16 w-16 object-contain bg-white rounded-full p-1" />
        <div className="flex-1">
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">
            SICAR · Sistema de Control de Armería
          </h1>
          <p className="text-xs md:text-sm opacity-90">
            Dirección General de Educación Militar · Rectoría U.D.E.F.A.
          </p>
        </div>
        <img src={logoArmas} alt="Insignia de Armería" className="h-16 w-16 object-contain bg-white rounded-md p-1" />
      </div>
    </header>
  );
}

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="bg-card border border-border rounded-lg shadow-sm">
      <header className="px-5 py-3 border-b border-border flex items-center justify-between gap-2">
        <h2 className="font-semibold text-foreground">{title}</h2>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    OFICIAL: "bg-primary text-primary-foreground",
    SARGENTO: "bg-accent text-accent-foreground",
    PERSONAL: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded ${styles[role] ?? ""}`}>
      {role}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    DISPONIBLE: "bg-success text-success-foreground",
    PRESTADA: "bg-warning text-warning-foreground",
    MANTENIMIENTO: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded ${styles[status] ?? ""}`}>
      {status}
    </span>
  );
}

/* ------------------ RFID Simulator ------------------ */
function RfidSimulator({
  users,
  value,
  onChange,
}: {
  users: any[];
  value: string;
  onChange: (v: string) => void;
}) {
  const selected = users.find((u) => u.rfid_code === value);
  return (
    <section className="no-print bg-card border-2 border-dashed border-primary/40 rounded-lg p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-primary">Panel de Simulación RFID</h3>
          <p className="text-xs text-muted-foreground">
            Selecciona una tarjeta virtual para simular un escaneo del lector (Wemos D1 / RC522).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="bg-background border border-input rounded-md px-3 py-2 text-sm min-w-[280px]"
          >
            <option value="">— Sin tarjeta —</option>
            {users.map((u) => (
              <option key={u.id} value={u.rfid_code}>
                [{u.role}] {u.name} · {u.rfid_code}
              </option>
            ))}
          </select>
          {selected && (
            <div className="flex items-center gap-2 text-sm">
              <span className="font-mono bg-muted px-2 py-1 rounded">{selected.rfid_code}</span>
              <RoleBadge role={selected.role} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------ Shift Panel ------------------ */
function ShiftPanel({
  data,
  simRfid,
  onDone,
  toast,
}: {
  data: any;
  simRfid: string;
  onDone: () => void;
  toast: (k: "ok" | "err", m: string) => void;
}) {
  const checkIn = useServerFn(scanCheckIn);
  const checkOut = useServerFn(scanCheckOut);

  const mCheckIn = useMutation({
    mutationFn: () => checkIn({ data: { rfid: simRfid } }),
    onSuccess: (r) => { toast("ok", r.message); onDone(); },
    onError: (e: any) => toast("err", e?.message ?? "Error"),
  });
  const mCheckOut = useMutation({
    mutationFn: () => checkOut({ data: { rfid: simRfid } }),
    onSuccess: (r) => { toast("ok", r.message); onDone(); },
    onError: (e: any) => toast("err", e?.message ?? "Error"),
  });

  const oficiales = data.activeShift.filter((r: any) => r.role === "OFICIAL").length;
  const sargentos = data.activeShift.filter((r: any) => r.role === "SARGENTO").length;

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card title="Acciones de Turno">
        <p className="text-sm text-muted-foreground mb-4">
          Use la tarjeta seleccionada en el simulador RFID para iniciar o terminar turno.
          Límite vigente: <b>1 OFICIAL</b> y <b>2 SARGENTOS</b> simultáneos.
        </p>
        <div className="flex gap-3">
          <button
            disabled={!simRfid || mCheckIn.isPending}
            onClick={() => mCheckIn.mutate()}
            className="flex-1 bg-primary text-primary-foreground rounded-md px-4 py-2.5 font-semibold disabled:opacity-50 hover:opacity-95"
          >
            Iniciar Turno
          </button>
          <button
            disabled={!simRfid || mCheckOut.isPending}
            onClick={() => mCheckOut.mutate()}
            className="flex-1 bg-accent text-accent-foreground border border-border rounded-md px-4 py-2.5 font-semibold disabled:opacity-50 hover:opacity-95"
          >
            Terminar Turno
          </button>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
          <div className="bg-muted rounded-md p-3">
            <div className="text-2xl font-bold">{data.activeShift.length}/3</div>
            <div className="text-xs text-muted-foreground">En turno</div>
          </div>
          <div className="bg-muted rounded-md p-3">
            <div className="text-2xl font-bold">{oficiales}/1</div>
            <div className="text-xs text-muted-foreground">Oficiales</div>
          </div>
          <div className="bg-muted rounded-md p-3">
            <div className="text-2xl font-bold">{sargentos}/2</div>
            <div className="text-xs text-muted-foreground">Sargentos</div>
          </div>
        </div>
      </Card>

      <Card title="Personal en Turno Activo">
        {data.activeShift.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay personal en turno.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.activeShift.map((r: any) => (
              <li key={r.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Ingreso: {fmt(r.check_in_timestamp)} · {r.rfid_code}
                  </div>
                </div>
                <RoleBadge role={r.role} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ------------------ Armory Panel ------------------ */
function ArmoryPanel({ weapons }: { weapons: any[] }) {
  return (
    <Card title="Inventario de Armamento">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left px-3 py-2">Serie</th>
              <th className="text-left px-3 py-2">Denominación</th>
              <th className="text-left px-3 py-2">Características</th>
              <th className="text-left px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {weapons.map((w) => (
              <tr key={w.id} className="border-t border-border">
                <td className="px-3 py-2 font-mono">{w.serial_number}</td>
                <td className="px-3 py-2 font-medium">{w.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{w.characteristics}</td>
                <td className="px-3 py-2"><StatusBadge status={w.current_status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ------------------ Loan / Return Panel ------------------ */
function LoanPanel({
  data,
  simRfid,
  onDone,
  toast,
}: {
  data: any;
  simRfid: string;
  onDone: () => void;
  toast: (k: "ok" | "err", m: string) => void;
}) {
  const createLoanFn = useServerFn(createLoan);
  const returnFn = useServerFn(returnWeapon);

  const [weaponId, setWeaponId] = useState("");
  const [recipientRfid, setRecipientRfid] = useState("");
  const [authorizerRfid, setAuthorizerRfid] = useState("");
  const [coOfficerRfid, setCoOfficerRfid] = useState("");

  const authorizer = data.users.find((u: any) => u.rfid_code === authorizerRfid);
  const needsCoOfficer = authorizer?.role === "SARGENTO";

  const available = data.weapons.filter((w: any) => w.current_status === "DISPONIBLE");

  const mLoan = useMutation({
    mutationFn: () =>
      createLoanFn({
        data: {
          weaponId,
          recipientRfid,
          authorizerRfid,
          coOfficerRfid: needsCoOfficer ? coOfficerRfid : undefined,
        },
      }),
    onSuccess: (r) => {
      toast("ok", r.message);
      setWeaponId(""); setRecipientRfid(""); setAuthorizerRfid(""); setCoOfficerRfid("");
      onDone();
    },
    onError: (e: any) => toast("err", e?.message ?? "Error"),
  });

  const mReturn = useMutation({
    mutationFn: (txId: string) => returnFn({ data: { transactionId: txId, receiverRfid: simRfid } }),
    onSuccess: (r) => { toast("ok", r.message); onDone(); },
    onError: (e: any) => toast("err", e?.message ?? "Error"),
  });

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card title="Registrar Préstamo de Arma">
        <div className="space-y-4">
          <Field label="1. Arma (DISPONIBLE)">
            <select
              value={weaponId}
              onChange={(e) => setWeaponId(e.target.value)}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm"
            >
              <option value="">Seleccionar arma…</option>
              {available.map((w: any) => (
                <option key={w.id} value={w.id}>
                  {w.serial_number} · {w.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="2. RFID del Receptor (quien recibe el arma)">
            <RfidInput value={recipientRfid} setValue={setRecipientRfid} simRfid={simRfid} users={data.users} />
          </Field>

          <Field label="3. RFID del Autorizante (OFICIAL o SARGENTO en turno)">
            <RfidInput value={authorizerRfid} setValue={setAuthorizerRfid} simRfid={simRfid} users={data.users} />
          </Field>

          {needsCoOfficer && (
            <Field label="4. Validación dual: RFID de OFICIAL co-autorizante (obligatorio porque el autorizante es SARGENTO)">
              <RfidInput value={coOfficerRfid} setValue={setCoOfficerRfid} simRfid={simRfid} users={data.users} highlight />
            </Field>
          )}

          <button
            disabled={!weaponId || !recipientRfid || !authorizerRfid || (needsCoOfficer && !coOfficerRfid) || mLoan.isPending}
            onClick={() => mLoan.mutate()}
            className="w-full bg-primary text-primary-foreground rounded-md px-4 py-2.5 font-semibold disabled:opacity-50"
          >
            {mLoan.isPending ? "Procesando…" : "Confirmar Préstamo"}
          </button>
        </div>
      </Card>

      <Card title="Préstamos Activos · Devolución">
        {data.activeLoans.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay armamento prestado actualmente.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.activeLoans.map((t: any) => (
              <li key={t.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{t.weapon_name} · <span className="font-mono text-xs">{t.serial_number}</span></div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Receptor: <b>{t.recipient_name}</b> · Autorizó: {t.authorizer_name}
                      {t.co_officer_name ? ` · Co-OFICIAL: ${t.co_officer_name}` : ""}
                    </div>
                    <div className="text-xs text-muted-foreground">Préstamo: {fmt(t.loaned_at_timestamp)}</div>
                  </div>
                  <button
                    disabled={!simRfid || mReturn.isPending}
                    onClick={() => mReturn.mutate(t.id)}
                    className="bg-accent text-accent-foreground border border-border rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-50 whitespace-nowrap"
                    title={!simRfid ? "Seleccione tarjeta RFID del receptor en el simulador" : "Registrar devolución"}
                  >
                    Recibir Devolución
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground mt-3">
          Para registrar una devolución, seleccione en el simulador RFID la tarjeta del OFICIAL/SARGENTO que recibe el arma.
        </p>
      </Card>
    </div>
  );
}

/* ------------------ Personnel Registration ------------------ */
function PersonnelPanel({
  onDone,
  toast,
  users,
}: {
  onDone: () => void;
  toast: (k: "ok" | "err", m: string) => void;
  users: any[];
}) {
  const createUserFn = useServerFn(createUser);
  const [name, setName] = useState("");
  const [role, setRole] = useState<"OFICIAL" | "SARGENTO" | "PERSONAL">("PERSONAL");
  const [rfid, setRfid] = useState("");

  const mCreate = useMutation({
    mutationFn: () => createUserFn({ data: { name, role, rfid } }),
    onSuccess: (r) => {
      toast("ok", r.message);
      setName(""); setRfid(""); setRole("PERSONAL");
      onDone();
    },
    onError: (e: any) => toast("err", e?.message ?? "Error"),
  });

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card title="Registrar Nueva Persona">
        <p className="text-sm text-muted-foreground mb-4">
          Complete los datos y registre la tarjeta RFID asignada a la persona. El código RFID es único e intransferible.
        </p>
        <div className="space-y-4">
          <Field label="Nombre completo y grado">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Sgto. Juan Pérez Hernández"
              maxLength={100}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm"
            />
          </Field>

          <Field label="Rol / Jerarquía">
            <div className="grid grid-cols-3 gap-2">
              {(["OFICIAL", "SARGENTO", "PERSONAL"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`px-3 py-2 text-sm font-semibold rounded-md border transition-colors ${
                    role === r
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground border-input hover:bg-muted"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Código RFID (escanear tarjeta o ingresar manualmente)">
            <input
              value={rfid}
              onChange={(e) => setRfid(e.target.value.toUpperCase())}
              placeholder="Ej. RFID-PS-005"
              maxLength={50}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm font-mono"
            />
          </Field>

          <button
            disabled={!name.trim() || !rfid.trim() || mCreate.isPending}
            onClick={() => mCreate.mutate()}
            className="w-full bg-primary text-primary-foreground rounded-md px-4 py-2.5 font-semibold disabled:opacity-50"
          >
            {mCreate.isPending ? "Registrando…" : "Registrar Persona"}
          </button>
        </div>
      </Card>

      <Card title={`Personal Registrado (${users.length})`}>
        <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted sticky top-0">
              <tr>
                <th className="text-left px-3 py-2">Nombre</th>
                <th className="text-left px-3 py-2">Rol</th>
                <th className="text-left px-3 py-2">RFID</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u: any) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-3 py-2">{u.name}</td>
                  <td className="px-3 py-2"><RoleBadge role={u.role} /></td>
                  <td className="px-3 py-2 font-mono text-xs">{u.rfid_code}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function RfidInput({
  value, setValue, simRfid, users, highlight,
}: { value: string; setValue: (v: string) => void; simRfid: string; users: any[]; highlight?: boolean }) {
  const u = users.find((x) => x.rfid_code === value);
  return (
    <div className="flex gap-2 items-center">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Escanear o escribir RFID…"
        className={`flex-1 bg-background border rounded-md px-3 py-2 text-sm font-mono ${highlight ? "border-primary ring-1 ring-primary" : "border-input"}`}
      />
      <button
        type="button"
        onClick={() => setValue(simRfid)}
        disabled={!simRfid}
        className="bg-secondary text-secondary-foreground border border-border rounded-md px-3 py-2 text-xs font-semibold disabled:opacity-50"
      >
        Usar simulador
      </button>
      {u && (
        <div className="text-xs flex items-center gap-1">
          <span className="font-medium">{u.name}</span>
          <RoleBadge role={u.role} />
        </div>
      )}
    </div>
  );
}

/* ------------------ Reports (OFICIAL only) ------------------ */
function ReportsPanel({ allowed }: { allowed: boolean }) {
  const fetchReports = useServerFn(getReports);
  const { data, isLoading } = useQuery({
    queryKey: ["reports"],
    queryFn: () => fetchReports(),
    enabled: allowed,
  });

  if (!allowed) {
    return (
      <Card title="Módulo de Reportes — Acceso Restringido">
        <div className="text-center py-10">
          <div className="text-5xl mb-3">🛡️</div>
          <p className="font-semibold text-destructive">Acceso denegado</p>
          <p className="text-sm text-muted-foreground mt-2">
            Este módulo está reservado al rol <b>OFICIAL</b>. Para consultar reportes, un OFICIAL debe encontrarse en turno activo.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="no-print flex justify-end">
        <button
          onClick={() => window.print()}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-semibold"
        >
          Imprimir Reporte
        </button>
      </div>

      <PrintHeader />

      <Card title="Historial de Turnos (últimos 200)">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-3 py-2">Personal</th>
                  <th className="text-left px-3 py-2">Rol</th>
                  <th className="text-left px-3 py-2">RFID</th>
                  <th className="text-left px-3 py-2">Ingreso</th>
                  <th className="text-left px-3 py-2">Salida</th>
                </tr>
              </thead>
              <tbody>
                {(data?.attendance ?? []).map((r: any) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2"><RoleBadge role={r.role} /></td>
                    <td className="px-3 py-2 font-mono text-xs">{r.rfid_code}</td>
                    <td className="px-3 py-2">{fmt(r.check_in_timestamp)}</td>
                    <td className="px-3 py-2">{r.check_out_timestamp ? fmt(r.check_out_timestamp) : <span className="text-warning-foreground bg-warning px-2 py-0.5 rounded text-xs">EN TURNO</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Historial de Préstamos y Devoluciones">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-3 py-2">Serie</th>
                  <th className="text-left px-3 py-2">Arma</th>
                  <th className="text-left px-3 py-2">Receptor</th>
                  <th className="text-left px-3 py-2">Autorizó</th>
                  <th className="text-left px-3 py-2">Co-OFICIAL</th>
                  <th className="text-left px-3 py-2">Préstamo</th>
                  <th className="text-left px-3 py-2">Devolución</th>
                  <th className="text-left px-3 py-2">Recibió</th>
                </tr>
              </thead>
              <tbody>
                {(data?.transactions ?? []).map((t: any) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">{t.serial_number}</td>
                    <td className="px-3 py-2">{t.weapon_name}</td>
                    <td className="px-3 py-2">{t.recipient_name}</td>
                    <td className="px-3 py-2">{t.authorizer_name}</td>
                    <td className="px-3 py-2">{t.co_officer_name ?? "—"}</td>
                    <td className="px-3 py-2">{fmt(t.loaned_at_timestamp)}</td>
                    <td className="px-3 py-2">{t.returned_at_timestamp ? fmt(t.returned_at_timestamp) : <span className="bg-warning text-warning-foreground px-2 py-0.5 rounded text-xs">PENDIENTE</span>}</td>
                    <td className="px-3 py-2">{t.receiver_name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <PrintSignatures />
    </div>
  );
}

function PrintHeader() {
  return (
    <div className="print-only mb-4">
      <div className="flex items-center gap-4 border-b-2 border-black pb-3">
        <img src={logoUdefa} alt="" className="h-20 w-20 object-contain" />
        <div className="flex-1 text-center">
          <h1 className="text-lg font-bold">DIRECCIÓN GENERAL DE EDUCACIÓN MILITAR</h1>
          <h2 className="text-base font-semibold">RECTORÍA U.D.E.F.A.</h2>
          <p className="text-sm">Reporte Oficial · Sistema de Control de Armería (SICAR)</p>
          <p className="text-xs">Emitido el {new Date().toLocaleString("es-MX")}</p>
        </div>
        <img src={logoArmas} alt="" className="h-20 w-20 object-contain" />
      </div>
    </div>
  );
}

function PrintSignatures() {
  return (
    <div className="print-only mt-12 grid grid-cols-2 gap-12">
      <div className="text-center">
        <div className="border-t border-black pt-2 text-sm">Oficial Responsable</div>
      </div>
      <div className="text-center">
        <div className="border-t border-black pt-2 text-sm">Sello / Visto Bueno</div>
      </div>
    </div>
  );
}
