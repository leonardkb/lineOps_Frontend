// components/FabricWH/FabricSkytexTransfers.jsx
// Almacén de Tela — Transferencias de Skytex.
// Skytex pushes every transfer to Skyrina automatically (POST /skytex/transfers).
// Their rolls are registered as «En Skytex», ready to get a container.
// This view lists those transfers (folio, PO, how many rolls are still in
// Skytex / reserved / received / cancelled) and, on click, their rolls.
import { useState, useEffect, useCallback, useMemo } from "react";
import { RefreshCw, ChevronRight, DownloadCloud, MapPin, AlertTriangle } from "lucide-react";
import {
  api, num, cx, Card, CardHeader, Button, SearchInput, EmptyState, RollTable, StatusBadge, Banner, Pill,
  fmtDateTime, locationText, inputCls,
} from "./fabricShared";

const RANGES = [[30, "30 días"], [90, "90 días"], [180, "6 meses"], [365, "1 año"]];

export default function FabricSkytexTransfers({ onNavigate = () => {} }) {
  const [days, setDays] = useState(90);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);          // transfer_id expanded
  const [rolls, setRolls] = useState({});         // transfer_id → rolls
  const [rollsLoading, setRollsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const d = await api(`/skytex/transfers?days=${days}`);
      setList(d.transfers || []);
      setRolls({});
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [days]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (id) => {
    if (open === id) return setOpen(null);
    setOpen(id);
    if (rolls[id]) return;
    setRollsLoading(true);
    try {
      const d = await api(`/skytex/transfers/${encodeURIComponent(id)}/rolls`);
      setRolls((p) => ({ ...p, [id]: d.rolls || [] }));
    } catch (e) { setError(e.message); }
    finally { setRollsLoading(false); }
  };

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return list;
    return list.filter((x) => [x.transfer_id, x.po_numbers].some((v) => String(v ?? "").toLowerCase().includes(t)));
  }, [list, q]);

  const totals = useMemo(() => list.reduce((a, x) => ({
    en: a.en + x.en_skytex, res: a.res + x.reserved, rec: a.rec + x.received,
  }), { en: 0, res: 0, rec: 0 }), [list]);

  const rollCols = [
    { key: "roll_no", label: "Rollo", mono: true },
    { key: "po_number", label: "PO" },
    { key: "fabric_name", label: "Tela", render: (r) => <span>{r.fabric_name || "—"} <span className="text-slate-400">· {r.color || "—"}</span></span> },
    { key: "lot", label: "Lote" },
    { key: "yards", label: "Yardas", align: "right", render: (r) => num(r.yards, 1) },
    { key: "arrival_date", label: "Fecha de entrega" },
    { key: "status", label: "Estado", sortable: false, render: (r) => <StatusBadge status={r.status} /> },
    { key: "box_code", label: "Contenedor", render: (r) => (r.box_code || r.location_code ? locationText(r) : <span className="text-slate-400">—</span>) },
  ];

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Transferencias de Skytex"
        subtitle={`Skytex las envía automáticamente. Sus rollos quedan «En Skytex» listos para asignar contenedor · ${num(totals.en)} en Skytex · ${num(totals.res)} reservados · ${num(totals.rec)} recibidos`}
        actions={
          <>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={cx(inputCls, "py-1.5 text-sm")} aria-label="Periodo">
              {RANGES.map(([d, l]) => <option key={d} value={d}>{l}</option>)}
            </select>
            <Button size="sm" variant="secondary" icon={RefreshCw} loading={loading} onClick={load}>Actualizar</Button>
          </>
        }
      />
      <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Folio (ITETRA-…) o PO" className="flex-1" />
        {totals.en > 0 && (
          <Button size="sm" icon={MapPin} onClick={() => onNavigate("ubicaciones")}>Asignar contenedores</Button>
        )}
      </div>
      {error && <div className="px-5 pt-4"><Banner kind="err" onClose={() => setError(null)}>{error}</Banner></div>}

      {!loading && shown.length === 0 ? (
        <EmptyState
          icon={DownloadCloud}
          title={q ? "Ninguna transferencia coincide" : "Aún no hay transferencias de Skytex"}
          text={q ? "Pruebe con otro folio o PO." : "Cada vez que Skytex registre una transferencia a Skyrina, aparecerá aquí automáticamente."}
        />
      ) : (
        <ul className="divide-y divide-slate-100">
          {shown.map((t) => {
            const isOpen = open === t.transfer_id;
            const cancelled = t.event === "transfer_cancelled";
            const active = t.rolls - t.cancelled;
            const pct = active ? Math.round((t.received / active) * 100) : 0;
            return (
              <li key={t.transfer_id}>
                <button onClick={() => toggle(t.transfer_id)} className="w-full px-5 py-3 flex items-center gap-4 text-left hover:bg-slate-50">
                  <ChevronRight className={cx("w-4 h-4 text-slate-400 flex-shrink-0 transition-transform", isOpen && "rotate-90")} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold text-slate-900">{t.transfer_id}</span>
                      {cancelled && <Pill tone="slate">Cancelada</Pill>}
                      {t.times_received > 1 && <Pill tone="indigo">{t.times_received} envíos</Pill>}
                      {t.overdue > 0 && <Pill tone="red">{t.overdue} con entrega vencida</Pill>}
                      {t.warnings > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-700" title="Avisos en el último envío de Skytex">
                          <AlertTriangle className="w-3.5 h-3.5" />{t.warnings} aviso(s)
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-slate-500 mt-0.5 truncate">
                      {t.po_numbers ? `PO ${t.po_numbers}` : "Sin PO"} · recibido {fmtDateTime(t.last_received_at)}
                      {t.next_delivery && ` · entrega ${t.next_delivery}`}
                    </span>
                  </span>
                  <span className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                    {t.en_skytex > 0 && <Pill tone="amber">{t.en_skytex} en Skytex</Pill>}
                    {t.reserved > 0 && <Pill tone="indigo">{t.reserved} reservados</Pill>}
                    {t.received > 0 && <Pill tone="emerald">{t.received} recibidos</Pill>}
                    {t.cancelled > 0 && <Pill tone="slate">{t.cancelled} cancelados</Pill>}
                  </span>
                  <span className="w-28 sm:w-40 flex-shrink-0 text-right">
                    <span className="block text-sm text-slate-700 fab-tnum sm:whitespace-nowrap">{num(t.rolls)} rollos · {num(t.yards, 0)} yd</span>
                    <span className="mt-1 block h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <span className="block h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                    </span>
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-slate-100 bg-slate-50/40">
                    <RollTable
                      rows={rolls[t.transfer_id] || []}
                      columns={rollCols}
                      loading={rollsLoading && !rolls[t.transfer_id]}
                      maxHeight="45vh"
                      defaultSort={{ key: "roll_no", dir: "asc" }}
                      empty={<EmptyState icon={DownloadCloud} title="Sin rollos" text="Esta transferencia no tiene rollos registrados." />}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}