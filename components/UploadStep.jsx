'use client';

import { useState, useRef } from 'react';
import { parseNeedsFile, validateRows } from '../lib/excelParser';
import { runRounding } from '../lib/rounding';
import ValidationPanel from './ValidationPanel';

/** Return the most common value in an array, or null if empty */
function mode(arr) {
  if (!arr.length) return null;
  const counts = {};
  arr.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
  return Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]);
}

/** Extract the dominant shipping week/year from parsed rows */
function detectWeekYear(rows) {
  const weeks = rows.map(r => parseInt(r.shippingWeek)).filter(n => !isNaN(n) && n >= 1 && n <= 53);
  const years = rows.map(r => parseInt(r.shippingYear)).filter(n => !isNaN(n) && n >= 2020);
  return { week: mode(weeks), year: mode(years) };
}

export default function UploadStep({ airtableData, onRoundingComplete, onBack }) {
  const [mainFile, setMainFile] = useState(null);
  const [prio4File, setPrio4File] = useState(null);
  const [validation, setValidation] = useState(null);
  const [prio4Validation, setPrio4Validation] = useState(null);
  const [detectedWeek, setDetectedWeek] = useState(null);
  const [detectedYear, setDetectedYear] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [draggingMain, setDraggingMain] = useState(false);
  const [draggingPrio4, setDraggingPrio4] = useState(false);
  const [useConstrained, setUseConstrained] = useState(true);

  const mainInputRef  = useRef();
  const prio4InputRef = useRef();

  const handleMainFile = async (file, constrained = useConstrained) => {
    setError(null);
    setMainFile(file);
    setValidation(null);
    setDetectedWeek(null);
    setDetectedYear(null);

    try {
      const buffer = await file.arrayBuffer();
      const { rows, errors, missingOriginCode } = await parseNeedsFile(buffer, false, constrained);

      if (missingOriginCode || (errors.length > 0 && rows.length === 0)) {
        setValidation({ errors, summary: null, unmatchedRows: [], noCostRows: [] });
        return;
      }

      const result = validateRows(rows, airtableData.palletization, airtableData.costs);
      setValidation({ ...result, errors });

      const { week, year } = detectWeekYear(rows);
      setDetectedWeek(week);
      setDetectedYear(year);
    } catch (err) {
      setError(`Failed to parse file: ${err.message}`);
    }
  };

  const handlePrio4File = async (file) => {
    setPrio4File(file);
    setPrio4Validation(null);
    try {
      const buffer = await file.arrayBuffer();
      const { rows, errors, missingOriginCode } = await parseNeedsFile(buffer, true);
      if (missingOriginCode) {
        setPrio4Validation({
          errors: [{ type: 'missing_column', message: 'Missing origin_location_code column — Prio 4 file was not processed.' }],
          summary: null, unmatchedRows: [], noCostRows: [], validRows: [],
        });
        return;
      }
      if (rows.length === 0) {
        setPrio4Validation({
          errors: [{ type: 'empty', message: 'No valid rows found in Prio 4 file — check that Prio 1/2/3 quantity columns have data.' }],
          summary: null, unmatchedRows: [], noCostRows: [], validRows: [],
        });
        return;
      }
      const result = validateRows(rows, airtableData.palletization, airtableData.costs);
      setPrio4Validation({ ...result, errors });
    } catch (err) {
      setPrio4Validation({
        errors: [{ type: 'parse_error', message: `Failed to parse Prio 4 file: ${err.message}` }],
        summary: null, unmatchedRows: [], noCostRows: [], validRows: [],
      });
    }
  };

  const handleRunRounding = async () => {
    if (!validation?.validRows) return;
    setRunning(true);
    setError(null);

    // Fallback: current ISO week if not found in file
    const now = new Date();
    const jan4 = new Date(now.getFullYear(), 0, 4);
    const start = new Date(jan4);
    start.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
    const currentWeek = Math.ceil((now - start) / (7 * 24 * 60 * 60 * 1000));
    const currentYear = now.getFullYear();

    const wk = detectedWeek || currentWeek;
    const yr = detectedYear || currentYear;

    try {
      await new Promise(r => setTimeout(r, 50));
      const prio4Rows = prio4Validation?.validRows || [];
      const results = runRounding(validation.validRows, prio4Rows, validation.costMap, wk, yr);
      onRoundingComplete(results, validation.unmatchedRows, wk, yr);
    } catch (err) {
      setError(`Rounding failed: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  const handleToggleConstrained = (val) => {
    setUseConstrained(val);
    if (mainFile) handleMainFile(mainFile, val);
  };

  const canRun = validation?.validRows?.length > 0 && !running;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-[#403833] mb-1">Upload Files</h1>
      <p className="text-[#8a7e78] mb-5">
        File 1 is required. File 2 (Prio 4 top-up) is optional.
      </p>

      {/* Constrained / Unconstrained toggle */}
      <div className="mb-5">
        <p className="text-xs font-semibold text-[#403833] mb-2">Quantity mode</p>
        <div className="inline-flex rounded-lg border border-[#e8e0db] overflow-hidden text-sm">
          <button
            onClick={() => handleToggleConstrained(true)}
            className={`px-4 py-2 font-medium transition-colors ${useConstrained ? 'bg-[#403833] text-white' : 'bg-white text-[#8a7e78] hover:bg-[#fafaf8]'}`}
          >
            Constrained
          </button>
          <button
            onClick={() => handleToggleConstrained(false)}
            className={`px-4 py-2 font-medium transition-colors border-l border-[#e8e0db] ${!useConstrained ? 'bg-[#403833] text-white' : 'bg-white text-[#8a7e78] hover:bg-[#fafaf8]'}`}
          >
            Unconstrained
          </button>
        </div>
        <p className="text-xs text-[#8a7e78] mt-1.5">
          {useConstrained
            ? 'Ordered quantity is capped at the constrained column value per SKU.'
            : 'Full Prio 1+2+3 sum is used — constraint column is ignored.'}
        </p>
      </div>

      <p className="text-xs text-[#8a7e78] mb-5 pl-3 border-l-2 border-[#e8e0db]">
        Your file needs an <code className="font-mono bg-[#f0ebe8] text-[#403833] px-1 rounded">origin_location_code</code> column —
        the pickup location code, e.g. <code className="font-mono bg-[#f0ebe8] text-[#403833] px-1 rounded">MI_PT</code>.
        The rounding week is read automatically from the <code className="font-mono bg-[#f0ebe8] text-[#403833] px-1 rounded">Shipping week</code> column.
      </p>

      {error && (
        <p className="text-sm text-red-600 mb-4">{error}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <DropZone
          label="Prio 1–3 Needs"
          sublabel="Required · SO99+ Proposals export"
          file={mainFile}
          dragging={draggingMain}
          onDragOver={() => setDraggingMain(true)}
          onDragLeave={() => setDraggingMain(false)}
          onDrop={e => { e.preventDefault(); setDraggingMain(false); const f = e.dataTransfer.files[0]; if (f) handleMainFile(f); }}
          onClick={() => mainInputRef.current?.click()}
        />
        <DropZone
          label="Prio 4 / Index 1"
          sublabel="Optional · next-week top-up"
          file={prio4File}
          dragging={draggingPrio4}
          onDragOver={() => setDraggingPrio4(true)}
          onDragLeave={() => setDraggingPrio4(false)}
          onDrop={e => { e.preventDefault(); setDraggingPrio4(false); const f = e.dataTransfer.files[0]; if (f) handlePrio4File(f); }}
          onClick={() => prio4InputRef.current?.click()}
        />
      </div>

      <input ref={mainInputRef}  type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { if (e.target.files[0]) handleMainFile(e.target.files[0]); }} />
      <input ref={prio4InputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { if (e.target.files[0]) handlePrio4File(e.target.files[0]); }} />

      {detectedWeek && (
        <div className="mb-3 flex items-center gap-2 text-xs text-[#8a7e78]">
          <svg className="w-3.5 h-3.5 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          Shipping week detected from file:{' '}
          <span className="font-semibold text-[#403833]">W{String(detectedWeek).padStart(2,'0')} {detectedYear}</span>
        </div>
      )}

      {validation && <ValidationPanel validation={validation} />}

      {prio4Validation && (
        <div className="mt-3">
          <p className="text-xs text-[#8a7e78] mb-1">Prio 4 file:</p>
          <ValidationPanel validation={prio4Validation} />
        </div>
      )}

      <div className="flex items-center justify-between mt-6">
        <button
          onClick={onBack}
          className="px-4 py-2 text-[#403833] border border-[#e8e0db] rounded-lg text-sm font-medium hover:bg-[#fafaf8] transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={handleRunRounding}
          disabled={!canRun}
          className="px-6 py-2.5 bg-[#ffa236] text-white font-semibold text-sm rounded-lg hover:bg-[#e8922e] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {running ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Running…
            </>
          ) : 'Run Rounding →'}
        </button>
      </div>
    </div>
  );
}

function DropZone({ label, sublabel, file, dragging, onDragOver, onDragLeave, onDrop, onClick }) {
  return (
    <div
      onDragOver={e => { e.preventDefault(); onDragOver(); }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClick}
      className={`
        border-2 rounded-xl p-5 cursor-pointer flex flex-col justify-center min-h-[120px]
        transition-all duration-150
        ${dragging ? 'border-[#ffa236] bg-[#fff8f0]'
          : file   ? 'border-green-400 bg-green-50'
          :          'border-dashed border-[#e8e0db] hover:border-[#ffa236] hover:bg-[#fff8f0]'}
      `}
    >
      {file ? (
        <div className="flex items-start gap-2.5">
          <svg className="w-4 h-4 text-green-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div className="min-w-0">
            <p className="text-sm font-medium text-[#403833] truncate">{file.name}</p>
            <p className="text-xs text-[#8a7e78] mt-0.5">Click to replace</p>
          </div>
        </div>
      ) : (
        <>
          <svg className="w-6 h-6 text-[#c4b8b0] mb-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
          </svg>
          <p className="text-sm font-semibold text-[#403833]">{label}</p>
          <p className="text-xs text-[#8a7e78] mt-0.5">{sublabel}</p>
          <p className="text-xs text-[#c4b8b0] mt-3">Drop here or click to browse</p>
        </>
      )}
    </div>
  );
}
