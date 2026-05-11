# Truck Rounding Tool

A web app for the Emma Sleep D2C Ops team that turns SO99+ purchase order quantities into full truck and container loads. Connects to Airtable for palletization rules and transport costs, processes Excel uploads client-side, and outputs two ready-to-send Excel files.

Built with Next.js 14 (App Router) · Tailwind CSS · SheetJS · Deployed on Vercel.

---

## Table of Contents

1. [How it works (6-step flow)](#1-how-it-works)
2. [Input file format](#2-input-file-format)
3. [Airtable master data](#3-airtable-master-data)
4. [Rounding algorithm](#4-rounding-algorithm)
5. [Output files](#5-output-files)
6. [Vendor Shipment Number format](#6-vendor-shipment-number-format)
7. [Special supplier rules](#7-special-supplier-rules)
8. [Deployment (Vercel)](#8-deployment-vercel)
9. [Local development](#9-local-development)
10. [Environment variables](#10-environment-variables)

---

## 1. How it works

The tool runs as a 6-step wizard. Each step must be completed in order.

### Step 1 — Setup

- Auto-connects to Airtable on load (cached for 6 hours in `localStorage`)
- Pulls the full palletization table and cost table
- Shows connection status, record counts, and last sync time
- Choose **Beds & Accessories** (milk run detection on) or **Mattress** (milk run detection off)
- Click **Ready to round →** to proceed

### Step 2 — Upload

- Drop your **SO99+ Proposals export** (.xlsx) into the File 1 zone
- Optionally drop a **Prio 4 / Index 1** file into File 2 for top-up quantities
- Choose **Constrained** (quantities capped at the constraint column) or **Unconstrained** (capped at the unconstrained quantity column)
- The tool auto-detects the shipping week and year from the `Shipping week` / `Shipping Year` columns — edit if wrong
- A validation panel shows: matched lines, unmatched SKU+lane combos, and any missing cost data
- Click **Run Rounding →** to execute the algorithm (runs entirely in the browser)

### Step 3 — Milk Run

*(Beds & Accessories mode only — auto-skipped for Mattress)*

- Shows proposed multi-stop routes: trucks from cut/borderline pools that can be combined into one physical truck making two stops in the same country
- Each candidate shows both stops, combined fill %, cost/piece, and PGRD week
- **Approve** — accept the milk run (generates a single VSN covering both stops)
- **Approve + Logistics Update** — approve with a justification code (LU1–LU4) and free-text note
- **Book 20ft Container** — downsize to a 20ft container instead (only shown if combined fill fits)
- **Cut** — reject the milk run (trucks return to cut lines)
- Auto-advances if no candidates are found

### Step 4 — Review

- Shows all trucks that need a decision: **Borderline** (cost €10–20/piece) and **Auto-cut** (cost >€20/piece or fill <50%)
- Live avg fill rate widget updates as you make decisions
- Per truck: Accept Cut, Force Keep, or Book 20ft Container
  - **Force Keep** requires a justification (LU1–LU4) and optional root cause
  - **Book 20ft Container** is only shown if current fill ÷ 0.45 ≤ 100% (cargo physically fits)
- Expand any truck to see SKU-level lines, quantities, pallets, and fill contribution
- Click **Confirm Decisions →** once all trucks are decided

### Step 5 — Transport

- Shows all confirmed 40ft container shipments (auto-confirmed + forced-kept)
- For each container, select **Road**, **Rail**, or **Sea** as the transport mode
- Rail and sea costs are shown alongside road cost so you can compare
- Rail requires a justification code (R1–R7)
- Running cost total updates live
- Click **Confirm & Generate Results →**

### Step 6 — Results

- Summary stats: trucks confirmed/cut, avg utilisation, pieces shipped/cut, total transport cost
- Confirmed shipments grouped by origin — expand any VSN to see SKU-level detail
- Cut lines section (collapsible) — full list of everything that was cut and why
- Download buttons:
  - **Confirmed Loads** — one row per SKU line per confirmed truck
  - **Cut Lines** — one row per cut SKU line
  - **All Lines (Combined)** — single file with both, plus Status column
- Run history saved in `localStorage` — re-download past runs without re-running

---

## 2. Input File Format

### File 1 — Prio 1–3 Needs (required)

Source: **SO99+ Proposals export** (.xlsx or .xls)

The tool searches the first 10 rows for a header row (anchored on `Item Code` or `SKU`). Columns are matched by name, not position. The following column names are accepted (case-insensitive):

| Field | Accepted column names |
|---|---|
| SKU / Item code | `Item Code`, `SKU`, `ITEM`, `Material` |
| Supplier name | `Description (Production Plant or External Supplier)`, `Supplier Name`, `Vendor Name`, `Vendor` |
| Destination | `Destination Location` |
| From warehouse | `From Whouse` |
| Priority 1 qty | `Prio 1` |
| Priority 2 qty | `Prio 2` |
| Priority 3 qty | `Prio 3` |
| Min order qty | `Minimum Supply Lot` |
| Constrained cap | `Constrained quantity`, `Constrained Qty`, `Constraint`, `Max Qty`, `Cap`, `P` |
| Unconstrained cap | `Unconstrained quantity`, `Unconstrained Qty`, `Unconstrained` |
| Shipping week | `Shipping week` |
| Shipping year | `Shipping Year` |
| PGRD week | `PGRD Week` |
| PGRD year | `PGRD Year` |
| **Origin location code** | `origin_location_code`, `origin location code`, `location code`, `Vendor Code` |

> **The `origin_location_code` column is required.** It must contain the pickup location code that matches Airtable's `origin_location_record` field (e.g. `MI_PT`, `PADV_LT`, `VELA_ES`). If the column is absent but `From Whouse` is present, the tool will attempt to resolve the origin via the Airtable location lookup table.

Rows are skipped if:
- SKU or Destination is empty
- Total quantity (Prio 1 + 2 + 3 after constraint cap) is 0
- Origin location code cannot be resolved

### File 2 — Prio 4 / Index 1 (optional)

Same format as File 1. Quantities are read from the `Unconstrained quantity` column if present; otherwise Prio 1 + 2 + 3 are summed. Used exclusively for topping up underutilised trucks in Steps 4A (≥80% trucks → top up to 95%) and 4B (50–80% trucks → try to reach 80%).

Special rule: **FENN MTO SKUs** (`FENN_EE` / `FEN1_EE`) cannot use Prio 4 top-up for `HA_DE` destination. Only FENN MTS SKUs (explicit allowlist in code) are eligible.

---

## 3. Airtable Master Data

All master data is fetched server-side via `/api/airtable` and never exposed to the browser directly.

### Palletization Table (`tblY2PxdLq84p8Erc`)

One record per SKU × lane combination. Only `FTL` and `CONTAINER 40FT` loading units are used.

Key fields used by the algorithm:

| Field | Description |
|---|---|
| `pkey` | Match key: `{origin_location_code}-{sku}-{destination}` |
| `loading_unit` | `FTL` or `CONTAINER 40FT` |
| `loading_type` | `Palletized` or `Loose Loaded` |
| `pcs_per_pallet` | Pieces per pallet (palletized items only) |
| `pallets_per_truck` | Pallets per full truck/container |
| `pcs_per_ftl_container` | Pieces per full FTL/container (loose loaded items) |
| `origin_location_code` | Pickup location code |
| `origin_location_name` | Supplier display name (used if file doesn't have one) |

### Cost Table (`tbl6Vr4XwyNhLVsMX`)

One record per lane. Only `Active` rows are used.

Key fields:

| Field | Description |
|---|---|
| `lane` | `{origin}|{destination}` — matches the lane key built from the upload file |
| `transport_cost_total_eur` | Full truck cost in euros |
| `sea_cost_eur` | Sea transport cost (containers only) |
| `rail_cost_eur` | Rail transport cost (containers only) |
| `active_status` | Must be `Active` to be included |

---

## 4. Rounding Algorithm

All logic lives in `lib/rounding.js` as pure functions (no side effects, no API calls).

### Step 0 — Grouping

Lines are grouped by **lane + PGRD week** key: `{origin}|{destination}|{pgrdYear}|{pgrdWeek}`.

Pass-through suppliers (`MI_PT`, `VELA_ES`) are separated before grouping — they skip the algorithm entirely and get auto-confirmed with exact quantities (see §7).

### Step 1 — Building trucks

For each lane+PGRD group, lines are sorted by priority (1 → 2 → 3) and loaded into trucks:

**Quantity rounding (palletized items):**
- Round DOWN to the nearest full pallet: `floor(qty / pcs_per_pallet) × pcs_per_pallet`
- Remainder = quantity that didn't fill a full pallet → goes to cut lines
- MOQ check: if rounded qty > 0 but < Minimum Supply Lot, round UP to the next full pallet count that meets the MOQ

**Loose loaded items:** use raw piece quantity, no pallet rounding.

**Truck filling:**
- Lines are added to the current truck until it would exceed 100% capacity
- If a line doesn't fit, start a new truck
- Capacity is tracked as a fraction: pallets / pallets_per_truck (palletized) or pieces / pcs_per_ftl_container (loose loaded)

### Step 2 — Vendor Shipment Numbers

VSN format: `{origin}_{typeCode}_P{minPrio}[_PW{pgrdWeek}][_{seq}]`

Examples:
- `PADV_LT_FTL_P1_PW25` — first truck, Priority 1, PGRD week 25
- `VELA_ES_S40FT_P3_PW25_2` — second 40ft container from VELA_ES, Priority 3

Each origin gets its own sequence counter — trucks from different suppliers can never share a VSN.

### Step 3 — Decision rules

After trucks are built, each truck is evaluated:

| Utilisation | Action |
|---|---|
| **≥ 80%** (confirmed) | Keep. Try to top up to 95% with Prio 4 lines from the same lane. |
| **50–80%** (borderline) | Try Prio 4 top-up to reach 80%. If still below 80%, calculate cost/piece (see table below). |
| **< 50%** | If all lines are Prio 3: cut the whole truck. Otherwise try Prio 4; if still below 50%, cut. |

**Cost/piece decision thresholds (50–80% trucks that can't reach 80% with Prio 4):**

| Cost per piece | Decision |
|---|---|
| < €10 | Auto-confirm |
| €10–€20 | Borderline → user reviews in Step 4 |
| > €20 | Auto-cut |

Cost per piece = `transport_cost_total_eur / total_pieces_on_truck`

### Step 4 — Milk run detection (Beds & Accessories only)

After decision rules, cut and borderline trucks are scanned for milk run opportunities.

**Eligibility:**
- Same origin supplier
- Same destination country (last segment of warehouse code, e.g. `HA_DE` → `DE`)
- Same PGRD week
- Combined fill ≤ 100%
- Second stop contributes ≥ 20% fill
- Maximum 2 stops

If >2 eligible destinations exist, the top 2 by volume are chosen. Milk run trucks are removed from the Review pool and shown in the Milk Run step instead.

**Two detection paths:**
1. **Pure remainder** — both trucks from cut/borderline pools
2. **Upgrade** — a confirmed truck with capacity absorbs a sub-threshold stop

### Step 5 — Pass-through trucks

`MI_PT` and `VELA_ES` suppliers bypass all rounding logic. Their quantities are loaded as-is into auto-confirmed trucks, each treated as 100% full. VSNs follow the same format with a `PT_` prefix internally.

---

## 5. Output Files

### `Confirmed_Loads_W{XX}.xlsx`

One row per SKU line per confirmed truck.

| Column | Description |
|---|---|
| Vendor Shipment Number | Unique truck ID |
| Milk Run ID | Milk run group ID (if applicable) |
| Milk Run Stop | Stop number within a milk run |
| Origin Location Code | Supplier/pickup code |
| Supplier Name | Supplier display name |
| Destination Location | Warehouse code |
| SKU | Item code |
| MTO/MTS | `MTO` or `MTS` for Fennobed SKUs; blank for others |
| Quantity (pieces) | Rounded and loaded quantity |
| Pallets | Pallet count (blank for loose loaded) |
| Priority | 1, 2, 3, or 4 |
| Loading Type | Palletized or Loose Loaded |
| Transport Unit Type | `FTL`, `40ft Container`, or `20ft Container` |
| Transport Mode | `Road`, `Rail`, or `Sea` |
| Rail Reason | R1–R7 justification code (if rail selected) |
| LU Reason | LU1–LU4 justification code (if force-kept or milk run) |
| LU Notes | Free-text justification note |
| Line Fill % | This SKU line's contribution to the truck |
| Truck Total Fill % | Total truck utilisation |
| Transport Cost (€) | Full truck cost |
| Cost per Piece (€) | Transport cost ÷ total pieces |
| Decision | Algorithm decision reason |
| Notes | Manual addition note (if Prio 4 top-up) |

### `Cut_Lines_W{XX}.xlsx`

One row per cut SKU line.

| Column | Description |
|---|---|
| Origin Location Code | Supplier/pickup code |
| Supplier Name | Supplier display name |
| Destination Location | Warehouse code |
| SKU | Item code |
| Original Quantity | Quantity that was cut |
| Priority | 1, 2, 3, or 4 |
| Transport Unit Type | What unit type would have been used |
| Fill % | Truck fill % at time of cut |
| Cost per Piece (€) | Transport cost ÷ total pieces |
| Cut Reason | Algorithm reason for cutting |
| Root Cause | User-provided root cause (if manually cut) |
| Suggested Fallback Unit | `Van` or `20ft Container` if quantity fits |

### `All_Lines_W{XX}.xlsx` (Combined)

Both confirmed and cut lines in a single file with an additional `Status` column (`Confirmed`, `Confirmed (Milk Run)`, `Cut`, `Cut (Milk Run)`).

---

## 6. Vendor Shipment Number Format

```
{origin}_{typeCode}_P{minPrio}[_PW{pgrdWeek}][_{seq}]
```

| Segment | Description | Example |
|---|---|---|
| `{origin}` | Origin location code | `PADV_LT` |
| `{typeCode}` | `FTL` or `S40FT` | `FTL` |
| `P{minPrio}` | Lowest priority loaded (1–4) | `P1` |
| `_PW{pgrdWeek}` | PGRD week (if present in file) | `_PW25` |
| `_{seq}` | Sequence within same origin+type+prio (omitted for first truck) | `_2` |

Full examples:
- `PADV_LT_FTL_P1_PW25` — first FTL from PADV_LT, Prio 1, PGRD week 25
- `PADV_LT_FTL_P1_PW25_2` — second such truck
- `VELA_ES_S40FT_P3_PW25` — 40ft container from VELA_ES, Prio 3

Milk run trucks get their own VSN assigned per stop in the format:
```
{milkRunId}_S40FT_PW{pgrdWeek}_{origin}_{country}_{shortDest}
```

---

## 7. Special Supplier Rules

### Pass-through suppliers: `MI_PT`, `VELA_ES`

These suppliers use exact S&OP quantities — no pallet rounding, no truck-fill algorithm, no cut logic. Each SKU line becomes its own auto-confirmed truck at 100% fill. They are excluded from Prio 4 top-up and milk run detection.

### Fennobed (`FENN_EE`, `FEN1_EE`) — MTO/MTS classification

Fennobed SKUs are classified as **Made to Stock (MTS)** or **Made to Order (MTO)** and the label is written to the `MTO/MTS` column in the output.

- **MTS SKUs** (explicit allowlist in `lib/excelExporter.js`) — eligible for Prio 4 top-up on all destinations
- **MTO SKUs** — blocked from Prio 4 top-up specifically on `HA_DE` destination; allowed for all other destinations

---

## 8. Deployment (Vercel)

### Initial deploy

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → **New Project** → import the repo
3. Add the environment variables listed in §10
4. Click **Deploy** — Vercel builds and gives you a live URL

### Updates

Push to `master` → Vercel auto-deploys (typically ~1 minute).

---

## 9. Local Development

Requires Node.js 18+.

```bash
npm install

# Copy env template and fill in Airtable credentials
cp .env.example .env.local

npm run dev
# App available at http://localhost:3000
```

---

## 10. Environment Variables

Set these in Vercel dashboard (or `.env.local` for local development):

| Variable | Value |
|---|---|
| `AIRTABLE_API_KEY` | Airtable Personal Access Token (`pat…`) |
| `AIRTABLE_BASE_ID` | `appC7tN7h8yeftyVV` |
| `PALLETIZATION_TABLE_ID` | `tblY2PxdLq84p8Erc` |
| `COST_TABLE_ID` | `tbl6Vr4XwyNhLVsMX` |

API credentials are accessed server-side only (`/app/api/airtable/route.js`) and never sent to the browser.
