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

  const mainInputRef = useRef();
  const prio4InputRef = useRef();

  const handleMainFile = async (file) => {
    setError(null);
    setMainFile(file);
    setValidation(null);

    try {
      const buffer = await file.arrayBuffer();
      const { rows, errors, missingOriginCode } = parseNeedsFile(buffer, false);

      if (missingOriginCode || (errors.length > 0 && rows.length === 0)) {
        setValidation({ errors, summary: null, unmatchedRows: [], noCostRows: [] });
        return;
      }

      // Validate against Airtable data
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
      const { rows, errors, missingOriginCode } = parseNeedsFile(buffer, true);

      if (!missingOriginCode && rows.length > 0) {
        const result = validateRows(rows, airtableData.palletization, airtableData.costs);
        setPrio4Validation({ ...result, errors });
      }
    } catch (err) {
      console.warn('Prio 4 file parse error:', err);
    }
  };

  const handleRunRounding = async () => {
    if (!validation?.validRows) return;
    setRunning(true);
    setError(null);

    try {
      // Small delay to let the UI update before heavy computation
      await new Promise(r => setTimeout(r, 50));

      const prio4Rows = prio4Validation?.validRows || [];
      const results = runRounding(
        validation.validRows,
        prio4Rows,
        validation.costMap,
        weekNum,
        year
      );

      onRoundingComplete(results, validation.unmatchedRows);
    } catch (err) {
      setError(`Rounding failed: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  const canRun = validation?.validRows?.length > 0 && !running;

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-[#403833] mb-1">Upload Files</h2>
      <p className="text-[#8a7e78] mb-6">
        Upload your planning export files. The main file (Prio 1-3) is required; Prio 4 is optional.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-[#f44336] rounded-btn text-sm text-[#f44336]">
          {error}
        </div>
      )}

      {/* Upload zones */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <DropZone
          label="Main Needs (Prio 1-3)"
          helper="Required — SO99+ Proposals export"
          file={mainFile}
          dragging={draggingMain}
          onDragOver={() => setDraggingMain(true)}
          onDragLeave={() => setDraggingMain(false)}
          onDrop={e => {
            e.preventDefault();
            setDraggingMain(false);
            const f = e.dataTransfer.files[0];
            if (f) handleMainFile(f);
          }}
          onClick={() => mainInputRef.current?.click()}
          required
        />
        <DropZone
          label="Next Week Needs (Prio 4)"
          helper="Optional — used to top up underutilized trucks"
          file={prio4File}
          dragging={draggingPrio4}
          onDragOver={() => setDraggingPrio4(true)}
          onDragLeave={() => setDraggingPrio4(false)}
          onDrop={e => {
            e.preventDefault();
            setDraggingPrio4(false);
            const f = e.dataTransfer.files[0];
            if (f) handlePrio4File(f);
          }}
          onClick={() => prio4InputRef.current?.click()}
        />
      </div>

      {/* Hidden file inputs */}
      <input
        ref={mainInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={e => { if (e.target.files[0]) handleMainFile(e.target.files[0]); }}
      />
      <input
        ref={prio4InputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={e => { if (e.target.files[0]) handlePrio4File(e.target.files[0]); }}
      />

      {/* Validation panel */}
      {validation && <ValidationPanel validation={validation} />}
      {prio4Validation && (
        <div className="mt-3">
          <p className="text-xs font-medium text-[#8a7e78] mb-1">Prio 4 file summary:</p>
          <ValidationPanel validation={prio4Validation} />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-between mt-6">
        <button
          onClick={onBack}
          className="px-4 py-2 text-[#403833] border border-[#e8e0db] rounded-btn text-sm font-medium hover:bg-[#fafafa] transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={handleRunRounding}
          disabled={!canRun}
          className="
            px-6 py-2.5 bg-[#ffa236] text-white font-semibold rounded-btn
            hover:bg-[#e8922e] active:bg-[#d4842a]
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-colors flex items-center gap-2
          "
        >
          {running ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Running algorithm...
            </>
          ) : (
            <>
              Run Rounding →
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function DropZone({ label, helper, file, dragging, onDragOver, onDragLeave, onDrop, onClick, required }) {
  return (
    <div
      onDragOver={e => { e.preventDefault(); onDragOver(); }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClick}
      className={`
        relative border-2 border-dashed rounded-card p-6 cursor-pointer
        flex flex-col items-center justify-center text-center
        transition-all duration-150 min-h-[160px]
        ${dragging
          ? 'border-[#ffa236] bg-[#fff3e0]'
          : file
            ? 'border-[#4caf50] bg-green-50'
            : 'border-[#e8e0db] bg-white hover:border-[#ffa236] hover:bg-[#fff3e0]'
        }
      `}
    >
      {file ? (
        <>
          <svg className="w-8 h-8 text-[#4caf50] mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm font-semibold text-[#403833] truncate max-w-full px-2">{file.name}</p>
          <p className="text-xs text-[#4caf50] mt-0.5">Click to replace</p>
        </>
      ) : (
        <>
          <svg className="w-8 h-8 text-[#8a7e78] mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-sm font-semibold text-[#403833]">{label}</p>
          {required && <span className="text-xs text-[#f44336] font-medium">Required</span>}
          <p className="text-xs text-[#8a7e78] mt-1">{helper}</p>
          <p className="text-xs text-[#8a7e78] mt-0.5">Drag & drop or click to browse</p>
        </>
      )}
    </div>
  );
}
