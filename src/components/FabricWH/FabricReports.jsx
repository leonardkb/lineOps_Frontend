// components/FabricWH/FabricReports.jsx
// Almacén de Tela — Reportes de entradas y salidas.
//
// - Period stepper (‹ ›) and quick ranges; months step by calendar month.
// - KPIs compare against the previous period of the same length.
// - Chart switches between rollos / yardas, groups by week for long ranges,
//   shows a tooltip and a dashed average line, and clicking a bar filters.
// - Clicking a container, supplier or type filters the whole report
//   (KPIs, chart, lists, detail and the CSV export). Active filters show as chips.
// - Free-text search over roll, PO, fabric, color, lot, supplier and reference.
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Download, ArrowDownToLine, ArrowUpFromLine, Ruler, Package, Factory, Boxes,
  ChevronLeft, ChevronRight, Search, X, ArrowUpRight, ArrowDownRight, Loader2, RotateCw,
} from "lucide-react";
import {
  api, num, cx, Card, CardHeader, Button, PageHeader, SegTabs, RollTable, EmptyState,
  Banner, fmtDateTime, todayStr, downloadCsv, inputCls, useRollDrawer, locationText, boxSortKey,
} from "./fabricShared";

const OUT_TYPE = { inspection_out: "Enviado a inspección", supplier_return: "Devuelto a proveedor" };
const LOCALE = "es-MX";

/* ---------- dates ---------- */
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s) => new Date(`${s}T00:00:00`);
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const spanDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000) + 1;
const weekStart = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const fmtDay = (s, opts = {}) => parse(s).toLocaleDateString(LOCALE, { day: "numeric", month: "short", ...opts });

