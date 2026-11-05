// components/planner/UrgentChangeModal.jsx
//
// ⚡ Cambio urgente en una semana bloqueada por el CEO.
// Cambia el COLOR (misma orden) o el ESTILO (otra orden) de UNA casilla sin
// desbloquear la semana. El servidor (plan-urgent-changes.js) valida todo y
// deja bitácora; aquí sólo se arma la petición y se explica qué va a pasar.
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, X, Zap, Lock } from "lucide-react";
import { API_URL } from "../../lib/masterCodeCatalog";

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

const norm = (c) => String(c == null ? "" : c).trim().toUpperCase();
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString();
const targetOf = (wo) => Number(wo?.total_to_produce) || Number(wo?.quantity) || 0;

// Colores de una orden con su cantidad pedida (null = sin desglose).
function colorsOf(wo) {
  const m = new Map();
  (wo?.lines || []).forEach((l) => {
    const c = norm(l?.color);
    if (c) m.set(c, (m.get(c) || 0) + (Number(l.quantity) || 0));
  });
  if (!m.size) (wo?.colors || []).forEach((c) => { const k = norm(c?.color); if (k) m.set(k, (m.get(k) || 0) + (Number(c.quantity) || 0)); });
  if (!m.size) String(wo?.color || "").split(",").map(norm).filter(Boolean).forEach((c) => m.set(c, null));
  return [...m.entries()].map(([color, qty]) => ({ color, qty }));
}

