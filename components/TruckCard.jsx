'use client';

/** Reusable truck detail card used in ReviewStep and OverrideStep */
export default function TruckCard({ truck, mode, onKeep, onCut, onForceKeep, userDecision }) {
  const utilPct = (truck.usedFraction * 100).toFixed(1);
  const utilColor = truck.usedFraction >= 0.8
    ? '#4caf50'
    : truck.usedFraction >= 0.5
      ? '#ff9800'
      : '#f44336';

  return (
    <div className="bg-white border border-[#e8e0db] rounded-card shadow-card p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs text-[#8a7e78] mb-0.5">Vendor Shipment Number</p>
          <p className="text-base font-bold text-[#403833] font-mono">{truck.vendorShipmentNumber}</p>
          <p className="text-sm text-[#8a7e78] mt-1">
            {truck.origin} → {truck.destination}
          </p>
        </div>
        {mode === 'override' && truck.cutReason && (
          <div className="ml-4 px-2 py-1 bg-red-50 border border-[#f44336] rounded-btn text-xs text-[#f44336] max-w-[240px] text-right">
            {truck.cutReason}
          </div>
        )}
      </div>

      {/* Lines table */}
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-[#403833] text-white">
              <th className="text-left p-2 rounded-tl-sm">SKU</th>
              <th className="text-right p-2">Qty (pcs)</th>
              <th className="text-right p-2">Pallets</th>
              <th className="text-center p-2">Prio</th>
              <th className="text-right p-2 rounded-tr-sm">Line Fill %</th>
            </tr>
          </thead>
          <tbody>
            {truck.lines.map((line, i) => (
              <tr
                key={i}
                className={`border-b border-[#e8e0db] ${i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'}`}
              >
                <td className="p-2 font-mono text-[#403833]">{line.sku}</td>
                <td className="p-2 text-right text-[#403833]">{line.qty.toLocaleString()}</td>
                <td className="p-2 text-right text-[#8a7e78]">{line.pallets > 0 ? line.pallets : '—'}</td>
                <td className="p-2 text-center">
                  <PrioBadge prio={line.priority} />
                </td>
                <td className="p-2 text-right text-[#403833]">{(line.lineFraction * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary bar */}
      <div className="bg-[#fafafa] border border-[#e8e0db] rounded-btn p-3 mb-4">
        {/* Utilization bar */}
        <div className="mb-2">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-[#8a7e78]">Truck Utilization</span>
            <span className="font-semibold" style={{ color: utilColor }}>{utilPct}%</span>
          </div>
          <div className="w-full bg-[#e8e0db] rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(100, parseFloat(utilPct))}%`,
                backgroundColor: utilColor,
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-[#8a7e78]">Total Pieces</p>
            <p className="font-semibold text-[#403833]">
              {truck.lines.reduce((s, l) => s + l.qty, 0).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-[#8a7e78]">Transport Cost</p>
            <p className="font-semibold text-[#403833]">
              {truck.transportCost != null ? `€${truck.transportCost.toFixed(2)}` : '—'}
            </p>
          </div>
          <div>
            <p className="text-[#8a7e78]">Cost per Piece</p>
            <p
              className="font-bold"
              style={{
                color: truck.costPerPiece != null
                  ? truck.costPerPiece > 20 ? '#f44336' : truck.costPerPiece >= 10 ? '#ff9800' : '#4caf50'
                  : '#8a7e78',
              }}
            >
              {truck.costPerPiece != null ? `€${truck.costPerPiece.toFixed(2)}` : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      {mode === 'review' && (
        <div className="flex gap-3">
          <button
            onClick={() => onKeep(truck.vendorShipmentNumber)}
            className={`
              flex-1 py-2 rounded-btn text-sm font-semibold transition-colors
              ${userDecision === 'keep'
                ? 'bg-[#4caf50] text-white'
                : 'bg-green-50 text-[#4caf50] border border-[#4caf50] hover:bg-[#4caf50] hover:text-white'
              }
            `}
          >
            {userDecision === 'keep' ? '✓ Kept' : 'Keep'}
          </button>
          <button
            onClick={() => onCut(truck.vendorShipmentNumber)}
            className={`
              flex-1 py-2 rounded-btn text-sm font-semibold transition-colors
              ${userDecision === 'cut'
                ? 'bg-[#f44336] text-white'
                : 'bg-red-50 text-[#f44336] border border-[#f44336] hover:bg-[#f44336] hover:text-white'
              }
            `}
          >
            {userDecision === 'cut' ? '✗ Cut' : 'Cut'}
          </button>
        </div>
      )}

      {mode === 'override' && (
        <div className="flex justify-end">
          <button
            onClick={() => onForceKeep(truck.vendorShipmentNumber)}
            className="px-4 py-2 border-2 border-[#ffa236] text-[#ffa236] rounded-btn text-sm font-semibold hover:bg-[#ffa236] hover:text-white transition-colors"
          >
            ⚡ Force Keep (Urgent Stock)
          </button>
        </div>
      )}
    </div>
  );
}

function PrioBadge({ prio }) {
  const colors = {
    1: 'bg-green-100 text-green-800',
    2: 'bg-blue-100 text-blue-800',
    3: 'bg-orange-100 text-orange-800',
    4: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-semibold ${colors[prio] || colors[4]}`}>
      P{prio}
    </span>
  );
}