function rangeLabel(from, to) {
  if (from === to) return parse(from).toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${fmtDay(from, sameYear ? {} : { year: "numeric" })} – ${fmtDay(to, { year: "numeric" })}`;
}

function preset(key) {
  const now = new Date();
  if (key === "today") return [todayStr(), todayStr()];
  if (key === "yesterday") return [todayStr(-1), todayStr(-1)];
  if (key === "7d") return [todayStr(-6), todayStr()];
  if (key === "30d") return [todayStr(-29), todayStr()];
  if (key === "month") return [ymd(new Date(now.getFullYear(), now.getMonth(), 1)), todayStr()];
  if (key === "lastMonth") return [ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), ymd(new Date(now.getFullYear(), now.getMonth(), 0))];
  return null;
}
const PRESETS = [["today", "Hoy"], ["yesterday", "Ayer"], ["7d", "7 días"], ["30d", "30 días"], ["month", "Este mes"], ["lastMonth", "Mes pasado"]];
const matchPreset = (f, t) => PRESETS.find(([k]) => { const p = preset(k); return p[0] === f && p[1] === t; })?.[0] || "custom";

/* ---------- data helpers ---------- */
const NO_FILTERS = { bucket: null, box: null, type: null, supplier: null, q: "" };
const supplierOf = (r) => r.supplier || r.supplier_code || "Sin proveedor";
const boxOf = (r) => r.box_code || r.container_code || "Sin contenedor";
const SEARCH_FIELDS = ["roll_no", "po_number", "fabric_name", "fabric_item_number", "color", "lot", "supplier", "supplier_code", "customer", "item_sku_code", "reference", "box_code", "location_code"];

function matches(r, f, bucketOf, skip) {
  if (skip !== "bucket" && f.bucket && bucketOf(r) !== f.bucket) return false;
  if (skip !== "box" && f.box && boxOf(r) !== f.box) return false;
  if (skip !== "type" && f.type && r.type !== f.type) return false;
  if (skip !== "supplier" && f.supplier && supplierOf(r) !== f.supplier) return false;
  const q = f.q.trim().toLowerCase();
  if (q && !SEARCH_FIELDS.some((k) => String(r[k] ?? "").toLowerCase().includes(q))) return false;
  return true;
}

function tally(rows, keyFn, extra) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    const c = m.get(k) || { key: k, rolls: 0, yards: 0, ...(extra ? extra(r) : {}) };
    c.rolls++; c.yards += Number(r.yards) || 0;
    m.set(k, c);
  }
  return [...m.values()].sort((a, b) => b.rolls - a.rolls || b.yards - a.yards);
}

const totalsOf = (rows) => rows.reduce(
  (t, r) => ({ rolls: t.rolls + 1, yards: t.yards + (Number(r.yards) || 0), meters: t.meters + (Number(r.meters) || 0) }),
  { rolls: 0, yards: 0, meters: 0 },
);

const niceMax = (v) => { if (v <= 1) return 1; const p = 10 ** Math.floor(Math.log10(v)); return Math.ceil(v / p) * p; };

/* ---------- KPI tile ---------- */
const TONES = {
  emerald: "bg-emerald-50 text-emerald-600",
  violet: "bg-violet-50 text-violet-600",
  indigo: "bg-indigo-50 text-indigo-600",
  slate: "bg-slate-100 text-slate-600",
};

function Kpi({ icon: Icon, label, value, cur, prev, sub, tone = "slate", dim }) {
  let delta = null;
  if (!sub && prev != null && cur != null) {
    if (prev === 0) delta = { dir: 0, text: cur === 0 ? "Igual que el periodo anterior" : "Sin movimientos el periodo anterior" };
    else {
      const p = ((cur - prev) / prev) * 100;
      const r = Math.round(Math.abs(p));
      delta = { dir: r === 0 ? 0 : Math.sign(p), text: r === 0 ? "Igual que el periodo anterior" : `${p > 0 ? "+" : "−"}${r}% vs periodo anterior` };
    }
  }
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span className={cx("w-7 h-7 rounded-lg grid place-items-center shrink-0", TONES[tone])}><Icon className="w-4 h-4" /></span>
        {label}
      </div>
      <div className={cx("mt-2 text-2xl font-semibold text-slate-900 fab-tnum transition-opacity", dim && "opacity-40")}>{value}</div>
      <div className="mt-1 min-h-[1rem] text-xs text-slate-500 flex items-center gap-1">
        {sub}
        {delta && delta.dir > 0 && <ArrowUpRight className="w-3.5 h-3.5" />}
        {delta && delta.dir < 0 && <ArrowDownRight className="w-3.5 h-3.5" />}
        {delta?.text}
      </div>
    </Card>
  );
}

/* ---------- chart ---------- */
function TrendChart({ rows, from, to, kind, weekly, bucketOf, selected, onSelect }) {
  const [metric, setMetric] = useState("rolls");
  const [hover, setHover] = useState(null);

  const buckets = useMemo(() => {
    const out = [];
    const end = parse(to);
    for (let d = weekly ? weekStart(parse(from)) : parse(from); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (weekly ? 7 : 1))) out.push(ymd(d));
    return out;
  }, [from, to, weekly]);

  const data = useMemo(() => {
    const m = Object.fromEntries(buckets.map((k) => [k, { key: k, a: 0, b: 0, ya: 0, yb: 0 }]));
    for (const r of rows) {
      const x = m[bucketOf(r)];
      if (!x) continue;
      const y = Number(r.yards) || 0;
      if (kind === "outbound" && r.type === "supplier_return") { x.b++; x.yb += y; } else { x.a++; x.ya += y; }
    }
    return buckets.map((k) => m[k]);
  }, [rows, buckets, bucketOf, kind]);

  if (data.length < 2) return null;

  const isRolls = metric === "rolls";
  const part = (x, p) => (isRolls ? (p === "a" ? x.a : x.b) : (p === "a" ? x.ya : x.yb));
  const total = (x) => part(x, "a") + part(x, "b");
  const max = niceMax(Math.max(...data.map(total)));
  const avg = data.reduce((s, x) => s + total(x), 0) / data.length;
  const fmtV = (v) => (isRolls ? num(v) : num(v, 1));
  const unit = isRolls ? "rollos" : "yd";
  const labelEvery = Math.ceil(data.length / 8);
  const bucketName = (k) => (weekly ? `Semana del ${fmtDay(k)}` : fmtDay(k, { weekday: "short" }));
  const h = hover != null ? data[hover] : null;
  const isOut = kind === "outbound";

  return (
    <Card>
      <CardHeader
        title={weekly ? "Movimientos por semana" : "Movimientos por día"}
        subtitle={selected ? "Haga clic de nuevo en la barra para quitar el filtro" : `Haga clic en una barra para ver solo ${weekly ? "esa semana" : "ese día"}`}
        actions={(
          <div className="flex items-center gap-3">
            {isOut && (
              <div className="hidden sm:flex gap-3 text-xs text-slate-500">
                <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-violet-400 mr-1" />Inspección</span>
                <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-slate-400 mr-1" />Devolución</span>
              </div>
            )}
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs" role="group" aria-label="Medida">
              {[["rolls", "Rollos"], ["yards", "Yardas"]].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setMetric(k)} aria-pressed={metric === k}
                  className={cx("px-2.5 py-1 rounded-md transition", metric === k ? "bg-white shadow-sm text-slate-900 font-medium" : "text-slate-500 hover:text-slate-700")}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}
      />
      <div className="px-5 pt-4 pb-3 flex gap-2">
        {/* y axis */}
        <div className="h-44 flex flex-col justify-between text-[11px] text-slate-400 fab-tnum text-right w-10 shrink-0 -mt-1.5">
          <span>{fmtV(max)}</span><span>{fmtV(max / 2)}</span><span>0</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="relative h-44" onMouseLeave={() => setHover(null)}>
            <div className="absolute inset-x-0 top-0 border-t border-slate-100" />
            <div className="absolute inset-x-0 top-1/2 border-t border-slate-100" />
            <div className="absolute inset-x-0 bottom-0 border-t border-slate-200" />
            {avg > 0 && (
              <div className="absolute inset-x-0 border-t border-dashed border-slate-400 pointer-events-none z-10" style={{ bottom: `${(avg / max) * 100}%` }}>
                <span className="absolute right-0 -top-4 text-[10px] text-slate-500 bg-white/80 px-1 rounded">prom. {fmtV(avg)}</span>
              </div>
            )}
            <div className="absolute inset-0 flex items-end gap-[3px]">
              {data.map((x, i) => {
                const on = selected === x.key;
                const dim = selected && !on;
                const weekend = !weekly && [0, 6].includes(parse(x.key).getDay());
                const a = part(x, "a"), b = part(x, "b");
                return (
                  <button
                    key={x.key}
                    type="button"
                    onClick={() => onSelect(on ? null : x.key)}
                    onMouseEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    aria-pressed={on}
                    aria-label={`${bucketName(x.key)}: ${fmtV(a + b)} ${unit}`}
                    className={cx(
                      "flex-1 h-full flex flex-col justify-end rounded-t-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                      weekend && "bg-slate-50", hover === i && "bg-slate-100",
                    )}
                  >
                    <div className={cx("w-full transition-opacity", dim && "opacity-25")}>
                      <div className="w-full rounded-t-sm bg-slate-400" style={{ height: `${(b / max) * 176}px` }} />
                      <div
                        className={cx("w-full", b ? "" : "rounded-t-sm", isOut ? "bg-violet-400" : "bg-emerald-500", on && (isOut ? "bg-violet-600" : "bg-emerald-700"))}
                        style={{ height: `${(a / max) * 176}px`, minHeight: a + b ? 2 : 0 }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
            {h && (
              <div
                className="absolute -top-2 z-20 pointer-events-none rounded-lg bg-slate-900 text-white text-xs px-3 py-2 shadow-lg whitespace-nowrap"
                style={{
                  left: `${((hover + 0.5) / data.length) * 100}%`,
                  transform: `translate(${hover < data.length / 4 ? "0" : hover > (data.length * 3) / 4 ? "-100%" : "-50%"}, -100%)`,
                }}
              >
                <div className="font-medium mb-0.5 capitalize">{bucketName(h.key)}</div>
                <div className="fab-tnum">{num(h.a + h.b)} rollos · {num(h.ya + h.yb, 1)} yd</div>
                {isOut && (h.a > 0 || h.b > 0) && (
                  <div className="text-slate-300 fab-tnum">{num(h.a)} a inspección · {num(h.b)} devueltos</div>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-[3px] text-[11px] text-slate-400 mt-1.5 fab-tnum">
            {data.map((x, i) => (
              <span key={x.key} className="flex-1 min-w-0 whitespace-nowrap overflow-visible">
                {i % labelEvery === 0 ? fmtDay(x.key) : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ---------- breakdown list ---------- */
function Breakdown({ title, items, selected, onSelect, barCls, icon: Icon, renderLabel, limit = 6 }) {
  const [all, setAll] = useState(false);
  const total = items.reduce((s, x) => s + x.rolls, 0);
  let shown = all ? items : items.slice(0, limit);
  if (selected && !shown.some((s) => s.key === selected)) {
    const sel = items.find((s) => s.key === selected);
    if (sel) shown = [...shown, sel];
  }
  return (
    <Card className="flex flex-col">
      <CardHeader title={title} subtitle={items.length ? `${items.length} en total · clic para filtrar` : undefined} />
      {items.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-400">Nada que mostrar con los filtros actuales.</p>
      ) : (
        <ul className="p-2 flex-1">
          {shown.map((s) => {
            const pct = total ? (s.rolls / total) * 100 : 0;
            const on = selected === s.key;
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => onSelect(on ? null : s.key)}
                  aria-pressed={on}
                  className={cx(
                    "w-full text-left px-3 py-2.5 rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                    on ? "bg-slate-100 ring-1 ring-slate-300" : "hover:bg-slate-50",
                    selected && !on && "opacity-50 hover:opacity-100",
                  )}
                >
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-800 truncate flex items-center gap-2 min-w-0">
                      {Icon && <Icon className="w-4 h-4 text-slate-400 shrink-0" />}
                      <span className="truncate">{renderLabel(s)}</span>
                      {on && <X className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
                    </span>
                    <span className="text-slate-600 fab-tnum whitespace-nowrap">
                      {num(s.rolls)} <span className="text-slate-400">rollos</span> · {num(s.yards, 1)} <span className="text-slate-400">yd</span>
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-100">
                      <div className={cx("h-full rounded-full", barCls)} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[11px] text-slate-400 fab-tnum w-9 text-right">{Math.round(pct)}%</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {items.length > limit && (
        <button type="button" onClick={() => setAll((v) => !v)} className="border-t border-slate-100 py-2.5 text-sm text-indigo-600 hover:bg-slate-50 rounded-b-xl">
          {all ? "Ver menos" : `Ver los ${items.length}`}
        </button>
      )}
    </Card>
  );
}

function Chip({ children, onClear }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium pl-2.5 pr-1 py-1">
      {children}
      <button type="button" onClick={onClear} className="rounded-full p-0.5 hover:bg-indigo-100" aria-label="Quitar filtro"><X className="w-3 h-3" /></button>
    </span>
  );
}

/* ---------- page ---------- */
export default function FabricReports() {
  const openRoll = useRollDrawer();
  const [kind, setKind] = useState("inbound");
  const [range, setRange] = useState("month");
  const [[from, to], setDates] = useState(() => preset("month"));
  const [filters, setFilters] = useState(NO_FILTERS);
  const [data, setData] = useState(null);
  const [prev, setPrev] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const isIn = kind === "inbound";
  const days = spanDays(from, to);
  const weekly = days > 62;
  const today = todayStr();

  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const choose = (key) => { const p = preset(key); if (p) { setRange(key); setDates(p); } };
  const setCustom = (f, t) => { if (!f || !t || f > t) return; setRange(matchPreset(f, t)); setDates([f, t]); };
  const switchKind = (k) => { if (k !== kind) { setData(null); setPrev(null); setKind(k); } };

  const step = (dir) => {
    let nf, nt;
    const monthly = from.endsWith("-01") && (range === "month" || range === "lastMonth" || to === ymd(endOfMonth(parse(from))));
    if (monthly) {
      const d = parse(from);
      const s = new Date(d.getFullYear(), d.getMonth() + dir, 1);
      nf = ymd(s); nt = ymd(endOfMonth(s));
    } else {
      nf = addDays(from, dir * days); nt = addDays(to, dir * days);
    }
    if (nt > today) nt = today;
    setCustom(nf, nt);
  };

  // Current period + previous period of the same length (for the comparison).
  useEffect(() => {
    if (from > to) return undefined;
    let alive = true;
    setLoading(true); setError(null);
    const pFrom = addDays(from, -days), pTo = addDays(from, -1);
    Promise.all([
      api(`/reports/${kind}?from=${from}&to=${to}`),
      api(`/reports/${kind}?from=${pFrom}&to=${pTo}`).catch(() => null),
    ])
      .then(([cur, prv]) => { if (alive) { setData(cur); setPrev(prv); } })
      .catch((e) => { if (alive) { setError(e.message); setData(null); setPrev(null); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [kind, from, to, days, reloadKey]);

  // A new period or report type starts unfiltered.
  useEffect(() => { setFilters(NO_FILTERS); }, [kind, from, to]);

  const bucketOf = useCallback(
    (r) => { const d = new Date(r.moved_at); return ymd(weekly ? weekStart(d) : d); },
    [weekly],
  );

  const rows = useMemo(() => (data?.rows || []).map((r) => ({ ...r, id: r.movement_id })), [data]);
  const filtered = useMemo(() => rows.filter((r) => matches(r, filters, bucketOf)), [rows, filters, bucketOf]);
  const chartRows = useMemo(() => rows.filter((r) => matches(r, filters, bucketOf, "bucket")), [rows, filters, bucketOf]);
  const boxes = useMemo(
    () => tally(rows.filter((r) => matches(r, filters, bucketOf, "box")), boxOf, (r) => ({ box_code: r.box_code, location_code: r.location_code })),
    [rows, filters, bucketOf],
  );
  const suppliers = useMemo(() => tally(rows.filter((r) => matches(r, filters, bucketOf, "supplier")), supplierOf), [rows, filters, bucketOf]);
  const typeCounts = useMemo(() => {
    const c = { all: 0, inspection_out: 0, supplier_return: 0 };
    for (const r of rows) if (matches(r, filters, bucketOf, "type")) { c.all++; c[r.type] = (c[r.type] || 0) + 1; }
    return c;
  }, [rows, filters, bucketOf]);

  const anyFilter = Boolean(filters.bucket || filters.box || filters.type || filters.supplier || filters.q.trim());
  const periodTotals = data?.totals || totalsOf(rows);
  const totals = anyFilter ? totalsOf(filtered) : periodTotals;
  const prevTotals = prev ? prev.totals || totalsOf(prev.rows || []) : null;
  const avgYd = totals.rolls ? totals.yards / totals.rolls : 0;
  const prevAvg = prevTotals?.rolls ? prevTotals.yards / prevTotals.rolls : prevTotals ? 0 : null;
  const truncated = data?.totals?.rolls > rows.length;
  const firstLoad = loading && !data;

  const exportCsv = () => {
    downloadCsv(`${isIn ? "entradas" : "salidas"}-tela-${from}_${to}${anyFilter ? "-filtrado" : ""}.csv`, [
      { label: "Fecha y hora", get: (r) => fmtDateTime(r.moved_at) },
      ...(!isIn ? [{ label: "Tipo", get: (r) => OUT_TYPE[r.type] || r.type }] : []),
      { label: "Contenedor", key: "box_code" },
      { label: "Lugar", key: "location_code" },
      { label: "División", key: "container_code" },
      { label: "Rollo de tela", key: "roll_no" },
      { label: "Purchase order number", key: "po_number" },
      { label: "Supplier", key: "supplier" },
      { label: "Supplier Code", key: "supplier_code" },
      { label: "Fabric item number", key: "fabric_item_number" },
      { label: "Fabric name", key: "fabric_name" },
      { label: "Tipo de tela", key: "fabric_type" },
      { label: "Color", key: "color" },
      { label: "Lote", key: "lot" },
      { label: "Width", key: "width" },
      { label: "Width Unit", key: "width_unit" },
      { label: "Weight", key: "weight" },
      { label: "Weight Unit", key: "weight_unit" },
      { label: "Gramaje (g/m²)", key: "weight_gsm" },
      { label: "Composition", key: "composition" },
      { label: "Cliente", key: "customer" },
      { label: "Item SKU code", key: "item_sku_code" },
      { label: "Yardas", key: "yards" },
      { label: "Metros", key: "meters" },
      ...(!isIn ? [{ label: "Referencia", key: "reference" }, { label: "Motivo", key: "reason" }] : []),
      { label: "Usuario", key: "user_name" },
    ], filtered);
  };

  const columns = [
    { key: "moved_at", label: "Fecha y hora", render: (r) => fmtDateTime(r.moved_at) },
    ...(!isIn ? [{ key: "type", label: "Tipo", render: (r) => (
      <span className={cx("text-xs rounded-md px-1.5 py-0.5 font-medium whitespace-nowrap", r.type === "inspection_out" ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-600")}>{OUT_TYPE[r.type] || r.type}</span>
    ) }] : []),
    { key: "box_code", label: isIn ? "Guardado en" : "Salió de", sortValue: boxSortKey, render: (r) => locationText(r) },
    { key: "roll_no", label: "Rollo", mono: true },
    { key: "po_number", label: "PO" },
    { key: "supplier", label: "Proveedor" },
    { key: "fabric_name", label: "Tela", render: (r) => <span>{r.fabric_name || "—"} <span className="text-slate-400">· {r.color || "—"}</span></span> },
    { key: "lot", label: "Lote" },
    { key: "yards", label: "Yardas", align: "right", render: (r) => num(r.yards, 1) },
    { key: "meters", label: "Metros", align: "right", render: (r) => num(r.meters, 1) },
    ...(!isIn ? [{ key: "reference", label: "Referencia / motivo", render: (r) => [r.reference, r.reason === "approved" || r.reason === "rejected" ? null : r.reason].filter(Boolean).join(" · ") || "—" }] : []),
    { key: "user_name", label: "Usuario" },
  ];

  const kpiSub = (cur, fmt) => (anyFilter ? `de ${fmt(cur)} en el periodo` : undefined);
  const noData = !loading && data && rows.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reportes"
        subtitle={`${isIn ? "Entradas al contenedor" : "Salidas del almacén"} · ${rangeLabel(from, to)}`}
        actions={(
          <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!filtered.length}>
            {anyFilter ? `Exportar ${num(filtered.length)} filas` : "Exportar CSV"}
          </Button>
        )}
      />

      {/* ---- toolbar ---- */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <SegTabs
            value={kind}
            onChange={switchKind}
            tabs={[{ key: "inbound", label: "Entradas", icon: ArrowDownToLine }, { key: "outbound", label: "Salidas", icon: ArrowUpFromLine }]}
          />
          <div className="flex items-center gap-1 sm:ml-auto">
            <button type="button" onClick={() => step(-1)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Periodo anterior">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="min-w-[11rem] text-center text-sm font-medium text-slate-800 flex items-center justify-center gap-2">
              {rangeLabel(from, to)}
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" aria-label="Cargando" />}
            </span>
            <button type="button" onClick={() => step(1)} disabled={to >= today} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent" aria-label="Periodo siguiente">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100">
          <div className="flex flex-wrap gap-1">
            {PRESETS.map(([k, label]) => (
              <button key={k} type="button" onClick={() => choose(k)} aria-pressed={range === k}
                className={cx("px-2.5 py-1.5 rounded-lg text-sm transition", range === k ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <input type="date" value={from} max={to} onChange={(e) => setCustom(e.target.value, to)} className={cx(inputCls, "py-1.5", range === "custom" && "ring-2 ring-slate-900/10")} aria-label="Desde" />
            <span className="text-slate-400">a</span>
            <input type="date" value={to} min={from} max={today} onChange={(e) => setCustom(from, e.target.value)} className={cx(inputCls, "py-1.5", range === "custom" && "ring-2 ring-slate-900/10")} aria-label="Hasta" />
          </div>
        </div>
        {!isIn && (
          <div className="flex flex-wrap gap-1 pt-3 border-t border-slate-100" role="group" aria-label="Tipo de salida">
            {[[null, "Todas las salidas", typeCounts.all], ["inspection_out", OUT_TYPE.inspection_out, typeCounts.inspection_out], ["supplier_return", OUT_TYPE.supplier_return, typeCounts.supplier_return]].map(([k, l, n]) => (
              <button key={l} type="button" onClick={() => setFilter("type", k)} aria-pressed={filters.type === k}
                className={cx("px-2.5 py-1.5 rounded-lg text-sm transition flex items-center gap-1.5",
                  filters.type === k ? "bg-violet-600 text-white" : "text-slate-600 hover:bg-slate-100")}>
                {l}
                <span className={cx("text-xs rounded-full px-1.5 fab-tnum", filters.type === k ? "bg-white/20" : "bg-slate-100 text-slate-500")}>{num(n || 0)}</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {error && (
        <Banner kind="err">
          <span className="flex flex-wrap items-center gap-3">
            No se pudo cargar el reporte: {error}
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
              <RotateCw className="w-3.5 h-3.5" /> Reintentar
            </button>
          </span>
        </Banner>
      )}

      {truncated && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          El periodo tiene {num(data.totals.rolls)} movimientos; aquí se muestran {num(rows.length)}. Acorte el rango para ver el detalle completo.
        </div>
      )}

      {/* ---- KPIs ---- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={isIn ? ArrowDownToLine : ArrowUpFromLine} label={isIn ? "Rollos recibidos" : "Rollos que salieron"} tone={isIn ? "emerald" : "violet"}
          value={num(totals.rolls)} cur={totals.rolls} prev={prevTotals?.rolls} sub={kpiSub(periodTotals.rolls, num)} dim={firstLoad} />
        <Kpi icon={Ruler} label="Yardas" tone="indigo"
          value={num(totals.yards, 1)} cur={totals.yards} prev={prevTotals?.yards} sub={kpiSub(periodTotals.yards, (v) => num(v, 1))} dim={firstLoad} />
        <Kpi icon={Ruler} label="Metros" tone="indigo"
          value={num(totals.meters, 1)} cur={totals.meters} prev={prevTotals?.meters} sub={kpiSub(periodTotals.meters, (v) => num(v, 1))} dim={firstLoad} />
        <Kpi icon={Package} label="Yardas por rollo" tone="slate"
          value={num(avgYd, 1)} cur={avgYd} prev={prevAvg} sub={anyFilter ? "promedio con filtros" : undefined} dim={firstLoad} />
      </div>

      {noData ? (
        <Card>
          <EmptyState
            icon={Package}
            title={isIn ? "No entraron rollos en este periodo" : "No salieron rollos en este periodo"}
            text="Use ‹ › para ir a otro periodo o elija un rango más amplio, como “30 días”."
          />
        </Card>
      ) : (
        <>
          <TrendChart
            rows={chartRows} from={from} to={to} kind={kind} weekly={weekly} bucketOf={bucketOf}
            selected={filters.bucket} onSelect={(v) => setFilter("bucket", v)}
          />

          {rows.length > 0 && (
            <div className="grid lg:grid-cols-2 gap-6">
              <Breakdown
                title={isIn ? "Por contenedor" : "Por contenedor de origen"}
                items={boxes}
                icon={Boxes}
                barCls={isIn ? "bg-emerald-500" : "bg-violet-400"}
                selected={filters.box}
                onSelect={(v) => setFilter("box", v)}
                renderLabel={(s) => (
                  <>{s.key}{s.location_code && <span className="font-normal text-slate-400"> · {s.location_code}</span>}</>
                )}
              />
              <Breakdown
                title="Por proveedor"
                items={suppliers}
                icon={Factory}
                barCls="bg-indigo-400"
                selected={filters.supplier}
                onSelect={(v) => setFilter("supplier", v)}
                renderLabel={(s) => s.key}
              />
            </div>
          )}

          {/* ---- detail ---- */}
          <Card className="overflow-hidden">
            <CardHeader
              title="Detalle"
              subtitle={anyFilter ? `${num(filtered.length)} de ${num(rows.length)} movimientos` : `${num(rows.length)} movimientos · clic en una fila para abrir el rollo`}
              actions={(
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={filters.q}
                    onChange={(e) => setFilter("q", e.target.value)}
                    placeholder="Rollo, PO, tela, lote…"
                    className={cx(inputCls, "py-1.5 pl-8 w-56")}
                    aria-label="Buscar en el detalle"
                  />
                </div>
              )}
            />
            {anyFilter && (
              <div className="px-5 py-2.5 border-b border-slate-100 flex flex-wrap items-center gap-2 bg-slate-50/60">
                <span className="text-xs text-slate-500">Filtrando por</span>
                {filters.bucket && <Chip onClear={() => setFilter("bucket", null)}>{weekly ? `Semana del ${fmtDay(filters.bucket)}` : fmtDay(filters.bucket, { weekday: "short" })}</Chip>}
                {filters.type && <Chip onClear={() => setFilter("type", null)}>{OUT_TYPE[filters.type]}</Chip>}
                {filters.box && <Chip onClear={() => setFilter("box", null)}>Contenedor {filters.box}</Chip>}
                {filters.supplier && <Chip onClear={() => setFilter("supplier", null)}>{filters.supplier}</Chip>}
                {filters.q.trim() && <Chip onClear={() => setFilter("q", "")}>“{filters.q.trim()}”</Chip>}
                <button type="button" onClick={() => setFilters(NO_FILTERS)} className="text-xs text-indigo-600 hover:underline ml-1">Quitar todos</button>
              </div>
            )}
            <RollTable
              rows={filtered}
              columns={columns}
              loading={firstLoad}
              onRowClick={(r) => openRoll({ ...r, id: r.roll_id })}
              defaultSort={{ key: "moved_at", dir: "desc" }}
              empty={<EmptyState icon={Search} title="Ningún movimiento coincide" text="Quite uno de los filtros de arriba para ver más resultados." />}
            />
          </Card>
        </>
      )}
    </div>
  );
}