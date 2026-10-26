import { useEffect, useMemo, useState } from "react";
import {
  Shirt,
  Plus,
  Send,
  Pencil,
  Trash2,
  RefreshCw,
  Search,
  Check,
  X,
  AlertCircle,
  Users,
  Calculator,
  ChevronLeft,
  ChevronRight,
  FolderPlus,
} from "lucide-react";
import { API_URL } from "../../lib/masterCodeCatalog";
import BomNavbar from "../../components/merchant/BomNavbar";
import StyleOrderWizard from "../../components/merchant/StyleOrderWizard";
import StyleCostingWizard from "../../components/merchant/StyleCostingWizard";

// The dashboard now hosts a single thing: the Style Data list. From here you
// create/edit a style order (the wizard) and send any order to the sample room.

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });
const jsonHeaders = () => ({ ...authHeaders(), "Content-Type": "application/json" });

const SIZES = ["2XS", "XS", "S", "M", "L", "XL", "XXL", "S-T", "M-T", "L-T", "XL-T", "2XL-T"];
const SAMPLE_STAGES = ["1st Proto", "2nd Proto", "Fit Sample", "Size Set", "PP Sample", "TOP", "Salesman"];

const STATUS_META = {
  draft: { label: "Borrador", cls: "bg-slate-100 text-slate-600" },
  sent_to_sample: { label: "En muestras", cls: "bg-amber-100 text-amber-700" },
  approved: { label: "Aprobado", cls: "bg-emerald-100 text-emerald-700" },
  in_production: { label: "En producción", cls: "bg-sky-100 text-sky-700" },
  archived: { label: "Archivado", cls: "bg-slate-100 text-slate-400" },
};
const num = (n) => (Number.isFinite(+n) ? +n : 0).toLocaleString("es-MX");

