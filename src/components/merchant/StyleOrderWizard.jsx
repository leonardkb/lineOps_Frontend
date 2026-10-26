import { useEffect, useMemo, useRef, useState } from "react";
import {
  Layers,
  Package,
  Ruler,
  Scissors,
  Timer,
  Palette,
  Boxes,
  Truck,
  Send,
  Plus,
  Trash2,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  FileText,
  Shirt,
  Tag,
  ClipboardList,
  Upload,
  FileSpreadsheet,
  X,
  FileUp,
  Save,
  RefreshCw,
  ClipboardCheck,
  Camera,
  ImagePlus,
  ImageOff,
} from "lucide-react";
import * as XLSX from "xlsx";
import { API_URL } from "../../lib/masterCodeCatalog";

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

/* ==========================================================================
   Style Order — step-by-step builder (self-contained demo)

   Seven steps in the order you asked for, then "Enviar a muestras":
     1. Materiales   – tela + avíos (material master)
     2. Tallas       – especificación / medidas (POM table)
     3. Confección   – workmanship / operaciones
     4. SAM          – tiempo estándar por operación
     5. Colorway     – combinaciones de color por componente
     6. Avíos        – prenda vs. empaque (consumo + colocación)
     7. Paquete de costura – SKU: destino + destino de gancho
     →  Revisar y enviar a la sala de muestras

   State is in-memory (drops into your BOM dashboard as a 4th tab). Seeded
   with the FN2798 / NKB-26-07-0461 tech-pack so every step opens populated.
   ======================================================================== */

// ---- reference data -------------------------------------------------------
const SIZES = ["2XS", "XS", "S", "M", "L", "XL", "XXL", "S-T", "M-T", "L-T", "XL-T", "2XL-T"];

const FABRIC_POSITIONS = ["Cuerpo", "Manga", "Inserto axila", "Vista de cuello", "Refuerzo"];
const TRIM_UNITS = ["pza", "m", "cm", "cono", "rollo", "par", "juego", "g"];
const MACHINES = [
  "Overlock 4 hilos (#514)",
  "Overlock 3 hilos (#504)",
  "Cadeneta 1 aguja (#401)",
  "Recubridora 3 agujas (#602)",
  "Recubridora 2 agujas (#406)",
  "Plana 1 aguja",
  "Prensa de calor",
  "Manual",
];
const CRITICALITY = ["Crítica", "Crítica seguridad", "Mayor", "Menor"];
const PACK_METHODS_DEFAULT = [
  "Solid packing",
  "Hanger packing",
  "Sizer",
  "Solid-hanger",
  "Solid-sizer",
  "Solid-hanger-sizer",
  "Hanger-sizer",
  "Pre-pack",
  "Pre-pack-hanger",
  "Pre-pack-sizer",
  "Pre-pack-hanger-sizer",
];

const uid = () => Math.random().toString(36).slice(2);
const num = (n, d = 2) =>
  (Number.isFinite(+n) ? +n : 0).toLocaleString("es-MX", { maximumFractionDigits: d });

// ---- empty order (production starts blank; the tech pack fills it) --------
const EMPTY = {
  header: {
    customer: "", styleNo: "", orderNo: "", version: "", styleName: "",
    season: "", quantity: "", orderDate: "", deliveryDate: "", patternMaker: "", factory: "",
  },
};
const emptyFabric = () => ({ key: uid(), code: "", position: "Cuerpo", composition: "", width: "", weight: "", fabricNo: "", note: "" });

