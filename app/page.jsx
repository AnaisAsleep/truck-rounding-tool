'use client';

import { useState, useCallback, useMemo } from 'react';
import ProgressBar from '../components/ProgressBar';
import SetupStep from '../components/SetupStep';
import UploadStep from '../components/UploadStep';
import ReviewStep from '../components/ReviewStep';
import MilkRunStep from '../components/MilkRunStep';
import TransportModeStep from '../components/TransportModeStep';
import ResultsStep from '../components/ResultsStep';
import { finalizeResults, finalizeMilkRunDecisions } from '../lib/rounding';

// Step indices
const STEP_SETUP     = 0;
const STEP_UPLOAD    = 1;
const STEP_REVIEW    = 2;
const STEP_MILKRUN   = 3;
const STEP_TRANSPORT = 4;
const STEP_RESULTS   = 5;

const STEPS = ['Setup', 'Upload', 'Review', 'Milk Run', 'Transport', 'Results'];

function isContainer(truck) {
  return (
    truck.lines?.[0]?.loadingUnit === 'CONTAINER 40FT' ||
    truck.lines?.[0]?.palletData?.loading_unit === 'CONTAINER 40FT'
  );
}

export default function Home() {
  const [step, setStep] = useState(STEP_SETUP);
  const [weekNum, setWeekNum] = useState(null);
  const [year, setYear] = useState(null);
  const [isBedsAndAcc, setIsBedsAndAcc] = useState(true);
  const [airtableData, setAirtableData] = useState(null);
  const [roundingResults, setRoundingResults] = useState(null);
  const [unmatchedRows, setUnmatchedRows] = useState([]);
  const [reviewDecisions, setReviewDecisions] = useState(null);
  const [milkRunDecisions, setMilkRunDecisions] = useState(null);
  const [finalConfirmed, setFinalConfirmed] = useState([]);
  const [finalCutLines, setFinalCutLines] = useState([]);

  const handleDataRefresh = useCallback((data) => setAirtableData(data), []);

  // Setup → Upload: capture round type
  const handleSetupNext = useCallback((bedsAndAcc) => {
    setIsBedsAndAcc(bedsAndAcc);
    setStep(STEP_UPLOAD);
  }, []);

  const handleRoundingComplete = useCallback((results, unmatched, wk, yr) => {
    setRoundingResults(results);
    setUnmatchedRows(unmatched || []);
    if (wk) setWeekNum(wk);
    if (yr) setYear(yr);
    setStep(STEP_REVIEW);
  }, []);

  // Review → Milk Run (or skip to Transport if no candidates)
  const handleReviewConfirm = useCallback((truckDecisions, cutLineNotes, truckAdditions) => {
    setReviewDecisions({ truckDecisions, cutLineNotes, truckAdditions });
    setStep(STEP_MILKRUN);
  }, []);

  // Milk Run → Transport
  const handleMilkRunConfirm = useCallback((decisions) => {
    setMilkRunDecisions(decisions);
    setStep(STEP_TRANSPORT);
  }, []);

  // Containers to show in Transport Mode step
  const confirmedContainersForTransport = useMemo(() => {
    if (!roundingResults) return [];
    const { confirmedTrucks = [], borderlineTrucks = [], cutTrucks = [] } = roundingResults;
    const decisions = reviewDecisions?.truckDecisions || {};

    const autoContainers = confirmedTrucks.filter(t => !t.isMilkRun && isContainer(t));

    const reviewKeptContainers = [...borderlineTrucks, ...cutTrucks].filter(t => {
      if (!isContainer(t)) return false;
      const d = decisions[t.vendorShipmentNumber];
      return d?.action === 'keep';
    });

    // Milk run containers (approved S40FT milk runs)
    const mrCandidates = roundingResults.milkRunCandidates || [];
    const mrDecisions = milkRunDecisions || {};
    const milkRunContainers = mrCandidates
      .filter(mr => {
        const d = mrDecisions[mr.milkRunId];
        return mr.typeCode === 'S40FT' && d?.action !== 'cut' && d?.action !== '20ft';
      })
      .flatMap(mr => mr.stops.map(stop => ({
        // Synthetic container object for transport mode step
        vendorShipmentNumber: `${mr.milkRunId}_S40FT_PW${mr.pgrdWeek || weekNum}_${mr.origin}_${mr.country}_${stop.shortDest}`,
        origin: mr.origin,
        destination: stop.destination,
        lane: `${mr.origin}|${stop.destination}`,
        lines: stop.lines,
        usedFraction: stop.fillFraction,
        isMilkRun: true,
        milkRunId: mr.milkRunId,
      })));

    return [...autoContainers, ...reviewKeptContainers, ...milkRunContainers];
  }, [roundingResults, reviewDecisions, milkRunDecisions, weekNum]);

  // Transport → Results: finalize everything
  const handleTransportConfirm = useCallback((transportDecisions) => {
    const { truckDecisions, cutLineNotes, truckAdditions } = reviewDecisions || {};

    // Finalize normal trucks
    const { finalConfirmed: fc, finalCutLines: fcl } = finalizeResults(
      roundingResults,
      truckDecisions || {},
      [],
      transportDecisions,
      cutLineNotes || {},
      unmatchedRows,
      truckAdditions || {},
    );

    // Finalize milk runs
    const mrCandidates = roundingResults?.milkRunCandidates || [];
    const { confirmedMilkRunTrucks, milkRunCutLines } = finalizeMilkRunDecisions(
      mrCandidates,
      milkRunDecisions || {},
      weekNum,
    );

    setFinalConfirmed([...fc, ...confirmedMilkRunTrucks]);
    setFinalCutLines([...fcl, ...milkRunCutLines]);
    setStep(STEP_RESULTS);
  }, [roundingResults, reviewDecisions, milkRunDecisions, unmatchedRows, weekNum]);

  const handleStartOver = useCallback(() => {
    setStep(STEP_SETUP);
    setRoundingResults(null);
    setUnmatchedRows([]);
    setReviewDecisions(null);
    setMilkRunDecisions(null);
    setFinalConfirmed([]);
    setFinalCutLines([]);
    setWeekNum(null);
    setYear(null);
  }, []);

  return (
    <div>
      <ProgressBar currentStep={step} steps={STEPS} />
      <div className="max-w-5xl mx-auto px-6 py-8">
        {step === STEP_SETUP && (
          <SetupStep
            airtableData={airtableData}
            onDataRefresh={handleDataRefresh}
            onNext={handleSetupNext}
          />
        )}
        {step === STEP_UPLOAD && (
          <UploadStep
            airtableData={airtableData}
            onRoundingComplete={handleRoundingComplete}
            onBack={() => setStep(STEP_SETUP)}
            isBedsAndAcc={isBedsAndAcc}
          />
        )}
        {step === STEP_REVIEW && roundingResults && (
          <ReviewStep
            roundingResults={roundingResults}
            unmatchedRows={unmatchedRows}
            onConfirm={handleReviewConfirm}
            onBack={() => setStep(STEP_UPLOAD)}
          />
        )}
        {step === STEP_MILKRUN && roundingResults && (
          <MilkRunStep
            milkRunCandidates={roundingResults.milkRunCandidates || []}
            weekNum={weekNum}
            onConfirm={handleMilkRunConfirm}
            onBack={() => setStep(STEP_REVIEW)}
          />
        )}
        {step === STEP_TRANSPORT && roundingResults && (
          <TransportModeStep
            confirmedTrucks={confirmedContainersForTransport}
            costMap={airtableData?.costMap || {}}
            onConfirm={handleTransportConfirm}
            onBack={() => setStep(STEP_MILKRUN)}
          />
        )}
        {step === STEP_RESULTS && (
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