export default function BomDashboard() {
  const [view, setView] = useState("list"); // "list" | "client" | "wizard" | "costing"
  const [editingId, setEditingId] = useState(null); // null = new order
  const [presetCustomer, setPresetCustomer] = useState(""); // seeds the wizard when creating from a client card
  const [costingId, setCostingId] = useState(null); // style order being costed
  const [activeClient, setActiveClient] = useState(null); // client whose styles we're viewing

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [toast, setToast] = useState(null);
  const [sendFor, setSendFor] = useState(null); // order being sent to sample

  const showToast = (msg, kind = "ok") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 2600);
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/style-orders`, { headers: authHeaders() });
      if (res.status === 401) { window.location.href = "/login"; return; }
      const data = await res.json();
      setOrders(data.orders || []);
      setOnline(true);
    } catch (err) {
      console.error(err);
      setOnline(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const refresh = () => {
    setBusy(true);
    load().finally(() => setTimeout(() => setBusy(false), 400));
  };

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return orders;
    return orders.filter((o) =>
      [o.styleNo, o.orderNo, o.styleName, o.customerName].filter(Boolean).join(" ").toLowerCase().includes(t)
    );
  }, [orders, q]);

  // Group the styles by client so the dashboard can lead with client cards.
  // The list of clients is derived from existing style orders; a brand-new
  // client is created on the fly by starting a style with that customer name.
  const clients = useMemo(() => {
    const map = new Map();
    for (const o of orders) {
      const name = (o.customerName || "").trim() || "Sin cliente";
      const c = map.get(name) || { name, count: 0, latest: null, statuses: new Set() };
      c.count += 1;
      c.statuses.add(o.status);
      if (!c.latest || (o.updatedAt || "") > (c.latest || "")) c.latest = o.updatedAt;
      map.set(name, c);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [orders]);

  const clientOrders = useMemo(
    () => (activeClient ? orders.filter((o) => ((o.customerName || "").trim() || "Sin cliente") === activeClient) : []),
    [orders, activeClient]
  );

  // client card → start a style for that client (or a brand-new client name)
  const startStyleForClient = (name) => {
    setPresetCustomer(name);
    setEditingId(null);
    setView("wizard");
  };
  const openClient = (name) => { setActiveClient(name); setView("client"); };
  const addClient = () => {
    const name = window.prompt("Nombre del nuevo cliente")?.trim();
    if (name) startStyleForClient(name);
  };
  const openCosting = (o) => { setCostingId(o.id); setView("costing"); };

  const removeOrder = async (o) => {
    if (!window.confirm(`¿Eliminar la orden de estilo ${o.styleNo || o.id}?`)) return;
    try {
      const res = await fetch(`${API_URL}/api/style-orders/${o.id}`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok) throw new Error("No se pudo eliminar");
      setOrders((os) => os.filter((x) => x.id !== o.id));
      showToast("Orden eliminada");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  // where to go back after a sub-view closes (client view if we came from one)
  const backView = () => setView(activeClient ? "client" : "list");

  // ---- wizard view --------------------------------------------------------
  if (view === "wizard") {
    return (
      <div className="min-h-screen bg-slate-100">
        <StyleOrderWizard
          orderId={editingId}
          presetCustomer={editingId ? "" : presetCustomer}
          onDone={() => { setPresetCustomer(""); setEditingId(null); backView(); load(); }}
        />
      </div>
    );
  }

  // ---- costing view -------------------------------------------------------
  if (view === "costing") {
    return (
      <div className="min-h-screen bg-slate-100">
        <StyleCostingWizard
          orderId={costingId}
          onDone={() => { setCostingId(null); backView(); load(); }}
        />
      </div>
    );
  }

  // ---- single-client view: that client's styles + create/cost actions -----
  if (view === "client") {
    return (
      <div className="min-h-screen bg-slate-100">
        <BomNavbar title="Datos de estilo" subtitle="Cliente · estilos y costeo" onRefresh={refresh} isRefreshing={busy} showStatus isOnline={online} />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => { setActiveClient(null); setView("list"); }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:border-slate-400"
            >
              <ChevronLeft size={16} /> Clientes
            </button>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                <span className="text-sm font-bold">{initials(activeClient)}</span>
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-semibold text-slate-800 truncate">{activeClient}</h1>
                <p className="text-xs text-slate-500">{clientOrders.length} {clientOrders.length === 1 ? "estilo" : "estilos"}</p>
              </div>
            </div>
            <button
              onClick={() => startStyleForClient(activeClient)}
              className="ml-auto inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <Plus size={16} /> Crear datos de estilo
            </button>
          </div>

          <OrdersTable
            rows={clientOrders}
            loading={loading}
            emptyText={`Aún no hay estilos para ${activeClient}. Crea el primero con el botón de arriba.`}
            onEdit={(o) => { setEditingId(o.id); setView("wizard"); }}
            onCost={openCosting}
            onSend={setSendFor}
            onDelete={removeOrder}
          />
        </main>

        {sendFor && (
          <SendToSampleModal order={sendFor} onClose={() => setSendFor(null)} onSent={() => { setSendFor(null); showToast("Enviado a muestras"); load(); }} onError={(m) => showToast(m, "error")} />
        )}
        {toast && <Toast toast={toast} />}
      </div>
    );
  }

  // ---- list view ----------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-100">
      <BomNavbar
        title="Datos de estilo"
        subtitle="Órdenes de estilo · enviar a muestras"
        onRefresh={refresh}
        isRefreshing={busy}
        showStatus
        isOnline={online}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por estilo, orden, nombre o cliente"
              className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm outline-none focus:border-slate-400"
            />
          </div>
          <button
            onClick={() => { setEditingId(null); setView("wizard"); }}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Plus size={16} /> Nueva orden de estilo
          </button>
        </div>

        {/* Clients — pick a client to create a style, or start a new client */}
        {!q.trim() && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <Users size={15} className="text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-700">Clientes</h2>
              <span className="text-xs text-slate-400">Selecciona un cliente para crear sus datos de estilo</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {clients.map((c) => (
                <ClientCard key={c.name} client={c} onOpen={() => openClient(c.name)} onCreate={() => startStyleForClient(c.name)} />
              ))}
              <button
                onClick={addClient}
                className="group flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-200 bg-white px-4 py-5 text-slate-400 hover:border-slate-400 hover:text-slate-600"
              >
                <FolderPlus size={22} />
                <span className="text-xs font-medium">Nuevo cliente</span>
              </button>
            </div>
          </section>
        )}

        {/* All styles */}
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Shirt size={15} className="text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-700">{q.trim() ? "Resultados" : "Todos los estilos"}</h2>
          </div>
          <OrdersTable
            rows={filtered}
            loading={loading}
            showClient
            emptyText={orders.length === 0
              ? "Aún no hay datos de estilo. Elige un cliente arriba o crea la primera orden y súbele el tech pack para autocompletarla."
              : "Ninguna orden coincide con la búsqueda."}
            onEdit={(o) => { setEditingId(o.id); setView("wizard"); }}
            onCost={openCosting}
            onSend={setSendFor}
            onDelete={removeOrder}
          />
        </section>
      </main>

      {sendFor && (
        <SendToSampleModal
          order={sendFor}
          onClose={() => setSendFor(null)}
          onSent={() => { setSendFor(null); showToast("Enviado a muestras"); load(); }}
          onError={(m) => showToast(m, "error")}
        />
      )}

      {toast && <Toast toast={toast} />}
    </div>
  );
}

// ==========================================================================
//  Client card + shared styles table + toast
// ==========================================================================
const initials = (name) =>
  (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

function ClientCard({ client, onOpen, onCreate }) {
  return (
    <div className="group relative rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300 hover:shadow-sm transition-all">
      <button onClick={onOpen} className="w-full text-left">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
            <span className="text-sm font-bold">{initials(client.name)}</span>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-800 truncate">{client.name}</div>
            <div className="text-[11px] text-slate-400">{client.count} {client.count === 1 ? "estilo" : "estilos"}</div>
          </div>
        </div>
      </button>
      <button
        onClick={onCreate}
        className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-900 hover:text-white transition-colors"
      >
        <Plus size={13} /> Crear estilo
      </button>
    </div>
  );
}

function OrdersTable({ rows, loading, emptyText, showClient, onEdit, onCost, onSend, onDelete }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      {loading ? (
        <div className="py-20 text-center text-sm text-slate-400">
          <RefreshCw size={22} className="animate-spin mx-auto mb-2" />
          Cargando órdenes…
        </div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-400 px-6">{emptyText}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="px-5 py-2.5 font-medium">Estilo</th>
                <th className="px-5 py-2.5 font-medium">Nombre</th>
                {showClient && <th className="px-5 py-2.5 font-medium">Cliente</th>}
                <th className="px-5 py-2.5 font-medium text-right">Cant.</th>
                <th className="px-5 py-2.5 font-medium">Entrega</th>
                <th className="px-5 py-2.5 font-medium">Estado</th>
                <th className="px-5 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((o) => {
                const st = STATUS_META[o.status] || STATUS_META.draft;
                return (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <button onClick={() => onEdit(o)} className="font-mono text-xs text-slate-800 hover:text-slate-500 text-left">
                        {o.styleNo || "—"}
                        <div className="text-[10px] text-slate-400">{o.orderNo}</div>
                      </button>
                    </td>
                    <td className="px-5 py-3 text-slate-700 max-w-xs truncate">{o.styleName || "—"}</td>
                    {showClient && <td className="px-5 py-3 text-slate-600">{o.customerName || "—"}</td>}
                    <td className="px-5 py-3 text-right text-slate-600">{num(o.quantity)}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{o.deliveryDate || "—"}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center text-[11px] rounded-full px-2 py-0.5 ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onCost(o)}
                          title="Costeo del estilo"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                        >
                          <Calculator size={13} /> Costeo
                        </button>
                        <button
                          onClick={() => onSend(o)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                        >
                          <Send size={13} /> Muestras
                        </button>
                        <button onClick={() => onEdit(o)} title="Editar" className="p-1.5 text-slate-400 hover:text-slate-700">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => onDelete(o)} title="Eliminar" className="p-1.5 text-slate-300 hover:text-rose-600">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Toast({ toast }) {
  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm text-white shadow-lg ${
        toast.kind === "error" ? "bg-rose-600" : "bg-slate-900"
      }`}
    >
      {toast.kind === "error" ? <X size={15} /> : <Check size={15} />}
      {toast.msg}
    </div>
  );
}