// ---- optional demo seed (not used by default) ----------------------------
const SEED = {
  header: {
    customer: "NIKE",
    orderNo: "NKB-26-07-0461",
    styleNo: "FN2798",
    version: "K6669",
    styleName: "W NK ONE CLASSIC DF SS TOP (WOMEN'S TRAINING)",
    season: "SP'27",
    quantity: "9116",
    orderDate: "2026-07-15",
    deliveryDate: "2026-12-06",
    patternMaker: "SAC-Pei Li Jun",
    factory: "SKM · Skyrina",
  },
  fabrics: [
    { key: uid(), code: "1056980", position: "Cuerpo", composition: "89% Poliéster (reciclado) 11% Elastano", width: '58"', weight: "135", fabricNo: "DA26070442", note: "Base colores lisos" },
    { key: uid(), code: "1025727", position: "Cuerpo", composition: "89% Poliéster 11% Elastano", width: '57.87"', weight: "140", fabricNo: "DA26070442", note: "Grupo jaspe (heather)" },
    { key: uid(), code: "1056980", position: "Vista de cuello", composition: "89% Poliéster (reciclado) 11% Elastano", width: '58"', weight: "135", fabricNo: "DA26070442", note: "Vista posterior 1 cm" },
  ],
  trimMaterials: [
    { key: uid(), code: "330279-SAM", desc: "Transfer de calor #2 swoosh (anti-sublimación)", supplier: "Dengwei (Yida)", spec: "Beyond Elastic — cara / FACE", consumption: "1", unit: "pza" },
    { key: uid(), code: "001323-002500", desc: "Hilo SP 40/2 (aguja)", supplier: "Jitai / Coats", spec: "2500 m/cono", consumption: "88.52", unit: "m" },
    { key: uid(), code: "002307-005000", desc: "Hilo texturizado T70 (looper)", supplier: "Jitai / Coats", spec: "5000 m", consumption: "106.10", unit: "m" },
    { key: uid(), code: "3-1028017-9687", desc: "Etiqueta principal (pad print) MTZ DRI-FIT", supplier: "Skyrina", spec: "Talla + planta variable", consumption: "1", unit: "pza" },
    { key: uid(), code: "093436-477467", desc: "Etiqueta de cuidado + composición", supplier: "Avery México", spec: "US/CA #445591", consumption: "1", unit: "pza" },
    { key: uid(), code: "368545", desc: "Etiqueta ID", supplier: "Avery México / SAA", spec: "Bajo etiqueta de lavado", consumption: "1", unit: "pza" },
  ],
  // POM spec (values are sample-size / graded highlights from the size set)
  spec: [
    { key: uid(), code: "NK_FH", name: "Alto de cuello terminado (CB)", how: "Orilla a costura/puntada, vertical", crit: "Crítica", tMinus: "0.3", tPlus: "0.3", vals: { "2XS": "1.3", XS: "1.3", S: "1.3", M: "1.3", L: "1.3", XL: "1.3", XXL: "1.3" } },
    { key: uid(), code: "NK_DBH", name: "Caída de cuello trasero (desde HPS)", how: "HPS a cuello trasero, vertical", crit: "Crítica", tMinus: "0.5", tPlus: "0.5", vals: { "2XS": "2.0", XS: "2.0", S: "2.2", M: "2.4", L: "2.6", XL: "2.8", XXL: "3.1" } },
    { key: uid(), code: "NK_WBH", name: "Ancho de cuello trasero (desde HPS)", how: "HPS a HPS, horizontal", crit: "Crítica", tMinus: "1.0", tPlus: "1.0", vals: { "2XS": "18.2", XS: "18.2", S: "18.5", M: "18.8", L: "19.1", XL: "19.4", XXL: "20.1" } },
    { key: uid(), code: "SH_WD_S", name: "Ancho de hombro (set-in / s.manga)", how: "Punto de hombro a punto, horizontal", crit: "Crítica", tMinus: "1.5", tPlus: "1.5", vals: { "2XS": "35.7", XS: "37.1", S: "38.5", M: "39.9", L: "41.3", XL: "43.3", XXL: "45.3" } },
    { key: uid(), code: "CH_WS", name: "Ancho de pecho", how: "2.5 cm bajo axila, horizontal", crit: "Crítica", tMinus: "1.5", tPlus: "1.5", vals: { "2XS": "40.0", XS: "43.5", S: "47.0", M: "50.5", L: "54.0", XL: "59.0", XXL: "64.0" } },
    { key: uid(), code: "WS_WD", name: "Ancho de cintura", how: "En posición de cintura, horizontal", crit: "Crítica", tMinus: "1.5", tPlus: "1.5", vals: { "2XS": "40.4", XS: "43.9", S: "47.4", M: "50.9", L: "54.4", XL: "59.4", XXL: "64.4" } },
    { key: uid(), code: "BH_OR", name: "Abertura inferior (relajada / plana)", how: "Orilla interna a orilla", crit: "Crítica", tMinus: "1.5", tPlus: "1.5", vals: { "2XS": "40.7", XS: "44.2", S: "47.7", M: "51.2", L: "54.7", XL: "59.7", XXL: "64.7" } },
    { key: uid(), code: "BL_BN_2", name: "Largo de cuerpo (desde cuello trasero)", how: "Costura CB a orilla inferior, vertical", crit: "Crítica", tMinus: "1.5", tPlus: "1.5", vals: { "2XS": "56.3", XS: "57.3", S: "58.3", M: "59.3", L: "61.3", XL: "63.3", XXL: "65.3", "S-T": "61.8", "M-T": "62.8", "L-T": "64.8", "XL-T": "66.8", "2XL-T": "68.8" } },
    { key: uid(), code: "SL_LTS_2", name: "Largo de manga (desde punto hombro)", how: "Punto de hombro a orilla de manga", crit: "Crítica", tMinus: "1.5", tPlus: "1.5", vals: { "2XS": "15.8", XS: "16.4", S: "17.0", M: "17.6", L: "18.2", XL: "18.8", XXL: "19.4" } },
    { key: uid(), code: "SL_OR_1", name: "Abertura de manga (relajada / plana)", how: "Orilla interna a orilla", crit: "Crítica", tMinus: "1.0", tPlus: "1.0", vals: { "2XS": "14.0", XS: "14.6", S: "15.2", M: "16.1", L: "17.1", XL: "18.5", XXL: "19.9" } },
    { key: uid(), code: "NK_OM", name: "Abertura de cuello (mínimo, sobre cabeza)", how: "Estirado hasta alcanzar objetivo", crit: "Crítica seguridad", tMinus: "0", tPlus: "99", vals: { "2XS": "29.0", XS: "29.0", S: "29.0", M: "30.0", L: "30.0", XL: "30.0", XXL: "30.0" } },
  ],
  workmanship: [
    { key: uid(), area: "Cuello", instr: "Cuello reversido a la tela, alto terminado 1.3 cm, overlock 4 hilos #514 (SPI 12) unido al cuerpo. Cadeneta #401 a 0.2 cm de la orilla (SPI 12–15). La costura frontal se extiende y traslapa con la vista 1.5 cm.", machine: "Overlock 4 hilos (#514)", spi: "12" },
    { key: uid(), area: "Vista posterior", instr: "Vista de 1 cm de tela base, según el video del cliente. Extremos a 0.5 cm de la costura de hombro, doblados; sin remate. La vista debe quedar plana, no levantada.", machine: "Cadeneta 1 aguja (#401)", spi: "" },
    { key: uid(), area: "Inserto de axila (con costado)", instr: "Overlock 3 hilos #504 + recubierto angosto 0.3 cm #602. Primero dos capas #504, luego tres capas recubierto 0.3 cm #602.", machine: "Recubridora 3 agujas (#602)", spi: "" },
    { key: uid(), area: "Sisa / hombro", instr: "Unión con overlock 4 hilos #514.", machine: "Overlock 4 hilos (#514)", spi: "" },
    { key: uid(), area: "Puño / dobladillo", instr: "Doblar 1.5 cm, recubierto 0.3 cm #406 (2 agujas). Aguja y looper con hilo SP.", machine: "Recubridora 2 agujas (#406)", spi: "" },
    { key: uid(), area: "Dobladillo con curva", instr: "Curva de 4 cm en la costura de costado. Cuidar no jalar ni torcer la tela; toda la tela queda dentro de la costura, sin orilla expuesta.", machine: "Recubridora 2 agujas (#406)", spi: "" },
    { key: uid(), area: "Colocación de logo", instr: "Etiqueta principal (pad print): 2 cm bajo cuello trasero, centrada. Transfer #2 swoosh: centro frontal, 3 cm bajo costura de cuello. Etiqueta de lavado: costado izq. del usuario, 10 cm arriba del dobladillo. ID bajo la de lavado.", machine: "Prensa de calor", spi: "" },
  ],
  sam: [
    { key: uid(), op: "Unir cuello + cadeneta", machine: "Overlock 4 hilos (#514)", minutes: "1.35" },
    { key: uid(), op: "Colocar vista posterior", machine: "Cadeneta 1 aguja (#401)", minutes: "0.90" },
    { key: uid(), op: "Inserto de axila + costado", machine: "Recubridora 3 agujas (#602)", minutes: "2.10" },
    { key: uid(), op: "Sisa / hombro", machine: "Overlock 4 hilos (#514)", minutes: "1.20" },
    { key: uid(), op: "Dobladillo cuerpo (curva)", machine: "Recubridora 2 agujas (#406)", minutes: "1.55" },
    { key: uid(), op: "Dobladillo de manga", machine: "Recubridora 2 agujas (#406)", minutes: "0.95" },
    { key: uid(), op: "Prensa transfer swoosh", machine: "Prensa de calor", minutes: "0.60" },
    { key: uid(), op: "Etiquetas + acabado", machine: "Manual", minutes: "1.10" },
  ],
  colorways: [
    { key: uid(), code: "013", name: "BLACK (00A)", body: "00A Negro", neckTape: "00A Negro", swoosh: "10A Blanco", thread: "00A Negro" },
    { key: uid(), code: "086", name: "SMOKE GREY heather (0AJ99J)", body: "0AJ99J Jaspe", neckTape: "0AJ99J Jaspe", swoosh: "10A Blanco", thread: "C9694 Gris humo" },
    { key: uid(), code: "101", name: "WHITE (10A)", body: "10A Blanco", neckTape: "10A Blanco", swoosh: "00A Negro", thread: "10A Blanco" },
    { key: uid(), code: "342", name: "GREEN GLOW (3KC)", body: "3KC Verde", neckTape: "3KC Verde", swoosh: "10A Blanco", thread: "3KC Verde" },
    { key: uid(), code: "413", name: "MIDNIGHT NAVY (44B)", body: "44B Marino", neckTape: "44B Marino", swoosh: "10A Blanco", thread: "44B Marino" },
    { key: uid(), code: "600", name: "CHALLENGE RED (6CG)", body: "6CG Rojo", neckTape: "6CG Rojo", swoosh: "10A Blanco", thread: "6CG Rojo" },
    { key: uid(), code: "678", name: "PLAYFUL PINK (6LG)", body: "6LG Rosa", neckTape: "6LG Rosa", swoosh: "10A Blanco", thread: "6LG Rosa" },
  ],
  garmentTrims: [
    { key: uid(), code: "330279-SAM", desc: "Transfer #2 swoosh", placement: "Centro frontal, 3 cm bajo cuello", qty: "1", unit: "pza" },
    { key: uid(), code: "3-1028017-9687", desc: "Etiqueta principal (pad print)", placement: "2 cm bajo cuello trasero", qty: "1", unit: "pza" },
    { key: uid(), code: "093436-477467", desc: "Etiqueta de cuidado", placement: "Costado izq., 10 cm sobre dobladillo", qty: "1", unit: "pza" },
    { key: uid(), code: "368545", desc: "Etiqueta ID", placement: "Bajo etiqueta de lavado (traslape)", qty: "1", unit: "pza" },
  ],
  packingTrims: [
    { key: uid(), code: "1031237", desc: "Etiqueta principal (hangtag) NIKE ONE", placement: "Hombro izq. del usuario", qty: "1", unit: "pza" },
    { key: uid(), code: "1057776", desc: "Hangtag suplementario QR", placement: "Con hangtag principal", qty: "1", unit: "pza" },
    { key: uid(), code: "022101", desc: "Gancho VICS #484K (HCLR17)", placement: "Empaque de gancho", qty: "1", unit: "pza" },
    { key: uid(), code: "029002", desc: "Sujetador de talla Crown CS1Q", placement: "En el gancho", qty: "1", unit: "pza" },
    { key: uid(), code: "135830-130004", desc: "Bolsa PE 10.5×7.5 sin adhesivo", placement: "Bolsa individual", qty: "1", unit: "pza" },
    { key: uid(), code: "681250", desc: "Etiqueta UPC RFID/QR (US, con precio)", placement: "Hangtag / caja", qty: "1", unit: "pza" },
  ],
  skus: [
    { key: uid(), po: "6213806225", colorway: "342", dest: "USA — general", pack: "brick", hangerDest: "", sizeClip: false, delivery: "2026-12-06", qty: "366" },
    { key: uid(), po: "6213806225", colorway: "086", dest: "USA — general", pack: "brick", hangerDest: "", sizeClip: false, delivery: "2027-01-17", qty: "1000" },
    { key: uid(), po: "6213803130", colorway: "413", dest: "USA — DICKS SPORTING", pack: "hanger", hangerDest: "DICKS DC (HCLR17 17\")", sizeClip: true, delivery: "2027-01-31", qty: "348" },
    { key: uid(), po: "6213803163", colorway: "342", dest: "USA — NORDSTROM", pack: "hanger", hangerDest: "NORDSTROM (HCLR17, sin sujetador)", sizeClip: false, delivery: "2027-01-31", qty: "830" },
    { key: uid(), po: "6213803161", colorway: "342", dest: "USA — BELK DC 0737", pack: "hanger_ratio", hangerDest: "BELK (HCLR17, S/M/L/XL = 1/2/3/2)", sizeClip: false, delivery: "2027-01-31", qty: "240" },
    { key: uid(), po: "6213803157", colorway: "678", dest: "USA — AMAZON", pack: "flat", hangerDest: "", sizeClip: false, delivery: "2026-12-06", qty: "286" },
  ],
};

// ==========================================================================
//  Import: parse an uploaded workbook and map it onto the wizard
//  Client-side (SheetJS). Tuned to the size-set and sample-request layouts,
//  with a generic fallback. Best-effort — the user reviews the result.
// ==========================================================================
const normSize = (s) =>
  String(s || "").toUpperCase().trim().replace(/\s+/g, "").replace(/\//g, "-");
const SIZE_LOOKUP = (() => {
  const m = {};
  SIZES.forEach((s) => (m[normSize(s)] = s));
  m["2XL"] = m["2XL"] || "XXL"; // files often say 2XL for XXL
  return m;
})();
const mapCrit = (v) => {
  const s = String(v || "").toLowerCase();
  if (s.includes("safety")) return "Crítica seguridad";
  if (s.includes("critical") || s.includes("crít")) return "Crítica";
  if (s.includes("minor") || s.includes("menor")) return "Menor";
  return "Mayor";
};

async function readWorkbook(file) {
  if (/\.csv$/i.test(file.name)) {
    const text = await file.text();
    return XLSX.read(text, { type: "string" });
  }
  const buf = await file.arrayBuffer();
  return XLSX.read(buf, { type: "array" });
}
// pick the sheet with the most rows; return array-of-arrays
function sheetRows(wb) {
  let best = [];
  wb.SheetNames.forEach((n) => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, blankrows: false, defval: "" });
    if (rows.length > best.length) best = rows;
  });
  return best;
}

// --- size spec ---
function parseSizeSpec(rows) {
  const norm = (v) => String(v ?? "").trim();
  const sizeColsAt = (cells) => {
    const map = {};
    cells.forEach((c, ci) => {
      const key = SIZE_LOOKUP[normSize(c)];
      if (key && !(key in map)) map[key] = ci;
    });
    return map;
  };
  let hIdx = -1;
  let sizeCols = null;
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].map(norm);
    const sizeMap = sizeColsAt(cells);
    const joined = cells.join(" ").toLowerCase();
    const looksHeader = /meas|point of measurement|c[oó]digo|punto de medida/.test(joined);
    if (Object.keys(sizeMap).length >= 2 && looksHeader) {
      hIdx = i;
      sizeCols = sizeMap;
      break;
    }
  }
  if (hIdx < 0) {
    for (let i = 0; i < rows.length; i++) {
      const map = sizeColsAt(rows[i].map(norm));
      if (Object.keys(map).length >= 3) {
        hIdx = i;
        sizeCols = map;
        break;
      }
    }
  }
  if (hIdx < 0) throw new Error("No reconocí la tabla de tallas. ¿Es el archivo de size spec?");

  const header = rows[hIdx].map((c) => norm(c).toLowerCase());
  const find = (re) => header.findIndex((c) => re.test(c));
  const codeCol = find(/meas.?\s*code|c[oó]digo|^code$/);
  const nameCol = find(/point of measurement|punto de medida|\bname\b|descrip/);
  const tMinusCol = find(/tolerance.*-|tol.*\(-|tol.*menos/);
  const tPlusCol = find(/tolerance.*\+|tol.*\(\+|tol.*m[aá]s/);
  const critCol = find(/criticality|criticidad/);

  const out = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const cells = rows[i].map(norm);
    const code = codeCol >= 0 ? cells[codeCol] : "";
    const name = nameCol >= 0 ? cells[nameCol] : "";
    const vals = {};
    Object.entries(sizeCols).forEach(([sz, ci]) => {
      const v = cells[ci];
      if (v !== "" && !isNaN(Number(v))) vals[sz] = String(v);
    });
    if (!code && Object.keys(vals).length === 0) continue; // skip section titles / blanks
    out.push({
      key: uid(),
      code,
      name,
      how: "",
      crit: critCol >= 0 ? mapCrit(cells[critCol]) : "Mayor",
      tMinus: tMinusCol >= 0 ? cells[tMinusCol] : "",
      tPlus: tPlusCol >= 0 ? cells[tPlusCol] : "",
      vals,
    });
  }
  if (!out.length) throw new Error("Encontré la tabla pero sin filas de medidas legibles.");
  return out;
}

