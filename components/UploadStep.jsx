'use client';

import { useState, useRef } from 'react';
import { parseNeedsFile, validateRows } from '../lib/excelParser';
import { runRounding } from '../lib/rounding';
import ValidationPanel from './ValidationPanel';

export default function UploadStep({ airtableData, weekNum, year, onRoundingComplete, onBack }) {
  const [mainFile, setMainFile] = useState(null);
  const [prio4File, setPrio4File] = useState(null);
  const [validation, setValidation] = useState(null);
  const [prio4Validation, setPrio4Validation] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [draggingMain, setDraggingMain] = useState(false);
  const [draggingPrio4, setDraggingPrio4] = useState(false);

  const mainInputRef  = useRef();
  const prio4InputRef = useRef();

  const handleMainFile = async (file) => {
    setError(null);
    setMainFile(file);
    setValidation(null);
    try {
      const buffer = await file.arrayBuffer();
      const { rows, errors, missingOriginCode } = await parseNeedsFile(buffer, false);
      if (missingOriginCode || (errors.length > 0 && rows.length === 0)) {
        setValidation({ errors, summary: null, unmatchedRows: [], noCostRows: [] });
        return;
      }
      const result = validateRows(rows, airtableData.palletization, airtableData.costs);
      setValidation({ ...result, errors });
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
      if (!missingOriginCode && rows.length > 0) {
        const result = validateRows(rows, airtableData.palletization, airtableData.costs);
        setPrio4Validation({ ...result, errors });
      }
    } catch (err) {
      console.warn('Prio 4 parse error:', err);
    }
  };

  const handleRunRounding = async () => {
    if (!validation?.validRows) return;
    setRunning(true);
    setError(null);
    try {
      await new Promise(r => setTimeout(r, 50));
      const prio4Rows = prio4Validation?.validRows || [];
      const results = runRounding(validation.validRows, prio4Rows, validation.costMap, weekNum, year);
      onRoundingComplete(results, validation.unmatchedRows);
    } catch (err) {
      setError(`Rounding failed: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  const canRun = validation?.validRows?.length > 0 && !running;

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-stone-900 mb-1">Upload Files</h1>
      <p className="text-sm text-stone-500 mb-6">
        File 1 is required. File 2 (Prio 4 top-up) is optional.
      </p>

      <p className="text-xs text-stone-400 mb-5 border-l-2 border-stone-200 pl-3">
        Make sure your file has an <code className="font-mono text-stone-600 bg-stone-100 px-1 rounded">origin_location_code</code> column
        with the pickup location code (e.g. <code className="font-mono text-stone-600 bg-stone-100 px-1 rounded">MI_PT</code>).
      </p>

      {error && (
        <p className="text-xs text-red-600 mb-4">{error}</p>
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
          label="Prio 4 Needs"
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

      {validation && <ValidationPanel validation={validation} />}

      {prio4Validation && (
        <div className="mt-2">
          <p className="text-xs text-stone-400 mb-1 mt-3">Prio 4 file:</p>
          <ValidationPanel validation={prio4Validation} />
        </div>
      )}

      <div className="flex items-center justify-between mt-6">
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm text-stone-600 border border-stone-200 rounded hover:bg-stone-50 transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={handleRunRounding}
          disabled={!canRun}
          className="px-5 py-2 bg-orange-500 text-white text-sm font-medium rounded hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {running ? (
            <>
              <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
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
        border rounded-lg p-5 cursor-pointer flex flex-col justify-center min-h-[120px]
        transition-colors duration-150
        ${dragging ? 'border-orange-400 bg-orange-50'
          : file    ? 'border-green-400 bg-green-50'
          :           'border-stone-200 border-dashed hover:border-stone-400 hover:bg-stone-50'}
      `}
    >
      {file ? (
        <div className="flex items-start gap-2.5">
          <svg className="w-4 h-4 text-green-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div className="min-w-0">
            <p className="text-sm font-medium text-stone-800 truncate">{file.name}</p>
            <p className="text-xs text-stone-400 mt-0.5">Click to replace</p>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm font-medium text-stone-700">{label}</p>
          <p className="text-xs text-stone-400 mt-0.5">{sublabel}</p>
          <p className="text-xs text-stone-300 mt-3">Drop file or click to browse</p>
        </>
      )}
    </div>
  );
}