// ==========================================================================
//  Send-to-sample modal
// ==========================================================================
function SendToSampleModal({ order, onClose, onSent, onError }) {
  const [form, setForm] = useState({
    stage: "1st Proto",
    size: "M",
    qty: "3",
    requester: "",
    costingMarker: false,
    sizeMarker: false,
    clientPatterns: true,
    remark: "",
  });
  const [sending, setSending] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400";

  const submit = async () => {
    if (!form.requester.trim()) return onError("Indica quién solicita la muestra (MR)");
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/api/style-orders/${order.id}/send-to-sample`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ sample: form }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo enviar");
      onSent(data);
    } catch (err) {
      onError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
            <Send size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-800">Enviar a muestras</h2>
            <p className="text-xs text-slate-500 truncate">
              {order.styleNo} · {order.styleName || order.orderNo}
            </p>
          </div>
          <button onClick={onClose} className="ml-auto p-1 text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 grid grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Etapa</span>
            <select className={input} value={form.stage} onChange={(e) => set("stage", e.target.value)}>
              {SAMPLE_STAGES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Talla</span>
            <select className={input} value={form.size} onChange={(e) => set("size", e.target.value)}>
              {SIZES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Cantidad</span>
            <input type="number" className={`${input} text-right`} value={form.qty} onChange={(e) => set("qty", e.target.value)} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Solicita (MR)</span>
            <input className={input} value={form.requester} placeholder="Nombre" onChange={(e) => set("requester", e.target.value)} />
          </label>
          <div className="col-span-2 flex flex-wrap gap-2">
            {[
              ["costingMarker", "Marcador de costeo"],
              ["sizeMarker", "Marcador de tallas"],
              ["clientPatterns", "Patrones del cliente"],
            ].map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => set(k, !form[k])}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                  form[k] ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-500 hover:border-slate-400"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
          <label className="block col-span-2">
            <span className="block text-xs font-medium text-slate-600 mb-1">Observaciones</span>
            <input className={input} value={form.remark} onChange={(e) => set("remark", e.target.value)} />
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:border-slate-400">
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={sending}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {sending ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
            Enviar a muestras
          </button>
        </div>
      </div>
    </div>
  );
}