// --- materials (fabric + trims) — sample-request layout, generic fallback ---
function parseMaterials(rows) {
  const norm = (v) => String(v ?? "").trim();
  const lc = (v) => norm(v).toLowerCase();
  const rowText = (r) => r.map(lc).join(" ");
  const colOf = (header, res) => {
    const h = header.map(lc);
    for (const re of res) {
      const i = h.findIndex((c) => re.test(c));
      if (i >= 0) return i;
    }
    return -1;
  };

  const shellIdx = rows.findIndex((r) => /shell fabric|布料|nombre de tela/.test(rowText(r)));
  const trimsIdx = rows.findIndex((r) => /^\s*trims\s*$|副料|av[ií]os/.test(rowText(r)));
  const fabrics = [];
  const trims = [];

  if (shellIdx >= 0) {
    // fabric header = first row after shell marker that has 'fabric' + width/position
    let fh = -1;
    for (let i = shellIdx + 1; i < rows.length; i++) {
      const t = rowText(rows[i]);
      if (/fabric/.test(t) && /(cut-?width|width|position|posici)/.test(t)) { fh = i; break; }
      if (/^\s*trims\s*$/.test(t)) break;
    }
    if (fh >= 0) {
      const H = rows[fh];
      const codeC = colOf(H, [/fabric/, /c[oó]digo|code/]);
      const widC = colOf(H, [/cut-?width|width|ancho/]);
      const posC = colOf(H, [/position|posici/]);
      const colC = colOf(H, [/color/]);
      const stop = trimsIdx > fh ? trimsIdx : rows.length;
      for (let i = fh + 1; i < stop; i++) {
        const c = rows[i].map(norm);
        const code = codeC >= 0 ? c[codeC] : "";
        if (!code || /trims/i.test(code)) continue;
        fabrics.push({
          key: uid(),
          code,
          position: posC >= 0 ? c[posC] || "Cuerpo" : "Cuerpo",
          composition: "",
          width: widC >= 0 ? c[widC] : "",
          weight: "",
          fabricNo: "",
          note: colC >= 0 && c[colC] ? `Color: ${c[colC]}` : "",
        });
      }
    }
  }

  if (trimsIdx >= 0) {
    let th = -1;
    for (let i = trimsIdx; i < rows.length; i++) {
      const t = rowText(rows[i]);
      if (/item|c[oó]digo|código/.test(t) && /description|descrip|position/.test(t)) { th = i; break; }
    }
    if (th >= 0) {
      const H = rows[th];
      const itemC = colOf(H, [/^item$|item|c[oó]digo|code/]);
      const descC = colOf(H, [/description|descrip/]);
      const posC = colOf(H, [/position|posici|placement/]);
      const qtyC = colOf(H, [/qty|cant|usage|consumo/]);
      const supC = colOf(H, [/supplier|proveedor|remark/]);
      for (let i = th + 1; i < rows.length; i++) {
        const c = rows[i].map(norm);
        const code = itemC >= 0 ? c[itemC] : "";
        const desc = descC >= 0 ? c[descC] : "";
        if (!code && !desc) continue;
        trims.push({
          key: uid(),
          code,
          desc: desc || code,
          spec: posC >= 0 ? c[posC] : "",
          consumption: qtyC >= 0 ? c[qtyC] : "",
          unit: "pza",
          supplier: supC >= 0 ? c[supC] : "",
        });
      }
    }
  }

  // generic fallback: a single header row with code + description-ish columns
  if (!fabrics.length && !trims.length) {
    const h = rows.findIndex(
      (r) => /c[oó]digo|code|item/.test(rowText(r)) && /descrip|description|material|proveedor|supplier/.test(rowText(r))
    );
    if (h < 0) throw new Error("No reconocí columnas de materiales. Revisa que sea el BOM o el Sample Request.");
    const H = rows[h];
    const codeC = colOf(H, [/c[oó]digo|code|item/]);
    const descC = colOf(H, [/descrip|description|material/]);
    const supC = colOf(H, [/proveedor|supplier/]);
    const qtyC = colOf(H, [/consumo|usage|qty|cant/]);
    for (let i = h + 1; i < rows.length; i++) {
      const c = rows[i].map(norm);
      const code = codeC >= 0 ? c[codeC] : "";
      const desc = descC >= 0 ? c[descC] : "";
      if (!code && !desc) continue;
      trims.push({ key: uid(), code, desc: desc || code, spec: "", consumption: qtyC >= 0 ? c[qtyC] : "", unit: "pza", supplier: supC >= 0 ? c[supC] : "" });
    }
  }

  if (!fabrics.length && !trims.length) throw new Error("El archivo no traía materiales legibles.");
  return { fabrics, trims };
}

// ---- steps ----------------------------------------------------------------
const STEPS = [
  { id: "materiales", n: 1, label: "Materiales", sub: "Tela, avíos y colorway", icon: Package },
  { id: "tallas", n: 2, label: "Tallas", sub: "Especificación / medidas", icon: Ruler },
  { id: "confeccion", n: 3, label: "Confección", sub: "Operaciones (workmanship)", icon: Scissors },
  { id: "empaque", n: 4, label: "Paquete y empaque", sub: "Destinos, componentes y método", icon: Boxes },
  { id: "calidad", n: 5, label: "Fotos de calidad", sub: "Evidencia fotográfica + comentarios", icon: Camera },
  { id: "crear", n: 6, label: "Crear estilo", sub: "Revisar y guardar", icon: Save },
];

// ==========================================================================
//  Reusable primitives (match the app: slate cards, rounded-xl, SectionCard)
// ==========================================================================
function SectionCard({ icon: Icon, title, subtitle, right, children }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
        <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-800 truncate">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500 truncate">{subtitle}</p>}
        </div>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-600 mb-1">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400";
const cellCls =
  "w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-slate-400";

