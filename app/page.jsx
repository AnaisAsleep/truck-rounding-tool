'use client';

import { useState, useCallback } from 'react';
import ProgressBar from '../components/ProgressBar';
import SetupStep from '../components/SetupStep';
import UploadStep from '../components/UploadStep';
import TransportModeStep from '../components/TransportModeStep';
import ReviewStep from '../components/ReviewStep';
import ResultsStep from '../components/ResultsStep';
import { finalizeResults } from '../lib/rounding';

const STEPS = ['Setup', 'Upload', 'Transport', 'Review', 'Results'];

export default function Home() {
  const [step, setStep] = useState(0);
  const [weekNum, setWeekNum] = useState(null);
  const [year, setYear] = useState(null);
  const [airtableData, setAirtableData] = useState(null);
  const [roundingResults, setRoundingResults] = useState(null);
  const [unmatchedRows, setUnmatchedRows] = useState([]);
  const [transportDecisions, setTransportDecisions] = useState({});
  const [finalConfirmed, setFinalConfirmed] = useState([]);
  const [finalCutLines, setFinalCutLines] = useState([]);

  const handleDataRefresh = useCallback((data) => setAirtableData(data), []);

  const handleRoundingComplete = useCallback((results, unmatched, wk, yr) => {
    setRoundingResults(results);
    setUnmatchedRows(unmatched || []);
    if (wk) setWeekNum(wk);
    if (yr) setYear(yr);
    setStep(2);
  }, []);

  const handleTransportConfirm = useCallback((decisions) => {
    setTransportDecisions(decisions);
    setStep(3);
  }, []);

  const handleReviewConfirm = useCallback((truckDecisions, cutLineNotes, truckAdditions) => {
    const { finalConfirmed: fc, finalCutLines: fcl } = finalizeResults(
      roundingResults,
      truckDecisions,
      [],
      transportDecisions,
      cutLineNotes || {},
      unmatchedRows,
      truckAdditions || {},
    );
    setFinalConfirmed(fc);
    setFinalCutLines(fcl);
    setStep(4);
  }, [roundingResults, transportDecisions, unmatchedRows]);

  const handleStartOver = useCallback(() => {
    setStep(0);
    setRoundingResults(null);
    setUnmatchedRows([]);
    setTransportDecisions({});
    setFinalConfirmed([]);
    setFinalCutLines([]);
    setWeekNum(null);
    setYear(null);
  }, []);

  return (
    <div>
      <ProgressBar currentStep={step} steps={STEPS} />
      <div className="max-w-5xl mx-auto px-6 py-8">
        {step === 0 && (
          <SetupStep
            airtableData={airtableData}
            onDataRefresh={handleDataRefresh}
            onNext={() => setStep(1)}
          />
        )}
        {step === 1 && (
          <UploadStep
            airtableData={airtableData}
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
            weekNum={weekNum}
            year={year}
            onStartOver={handleStartOver}
          />
        )}
      </div>
    </div>
  );
}
