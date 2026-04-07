'use client';

import { useState, useCallback } from 'react';
import ProgressBar from '../components/ProgressBar';
import SetupStep from '../components/SetupStep';
import UploadStep from '../components/UploadStep';
import ReviewStep from '../components/ReviewStep';
import OverrideStep from '../components/OverrideStep';
import ResultsStep from '../components/ResultsStep';
import { finalizeResults } from '../lib/rounding';

/** Get current ISO week number */
function getCurrentISOWeek() {
  const now = new Date();
  const jan4 = new Date(now.getFullYear(), 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const diff = now - startOfWeek1;
  return Math.ceil(diff / (7 * 24 * 60 * 60 * 1000));
}

const STEPS = {
  SETUP: 1,
  UPLOAD: 2,
  REVIEW: 3,
  OVERRIDE: 4,
  RESULTS: 5,
};

export default function HomePage() {
  // ── Step navigation ───────────────────────────────────────────────
  const [step, setStep] = useState(STEPS.SETUP);

  // ── Setup state ───────────────────────────────────────────────────
  const [weekNum, setWeekNum] = useState(getCurrentISOWeek);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [airtableData, setAirtableData] = useState(null);

  // ── Rounding results ──────────────────────────────────────────────
  const [roundingResults, setRoundingResults] = useState(null);
  const [unmatchedRows, setUnmatchedRows] = useState([]);

  // ── User decisions ────────────────────────────────────────────────
  const [borderlineDecisions, setBorderlineDecisions] = useState({});
  const [forceKeptVSNs, setForceKeptVSNs] = useState([]);

  // ── Final output ──────────────────────────────────────────────────
  const [finalConfirmed, setFinalConfirmed] = useState(null);
  const [finalCutLines, setFinalCutLines] = useState(null);

  // ── Handlers ─────────────────────────────────────────────────────

  const handleDataRefresh = useCallback((data) => {
    setAirtableData(data);
  }, []);

  const handleRoundingComplete = useCallback((results, unmatched) => {
    setRoundingResults(results);
    setUnmatchedRows(unmatched || []);

    // Add cut lines for unmatched rows (no Airtable match)
    const unmatchedCutLines = (unmatched || []).map(row => ({
      originLocationCode: row.originLocationCode,
      supplierName: row.supplierName,
      destinationLocation: row.destinationLocation,
      sku: row.sku,
      originalQty: (row.prio1 || 0) + (row.prio2 || 0) + (row.prio3 || 0),
      priority: Math.min(
        row.prio1 > 0 ? 1 : 9,
        row.prio2 > 0 ? 2 : 9,
        row.prio3 > 0 ? 3 : 9,
      ),
      lane: row.lane,
      cutReason: row.cutReason || `No Airtable match — SKU+lane combo '${row.pkey}' not found in palletization table`,
    }));

    // Attach unmatched cut lines to rounding results
    setRoundingResults(prev => ({
      ...results,
      cutLines: [...(results.cutLines || []), ...unmatchedCutLines],
    }));

    setStep(STEPS.REVIEW);
  }, []);

  const handleReviewConfirm = useCallback((decisions) => {
    setBorderlineDecisions(decisions);
    setStep(STEPS.OVERRIDE);
  }, []);

  const handleOverrideFinalize = useCallback((forceKept) => {
    setForceKeptVSNs(forceKept);

    // Finalize results incorporating user decisions
    const { finalConfirmed: confirmed, finalCutLines: cutLines } = finalizeResults(
      roundingResults,
      borderlineDecisions,
      forceKept
    );

    setFinalConfirmed(confirmed);
    setFinalCutLines(cutLines);
    setStep(STEPS.RESULTS);
  }, [roundingResults, borderlineDecisions]);

  const handleStartOver = useCallback(() => {
    setStep(STEPS.SETUP);
    setRoundingResults(null);
    setUnmatchedRows([]);
    setBorderlineDecisions({});
    setForceKeptVSNs([]);
    setFinalConfirmed(null);
    setFinalCutLines(null);
  }, []);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div>
      {/* Progress indicator */}
      <ProgressBar currentStep={step} />

      {/* Divider */}
      <div className="border-b border-[#e8e0db] mb-8" />

      {/* Step content */}
      {step === STEPS.SETUP && (
        <SetupStep
          weekNum={weekNum}
          year={year}
          onWeekChange={setWeekNum}
          onYearChange={setYear}
          airtableData={airtableData}
          onDataRefresh={handleDataRefresh}
          onNext={() => setStep(STEPS.UPLOAD)}
        />
      )}

      {step === STEPS.UPLOAD && (
        <UploadStep
          airtableData={airtableData}
          weekNum={weekNum}
          year={year}
          onRoundingComplete={handleRoundingComplete}
          onBack={() => setStep(STEPS.SETUP)}
        />
      )}

      {step === STEPS.REVIEW && roundingResults && (
        <ReviewStep
          borderlineTrucks={roundingResults.borderlineTrucks}
          onConfirm={handleReviewConfirm}
          onBack={() => setStep(STEPS.UPLOAD)}
        />
      )}

      {step === STEPS.OVERRIDE && roundingResults && (
        <OverrideStep
          cutTrucks={roundingResults.cutTrucks}
          onFinalize={handleOverrideFinalize}
          onBack={() => setStep(STEPS.REVIEW)}
        />
      )}

      {step === STEPS.RESULTS && finalConfirmed && (
        <ResultsStep
          finalConfirmed={finalConfirmed}
          finalCutLines={finalCutLines || []}
          weekNum={weekNum}
          year={year}
          onStartOver={handleStartOver}
        />
      )}
    </div>
  );
}
