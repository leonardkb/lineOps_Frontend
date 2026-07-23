// components/planner/PlanBoard.jsx
import { useState, useEffect } from "react";
import { format, addDays, differenceInDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from "date-fns";
import { ChevronLeft, ChevronRight, Package, GripVertical, Loader2, Check, AlertCircle } from "lucide-react";
import { API_URL } from "../../lib/masterCodeCatalog";
import { colorForWO } from "../../lib/workOrderColors";

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

const targetOf = (wo) => Number(wo?.total_to_produce) || Number(wo?.quantity) || 0;
const assignedOf = (wo) => Number(wo?.assigned_quantity) || 0;
const remainingOf = (wo) => Math.max(targetOf(wo) - assignedOf(wo), 0);

// Compact cell sizing
const CELL = 34;   // px — square size
const GAP = 6;     // px — gap between squares
const LABEL = 64;  // px — line label column width

export default function PlanBoard() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState("week"); // day, week, month
  const [assignments, setAssignments] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [lineRuns, setLineRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [hovered, setHovered] = useState(null); // { assignment, x, y }

  // Drag & drop
  const [draggedPO, setDraggedPO] = useState(null); // transient: during a native drag only
  const [armedPO, setArmedPO] = useState(null);     // persistent: picked up via tap/click
  const [dropTarget, setDropTarget] = useState(null);
  const [dropBusy, setDropBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [showPool, setShowPool] = useState(true);

  // The PO currently ready to place (drag takes priority over tap).
  const activePO = draggedPO || armedPO;

  useEffect(() => { fetchData(); }, []);

  // Esc cancels a picked-up (armed) PO.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { setArmedPO(null); setDraggedPO(null); setDropTarget(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showToast = (msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [aRes, woRes, lrRes] = await Promise.all([
        fetch(`${API_URL}/api/line-assignments`, { headers: authHeaders() }),
        fetch(`${API_URL}/api/work-orders`, { headers: authHeaders() }),
        fetch(`${API_URL}/api/line-runs`, { headers: authHeaders() }),
      ]);
      const a = await aRes.json(); if (a.success) setAssignments(a.assignments);
      const wo = await woRes.json(); if (wo.success) setWorkOrders(wo.workOrders);
      const lr = await lrRes.json(); if (lr.success) setLineRuns(lr.runs);
    } catch (err) {
      console.error("Error fetching plan board data:", err);
    } finally {
      setLoading(false);
    }
  };

  const lines = [
    ...new Set([...assignments.map((a) => a.line_no), ...lineRuns.map((lr) => lr.line_no)]),
  ].sort((a, b) => Number(a) - Number(b));

  const unassignedPOs = workOrders
    .filter((wo) => remainingOf(wo) > 0 && !["completed", "cancelled"].includes(wo.status))
    .sort((a, b) => {
      const da = a.commitment_date ? new Date(a.commitment_date).getTime() : Infinity;
      const db = b.commitment_date ? new Date(b.commitment_date).getTime() : Infinity;
      return da - db;
    });

  const getDateRange = () => {
    if (viewMode === "day") return [currentDate];
    if (viewMode === "week") {
      return eachDayOfInterval({
        start: startOfWeek(currentDate, { weekStartsOn: 1 }),
        end: endOfWeek(currentDate, { weekStartsOn: 1 }),
      });
    }
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end: addDays(start, 34) });
  };
  const dateRange = getDateRange();

  // Each assignment is one day (one assigned_date), so match cells by assigned_date.
  // Falls back to the planned_start..end span for any legacy rows without assigned_date.
  // Read a DATE/ISO value as its calendar day WITHOUT timezone shifting.
  const ymd = (v) => {
    if (!v) return "";
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    const d = new Date(v);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  // Each assignment is one day (one assigned_date); match cells by calendar day.
  const getAssignmentForLineAndDate = (lineNo, date) => {
    const key = format(date, "yyyy-MM-dd");
    return assignments.find((a) => {
      if (String(a.line_no) !== String(lineNo)) return false;
      if (a.assigned_date) return ymd(a.assigned_date) === key;
      return ymd(a.planned_start_date) <= key && key <= ymd(a.planned_end_date);
    });
  };

  const getDaysRemaining = (assignment) =>
    differenceInDays(new Date(assignment.planned_end_date), new Date());

  // Each work order gets its own stable color (same in the pool and on the grid).
  // Full literal class strings so Tailwind keeps them.
  const isOverdue = (assignment) =>
    assignment.status !== "completed" && getDaysRemaining(assignment) < 0;

  // The assignments endpoint doesn't include work_order_no / style, so resolve
  // them from the already-loaded work-order list.
  const woOf = (id) => workOrders.find((w) => w.id === id);
  const woNo = (a) => a.work_order_no || woOf(a.work_order_id)?.work_order_no || `#${a.work_order_id}`;
  const woStyle = (a) => a.style_description || woOf(a.work_order_id)?.style_description || "";

  const goPrevious = () => setCurrentDate(addDays(currentDate, viewMode === "day" ? -1 : viewMode === "week" ? -7 : -30));
  const goNext = () => setCurrentDate(addDays(currentDate, viewMode === "day" ? 1 : viewMode === "week" ? 7 : 30));
  const goToday = () => setCurrentDate(new Date());

  // ---- capacity helper (for the line label only) ------------------------
  const latestTargetForLine = (lineNo) => {
    const runs = lineRuns
      .filter((lr) => String(lr.line_no) === String(lineNo) && lr.target_pcs)
      .sort((a, b) => new Date(b.run_date) - new Date(a.run_date));
    return runs.length ? Math.round(runs[0].target_pcs) : 0;
  };

  // Authoritative daily availability for a line on a date, straight from the
  // backend (same numbers the server validates against — avoids 400s).
  const fetchAvailableForDate = async (dateStr) => {
    const r = await fetch(`${API_URL}/api/planning/available-lines?date=${dateStr}`, { headers: authHeaders() });
    const d = await r.json();
    return d.success ? (d.lines || []) : [];
  };

  // ---- DROP: fill the line day by day, carrying the remainder forward ----
  const assignPOAcrossDays = async (po, lineNo, startDate) => {
    let remaining = remainingOf(po);
    if (remaining <= 0) return showToast("Esta PO ya está totalmente asignada.", true);

    setDropBusy(true);
    let day = new Date(startDate);
    let created = 0, assignedTotal = 0;
    let daysScanned = 0, failures = 0;
    const MAX_DAYS = 90;         // don't scan forever
    const MAX_FAILURES = 3;      // stop hammering if the server keeps rejecting
    const errors = [];
    const capCache = {};         // dateStr -> lines[] (fetched once per day)

    try {
      while (remaining > 0 && daysScanned < MAX_DAYS && failures < MAX_FAILURES) {
        daysScanned++;
        const dateStr = format(day, "yyyy-MM-dd");

        if (!capCache[dateStr]) capCache[dateStr] = await fetchAvailableForDate(dateStr);
        const lineInfo = capCache[dateStr].find((l) => String(l.line_no) === String(lineNo));

        // No capacity configured for this line/date at all.
        if (!lineInfo) {
          failures++;
          errors.push(`Sin configuración de capacidad para la línea ${lineNo} el ${dateStr}`);
          day = addDays(day, 1);
          continue;
        }

        const available = Math.floor(Number(lineInfo.available_capacity) || 0);
        if (available <= 0) { day = addDays(day, 1); continue; } // day full → next day

        const qty = Math.min(remaining, available);
        const res = await fetch(`${API_URL}/api/line-assignments`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            workOrderId: po.id,
            lineNo: lineInfo.line_no,           // exact value the backend expects
            assignedDate: dateStr,
            quantity: qty,
            plannedStartDate: dateStr,
          }),
        });
        const data = await res.json();

        if (data.success) {
          created++;
          assignedTotal += qty;
          remaining -= qty;
          lineInfo.available_capacity = available - qty; // keep cache consistent
          day = addDays(day, 1);
        } else {
          failures++;
          errors.push(`${dateStr}: ${data.error || res.status}`);
          day = addDays(day, 1);
        }
      }

      await fetchData();

      if (created > 0 && remaining <= 0) {
        showToast(`✅ ${po.work_order_no}: ${Math.round(assignedTotal).toLocaleString()} pzas en ${created} día(s).`);
      } else if (created > 0) {
        showToast(`⚠️ ${po.work_order_no}: asignadas ${Math.round(assignedTotal).toLocaleString()} pzas; faltan ${Math.round(remaining).toLocaleString()}. ${errors[0] || "Sin capacidad disponible en las próximas fechas."}`, true);
      } else {
        showToast(`No se pudo asignar ${po.work_order_no}. ${errors[0] || ""}`, true);
      }
    } catch (err) {
      showToast(`Error al asignar: ${err.message}`, true);
    } finally {
      setDropBusy(false);
      setDraggedPO(null);
      setArmedPO(null);
      setDropTarget(null);
    }
  };

  const handleDrop = (e, lineNo, date) => {
    e.preventDefault();
    setDropTarget(null);
    const po = draggedPO || armedPO;
    if (!po || dropBusy) return;
    if (getAssignmentForLineAndDate(lineNo, date)) return showToast("Ese día ya está ocupado. Elija un día libre.", true);
    assignPOAcrossDays(po, lineNo, date);
  };

  // Click on a cell: open details if occupied, or place the armed PO if free.
  const handleCellClick = (lineNo, date, assignment) => {
    if (assignment) return setSelectedAssignment(assignment);
    if (armedPO && !dropBusy) assignPOAcrossDays(armedPO, lineNo, date);
  };

  // Remove one or more assignments from a line.
  const removeAssignments = async (ids) => {
    if (!ids || ids.length === 0) return;
    setDropBusy(true);
    let removed = 0;
    const errors = [];
    try {
      for (const id of ids) {
        const res = await fetch(`${API_URL}/api/line-assignments/${id}`, {
          method: "DELETE",
          headers: authHeaders(),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) removed++;
        else errors.push(data.error || `HTTP ${res.status}`);
      }
      await fetchData();
      setSelectedAssignment(null);
      if (removed > 0) showToast(`🗑️ ${removed} asignación(es) eliminada(s).`);
      else showToast(`No se pudo eliminar. ${errors[0] || ""}`, true);
    } catch (err) {
      showToast(`Error al eliminar: ${err.message}`, true);
    } finally {
      setDropBusy(false);
    }
  };

  const gridCols = `${LABEL}px repeat(${dateRange.length}, ${CELL}px)`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">Cargando Plan Board...</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b bg-gradient-to-r from-gray-50 to-white">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="font-semibold text-gray-900 text-lg">Plan Board</h2>
            <p className="text-sm text-gray-600">Arrastre una PO a una línea —o tóquela y luego toque una casilla libre— para programarla</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 rounded-lg p-1">
              {["day", "week", "month"].map((m) => (
                <button key={m} onClick={() => setViewMode(m)}
                  className={`px-3 py-1.5 text-sm rounded-md transition ${viewMode === m ? "bg-white shadow-sm text-gray-900" : "text-gray-600 hover:text-gray-800"}`}>
                  {m === "day" ? "Día" : m === "week" ? "Semana" : "Mes"}
                </button>
              ))}
            </div>
            <button onClick={goToday} className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Hoy</button>
            <div className="flex gap-1">
              <button onClick={goPrevious} className="p-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={goNext} className="p-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
        <div className="mt-3 text-sm text-gray-500">
          {viewMode === "day" && format(currentDate, "EEEE, d MMMM yyyy")}
          {viewMode === "week" && `${format(dateRange[0], "d MMM")} - ${format(dateRange[dateRange.length - 1], "d MMM yyyy")}`}
          {viewMode === "month" && format(currentDate, "MMMM yyyy")}
        </div>
      </div>

      {/* Unassigned PO pool */}
      <div className="border-b bg-amber-50/60">
        <button onClick={() => setShowPool((v) => !v)} className="w-full flex items-center justify-between px-5 py-2.5 text-left">
          <span className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Package className="w-4 h-4 text-amber-600" /> Órdenes por asignar ({unassignedPOs.length})
          </span>
          <span className="text-xs text-gray-500">{showPool ? "Ocultar" : "Mostrar"}</span>
        </button>
        {showPool && (
          <div className="px-5 pb-3">
            {unassignedPOs.length === 0 ? (
              <p className="text-sm text-gray-500 py-1">No hay órdenes pendientes.</p>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {unassignedPOs.map((po) => {
                  const isActive = activePO?.id === po.id;
                  return (
                    <div key={po.id} draggable={!dropBusy}
                      onDragStart={(e) => {
                        // Required for the drag to actually start in Firefox / some browsers.
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", String(po.id));
                        setArmedPO(null);      // dragging supersedes a tapped selection
                        setDraggedPO(po);
                      }}
                      onDragEnd={() => { setDraggedPO(null); setDropTarget(null); }}
                      onClick={() => setArmedPO((cur) => (cur?.id === po.id ? null : po))}
                      title="Arrástrela a una línea, o tóquela y luego toque una casilla libre"
                      className={`shrink-0 w-52 rounded-xl border bg-white p-2.5 cursor-grab active:cursor-grabbing shadow-sm hover:shadow transition ${isActive ? "ring-2 ring-amber-500 border-amber-400" : "border-gray-200"}`}>
                      <div className="flex items-start gap-2">
                        <GripVertical className="w-4 h-4 text-gray-300 mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-sm font-bold text-gray-900 truncate flex items-center gap-1.5">
                            <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${colorForWO(po.id).dot}`} />
                            {po.work_order_no}
                          </p>
                          <p className="text-xs text-gray-500 truncate">{po.customer_name} · {po.style_code || po.estilo || "—"}</p>
                          <div className="mt-1 flex items-center justify-between text-xs">
                            <span className="font-medium text-amber-700">{Math.round(remainingOf(po)).toLocaleString()} pzas</span>
                            {po.commitment_date && <span className="text-gray-400">{format(new Date(po.commitment_date), "dd/MM")}</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Armed-PO hint */}
      {armedPO && !dropBusy && (
        <div className="px-5 py-2 bg-amber-100 border-b border-amber-200 text-sm text-amber-800 flex items-center justify-between gap-3">
          <span className="truncate">
            <b className="font-mono">{armedPO.work_order_no}</b> lista para asignar — toque una casilla libre (o arrástrela). <span className="text-amber-600">Esc para cancelar.</span>
          </span>
          <button onClick={() => setArmedPO(null)} className="shrink-0 text-amber-700 hover:text-amber-900 underline">
            Cancelar
          </button>
        </div>
      )}

      {/* Assigned work orders (color + number) shown above the grid */}
      {(() => {
        const byOrder = new Map();
        assignments
          .filter((a) => !["cancelled", "rejected"].includes(a.status))
          .forEach((a) => {
            const cur = byOrder.get(a.work_order_id) || { id: a.work_order_id, no: woNo(a), qty: 0 };
            cur.qty += parseFloat(a.assigned_quantity) || 0;
            byOrder.set(a.work_order_id, cur);
          });
        const orders = [...byOrder.values()];
        if (orders.length === 0) return null;
        return (
          <div className="px-5 py-3 border-b bg-white">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-800 mr-1">Órdenes asignadas:</span>
              {orders.map((o) => (
                <span
                  key={o.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 pl-1.5 pr-2 py-0.5 text-xs"
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${colorForWO(o.id).dot}`} />
                  <span className="font-mono font-medium text-gray-800">{o.no}</span>
                  <span className="text-gray-500">{Math.round(o.qty).toLocaleString()} pzas</span>
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Compact square grid */}
      <div className="p-5 overflow-x-auto relative">
        {dropBusy && (
          <div className="absolute inset-0 z-40 bg-white/60 flex items-center justify-center">
            <div className="flex items-center gap-2 text-gray-700 text-sm bg-white border rounded-lg px-4 py-2 shadow">
              <Loader2 className="w-4 h-4 animate-spin" /> Programando…
            </div>
          </div>
        )}

        <div className="inline-block">
          {/* Day header row */}
          <div className="grid items-end" style={{ gridTemplateColumns: gridCols, gap: GAP, marginBottom: GAP }}>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Línea</div>
            {dateRange.map((date, idx) => {
              const isToday = isSameDay(date, new Date());
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;
              return (
                <div key={idx} className={`text-center leading-tight ${isWeekend ? "text-gray-300" : "text-gray-500"}`} style={{ width: CELL }}>
                  <div className="text-[9px] uppercase">{format(date, "EEEEE")}</div>
                  <div className={`text-[10px] font-semibold ${isToday ? "text-blue-600" : "text-gray-700"}`}>{format(date, "d")}</div>
                </div>
              );
            })}
          </div>

          {/* Line rows */}
          {lines.length === 0 ? (
            <div className="py-8 text-center text-gray-500 text-sm">No hay líneas configuradas.</div>
          ) : (
            lines.map((lineNo) => (
              <div key={lineNo} className="grid items-center" style={{ gridTemplateColumns: gridCols, gap: GAP, marginBottom: GAP }}>
                {/* Line label */}
                <div className="pr-1" title={`Línea ${lineNo} · ${latestTargetForLine(lineNo).toLocaleString()} pzas/día`}>
                  <div className="text-xs font-semibold text-gray-800 leading-none">L{lineNo}</div>
                  <div className="text-[9px] text-gray-400 leading-none mt-0.5">{latestTargetForLine(lineNo) ? `${latestTargetForLine(lineNo).toLocaleString()}` : "—"}</div>
                </div>

                {/* Day squares */}
                {dateRange.map((date, idx) => {
                  const assignment = getAssignmentForLineAndDate(lineNo, date);
                  const isToday = isSameDay(date, new Date());
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  const dateKey = `${lineNo}|${format(date, "yyyy-MM-dd")}`;
                  const isDropHover = dropTarget === dateKey && activePO && !assignment;
                  const canDrop = activePO && !assignment;
                  const isStart = assignment && isSameDay(date, new Date(assignment.planned_start_date));

                  let cls;
                  if (assignment) {
                    const c = colorForWO(assignment.work_order_id);
                    const overdue = isOverdue(assignment) ? "ring-2 ring-red-600" : "";
                    const done = assignment.status === "completed" ? "opacity-60" : "";
                    cls = `${c.bg} ${c.border} border cursor-pointer ${overdue} ${done}`;
                  } else {
                    cls = `border ${isToday ? "border-blue-200 bg-blue-50" : isWeekend ? "border-gray-100 bg-gray-50" : "border-gray-200 bg-gray-100"}`;
                  }

                  return (
                    <div
                      key={idx}
                      onDragOver={(e) => { if (canDrop) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDropTarget(dateKey); } }}
                      onDragLeave={() => setDropTarget((t) => (t === dateKey ? null : t))}
                      onDrop={(e) => handleDrop(e, lineNo, date)}
                      onClick={() => handleCellClick(lineNo, date, assignment)}
                      onMouseEnter={(e) => assignment && setHovered({ assignment, x: e.clientX, y: e.clientY })}
                      onMouseMove={(e) => assignment && setHovered({ assignment, x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setHovered(null)}
                      style={{ width: CELL, height: CELL }}
                      className={`relative rounded-md transition ${cls} ${isDropHover ? "ring-2 ring-amber-400 bg-amber-100" : ""} ${canDrop ? "cursor-pointer hover:ring-2 hover:ring-amber-300" : ""}`}
                    >
                      {isStart && <span className="absolute inset-y-0 left-0 w-1 rounded-l-md bg-black/25" />}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Legend: cell states (order colors are shown above the grid) */}
      <div className="px-5 py-3 border-t bg-gray-50 text-xs">
        <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded ring-2 ring-red-600 bg-white" />
            <span className="text-gray-600">Atrasada</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-gray-100 border border-gray-200" />
            <span className="text-gray-600">Libre</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-gray-400 opacity-60" />
            <span className="text-gray-600">Completada (atenuada)</span>
          </div>
        </div>
      </div>

      {/* Hover tooltip (follows cursor) */}
      {hovered && (
        <div className="fixed z-[60] w-56 bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3 pointer-events-none"
          style={{ left: Math.min(hovered.x + 12, (typeof window !== "undefined" ? window.innerWidth : 1000) - 240), top: hovered.y + 12 }}>
          <div className="font-medium mb-1">{woNo(hovered.assignment)}</div>
          <div className="space-y-0.5">
            <Row k="Estilo" v={woStyle(hovered.assignment)} />
            <Row k="Línea" v={`L${hovered.assignment.line_no}`} />
            <Row k="Cantidad" v={`${Math.round(hovered.assignment.assigned_quantity).toLocaleString()} pzas`} />
            <Row k="Inicio" v={format(new Date(hovered.assignment.planned_start_date), "dd/MM/yyyy")} />
            <Row k="Fin" v={format(new Date(hovered.assignment.planned_end_date), "dd/MM/yyyy")} />
            <Row k="Estado" v={hovered.assignment.status} />
          </div>
        </div>
      )}

      {/* Assignment Details Modal */}
      {selectedAssignment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedAssignment(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b"><h3 className="font-semibold text-gray-900">Detalles de Asignación</h3></div>
            <div className="p-6 space-y-3 text-sm">
              {(() => {
                const wo = workOrders.find((w) => w.id === selectedAssignment.work_order_id);
                return (
                  <>
                    <ModalRow k="Orden" v={woNo(selectedAssignment)} bold />
                    <ModalRow k="Estilo" v={woStyle(selectedAssignment)} />
                    <ModalRow k="Línea" v={selectedAssignment.line_no} />
                    <ModalRow k="Cantidad" v={`${Math.round(selectedAssignment.assigned_quantity).toLocaleString()} pzas`} />
                    <ModalRow k="Inicio" v={format(new Date(selectedAssignment.planned_start_date), "dd/MM/yyyy")} />
                    <ModalRow k="Fin" v={format(new Date(selectedAssignment.planned_end_date), "dd/MM/yyyy")} />
                    <ModalRow k="Estado" v={selectedAssignment.status} />
                    {wo && <>
                      <ModalRow k="Cliente" v={wo.customer_name} />
                      <ModalRow k="Total Orden" v={`${Math.round(targetOf(wo)).toLocaleString()} pzas`} />
                    </>}
                  </>
                );
              })()}
            </div>
            <div className="px-6 py-4 border-t flex flex-wrap justify-between gap-2">
              {(() => {
                const sel = selectedAssignment;
                const sameOrderOnLine = assignments.filter(
                  (a) =>
                    a.work_order_id === sel.work_order_id &&
                    String(a.line_no) === String(sel.line_no) &&
                    !["cancelled"].includes(a.status)
                );
                const dayLabel = sel.assigned_date
                  ? format(new Date(sel.assigned_date), "dd/MM")
                  : format(new Date(sel.planned_start_date), "dd/MM");
                return (
                  <div className="flex flex-wrap gap-2">
                    <button
                      disabled={dropBusy}
                      onClick={() => {
                        if (window.confirm(`¿Quitar la asignación del ${dayLabel} en la Línea ${sel.line_no}?`)) {
                          removeAssignments([sel.id]);
                        }
                      }}
                      className="px-3 py-2 text-sm bg-rose-50 text-rose-700 rounded-lg hover:bg-rose-100 border border-rose-200 disabled:opacity-50"
                    >
                      Quitar este día
                    </button>
                    {sameOrderOnLine.length > 1 && (
                      <button
                        disabled={dropBusy}
                        onClick={() => {
                          if (window.confirm(`¿Quitar TODA la orden ${woNo(sel)} de la Línea ${sel.line_no}? (${sameOrderOnLine.length} días)`)) {
                            removeAssignments(sameOrderOnLine.map((a) => a.id));
                          }
                        }}
                        className="px-3 py-2 text-sm bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50"
                      >
                        Quitar orden de la línea ({sameOrderOnLine.length})
                      </button>
                    )}
                  </div>
                );
              })()}
              <button onClick={() => setSelectedAssignment(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] text-sm px-4 py-2 rounded-full shadow-lg flex items-center gap-2 max-w-[90vw] ${toast.isError ? "bg-rose-600 text-white" : "bg-gray-900 text-white"}`}>
          {toast.isError ? <AlertCircle className="w-4 h-4 shrink-0" /> : <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
          <span className="truncate">{toast.msg}</span>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }) {
  return <div className="flex justify-between gap-3"><span className="text-gray-400">{k}:</span><span className="text-right capitalize truncate">{v}</span></div>;
}
function ModalRow({ k, v, bold }) {
  return <div className="flex justify-between"><span className="text-gray-500">{k}:</span><span className={`capitalize ${bold ? "font-medium" : ""}`}>{v}</span></div>;
}