export default function UrgentChangeModal({
  assignment,        // casilla seleccionada (line_assignments)
  workOrders,        // lista del tablero
  assignments,       // todas las casillas (para calcular lo libre por color)
  weekLock,          // { locked_by_name, ... } de la semana
  weekLabel,         // "Semana 45 (03/11 – 09/11)"
  produced = 0,      // lo cosido ese día en esa casilla (si se conoce)
  pendingBalances = [], // saldos de días pasados (day-balances: balance > 0)
  onClose,
  onDone,            // (data) => void  — el tablero recarga
  onMissingStyle,    // (data, retry) => bool — reusa el formulario de estándar
}) {
  const a = assignment;
  const srcWo = workOrders.find((w) => w.id === a.work_order_id);
  const srcQty = Number(a.assigned_quantity) || 0;
  const movable = Math.max(Math.floor(srcQty - (Number(produced) || 0)), 0);
  const wasSent = a.status === "released" || a.line_run_id != null;

  const [mode, setMode] = useState("color");
  const [newColor, setNewColor] = useState("");
  const [targetId, setTargetId] = useState(null);
  const [query, setQuery] = useState("");
  const [qty, setQty] = useState(String(movable));
  const [reason, setReason] = useState("");
  const [sendToLines, setSendToLines] = useState(wasSent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Saldos de días pasados elegidos para la orden destino: "linea|yyyy-MM-dd".
  const [pickedBal, setPickedBal] = useState(() => new Set());

  // Opciones del servidor: órdenes del mismo estilo/cliente y saldos de días
  // pasados (6 meses). No dependen de lo que el tablero tenga cargado.
  const [srvOrders, setSrvOrders] = useState(null);   // null = cargando / sin datos
  const [srvBal, setSrvBal] = useState(null);
  const [loadingOpts, setLoadingOpts] = useState(true);
  useEffect(() => {
    let off = false;
    const ymdLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const today = new Date();
    const from = ymdLocal(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 180));
    const to = ymdLocal(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
    const get = (path) => fetch(`${API_URL}${path}`, { headers: authHeaders() }).then((r) => r.json()).catch(() => null);
    Promise.all([
      get(`/api/line-assignments/urgent-options?assignmentId=${a.id}`),
      get(`/api/line-assignments/day-balances?onlyPending=1&from=${from}&to=${to}`),
    ]).then(([o, b]) => {
      if (off) return;
      if (o?.success) setSrvOrders(o.sameStyleOrders || []);
      if (b?.success && b.resolved !== false) {
        setSrvBal((b.rows || []).filter((r) => r.is_past !== false && Number(r.balance) > 0));
      }
      setLoadingOpts(false);
    });
    return () => { off = true; };
  }, [a.id]);
  const balSource = srvBal || pendingBalances;

  const assignedFor = (woId, color) =>
    assignments
      .filter((x) => x.work_order_id === woId && !["cancelled", "rejected"].includes(x.status)
        && (color === undefined || norm(x.color) === norm(color)))
      .reduce((s, x) => s + (Number(x.assigned_quantity) || 0), 0);

  // ---- saldos de días pasados (casillas que cerraron por debajo) ---------
  const srcDay = String(a.assigned_date || "").slice(0, 10);
  const balKey = (r) => `${r.line_no}|${String(r.assigned_date).slice(0, 10)}`;
  const balRowsOf = (woId) =>
    balSource
      .filter((r) => Number(r.work_order_id) === Number(woId) && Number(r.balance) > 0
        && !(String(r.line_no) === String(a.line_no) && String(r.assigned_date).slice(0, 10) === srcDay))
      .sort((x, y) => String(x.assigned_date).localeCompare(String(y.assigned_date)));
  const balanceOfWo = (woId) => balRowsOf(woId).reduce((t, r) => t + (Number(r.balance) || 0), 0);
  // Capturó producción sin ligar la orden: el saldo puede ser falso.
  const suspicious = (r) => !r.run_linked && Number(r.runs_on_day) > 0;
  // Marca saldos (del más viejo al más nuevo, sin los dudosos) hasta cubrir
  // lo que falta para mover toda la casilla.
  const autoPickBalances = (woId, baseFree) => {
    const next = new Set();
    let have = baseFree == null ? Infinity : baseFree;
    for (const r of balRowsOf(woId)) {
      if (have >= movable) break;
      if (suspicious(r)) continue;
      next.add(balKey(r));
      have += Number(r.balance) || 0;
    }
    setPickedBal(next);
    return have;
  };

  const targetWo = mode === "color"
    ? workOrders.find((w) => w.id === targetId) || srcWo
    : workOrders.find((w) => w.id === targetId) || null;

  // Cambiar color: todos los colores DISPONIBLES del mismo estilo y cliente,
  // de esta orden o de otros PO del mismo estilo (igual que el tablero:
  // mismo estilo + mismo cliente = cambio de color).
  const styleKey = (w) => norm(w?.style_code || w?.estilo);
  const custKey = (w) => (w?.customer_id != null ? `id:${w.customer_id}` : norm(w?.customer_name));
  const colorChoices = useMemo(() => {
    if (srvOrders) {
      const out = [];
      srvOrders.forEach((o) => {
        o.colors.forEach((c) => {
          if (o.own && c.color === norm(a.color)) return;
          const free = o.own ? c.free : c.free == null ? o.free : Math.min(c.free, o.free);
          out.push({ woId: o.id, woNo: o.work_order_no, po: o.customer_po, color: c.color, free, own: o.own, bal: balanceOfWo(o.id) });
        });
      });
      const avail = (x) => x.free == null || x.free > 0 || x.bal > 0;
      return out.sort((x, y) =>
        Number(avail(y)) - Number(avail(x)) || Number(y.own) - Number(x.own)
        || (y.free ?? 1e9) - (x.free ?? 1e9) || x.color.localeCompare(y.color));
    }
    if (!srcWo) return [];
    const st = styleKey(srcWo), cu = custKey(srcWo);
    const out = [];
    workOrders
      .filter((w) => w.id === srcWo.id || (
        st && styleKey(w) === st && custKey(w) === cu && !["completed", "cancelled"].includes(w.status)))
      .forEach((w) => {
        const orderFree = Math.max(targetOf(w) - assignedFor(w.id), 0);
        colorsOf(w).forEach((c) => {
          if (w.id === srcWo.id && c.color === norm(a.color)) return;
          const colorFree = c.qty == null ? null : Math.max(c.qty - assignedFor(w.id, c.color), 0);
          // Otra orden: tambien la limita lo que le queda sin asignar.
          const free = w.id === srcWo.id
            ? colorFree
            : colorFree == null ? orderFree : Math.min(colorFree, orderFree);
          out.push({ woId: w.id, woNo: w.work_order_no, po: w.customer_po, color: c.color, free, own: w.id === srcWo.id, bal: balanceOfWo(w.id) });
        });
      });
    const avail = (x) => x.free == null || x.free > 0 || x.bal > 0;
    return out.sort((x, y) =>
      Number(avail(y)) - Number(avail(x)) || Number(y.own) - Number(x.own)
      || (y.free ?? 1e9) - (x.free ?? 1e9) || x.color.localeCompare(y.color));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srvOrders, srcWo, workOrders, assignments, a.color, balSource]);
  const pickedChoice = mode === "color"
    ? colorChoices.find((c) => c.color === newColor && c.woId === (targetId ?? srcWo?.id)) || null
    : null;
  const pickColorChoice = (c) => {
    setTargetId(c.own ? null : c.woId);
    setNewColor(c.color);
    const have = autoPickBalances(c.woId, c.free);
    setQty(String(Number.isFinite(have) ? Math.max(Math.min(movable, have), 0) : movable));
    setError(null);
  };
  const colorOptions = useMemo(() => {
    if (!targetWo) return [];
    return colorsOf(targetWo)
      .filter((c) => !(mode === "color" && c.color === norm(a.color)))
      .map((c) => ({ ...c, free: c.qty == null ? null : Math.max(c.qty - assignedFor(targetWo.id, c.color), 0) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetWo, mode, assignments]);

  // Órdenes candidatas para cambio de estilo: activas, con piezas sin asignar.
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return workOrders
      .filter((w) => w.id !== a.work_order_id && !["completed", "cancelled"].includes(w.status))
      .map((w) => ({ w, free: Math.max(targetOf(w) - assignedFor(w.id), 0), bal: balanceOfWo(w.id) }))
      .filter(({ free, bal }) => free > 0 || bal > 0)
      .filter(({ w }) => !q || [w.work_order_no, w.style_code, w.estilo, w.style_description, w.customer_name, w.customer_po]
        .some((v) => String(v || "").toLowerCase().includes(q)))
      .slice(0, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workOrders, assignments, query, a.work_order_id, balSource]);

  const switchMode = (m) => { setMode(m); setNewColor(""); setTargetId(null); setPickedBal(new Set()); setError(null); };
  const pickTarget = (id) => {
    setTargetId(id);
    const w = workOrders.find((x) => x.id === id);
    const opts = colorsOf(w);
    setNewColor(opts.length === 1 ? opts[0].color : "");
    const have = autoPickBalances(id, Math.max(targetOf(w) - assignedFor(id), 0));
    setQty(String(Math.max(Math.min(movable, have), 0)));
    setError(null);
  };

  // Cambiar color: TODOS los saldos pasados del mismo estilo y cliente.
  const sameStyleIds = new Set((srvOrders || []).map((o) => Number(o.id)));
  const sameStyleBal = balSource
    .filter((r) => sameStyleIds.has(Number(r.work_order_id)) && Number(r.balance) > 0
      && !(String(r.line_no) === String(a.line_no) && String(r.assigned_date).slice(0, 10) === srcDay))
    .sort((x, y) => String(y.assigned_date).localeCompare(String(x.assigned_date)));
  // Colores que puede tomar una fila de saldo (sin el color actual de la misma orden).
  const rowColorChoices = (r) => {
    const ch = colorChoices.filter((c) => c.woId === Number(r.work_order_id));
    const rc = (r.colors || []).map(norm);
    // Un saldo sólo alimenta SU color (la tela ya está cortada en ese color).
    if (!rc.length) return ch;
    return ch.filter((c) => rc.includes(c.color));
  };
  const pickBalanceRow = (r) => {
    const woId = Number(r.work_order_id);
    const curWo = pickedChoice ? pickedChoice.woId : null;
    if (curWo === woId) { toggleBal(r); return; }
    const ch = rowColorChoices(r);
    if (!ch.length) { setError("Esa orden no tiene otro color para esta casilla."); return; }
    const c = ch[0];
    setTargetId(c.own ? null : c.woId);
    setNewColor(c.color);
    const next = new Set([balKey(r)]);
    setPickedBal(next);
    const have = (c.free ?? 0) + (Number(r.balance) || 0);
    setQty(String(Math.max(Math.min(movable, Math.floor(have)), 0)));
    setError(null);
  };

  // Piezas disponibles para el destino = libres + saldos marcados.
  const balTargetId = mode === "color" ? (pickedChoice ? pickedChoice.woId : null) : targetId;
  const balRows = balTargetId != null ? balRowsOf(balTargetId) : [];
  const pickedRows = balRows.filter((r) => pickedBal.has(balKey(r)));
  const pickedSum = pickedRows.reduce((t, r) => t + (Number(r.balance) || 0), 0);
  const baseFree = mode === "color"
    ? (pickedChoice ? pickedChoice.free : null)
    : (targetWo ? Math.max(targetOf(targetWo) - assignedFor(targetWo.id), 0) : null);
  const available = baseFree == null ? null : Math.floor(baseFree + pickedSum);
  const toggleBal = (r) => {
    const k = balKey(r);
    setPickedBal((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  };

  const qtyNum = Math.floor(Number(qty) || 0);
  const needsColor = colorOptions.length > 0;
  const ready = !busy && reason.trim().length >= 5 && qtyNum > 0 && qtyNum <= movable
    && (available == null || qtyNum <= available)
    && (mode === "color" ? !!pickedChoice : !!targetId && (!needsColor || !!newColor));

  const submit = async () => {
    if (!ready) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${API_URL}/api/line-assignments/urgent-change`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          assignmentId: a.id,
          mode,
          newColor: newColor || null,
          newWorkOrderId: targetId ?? undefined,
          balanceCells: pickedRows.map((r) => ({ lineNo: r.line_no, date: String(r.assigned_date).slice(0, 10) })),
          quantity: qtyNum,
          reason: reason.trim(),
          sendToLines,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) { onDone?.(data); return; }
      if (onMissingStyle && onMissingStyle(data, submit)) return;
      if (data.maxQuantity != null) setQty(String(data.maxQuantity));
      setError(data.error || `No se pudo hacer el cambio (HTTP ${res.status}).`);
    } catch (err) {
      setError(`Error de red: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const day = String(a.assigned_date || "").slice(0, 10);
  const srcLabel = `${srcWo?.work_order_no || `#${a.work_order_id}`}${a.color ? ` · ${a.color}` : ""}`;
  const tgtLabel = targetWo ? `${targetWo.work_order_no}${newColor ? ` · ${newColor}` : ""}` : "—";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-3" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-[420px] text-[12px] max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b flex items-start gap-2">
          <Zap className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-gray-900 text-[14px]">Cambio urgente</h3>
            <p className="text-gray-500 mt-0.5 flex items-center gap-1">
              <Lock className="w-3 h-3" />
              {weekLabel}{weekLock?.locked_by_name ? ` · bloqueada por ${weekLock.locked_by_name}` : ""}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-500" aria-label="Cerrar"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
            <div className="text-gray-500">Casilla</div>
            <div className="font-semibold text-gray-900">Línea {a.line_no} · {day}</div>
            <div className="text-gray-700">{srcLabel} · {fmt(srcQty)} pzas{produced > 0 ? ` (${fmt(produced)} ya cosidas)` : ""}</div>
          </div>

          <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-lg" role="tablist">
            {[["color", "Cambiar color"], ["style", "Cambiar estilo"]].map(([m, label]) => (
              <button key={m} role="tab" aria-selected={mode === m} onClick={() => switchMode(m)}
                className={`py-1.5 rounded-md font-medium ${mode === m ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-800"}`}>
                {label}
              </button>
            ))}
          </div>

          {mode === "style" && (
            <div>
              <label className="text-gray-600 font-medium" htmlFor="urgent-search">Orden con el nuevo estilo</label>
              <div className="relative mt-1">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
                <input id="urgent-search" value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por orden, estilo, cliente o PO (incluye saldos de días pasados)"
                  className="w-full pl-7 pr-2 py-1.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <div className="mt-1.5 max-h-40 overflow-y-auto border rounded-lg divide-y">
                {candidates.length === 0 && <div className="px-3 py-2 text-gray-500">Ninguna orden con piezas libres o saldo de días pasados coincide.</div>}
                {candidates.map(({ w, free, bal }) => (
                  <button key={w.id} onClick={() => pickTarget(w.id)}
                    className={`w-full text-left px-3 py-1.5 hover:bg-orange-50 focus:outline-none focus:bg-orange-50 ${targetId === w.id ? "bg-orange-50 ring-1 ring-inset ring-orange-500" : ""}`}>
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold text-gray-900 truncate">{w.work_order_no}</span>
                      <span className="text-gray-500 shrink-0">
                        {fmt(free)} libres{bal > 0 && <span className="text-amber-700"> · +{fmt(bal)} saldo</span>}
                      </span>
                    </div>
                    <div className="text-gray-500 truncate">{w.style_code || w.estilo || "—"} · {w.style_description} · {w.customer_name}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === "color" && (
            <div>
              <div className="text-gray-600 font-medium">Nuevo color <span className="font-normal text-gray-400">· mismo estilo {srcWo?.style_code || srcWo?.estilo || ""}</span></div>
              {loadingOpts && !srvOrders ? (
                <div className="mt-1 text-gray-500 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando órdenes y saldos del mismo estilo…</div>
              ) : colorChoices.length === 0 ? (
                <div className="mt-1 text-gray-500">Este estilo no tiene otro color en ninguna orden activa.</div>
              ) : (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {colorChoices.map((c) => {
                    const on = pickedChoice && pickedChoice.woId === c.woId && pickedChoice.color === c.color;
                    const none = c.free === 0 && !(c.bal > 0);
                    return (
                      <button key={`${c.woId}|${c.color}`} disabled={none} onClick={() => pickColorChoice(c)}
                        title={none ? "Sin piezas disponibles" : c.own ? "Misma orden" : `Orden ${c.woNo}${c.po ? ` · PO ${c.po}` : ""}`}
                        className={`px-2.5 py-1 rounded-lg border text-left ${on ? "border-orange-600 bg-orange-50 text-orange-800" : none ? "border-gray-100 text-gray-300 cursor-not-allowed" : "border-gray-200 hover:border-gray-400 text-gray-700"}`}>
                        <span className={on ? "font-semibold" : ""}>{c.color}</span>
                        <span className={`font-normal ${none ? "" : "text-gray-500"}`}> · {c.free == null ? "disponible" : `${fmt(c.free)} libres`}</span>
                        {c.bal > 0 && <span className="font-normal text-amber-700"> · +{fmt(c.bal)} saldo</span>}
                        {!c.own && <span className={`block text-[10px] leading-tight ${none ? "" : "text-gray-400"}`}>{c.woNo}{c.po ? ` · PO ${c.po}` : ""}</span>}
                      </button>
                    );
                  })}
                </div>
              )}

            </div>
          )}

          {mode === "color" && !loadingOpts && (
            <div>
              <div className="text-gray-600 font-medium">
                Saldos de días pasados <span className="font-normal text-gray-400">· mismo estilo y cliente</span>
              </div>
              {sameStyleBal.length === 0 ? (
                <div className="mt-1 text-gray-500">
                  {srvBal ? "No hay días pasados con piezas sin coser para este estilo." : "No se pudieron leer los saldos (la captura de piso no está ligada a las órdenes)."}
                </div>
              ) : (
                <>
                  <p className="text-gray-400">Marque un día para tomar sus piezas. El día se cierra con lo que sí se cosió.</p>
                  <div className="mt-1 max-h-40 overflow-y-auto border rounded-lg divide-y">
                    {sameStyleBal.map((r) => {
                      const k = `${r.work_order_id}|${balKey(r)}`;
                      const d = String(r.assigned_date).slice(0, 10);
                      const isTarget = pickedChoice && pickedChoice.woId === Number(r.work_order_id);
                      const on = isTarget && pickedBal.has(balKey(r));
                      const usable = rowColorChoices(r).length > 0;
                      return (
                        <label key={k} className={`flex items-start gap-2 px-3 py-1.5 ${usable ? "cursor-pointer hover:bg-amber-50" : "opacity-50 cursor-not-allowed"} ${on ? "bg-amber-50" : ""}`}>
                          <input type="checkbox" className="mt-0.5 accent-orange-600" disabled={!usable} checked={!!on} onChange={() => pickBalanceRow(r)} />
                          <span className="flex-1 min-w-0">
                            <span className="flex justify-between gap-2">
                              <span className="text-gray-900 truncate">
                                {d.slice(8)}/{d.slice(5, 7)} · Línea {r.line_no} · <span className="font-semibold">{r.work_order_no}</span>
                                {(r.colors || []).length ? ` · ${r.colors.join(", ")}` : ""}
                              </span>
                              <span className="text-amber-800 font-semibold shrink-0">{fmt(r.balance)} pzas</span>
                            </span>
                            <span className="block text-gray-500">{fmt(r.assigned)} asignadas · {fmt(r.produced)} cosidas</span>
                            {!usable && (
                              <span className="block text-gray-500">
                                {Number(r.work_order_id) === Number(a.work_order_id) && (r.colors || []).map(norm).includes(norm(a.color))
                                  ? "Mismo color de esta casilla: no es un cambio de color."
                                  : "Su color no está disponible en la orden."}
                              </span>
                            )}
                            {suspicious(r) && <span className="block text-rose-700">La línea capturó producción sin ligar la orden: puede que ya estén hechas.</span>}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {mode === "style" && targetWo && (
            <div>
              <div className="text-gray-600 font-medium">Color</div>
              {colorOptions.length === 0 ? (
                <div className="mt-1 text-gray-500">{mode === "color" ? "Esta orden no tiene otro color." : "La orden no tiene desglose por color."}</div>
              ) : (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {colorOptions.map((c) => (
                    <button key={c.color} onClick={() => { setNewColor(c.color); setError(null); }}
                      className={`px-2.5 py-1 rounded-lg border ${newColor === c.color ? "border-orange-600 bg-orange-50 text-orange-800 font-semibold" : "border-gray-200 hover:border-gray-400 text-gray-700"}`}>
                      {c.color}{c.free != null && <span className="text-gray-500 font-normal"> · {fmt(c.free)} libres</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {mode === "style" && balRows.length > 0 && (
            <div>
              <div className="text-gray-600 font-medium">
                Saldos de días pasados <span className="font-normal text-gray-400">· {workOrders.find((w) => w.id === balTargetId)?.work_order_no}</span>
              </div>
              <p className="text-gray-400">Lo que no se cosió esos días. Al tomarlos, el día se cierra con lo que sí se cosió.</p>
              <div className="mt-1 max-h-32 overflow-y-auto border rounded-lg divide-y">
                {balRows.map((r) => {
                  const k = balKey(r);
                  const d = String(r.assigned_date).slice(0, 10);
                  return (
                    <label key={k} className={`flex items-start gap-2 px-3 py-1.5 cursor-pointer hover:bg-amber-50 ${pickedBal.has(k) ? "bg-amber-50" : ""}`}>
                      <input type="checkbox" className="mt-0.5 accent-orange-600" checked={pickedBal.has(k)} onChange={() => toggleBal(r)} />
                      <span className="flex-1 min-w-0">
                        <span className="flex justify-between gap-2">
                          <span className="text-gray-900">Línea {r.line_no} · {d.slice(8)}/{d.slice(5, 7)}{(r.colors || []).length ? ` · ${r.colors.join(", ")}` : ""}</span>
                          <span className="text-amber-800 font-semibold shrink-0">{fmt(r.balance)} pzas</span>
                        </span>
                        <span className="block text-gray-500">{fmt(r.assigned)} asignadas · {fmt(r.produced)} cosidas</span>
                        {suspicious(r) && (
                          <span className="block text-rose-700">La línea capturó producción sin ligar la orden: puede que ya estén hechas.</span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {available != null && (
            <div className={`text-[11px] ${qtyNum > available ? "text-rose-700" : "text-gray-500"}`}>
              Disponible para el cambio: <span className="font-semibold">{fmt(available)} pzas</span>
              {pickedSum > 0 && ` (${fmt(baseFree)} libres + ${fmt(pickedSum)} de saldos)`}
              {qtyNum > available && " · marque más saldos o baje la cantidad."}
            </div>
          )}

          <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <div>
              <label className="text-gray-600 font-medium" htmlFor="urgent-qty">Piezas a cambiar</label>
              <input id="urgent-qty" type="number" min={1} max={movable} value={qty} onChange={(e) => setQty(e.target.value)}
                className="mt-1 w-full px-2 py-1.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            {(() => {
              const max = available == null ? movable : Math.min(movable, available);
              return (
                <button onClick={() => setQty(String(max))} className="px-2.5 py-1.5 border rounded-lg text-gray-600 hover:bg-gray-50">Máx. ({fmt(max)})</button>
              );
            })()}
          </div>

          <div>
            <label className="text-gray-600 font-medium" htmlFor="urgent-reason">Motivo</label>
            <textarea id="urgent-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. No llegó la tela azul; el cliente adelantó el estilo 12"
              className="mt-1 w-full px-2 py-1.5 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-orange-500" />
            {reason.trim().length < 5 ? (
              <p className={`mt-0.5 ${reason.trim().length > 0 ? "text-rose-600" : "text-gray-400"}`}>
                Mínimo 5 caracteres ({reason.trim().length}/5). Queda en la bitácora junto con su nombre.
              </p>
            ) : (
              <p className="text-gray-400 mt-0.5">Queda en la bitácora junto con su nombre.</p>
            )}
          </div>

          <label className="flex items-center gap-2 text-gray-700">
            <input type="checkbox" checked={sendToLines} onChange={(e) => setSendToLines(e.target.checked)} className="accent-orange-600" />
            Enviar el cambio a los líderes de línea
          </label>

          {(targetWo && (newColor || colorOptions.length === 0) && qtyNum > 0) && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-orange-900">
              <span className="font-semibold">{fmt(qtyNum)} pzas</span>: {srcLabel} → <span className="font-semibold">{tgtLabel}</span>
              {qtyNum < srcQty && <div className="text-orange-800">Se quedan {fmt(srcQty - qtyNum)} pzas de {srcLabel}.</div>}
            </div>
          )}

          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800" role="alert">{error}</div>}
        </div>

        <div className="px-4 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Cancelar</button>
          <button onClick={submit} disabled={!ready}
            title={ready ? "" : [
              mode === "style" && !targetId ? "Elija la orden" : "",
              (mode === "color" || (targetId && needsColor)) && !newColor ? "Elija el color" : "",
              !(qtyNum > 0 && qtyNum <= movable) ? `Piezas entre 1 y ${movable}` : "",
              available != null && qtyNum > available ? `Sólo hay ${available} disponibles: marque saldos` : "",
              reason.trim().length < 5 ? "Motivo de al menos 5 caracteres" : "",
            ].filter(Boolean).join(" · ")}
            className="px-3 py-1.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            {mode === "color" ? "Cambiar color" : "Cambiar estilo"}
          </button>
        </div>
      </div>
    </div>
  );
}