// Generic editable table (rows of objects). columns: {key,label,type,width,options,align}
function EditableTable({ columns, rows, onChange, onAdd, addLabel = "Agregar", minRows = 0 }) {
  const patch = (key, field, value) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  const remove = (key) =>
    onChange(rows.length > minRows ? rows.filter((r) => r.key !== key) : rows);
  const duplicate = (key) => {
    const i = rows.findIndex((r) => r.key === key);
    if (i < 0) return;
    onChange([...rows.slice(0, i + 1), { ...rows[i], key: uid() }, ...rows.slice(i + 1)]);
  };

  return (
    <>
      <div className="overflow-x-auto max-w-full">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr className="text-left text-[11px] font-medium text-slate-400">
              {columns.map((c) => (
                <th key={c.key} className="px-1 pb-2 whitespace-nowrap" style={{ width: c.width }}>
                  {c.label}
                </th>
              ))}
              <th className="px-1 pb-2 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="align-top">
                {columns.map((c) => (
                  <td key={c.key} className="px-1 py-1">
                    {c.type === "select" ? (
                      <select
                        value={r[c.key] ?? ""}
                        onChange={(e) => patch(r.key, c.key, e.target.value)}
                        className={cellCls}
                      >
                        {(c.options || []).map((o) => (
                          <option key={o.value ?? o} value={o.value ?? o}>
                            {o.label ?? o}
                          </option>
                        ))}
                      </select>
                    ) : c.type === "textarea" ? (
                      <textarea
                        rows={c.rows || 3}
                        value={r[c.key] ?? ""}
                        onChange={(e) => patch(r.key, c.key, e.target.value)}
                        className={`${cellCls} resize-y leading-snug`}
                      />
                    ) : c.type === "check" ? (
                      <button
                        type="button"
                        onClick={() => patch(r.key, c.key, !r[c.key])}
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-md border ${
                          r[c.key]
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 bg-white text-slate-300"
                        }`}
                      >
                        <Check size={14} />
                      </button>
                    ) : (
                      <input
                        type={c.type === "number" ? "number" : "text"}
                        step={c.type === "number" ? "any" : undefined}
                        value={r[c.key] ?? ""}
                        onChange={(e) => patch(r.key, c.key, e.target.value)}
                        className={`${cellCls} ${c.align === "right" ? "text-right" : ""} ${
                          c.mono ? "font-mono" : ""
                        }`}
                      />
                    )}
                  </td>
                ))}
                <td className="px-1 py-1">
                  <div className="flex items-center gap-1 pt-0.5">
                    <button
                      onClick={() => duplicate(r.key)}
                      title="Duplicar"
                      className="p-1 text-slate-300 hover:text-slate-600"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      onClick={() => remove(r.key)}
                      title="Quitar"
                      className="p-1 text-slate-300 hover:text-rose-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        onClick={onAdd}
        className="mt-3 inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
      >
        <Plus size={15} /> {addLabel}
      </button>
    </>
  );
}

// File drop target for imports.
function DropInput({ label, hint, onFile, status, accept = ".xlsx,.xls,.csv", icon: Ico = FileSpreadsheet, busy = false }) {
  const border =
    status?.ok === true
      ? "border-emerald-300 bg-emerald-50"
      : status?.ok === false
      ? "border-rose-300 bg-rose-50"
      : "border-slate-300 bg-slate-50 hover:border-slate-400";
  return (
    <label className="block cursor-pointer">
      <div className={`flex items-center gap-3 rounded-lg border-2 border-dashed px-4 py-3 transition-all ${border}`}>
        <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
          {busy ? (
            <RefreshCw size={18} className="text-slate-400 animate-spin" />
          ) : status?.ok === true ? (
            <Check size={18} className="text-emerald-600" />
          ) : status?.ok === false ? (
            <X size={18} className="text-rose-500" />
          ) : (
            <Ico size={18} className="text-slate-400" />
          )}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-700">{label}</div>
          <div className={`text-[11px] truncate ${status?.ok === false ? "text-rose-600" : "text-slate-400"}`}>
            {status?.msg || hint || "Haz clic para elegir un archivo"}
          </div>
        </div>
        <Upload size={16} className="ml-auto text-slate-300 shrink-0" />
      </div>
      <input type="file" accept={accept} className="hidden" onChange={onFile} />
    </label>
  );
}

// ==========================================================================
//  Main
// ==========================================================================
// Parse a "013:00A BLACK  101:10A WHITE" note/spec string into { cw: color }.
function parseCwColors(str) {
  const out = {};
  String(str || "")
    .split(/\s{2,}/)
    .forEach((p) => {
      const i = p.indexOf(":");
      if (i > 0) {
        const cw = p.slice(0, i).trim();
        const val = p.slice(i + 1).replace(/\s*Colorway \d+\/\d+/g, "").replace(/\bNOCOLR\b/g, "").trim();
        if (/^\d{3}$/.test(cw) && val) out[cw] = val;
      }
    });
  return out;
}
const cwSwatch = (name) => {
  const n = (name || "").toUpperCase();
  const map = { BLACK: "#111827", WHITE: "#f9fafb", MNNAVY: "#1e3a5f", NAVY: "#1e3a5f", "G MIST": "#9fb8ad", GRNGLW: "#b6e800", GREEN: "#22c55e", SNDRFT: "#d8cdb8", RDBARK: "#7c3a2d", BQBN: "#3b4a5a", FBRGLS: "#c9b98f", "LT OLV": "#8a8a5c", HYPRYL: "#5b6ee1", BLLEGN: "#2b3a67", ORCHID: "#b25fa6", CHLGRD: "#c0392b", CHLG: "#c0392b", PLYPNK: "#f4a6c0", SMKGRY: "#8b8b8b", RED: "#c0392b", PINK: "#f4a6c0" };
  for (const k in map) if (n.includes(k)) return map[k];
  return "#cbd5e1";
};

// Materials × colorway grid — one row per material, one column per colorway.
// Group imported per-variant trims into grid rows: one row per code+color, with
// quantities spread across the size columns (size taken from the variant).
function toTrimGrid(trims) {
  const sizeSet = new Set(SIZES);
  const groups = {};
  const order = [];
  const ensure = (base, color, t) => {
    const key = base + "|" + color;
    if (!groups[key]) {
      groups[key] = { key: uid(), code: base, desc: t.desc || "", color, po: "", supplier: t.supplier || "", unit: t.unit || "pza", spec: t.spec || "", qtyBySize: {} };
      order.push(key);
    }
    return groups[key];
  };
  for (const t of trims || []) {
    const m = String(t.code || "").match(/^(.*?)\s*\((.*)\)\s*$/);
    const base = (m ? m[1] : t.code || "").trim();
    const variant = (t.variant && String(t.variant).trim()) || (m ? m[2].trim() : "");
    // size + colour carried in the variant (SKM main label: "GCW# 3/ L")
    let size = "";
    const parts = variant.split(/[\/,]/).map((s) => s.trim()).filter(Boolean);
    for (const p of parts) { const up = p.toUpperCase().replace(/\s+/g, ""); if (sizeSet.has(up)) size = up; }
    const variantColor = t.color || (size ? parts.filter((p) => p.toUpperCase().replace(/\s+/g, "") !== size).join(" ") : variant);
    // distinct colours from the colorway columns (Nike BOM stores "cw:color…" in spec)
    const distinct = [...new Set(Object.values(parseCwColors(t.spec)).map((v) => v.trim()).filter(Boolean))];

    if (variantColor && (size || !distinct.length)) {
      const g = ensure(base, variantColor, t);          // SKM: one row per colour, size cell filled
      if (size) g.qtyBySize[size] = t.qty || t.consumption || "1";
    } else if (distinct.length) {
      distinct.forEach((c) => ensure(base, c, t));       // Nike: one row per distinct colour, sizes blank
    } else {
      ensure(base, variantColor || "", t);
    }
  }
  return order.map((k) => groups[k]);
}

// Size-quantity grid: one row per code+color+PO, a quantity cell per size.
function SizeQtyGrid({ rows, onChange, sizes, onAdd }) {
  const patch = (key, field, val) => onChange(rows.map((r) => (r.key === key ? { ...r, [field]: val } : r)));
  const patchSize = (key, sz, val) => onChange(rows.map((r) => (r.key === key ? { ...r, qtyBySize: { ...r.qtyBySize, [sz]: val } } : r)));
  const remove = (key) => onChange(rows.filter((r) => r.key !== key));
  const dup = (key) => {
    const i = rows.findIndex((r) => r.key === key);
    if (i < 0) return;
    onChange([...rows.slice(0, i + 1), { ...rows[i], key: uid(), qtyBySize: { ...rows[i].qtyBySize } }, ...rows.slice(i + 1)]);
  };
  const rowTotal = (r) => sizes.reduce((s, sz) => s + (Number(r.qtyBySize?.[sz]) || 0), 0);
  return (
    <>
      <div className="overflow-x-auto max-w-full">
        <table className="text-xs border-separate border-spacing-0">
          <thead>
            <tr className="text-left text-[11px] font-medium text-slate-400">
              <th className="sticky left-0 z-10 bg-white px-2 pb-2 min-w-[120px]">Código</th>
              <th className="px-2 pb-2 min-w-[150px]">Descripción</th>
              <th className="px-2 pb-2 min-w-[90px]">Color</th>
              <th className="px-2 pb-2 min-w-[110px]">PO</th>
              <th className="px-2 pb-2 min-w-[110px]">Proveedor</th>
              {sizes.map((s) => (<th key={s} className="px-1 pb-2 w-16 text-center text-slate-500">{s}</th>))}
              <th className="px-2 pb-2 w-20 text-right">Total</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="align-top">
                <td className="sticky left-0 z-10 bg-white px-1 py-1"><input value={r.code || ""} onChange={(e) => patch(r.key, "code", e.target.value)} className={`${cellCls} font-mono min-w-[110px]`} /></td>
                <td className="px-1 py-1"><input value={r.desc || ""} onChange={(e) => patch(r.key, "desc", e.target.value)} className={`${cellCls} min-w-[140px]`} /></td>
                <td className="px-1 py-1"><input value={r.color || ""} onChange={(e) => patch(r.key, "color", e.target.value)} className={`${cellCls} w-24`} /></td>
                <td className="px-1 py-1"><input value={r.po || ""} onChange={(e) => patch(r.key, "po", e.target.value)} className={`${cellCls} font-mono w-28`} /></td>
                <td className="px-1 py-1"><input value={r.supplier || ""} onChange={(e) => patch(r.key, "supplier", e.target.value)} className={`${cellCls} w-28`} /></td>
                {sizes.map((sz) => (
                  <td key={sz} className="px-1 py-1"><input type="number" value={r.qtyBySize?.[sz] ?? ""} onChange={(e) => patchSize(r.key, sz, e.target.value)} className={`w-16 rounded-md border border-slate-200 bg-white px-2 py-2 text-sm text-right tabular-nums outline-none focus:border-slate-500 ${r.qtyBySize?.[sz] ? "text-slate-800 font-medium" : "text-slate-300"}`} /></td>
                ))}
                <td className="px-2 py-1 text-right text-sm font-semibold text-slate-700 tabular-nums w-20">{rowTotal(r) || ""}</td>
                <td className="px-1 py-1">
                  <div className="flex gap-1 pt-0.5">
                    <button onClick={() => dup(r.key)} title="Duplicar" className="p-1 text-slate-300 hover:text-slate-600"><Copy size={13} /></button>
                    <button onClick={() => remove(r.key)} title="Quitar" className="p-1 text-slate-300 hover:text-rose-600"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={onAdd} className="mt-3 inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"><Plus size={15} /> Agregar avío</button>
    </>
  );
}

// SKU / PO grid with a per-size quantity matrix (S/M/L/XL…) for each destination.
function SkuPackGrid({ rows, onChange, sizes, colorwayOptions, packMethods, onAdd }) {
  const patch = (key, field, val) => onChange(rows.map((r) => (r.key === key ? { ...r, [field]: val } : r)));
  const patchSize = (key, sz, val) => onChange(rows.map((r) => (r.key === key ? { ...r, qtyBySize: { ...r.qtyBySize, [sz]: val } } : r)));
  const remove = (key) => onChange(rows.filter((r) => r.key !== key));
  const dup = (key) => {
    const i = rows.findIndex((r) => r.key === key);
    if (i < 0) return;
    onChange([...rows.slice(0, i + 1), { ...rows[i], key: uid(), qtyBySize: { ...rows[i].qtyBySize } }, ...rows.slice(i + 1)]);
  };
  const rowTotal = (r) => sizes.reduce((s, sz) => s + (Number(r.qtyBySize?.[sz]) || 0), 0) || Number(r.qty) || 0;
  return (
    <>
      <div className="overflow-x-auto max-w-full">
        <table className="text-xs border-separate border-spacing-0">
          <thead>
            <tr className="text-left text-[11px] font-medium text-slate-400">
              <th className="sticky left-0 z-10 bg-white px-2 pb-2 min-w-[110px]">PO</th>
              <th className="px-2 pb-2 min-w-[150px]">Colorway</th>
              <th className="px-2 pb-2 min-w-[150px]">Destino</th>
              <th className="px-2 pb-2 min-w-[180px]">Método de empaque</th>
              {sizes.map((s) => (<th key={s} className="px-1 pb-2 w-16 text-center text-slate-500">{s}</th>))}
              <th className="px-2 pb-2 w-20 text-right">Total</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="align-top">
                <td className="sticky left-0 z-10 bg-white px-1 py-1"><input value={r.po || ""} onChange={(e) => patch(r.key, "po", e.target.value)} className={`${cellCls} font-mono min-w-[100px]`} /></td>
                <td className="px-1 py-1">
                  <select value={r.colorway || ""} onChange={(e) => patch(r.key, "colorway", e.target.value)} className={`${cellCls} min-w-[140px]`}>
                    <option value="">—</option>
                    {colorwayOptions.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                  </select>
                </td>
                <td className="px-1 py-1"><input value={r.dest || ""} onChange={(e) => patch(r.key, "dest", e.target.value)} className={`${cellCls} min-w-[140px]`} /></td>
                <td className="px-1 py-1">
                  <select value={r.method || ""} onChange={(e) => patch(r.key, "method", e.target.value)} className={`${cellCls} min-w-[170px]`}>
                    <option value="">—</option>
                    {packMethods.map((m) => (<option key={m} value={m}>{m}</option>))}
                  </select>
                </td>
                {sizes.map((sz) => (
                  <td key={sz} className="px-1 py-1"><input type="number" value={r.qtyBySize?.[sz] ?? ""} onChange={(e) => patchSize(r.key, sz, e.target.value)} className={`w-16 rounded-md border border-slate-200 bg-white px-2 py-2 text-sm text-right tabular-nums outline-none focus:border-slate-500 ${r.qtyBySize?.[sz] ? "text-slate-800 font-medium" : "text-slate-300"}`} /></td>
                ))}
                <td className="px-2 py-1 text-right text-sm font-semibold text-slate-700 tabular-nums w-20">{rowTotal(r) || ""}</td>
                <td className="px-1 py-1">
                  <div className="flex gap-1 pt-0.5">
                    <button onClick={() => dup(r.key)} title="Duplicar" className="p-1 text-slate-300 hover:text-slate-600"><Copy size={13} /></button>
                    <button onClick={() => remove(r.key)} title="Quitar" className="p-1 text-slate-300 hover:text-rose-600"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={onAdd} className="mt-3 inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"><Plus size={15} /> Agregar SKU / PO</button>
    </>
  );
}

function ColorwayMatrix({ rows, colorways, colorKey, label }) {
  if (!colorways.length) return null;
  return (
    <div className="overflow-x-auto max-w-full">
      <table className="text-xs border-separate border-spacing-0">
        <thead>
          <tr className="text-left text-[11px] text-slate-400">
            <th className="sticky left-0 z-10 bg-white px-2 pb-2 min-w-[170px]">{label}</th>
            {colorways.map((c) => (
              <th key={c.key || c.code} className="px-2 pb-2 text-center min-w-[64px]">
                <div className="font-semibold text-slate-500">{c.code}</div>
                <div className="text-[9px] text-slate-400 truncate">{(c.name || "").slice(0, 8)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const colors = parseCwColors(r[colorKey]);
            return (
              <tr key={r.key} className="hover:bg-slate-50">
                <td className="sticky left-0 z-10 bg-white px-2 py-1.5 border-t border-slate-100">
                  <div className="font-mono text-[11px] text-slate-800">#{r.code || "—"}</div>
                  <div className="text-[10px] text-slate-400 truncate max-w-[160px]">{r.position || (r.desc || "").slice(0, 22)}</div>
                </td>
                {colorways.map((c) => {
                  const v = colors[c.code];
                  return (
                    <td key={c.key || c.code} className="px-2 py-1.5 border-t border-slate-100 text-center">
                      {v ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-full border border-slate-300 shrink-0" style={{ background: cwSwatch(v) }} />
                          <span className="text-[10px] text-slate-600 whitespace-nowrap">{v}</span>
                        </span>
                      ) : (
                        <span className="text-slate-300">·</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---- QC photo board: multi-upload straight to S3 + a comment per photo -----
// Photos appear immediately (optimistic) with a local preview so you can start
// writing the comment right away; each one uploads to S3 in the background and
// shows its own status (subiendo / listo / error con reintento). We persist
// { s3Key, name, comment } once the upload succeeds; `url`/`status` are transient.
function QualityPhotoBoard({ photos, onChange, onToast }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);
  const fileMap = useRef({}); // photo.key -> File (kept so "Reintentar" can re-send)

  const patch = (key, fields) => onChange((prev) => prev.map((p) => (p.key === key ? { ...p, ...fields } : p)));

  const uploadOne = async (key, file) => {
    patch(key, { status: "uploading", error: null });
    // Derive a content-type the backend accepts even when file.type is empty.
    const extType = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif", gif: "image/gif" };
    const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase();
    const contentType = file.type || extType[ext] || "image/jpeg";
    try {
      console.log("[QC] pidiendo URL de subida →", `${API_URL}/api/style-orders/photo-upload-url`, { filename: file.name, contentType });
      // 1) presigned PUT URL for this image
      const up = await fetch(`${API_URL}/api/style-orders/photo-upload-url`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType }),
      });
      let upData;
      try { upData = await up.json(); } catch { throw new Error("El servidor no respondió con la URL de subida (¿backend desplegado?)"); }
      console.log("[QC] respuesta upload-url:", up.status, upData);
      if (!up.ok || !upData.success) throw new Error(upData.error || "No se pudo iniciar la subida");
      // 2) upload the bytes straight to S3
      console.log("[QC] subiendo a S3 (PUT)…", upData.key);
      const putRes = await fetch(upData.url, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
      console.log("[QC] respuesta PUT S3:", putRes.status, putRes.ok);
      if (!putRes.ok) throw new Error(`S3 rechazó la subida (HTTP ${putRes.status}). Revisa CORS del bucket.`);
      patch(key, { status: "done", s3Key: upData.key });
      delete fileMap.current[key];
    } catch (err) {
      console.error("[QC] error subiendo foto:", err);
      patch(key, { status: "error", error: err.message });
      onToast?.(err.message);
    }
  };

  const addFiles = (fileList) => {
    const all = Array.from(fileList || []);
    // Some browsers/OS report an empty file.type (e.g. HEIC on Windows), so
    // fall back to matching the extension instead of dropping the file.
    const isImage = (f) => (f.type || "").startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i.test(f.name || "");
    const files = all.filter(isImage);
    console.log("[QC] archivos elegidos:", all.length, "· imágenes válidas:", files.length, "· API_URL:", API_URL, "· tipos:", all.map((f) => f.type || "(vacío)"));
    if (!files.length) {
      if (all.length) onToast?.("El archivo no parece una imagen (usa JPG, PNG, WEBP o HEIC).");
      return;
    }
    const tiles = files.map((file) => {
      const key = uid();
      fileMap.current[key] = file;
      return { key, name: file.name, comment: "", at: new Date().toISOString(), url: URL.createObjectURL(file), status: "uploading" };
    });
    onChange((prev) => [...(prev || []), ...tiles]); // show them right away
    tiles.forEach((t) => uploadOne(t.key, fileMap.current[t.key]));
  };

  const onPick = (e) => {
    // Copy the files out BEFORE clearing value — e.target.files is a live list,
    // and resetting value empties it, which would drop the selection.
    const files = Array.from(e.target.files || []);
    e.target.value = ""; // allow picking the same file again later
    addFiles(files);
  };
  const retry = (key) => { const f = fileMap.current[key]; if (f) uploadOne(key, f); };
  const setComment = (key, comment) => patch(key, { comment });
  const remove = (key) => {
    const p = photos.find((x) => x.key === key);
    if (p?.url?.startsWith("blob:")) URL.revokeObjectURL(p.url);
    delete fileMap.current[key];
    onChange((prev) => prev.filter((x) => x.key !== key));
  };

  const uploading = photos.some((p) => p.status === "uploading");

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={onPick} />

      {/* dropzone — always available; each pick appends more photos */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
          drag ? "border-slate-400 bg-slate-50" : "border-slate-200 hover:border-slate-300"
        }`}
      >
        <ImagePlus size={22} className="text-slate-400" />
        <span className="text-sm font-medium text-slate-600">Toca para tomar o subir fotos</span>
        <span className="text-[11px] text-slate-400">JPG, PNG, WEBP o HEIC · se suben directo a S3 · puedes seleccionar varias</span>
      </div>

      {photos.length > 0 && (
        <>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {photos.map((p) => (
              <div key={p.key} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="relative aspect-video bg-slate-100">
                  {p.url ? (
                    <img src={p.url} alt={p.name || "Foto de calidad"} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-slate-300">
                      <ImageOff size={22} />
                      <span className="text-[10px] text-slate-400">Vista previa no disponible</span>
                    </div>
                  )}

                  {/* uploading overlay */}
                  {p.status === "uploading" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/45 text-white">
                      <RefreshCw size={20} className="animate-spin" />
                      <span className="text-[11px] font-medium">Subiendo…</span>
                    </div>
                  )}
                  {/* error overlay with retry */}
                  {p.status === "error" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-rose-900/70 px-3 text-center text-white">
                      <AlertCircle size={20} />
                      <span className="text-[10px] leading-tight">{p.error || "No se pudo subir"}</span>
                      <button onClick={() => retry(p.key)} className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-white">
                        <RefreshCw size={12} /> Reintentar
                      </button>
                    </div>
                  )}
                  {/* done badge */}
                  {p.status !== "uploading" && p.status !== "error" && (
                    <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-emerald-600/90 px-2 py-0.5 text-[10px] font-medium text-white">
                      <Check size={11} /> En S3
                    </span>
                  )}

                  <button
                    onClick={() => remove(p.key)}
                    title="Quitar foto"
                    className="absolute top-2 right-2 rounded-full bg-black/55 p-1.5 text-white hover:bg-rose-600"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="p-3">
                  <textarea
                    value={p.comment || ""}
                    onChange={(e) => setComment(p.key, e.target.value)}
                    rows={2}
                    placeholder="Comentario de calidad (defecto, punto a revisar, aprobación…)"
                    className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-xs outline-none focus:border-slate-400"
                  />
                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
                    <span className="truncate pr-2">{p.name || "—"}</span>
                    {p.at && <span className="shrink-0">{new Date(p.at).toLocaleDateString("es-MX")}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* add-more button under the grid */}
          <button
            onClick={() => inputRef.current?.click()}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:border-slate-400"
          >
            <ImagePlus size={16} /> Agregar más fotos
            {uploading && <RefreshCw size={13} className="animate-spin text-slate-400" />}
          </button>
        </>
      )}
    </div>
  );
}

export default function StyleOrderWizard({ orderId = null, presetCustomer = "", onDone }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [created, setCreated] = useState(false);
  const [toast, setToast] = useState(null);
  const [importStatus, setImportStatus] = useState({ size: null, materials: null });
  const [importReview, setImportReview] = useState(null);
  const topRef = useRef(null);

  // form state
  const [savedId, setSavedId] = useState(orderId || null);
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [loading, setLoading] = useState(false);

  const [header, setHeader] = useState(
    presetCustomer && !orderId ? { ...EMPTY.header, customer: presetCustomer } : EMPTY.header
  );
  const [fabrics, setFabrics] = useState([emptyFabric()]);
  const [trimMaterials, setTrimMaterials] = useState([]);
  const [spec, setSpec] = useState([]);
  const [workmanship, setWorkmanship] = useState([]);
  const [sam, setSam] = useState([]);
  const [colorways, setColorways] = useState([]);
  const [garmentTrims, setGarmentTrims] = useState([]);
  const [packingTrims, setPackingTrims] = useState([]);
  const [skus, setSkus] = useState([]);
  const [qualityPhotos, setQualityPhotos] = useState([]);
  const [packing, setPacking] = useState({ packType: "", folding: "", perBag: "", perCarton: "", ratio: "", notes: "" });
  const [packMethods, setPackMethods] = useState(PACK_METHODS_DEFAULT);
  const [newMethod, setNewMethod] = useState("");
  const addPackMethod = () => {
    const m = newMethod.trim();
    if (m && !packMethods.includes(m)) setPackMethods((xs) => [...xs, m]);
    setNewMethod("");
  };

  const step = STEPS[stepIdx];
  const setHeaderField = (k, v) => setHeader((h) => ({ ...h, [k]: v }));
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };
  const goto = (i) => {
    setStepIdx(i);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ---- load an existing order for editing ---------------------------------
  useEffect(() => {
    if (!orderId) return;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/style-orders/${orderId}`, { headers: authHeaders() });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || "No se pudo abrir la orden");
        applyParsed(data.order);
        setSavedId(orderId);
      } catch (err) {
        showToast(err.message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // ---- QC photos: swap stored S3 keys for short-lived signed view URLs ----
  // Called when loading an existing order (the bucket is private, so a bare
  // key can't be shown; we ask the API to sign each one for display).
  const hydratePhotos = async (photos) => {
    setQualityPhotos(photos);
    const keys = photos.filter((p) => p.s3Key && !p.url).map((p) => p.s3Key);
    if (!keys.length) return;
    try {
      const res = await fetch(`${API_URL}/api/style-orders/photo-view-urls`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ keys }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setQualityPhotos((cur) => cur.map((p) => (data.urls[p.s3Key] ? { ...p, url: data.urls[p.s3Key] } : p)));
      }
    } catch {
      /* thumbnails just won't render; the keys + comments are still intact */
    }
  };

  // ---- tech pack PDF: server extracts everything, we fill every step ------
  const applyParsed = (o) => {
    if (o.header) setHeader((h) => ({ ...h, ...o.header }));
    if (o.fabrics?.length) setFabrics(o.fabrics);
    if (o.trimMaterials?.length) setTrimMaterials(toTrimGrid(o.trimMaterials));
    if (o.spec?.length) setSpec(o.spec);
    if (o.workmanship?.length) setWorkmanship(o.workmanship);
    if (o.sam?.length) setSam(o.sam);
    if (o.colorways?.length) setColorways(o.colorways);
    if (o.garmentTrims?.length) setGarmentTrims(o.garmentTrims);
    if (o.packingTrims?.length) setPackingTrims(o.packingTrims);
    if (o.skus?.length) {
      const mapPack = (p) => ({ hanger: "Hanger packing", hanger_ratio: "Pre-pack-hanger", brick: "Solid packing", flat: "Solid packing" }[p] || "");
      setSkus(o.skus.map((s) => ({ ...s, method: s.method || mapPack(s.pack), qtyBySize: s.qtyBySize || {} })));
    }
    if (o.packing) setPacking((p) => ({ ...p, ...o.packing }));
    if (o.qualityPhotos?.length) hydratePhotos(o.qualityPhotos);
  };

  const onTechPackFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setParsing(true);
    setImportStatus((s) => ({ ...s, pdf: { ok: null, msg: "Subiendo el tech pack…" } }));
    try {
      // 1) ask the API for a presigned URL and upload the PDF straight to S3
      const up = await fetch(`${API_URL}/api/style-orders/upload-url`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name }),
      });
      const upData = await up.json();
      if (!up.ok || !upData.success) throw new Error(upData.error || "No se pudo iniciar la subida");
      const putRes = await fetch(upData.url, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: file });
      if (!putRes.ok) throw new Error("Falló la subida a S3");

      // 2) parse the PDF from its S3 key (nothing large travels through the API)
      setImportStatus((s) => ({ ...s, pdf: { ok: null, msg: "Leyendo el tech pack…" } }));
      const res = await fetch(`${API_URL}/api/style-orders/parse-techpack`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ key: upData.key }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo leer el PDF");
      applyParsed(data.order);
      const o = data.order;
      const filled = [
        o.fabrics?.length && `${o.fabrics.length} telas`,
        o.trimMaterials?.length && `${o.trimMaterials.length} avíos`,
        o.spec?.length && `${o.spec.length} medidas`,
        o.workmanship?.length && `${o.workmanship.length} operaciones`,
        o.colorways?.length && `${o.colorways.length} colorways`,
        o.skus?.length && `${o.skus.length} SKU`,
      ].filter(Boolean).join(" · ");
      const fmtLabel = data.format === "nike_bom" ? "BOM Nike" : "Hoja de proceso SKM";
      setImportStatus((s) => ({ ...s, pdf: { ok: true, msg: `${fmtLabel} · ${file.name} → ${filled}` } }));
      showToast(`Tech pack cargado (${fmtLabel}): ${filled}`);
      setImportReview({
        warnings: o.warnings || [],
        sections: [
          { id: "materiales", label: "Materiales", n: (o.fabrics?.length || 0) + (o.trimMaterials?.length || 0), detail: `${o.fabrics?.length || 0} telas · ${o.trimMaterials?.length || 0} avíos · ${o.colorways?.length || 0} colorways` },
          { id: "tallas", label: "Tallas", n: o.spec?.length || 0, detail: `${o.spec?.length || 0} medidas` },
          { id: "confeccion", label: "Confección", n: o.workmanship?.length || 0, detail: `${o.workmanship?.length || 0} operaciones` },
          { id: "empaque", label: "Paquete y empaque", n: (o.skus?.length || 0) + (o.packingTrims?.length || 0), detail: `${o.skus?.length || 0} SKU · ${o.packingTrims?.length || 0} componentes · método por capturar`, soft: true },
        ],
      });
    } catch (err) {
      setImportStatus((s) => ({ ...s, pdf: { ok: false, msg: err.message } }));
    } finally {
      setParsing(false);
    }
  };

  // ---- persist the order --------------------------------------------------
  const orderBody = () => ({
    masterCodeId: null, // set when opened from a product
    customerId: null,
    status: savedId ? undefined : "draft",
    header, fabrics, trimMaterials, spec, workmanship, sam, colorways, garmentTrims, packingTrims, skus, packing,
    // persist only photos that finished uploading (have an s3Key); the signed/
    // preview `url` and transient `status` are dropped and rebuilt on load
    qualityPhotos: qualityPhotos.filter((p) => p.s3Key).map(({ key, s3Key, name, comment, at }) => ({ key, s3Key, name, comment, at })),
  });

  const saveOrder = async () => {
    setSaving(true);
    try {
      const res = await fetch(savedId ? `${API_URL}/api/style-orders/${savedId}` : `${API_URL}/api/style-orders`, {
        method: savedId ? "PUT" : "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(orderBody()),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo guardar");
      setSavedId(data.id);
      showToast(savedId ? "Orden actualizada" : "Orden guardada");
      return data.id;
    } catch (err) {
      showToast(err.message);
      throw err;
    } finally {
      setSaving(false);
    }
  };

  // ---- imports: parse an uploaded workbook, fill the matching steps --------
  const onSizeFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const parsed = parseSizeSpec(sheetRows(await readWorkbook(file)));
      setSpec(parsed);
      setImportStatus((s) => ({ ...s, size: { ok: true, msg: `${file.name} → ${parsed.length} medidas · paso 2 lleno` } }));
      showToast(`Especificación importada: ${parsed.length} puntos de medida`);
    } catch (err) {
      setImportStatus((s) => ({ ...s, size: { ok: false, msg: err.message } }));
    }
  };
  const onMaterialsFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { fabrics: fb, trims: tr } = parseMaterials(sheetRows(await readWorkbook(file)));
      if (fb.length) setFabrics(fb);
      if (tr.length) setTrimMaterials(toTrimGrid(tr));
      const parts = [fb.length ? `${fb.length} telas` : null, tr.length ? `${tr.length} avíos` : null].filter(Boolean).join(" · ");
      setImportStatus((s) => ({ ...s, materials: { ok: true, msg: `${file.name} → ${parts} · paso 1 lleno` } }));
      showToast(`Materiales importados: ${parts}`);
    } catch (err) {
      setImportStatus((s) => ({ ...s, materials: { ok: false, msg: err.message } }));
    }
  };

  const totalSam = Number(header.samMinutes) || 0; // SAM is entered once in the Ficha de estilo
  const skuTotal = useMemo(
    () => skus.reduce((s, r) => s + (SIZES.reduce((a, sz) => a + (Number(r.qtyBySize?.[sz]) || 0), 0) || Number(r.qty) || 0), 0),
    [skus]
  );
  const colorwayOptions = colorways.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` }));

  // ---- create / save the style data ---------------------------------------
  const createStyle = async () => {
    try {
      const id = await saveOrder(); // POST (or PUT if already saved)
      setCreated(true);
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      onDone?.(id); // let the dashboard refresh its table
    } catch {
      /* saveOrder already toasts the error */
    }
  };

  // ------------------------------------------------------------------ render
  return (
    <div className="min-h-screen bg-slate-100">
      <div ref={topRef} />

      {/* Style header bar */}
      <div className="bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center">
              <Shirt size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight truncate">
                {header.styleName || "Nueva orden de estilo"}
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                {[header.customer, header.styleNo, header.orderNo, header.season]
                  .filter(Boolean)
                  .join("  ·  ")}
              </div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-4 text-[11px] text-slate-300">
            <span>Cant. <b className="text-white">{num(header.quantity, 0)}</b></span>
            <span>Entrega <b className="text-white">{header.deliveryDate || "—"}</b></span>
            <span>SAM <b className="text-white">{num(totalSam)} min</b></span>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-6">
        {/* Stepper rail */}
        <aside className="lg:sticky lg:top-6 h-fit min-w-0">
          <ol className="space-y-1.5">
            {STEPS.map((s, i) => {
              const active = i === stepIdx;
              const done = i < stepIdx || created;
              const Icon = s.icon;
              const needsAttention = importReview?.sections.some((x) => x.id === s.id && x.n === 0 && !x.soft);
              return (
                <li key={s.id}>
                  <button
                    onClick={() => goto(i)}
                    className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all ${
                      active
                        ? "bg-slate-900 text-white shadow-sm"
                        : "bg-white text-slate-600 border border-slate-200 hover:border-slate-400"
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold ${
                        active ? "bg-white/15" : done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {done && !active ? <Check size={14} /> : s.n}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium leading-tight truncate">{s.label}</span>
                      <span className={`block text-[11px] truncate ${active ? "text-slate-300" : "text-slate-400"}`}>
                        {s.sub}
                      </span>
                    </span>
                    {needsAttention && !active && (
                      <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Vacío tras la importación" />
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        {/* Step body */}
        <section className="space-y-6 pb-28 min-w-0">
          {/* Import / auto-fill */}
          <SectionCard
            icon={Upload}
            title="Importar y autocompletar"
            subtitle="Sube el tech pack y los pasos se llenan solos — luego revisa y ajusta"
          >
            <DropInput
              label="Tech pack (PDF)"
              hint="加工指導書 — llena todos los pasos automáticamente"
              accept="application/pdf,.pdf"
              icon={FileUp}
              busy={parsing}
              onFile={onTechPackFile}
              status={importStatus.pdf}
            />
            <div className="mt-4 grid sm:grid-cols-2 gap-4">
              <DropInput
                label="Especificación de tallas (.xlsx)"
                hint="Alterno: size-set → paso 2"
                onFile={onSizeFile}
                status={importStatus.size}
              />
              <DropInput
                label="BOM / avíos o Sample Request (.xlsx)"
                hint="Alterno: tela + avíos → paso 1"
                onFile={onMaterialsFile}
                status={importStatus.materials}
              />
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-[11px] text-slate-400">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              El tech pack se procesa en el servidor. La extracción está afinada al formato SKM/Nike (加工指導書); el SAM no
              viene en el documento y los colores por componente se infieren — revisa siempre lo importado antes de enviar.
            </p>

            {importReview && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold text-slate-600 mb-2">Resumen de importación — toca una sección para revisarla</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {importReview.sections.map((s) => {
                    const empty = s.n === 0 && !s.soft;
                    const idx = STEPS.findIndex((st) => st.id === s.id);
                    return (
                      <button
                        key={s.id}
                        onClick={() => idx >= 0 && goto(idx)}
                        className={`text-left rounded-lg border px-3 py-2 transition-all ${
                          empty ? "border-amber-300 bg-amber-50 hover:border-amber-400" : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {empty ? (
                            <AlertCircle size={13} className="text-amber-500 shrink-0" />
                          ) : (
                            <Check size={13} className="text-emerald-600 shrink-0" />
                          )}
                          <span className="text-xs font-medium text-slate-700 truncate">{s.label}</span>
                        </div>
                        <div className={`mt-0.5 text-[11px] ${empty ? "text-amber-600" : "text-slate-400"}`}>
                          {empty ? "Vacío — captura manual" : s.detail}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {importReview.warnings.length > 0 && (
                  <div className="mt-3 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 mb-1">
                      <AlertCircle size={12} /> Avisos de lectura ({importReview.warnings.length})
                    </div>
                    <ul className="space-y-0.5">
                      {importReview.warnings.map((w, i) => (
                        <li key={i} className="text-[11px] text-amber-700 leading-snug">• {w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          {/* Always-editable style header (compact, collapsible-feel) */}
          <SectionCard icon={FileText} title="Ficha de estilo" subtitle="Encabezado de la orden — se copia a cada documento">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Field label="Cliente"><input className={inputCls} value={header.customer} onChange={(e) => setHeaderField("customer", e.target.value)} /></Field>
              <Field label="No. de estilo"><input className={`${inputCls} font-mono`} value={header.styleNo} onChange={(e) => setHeaderField("styleNo", e.target.value)} /></Field>
              <Field label="Orden interna"><input className={`${inputCls} font-mono`} value={header.orderNo} onChange={(e) => setHeaderField("orderNo", e.target.value)} /></Field>
              <Field label="Versión"><input className={`${inputCls} font-mono`} value={header.version} onChange={(e) => setHeaderField("version", e.target.value)} /></Field>
              <Field label="Nombre del estilo"><input className={inputCls} value={header.styleName} onChange={(e) => setHeaderField("styleName", e.target.value)} /></Field>
              <Field label="Temporada"><input className={inputCls} value={header.season} onChange={(e) => setHeaderField("season", e.target.value)} /></Field>
              <Field label="Cantidad"><input type="number" className={`${inputCls} text-right`} value={header.quantity} onChange={(e) => setHeaderField("quantity", e.target.value)} /></Field>
              <Field label="Fecha de entrega"><input type="date" className={inputCls} value={header.deliveryDate} onChange={(e) => setHeaderField("deliveryDate", e.target.value)} /></Field>
              <Field label="SAM (min)" hint="Tiempo estándar de la prenda"><input type="number" step="any" className={`${inputCls} text-right`} value={header.samMinutes || ""} onChange={(e) => setHeaderField("samMinutes", e.target.value)} /></Field>
            </div>
          </SectionCard>

          {/* ---- STEP 1: Materials ---- */}
          {step.id === "materiales" && (
            <>
              <SectionCard icon={Layers} title="1 · Material de tela" subtitle="Composición, ancho útil y peso por posición">
                <EditableTable
                  minRows={1}
                  addLabel="Agregar tela"
                  onAdd={() => setFabrics((f) => [...f, { key: uid(), code: "", position: "Cuerpo", composition: "", width: "", weight: "", fabricNo: "", po: "" }])}
                  onChange={setFabrics}
                  rows={fabrics}
                  columns={[
                    { key: "code", label: "No. de tela", width: 110, mono: true },
                    { key: "position", label: "Posición", type: "select", width: 140, options: FABRIC_POSITIONS },
                    { key: "composition", label: "Composición", width: 220 },
                    { key: "width", label: "Ancho útil", width: 85 },
                    { key: "weight", label: "g/m²", type: "number", width: 65, align: "right" },
                    { key: "fabricNo", label: "Lote / DA", width: 100, mono: true },
                    { key: "po", label: "PO", width: 120, mono: true },
                  ]}
                />
              </SectionCard>

              <SectionCard icon={Tag} title="1 · Material de avíos" subtitle="Por código y color: cantidad por talla y PO de compra">
                <SizeQtyGrid
                  rows={trimMaterials}
                  onChange={setTrimMaterials}
                  sizes={SIZES}
                  onAdd={() => setTrimMaterials((t) => [...t, { key: uid(), code: "", desc: "", color: "", po: "", supplier: "", unit: "pza", spec: "", qtyBySize: {} }])}
                />
              </SectionCard>

              {colorways.length > 0 && (
                <>
                  <SectionCard icon={Palette} title="Colorways" subtitle="Combinaciones de color de este estilo" right={`${colorways.length}`}>
                    <div className="flex flex-wrap gap-2">
                      {colorways.map((c) => (
                        <div key={c.key || c.code} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
                          <span className="w-4 h-4 rounded-md border border-slate-300" style={{ background: cwSwatch(c.body || c.name) }} />
                          <span className="text-xs font-semibold text-slate-700">{c.code}</span>
                          <span className="text-[10px] text-slate-400">{c.name}</span>
                        </div>
                      ))}
                    </div>
                  </SectionCard>

                  <SectionCard icon={Layers} title="Tela × colorway" subtitle="Color de cada tela en cada colorway (leído del BOM)">
                    <ColorwayMatrix rows={fabrics} colorways={colorways} colorKey="note" label="Tela / posición" />
                  </SectionCard>

                  {trimMaterials.some((t) => Object.keys(parseCwColors(t.spec)).length) && (
                    <SectionCard icon={Tag} title="Avíos × colorway" subtitle="Color/variante de cada avío por colorway">
                      <ColorwayMatrix rows={trimMaterials.filter((t) => Object.keys(parseCwColors(t.spec)).length)} colorways={colorways} colorKey="spec" label="Avío" />
                    </SectionCard>
                  )}
                </>
              )}
            </>
          )}

          {/* ---- STEP 2: Size spec ---- */}
          {step.id === "tallas" && (
            <SectionCard
              icon={Ruler}
              title="2 · Especificación de tallas"
              subtitle="Puntos de medida (POM), tolerancias y valores por talla — cm"
              right={<span className="text-[11px] text-slate-400">{spec.length} POM · {SIZES.length} tallas</span>}
            >
              <div className="overflow-x-auto max-w-full">
                <table className="text-xs border-separate border-spacing-0">
                  <thead>
                    <tr className="text-left text-[11px] font-medium text-slate-400">
                      <th className="sticky left-0 z-10 bg-white px-2 pb-2 min-w-[90px]">Código</th>
                      <th className="px-2 pb-2 min-w-[200px]">Punto de medida</th>
                      <th className="px-2 pb-2 min-w-[90px]">Criticidad</th>
                      <th className="px-1 pb-2 w-16 text-right">Tol −</th>
                      <th className="px-1 pb-2 w-16 text-right">Tol +</th>
                      {SIZES.map((s) => (
                        <th key={s} className="px-1 pb-2 w-20 text-right">{s}</th>
                      ))}
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {spec.map((row) => (
                      <tr key={row.key} className="align-top">
                        <td className="sticky left-0 z-10 bg-white px-1 py-1">
                          <input
                            value={row.code}
                            onChange={(e) => setSpec((rs) => rs.map((r) => (r.key === row.key ? { ...r, code: e.target.value } : r)))}
                            className={`${cellCls} font-mono w-[86px]`}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            value={row.name}
                            onChange={(e) => setSpec((rs) => rs.map((r) => (r.key === row.key ? { ...r, name: e.target.value } : r)))}
                            className={`${cellCls} min-w-[200px]`}
                            title={row.how}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <select
                            value={row.crit}
                            onChange={(e) => setSpec((rs) => rs.map((r) => (r.key === row.key ? { ...r, crit: e.target.value } : r)))}
                            className={cellCls}
                          >
                            {CRITICALITY.map((c) => <option key={c}>{c}</option>)}
                          </select>
                        </td>
                        <td className="px-1 py-1">
                          <input value={row.tMinus} onChange={(e) => setSpec((rs) => rs.map((r) => (r.key === row.key ? { ...r, tMinus: e.target.value } : r)))} className={`${cellCls} w-16 text-right`} />
                        </td>
                        <td className="px-1 py-1">
                          <input value={row.tPlus} onChange={(e) => setSpec((rs) => rs.map((r) => (r.key === row.key ? { ...r, tPlus: e.target.value } : r)))} className={`${cellCls} w-16 text-right`} />
                        </td>
                        {SIZES.map((sz) => (
                          <td key={sz} className="px-1 py-1">
                            <input
                              value={row.vals?.[sz] ?? ""}
                              onChange={(e) =>
                                setSpec((rs) =>
                                  rs.map((r) => (r.key === row.key ? { ...r, vals: { ...r.vals, [sz]: e.target.value } } : r))
                                )
                              }
                              className={`${cellCls} w-20 text-right ${row.vals?.[sz] ? "" : "text-slate-300"}`}
                            />
                          </td>
                        ))}
                        <td className="px-1 py-1">
                          <button onClick={() => setSpec((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== row.key) : rs))} className="p-1 text-slate-300 hover:text-rose-600">
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                onClick={() => setSpec((rs) => [...rs, { key: uid(), code: "", name: "", how: "", crit: "Mayor", tMinus: "", tPlus: "", vals: {} }])}
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
              >
                <Plus size={15} /> Agregar punto de medida
              </button>
            </SectionCard>
          )}

          {/* ---- STEP 3: Workmanship ---- */}
          {step.id === "confeccion" && (
            <SectionCard icon={Scissors} title="3 · Confección (workmanship)" subtitle="Operaciones en orden de ensamble, con máquina y SPI">
              <EditableTable
                minRows={1}
                addLabel="Agregar operación"
                onAdd={() => setWorkmanship((w) => [...w, { key: uid(), area: "", instr: "", machine: "Plana 1 aguja", spi: "" }])}
                onChange={setWorkmanship}
                rows={workmanship}
                columns={[
                  { key: "area", label: "Área / paso", width: 150 },
                  { key: "instr", label: "Instrucción", type: "textarea", width: 460, rows: 3 },
                  { key: "machine", label: "Máquina", type: "select", width: 180, options: MACHINES },
                  { key: "spi", label: "SPI", width: 60, align: "right" },
                ]}
              />
            </SectionCard>
          )}

          {/* ---- STEP 4: Paquete y empaque — destino + método por PO, y componentes ---- */}
          {step.id === "empaque" && (
            <>
              <SectionCard
                icon={Truck}
                title="4 · Destino y método por SKU"
                subtitle="Por PO: colorway, destino, método y cantidad por talla"
                right={<span className="text-[11px] text-slate-400">{skus.length} SKU · {num(skuTotal, 0)} pza</span>}
              >
                <SkuPackGrid
                  rows={skus}
                  onChange={setSkus}
                  sizes={SIZES}
                  colorwayOptions={colorwayOptions}
                  packMethods={packMethods}
                  onAdd={() => setSkus((s) => [...s, { key: uid(), po: "", colorway: colorways[0]?.code || "", dest: "", method: "", qtyBySize: {} }])}
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-slate-500">{packMethods.length} métodos disponibles.</span>
                  <input
                    value={newMethod}
                    onChange={(e) => setNewMethod(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addPackMethod()}
                    placeholder="Agregar método de empaque…"
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs outline-none focus:border-slate-400"
                  />
                  <button onClick={addPackMethod} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-400">
                    <Plus size={13} /> Agregar método
                  </button>
                </div>
                <p className="mt-2 flex items-start gap-1.5 text-[11px] text-slate-400">
                  <AlertCircle size={13} className="mt-0.5 shrink-0" />
                  El método (solid, hanger, sizer, pre-pack y combinaciones) depende del PO/destino. Captura las piezas por talla (S/M/L/XL…) en la matriz.
                </p>
              </SectionCard>

              <SectionCard
                icon={Boxes}
                title="4 · Componentes de empaque"
                subtitle="Insumos de empaque del BOM (bolsa, UPC/RFID, tissue, hangtags) — con PO de compra"
                right={`${packingTrims.length} componentes`}
              >
                {packingTrims.length === 0 ? (
                  <p className="text-sm text-slate-400 py-6 text-center">Aún no hay componentes. Se llenan al importar el BOM, o agrégalos manualmente.</p>
                ) : (
                  <EditableTable
                    addLabel="Agregar componente"
                    onAdd={() => setPackingTrims((t) => [...t, { key: uid(), code: "", desc: "", placement: "", po: "", qty: "1", unit: "pza" }])}
                    onChange={setPackingTrims}
                    rows={packingTrims}
                    columns={[
                      { key: "code", label: "Código / IM#", width: 150, mono: true },
                      { key: "desc", label: "Descripción", width: 280 },
                      { key: "placement", label: "Tipo / uso", width: 140 },
                      { key: "po", label: "PO", width: 120, mono: true },
                      { key: "qty", label: "Cant.", type: "number", width: 70, align: "right" },
                      { key: "unit", label: "Unidad", type: "select", width: 85, options: TRIM_UNITS },
                    ]}
                  />
                )}
              </SectionCard>
            </>
          )}

          {/* ---- STEP 5: Fotos de calidad — evidencia + comentario, a S3 ---- */}
          {step.id === "calidad" && (
            <SectionCard
              icon={Camera}
              title="5 · Fotos de calidad"
              subtitle="Registra evidencia fotográfica con un comentario por foto (se guarda en S3)"
              right={<span className="text-[11px] text-slate-400">{qualityPhotos.length} {qualityPhotos.length === 1 ? "foto" : "fotos"}</span>}
            >
              <QualityPhotoBoard photos={qualityPhotos} onChange={setQualityPhotos} onToast={showToast} />
              <p className="mt-3 flex items-start gap-1.5 text-[11px] text-slate-400">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                Las imágenes se suben directo al bucket de S3; en la orden solo se guarda la referencia (key) y tu comentario.
                Las miniaturas usan enlaces firmados temporales, así que el bucket puede permanecer privado.
              </p>
            </SectionCard>
          )}


          {/* ---- STEP 8: review + create the style record ---- */}
          {step.id === "crear" && !created && (
            <SectionCard icon={ClipboardCheck} title="Revisar y crear" subtitle="Se guarda como dato de estilo; el envío a muestras se hace desde el listado">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <Row k="Cliente" v={header.customer} />
                <Row k="Estilo" v={`${header.styleNo || "—"} · ${header.styleName || ""}`} />
                <Row k="Orden interna" v={header.orderNo} />
                <Row k="Temporada / cant." v={`${header.season || "—"} · ${num(header.quantity, 0)}`} />
                <Row k="Telas" v={`${fabrics.filter((f) => f.code).length}`} />
                <Row k="Avíos" v={`${trimMaterials.length} · prenda ${garmentTrims.length} / empaque ${packingTrims.length}`} />
                <Row k="Medidas (POM)" v={`${spec.length}`} />
                <Row k="Operaciones" v={`${workmanship.length}`} />
                <Row k="Colorways" v={`${colorways.length}`} />
                <Row k="SKU" v={`${skus.length} · ${num(skuTotal, 0)} pza`} />
                <Row k="SAM" v={`${num(totalSam)} min`} />
                <Row k="Fotos de calidad" v={`${qualityPhotos.length} · ${qualityPhotos.filter((p) => p.comment?.trim()).length} con comentario`} />
              </div>
              <p className="mt-4 flex items-start gap-1.5 text-[11px] text-slate-400">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                Al crear, esta orden aparece en el listado de <b className="text-slate-500">Datos de estilo</b>, desde donde se envía a muestras.
              </p>
            </SectionCard>
          )}

          {step.id === "crear" && created && (
            <SectionCard icon={Check} title="Datos de estilo creados" subtitle={header.styleNo ? `Estilo ${header.styleNo}` : "Orden guardada"}>
              <div className="flex items-start gap-3 rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-800">
                <Check size={18} className="mt-0.5 shrink-0" />
                <div>
                  Se guardó la orden de estilo <b className="font-mono">{header.styleNo || `#${savedId}`}</b>. Ya aparece en el
                  listado de datos de estilo, donde puedes enviarla a muestras.
                </div>
              </div>
              <div className="mt-4">
                <button
                  onClick={() => onDone?.(savedId)}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  <ChevronLeft size={16} /> Volver al listado
                </button>
              </div>
            </SectionCard>
          )}
        </section>
      </main>

      {/* Sticky action bar */}
      {!created && (
        <div className="fixed bottom-0 inset-x-0 z-40 border-t border-slate-200 bg-white/90 backdrop-blur">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
            <button
              onClick={() => goto(Math.max(0, stepIdx - 1))}
              disabled={stepIdx === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 disabled:opacity-40 hover:border-slate-400"
            >
              <ChevronLeft size={16} /> Anterior
            </button>
            <div className="hidden sm:block text-xs text-slate-400">
              Paso {step.n} de {STEPS.length} · {step.label}
            </div>
            <div className="ml-auto flex items-center gap-3">
              {onDone && (
                <button
                  onClick={() => onDone(savedId)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-500 hover:border-slate-400"
                >
                  Cancelar
                </button>
              )}
              {step.id !== "crear" ? (
                <button
                  onClick={() => goto(Math.min(STEPS.length - 1, stepIdx + 1))}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Siguiente <ChevronRight size={16} />
                </button>
              ) : (
                <button
                  onClick={createStyle}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                  {savedId ? "Guardar cambios" : "Crear datos de estilo"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-sm text-white shadow-lg">
          <AlertCircle size={15} /> {toast}
        </div>
      )}
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex items-baseline gap-2 border-b border-slate-50 py-1.5">
      <span className="text-slate-500 w-40 shrink-0 text-xs">{k}</span>
      <span className="text-slate-800">{v || "—"}</span>
    </div>
  );
}