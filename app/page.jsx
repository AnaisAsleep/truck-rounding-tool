'use client';

import { useState, useCallback } from 'react';
import ProgressBar from '../components/ProgressBar';
import SetupStep from '../components/SetupStep';
import UploadStep from '../components/UploadStep';
import TransportModeStep from '../components/TransportModeStep';
import ReviewStep from '../components/ReviewStep';
import ResultsStep from '../components/ResultsStep';
import { finalizeResults } from '../lib/rounding';

function getCurrentISOWeek() {
  const now = new Date();
  const jan4 = new Date(now.getFullYear(), 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const diff = now - startOfWeek1;
  return Math.ceil(diff / (7 * 24 * 60 * 60 * 1000));
}

const STEPS = ['Setup', 'Upload', 'Transport', 'Review', 'Results'];

export default function Home() {
  const [step, setStep] = useState(0);
  const [weekNum, setWeekNum] = useState(getCurrentISOWeek());
  const [year, setYear] = useState(new Date().getFullYear());
  const [airtableData, setAirtableData] = useState(null);
  const [roundingResults, setRoundingResults] = useState(null);
  const [unmatchedRows, setUnmatchedRows] = useState([]);
  const [transportDecisions, setTransportDecisions] = useState({});
  const [finalConfirmed, setFinalConfirmed] = useState([]);
  const [finalCutLines, setFinalCutLines] = useState([]);

  const handleDataRefresh = useCallback((data) => setAirtableData(data), []);

  const handleRoundingComplete = useCallback((results, unmatched) => {
    setRoundingResults(results);
    setUnmatchedRows(unmatched || []);
    setStep(2); // → Transport Mode
  }, []);

  const handleTransportConfirm = useCallback((decisions) => {
    setTransportDecisions(decisions);
    setStep(3); // → Review
  }, []);

  const handleReviewConfirm = useCallback((truckDecisions, cutLineNotes) => {
    const { finalConfirmed: fc, finalCutLines: fcl } = finalizeResults(
      roundingResults,
      truckDecisions,
      [],
      transportDecisions,
      cutLineNotes || {},
      unmatchedRows,
    );
    setFinalConfirmed(fc);
    setFinalCutLines(fcl);
    setStep(4); // → Results
  }, [roundingResults, transportDecisions, unmatchedRows]);

  const handleStartOver = useCallback(() => {
    setStep(0);
    setRoundingResults(null);
    setUnmatchedRows([]);
    setTransportDecisions({});
    setFinalConfirmed([]);
    setFinalCutLines([]);
  }, []);

  return (
    <div className="min-h-screen bg-stone-50">
      <ProgressBar currentStep={step} steps={STEPS} />
      <div>
        {step === 0 && (
          <SetupStep
            weekNum={weekNum} year={year}
            onWeekChange={setWeekNum} onYearChange={setYear}
            airtableData={airtableData} onDataRefresh={handleDataRefresh}
            onNext={() => setStep(1)}
          />
        )}
        {step === 1 && (
          <UploadStep
            airtableData={airtableData} weekNum={weekNum} year={year}
            onRoundingComplete={handleRoundingComplete}
            onBack={() => setStep(0)}
          />
        )}
        {step === 2 && roundingResults && (
          <TransportModeStep
            confirmedTrucks={roundingResults.confirmedTrucks}
            costMap={airtableData?.costMap || {}}
            onConfirm={handleTransportConfirm}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && roundingResults && (
          <ReviewStep
            roundingResults={roundingResults}
            unmatchedRows={unmatchedRows}
            onConfirm={handleReviewConfirm}
            onBack={() => setStep(2)}
          />
        )}
        {step === 4 && (
          <ResultsStep
            finalConfirmed={finalConfirmed}
            finalCutLines={finalCutLines}
            weekNum={weekNum} year={year}
            onStartOver={handleStartOver}
          />
        )}
      </div>
    </div>
  );
}
