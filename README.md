# Truck Rounding Tool

A web application for rounding purchase order quantities into full trucks or containers. Built with Next.js + Tailwind CSS, connected to Airtable for master data.

---

## How it works

1. **Setup** — Enter the week number and refresh Airtable data (palletization rules + transport costs)
2. **Upload** — Upload your Main Needs file (Prio 1-3) and optionally Next Week's Needs (Prio 4)
3. **Review** — Confirm or cut borderline trucks (€10-20/piece cost)
4. **Override** — Force-keep any cut trucks if there's an urgent stock situation
5. **Results** — Download the two output Excel files: Confirmed Loads and Cut Lines

---

## First-time Setup (Vercel Deployment)

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/truck-rounding-tool.git
git push -u origin main
```

### 2. Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **New Project** → import your `truck-rounding-tool` repository
3. In **Environment Variables**, add:

| Variable | Value |
|---|---|
| `AIRTABLE_API_KEY` | Your Airtable Personal Access Token |
| `AIRTABLE_BASE_ID` | `appC7tN7h8yeftyVV` |
| `PALLETIZATION_TABLE_ID` | `tblY2PxdLq84p8Erc` |
| `COST_TABLE_ID` | `tbl6Vr4XwyNhLVsMX` |

4. Click **Deploy** — Vercel will build and give you a URL like `truck-rounding-tool.vercel.app`
5. Share the URL with your team

### 3. Updating

Push changes to GitHub → Vercel auto-deploys (usually takes ~1 minute).

---

## Local Development (optional)

Requires Node.js 18+.

```bash
# Install dependencies
npm install

# Copy env template and fill in your values
cp .env.example .env.local
# Edit .env.local with your Airtable credentials

# Start dev server
npm run dev
# Open http://localhost:3000
```

---

## Upload File Format

### Main Needs (Prio 1-3)

Excel file exported from SO99+. Required columns (matched by header name, not position):

| Header | Description |
|---|---|
| `Description (Production Plant or External Supplier)` | Supplier name |
| `Destination Location` | Delivery location code |
| `Item Code` | SKU |
| `Prio 1` | Priority 1 quantity |
| `Prio 2` | Priority 2 quantity |
| `Prio 3` | Priority 3 quantity |
| `Minimum Supply Lot` | Minimum order quantity |
| `origin_location_code` | **Must be added manually** — pickup location code (e.g. `MI_PT`, `RF_DE`) |

> **Important**: You must manually add the `origin_location_code` column to the file before uploading. This column contains the pickup location code that matches Airtable's `origin_location_record` field.

### Next Week Needs (Prio 4)

Same format as the Main Needs file. Optional — used only to top up underutilized trucks.

---

## Output Files

### Confirmed_Loads_W{XX}.xlsx
One row per SKU line per confirmed truck. Includes vendor shipment number, route, quantities, pallets, utilization, transport cost, and decision reason.

### Cut_Lines_W{XX}.xlsx
All quantities that were cut, with the reason for each cut.

---

## Rounding Algorithm Summary

1. Lines are grouped by lane (origin → destination)
2. Quantities are stacked by priority (Prio 1 first, then 2, then 3)
3. Palletized quantities are rounded down to full pallets (MOQ check applied)
4. Trucks above 80% utilization are kept; Prio 4 can top them up to 95%
5. Trucks below 50% try to be eliminated (if all Prio 3) or topped up with Prio 4
6. If still below 80% after Prio 4, cost per piece determines fate:
   - < €10/piece: keep
   - €10-20/piece: flagged for user review
   - > €20/piece: cut automatically

---

## Airtable Structure

**Table: Item Palletization Table** (`tblY2PxdLq84p8Erc`)
Palletization rules per SKU+lane combination. Only FTL and CONTAINER 40FT rows are used.

**Table: P2W view** (`tbl6Vr4XwyNhLVsMX`)
Transport cost per lane. Only Active rows are used.
