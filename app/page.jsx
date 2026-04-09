'use client';

import { useState, useCallback, useMemo } from 'react';
import ProgressBar from '../components/ProgressBar';
import SetupStep from '../components/SetupStep';
import UploadStep from '../components/UploadStep';
import ReviewStep from '../components/ReviewStep';
import TransportModeStep from '../components/TransportModeStep';
import ResultsStep from '../components/ResultsStep';
import { finalizeResults } from '../lib/rounding';

const STEPS = ['Setup', 'Upload', 'Review', 'Transport', 'Results'];

function isContainer(truck) {
  return (
    truck.lines?.[0]?.loadingUnit === 'CONTAINER 40FT' ||
    truck.lines?.[0]?.palletData?.loading_unit === 'CONTAINER 40FT'
  );
}

export default function Home() {
  const [step, setStep] = useState(0);
  const [weekNum, setWeekNum] = useState(null);
  const [year, setYear] = useState(null);
  const [airtableData, setAirtableData] = useState(null);
  const [roundingResults, setRoundingResults] = useState(null);
  const [unmatchedRows, setUnmatchedRows] = useState([]);
  // Saved after Review step, used when Transport confirms
  const [reviewDecisions, setReviewDecisions] = useState(null);
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

  // After Review: save decisions, compute accepted containers, go to Transport
  const handleReviewConfirm = useCallback((truckDecisions, cutLineNotes, truckAdditions) => {
    setReviewDecisions({ truckDecisions, cutLineNotes, truckAdditions });
    setStep(3);
  }, []);

  // Containers to show in Transport Mode:
  //  - All auto-confirmed containers from rounding
  //  - Force-kept containers (action='keep') from Review — NOT 20ft rebooks (they go sea-only)
  const confirmedContainersForTransport = useMemo(() => {
    if (!roundingResults) return [];
    const { confirmedTrucks = [], borderlineTrucks = [], cutTrucks = [] } = roundingResults;
    const decisions = reviewDecisions?.truckDecisions || {};

    const autoContainers = confirmedTrucks.filter(isContainer);

    const reviewKeptContainers = [...borderlineTrucks, ...cutTrucks].filter(t => {
      if (!isContainer(t)) return false;
      const d = decisions[t.vendorShipmentNumber];
      // 'keep' = stays as 40ft → needs transport mode decision
      // '20ft' = rebooked as 20ft → sea only, skip transport mode
      // 'cut' / undefined = not accepted → skip
      return d?.action === 'keep';
    });

    return [...autoContainers, ...reviewKeptContainers];
  }, [roundingResults, reviewDecisions]);

  // After Transport: finalize everything and go to Results
  const handleTransportConfirm = useCallback((transportDecisions) => {
    const { truckDecisions, cutLineNotes, truckAdditions } = reviewDecisions || {};
    const { finalConfirmed: fc, finalCutLines: fcl } = finalizeResults(
      roundingResults,
      truckDecisions || {},
      [],
      transportDecisions,
      cutLineNotes || {},
      unmatchedRows,
      truckAdditions || {},
    );
    setFinalConfirmed(fc);
    setFinalCutLines(fcl);
    setStep(4);
  }, [roundingResults, reviewDecisions, unmatchedRows]);

  const handleStartOver = useCallback(() => {
    setStep(0);
    setRoundingResults(null);
    setUnmatchedRows([]);
    setReviewDecisions(null);
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
          <ReviewStep
            roundingResults={roundingResults}
            unmatchedRows={unmatchedRows}
            onConfirm={handleReviewConfirm}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && roundingResults && (
          <TransportModeStep
            confirmedTrucks={confirmedContainersForTransport}
            costMap={airtableData?.costMap || {}}
            onConfirm={handleTransportConfirm}
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
