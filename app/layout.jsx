import './globals.css';

export const metadata = {
  title: 'Truck Rounding Tool',
  description: 'Round PO quantities into full trucks and containers',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="sticky top-0 z-50 bg-gradient-to-b from-[#2e2219] to-[#403833] border-b border-[#1e170f]/60">
          <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-1.5">
                {/* Truck */}
                <div className="w-7 h-7 rounded-lg bg-[#ffa236]/15 flex items-center justify-center">
                  <svg className="w-4 h-4 text-[#ffa236]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                      d="M1 3h15v13H1V3zm15 4h4l3 3v6h-7V7zM5 19a2 2 0 100-4 2 2 0 000 4zm14 0a2 2 0 100-4 2 2 0 000 4z" />
                  </svg>
                </div>
                {/* Boat */}
                <div className="w-7 h-7 rounded-lg bg-[#ffa236]/10 flex items-center justify-center">
                  <svg className="w-4 h-4 text-[#ffa236]/80" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                      d="M2 20c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0M12 3v11M5 14l7-4 7 4M9 8h6" />
                  </svg>
                </div>
                {/* Bed */}
                <div className="w-7 h-7 rounded-lg bg-[#ffa236]/10 flex items-center justify-center">
                  <svg className="w-4 h-4 text-[#ffa236]/80" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                      d="M3 7v10M21 7v10M3 12h18M3 17h18M7 12V9a2 2 0 012-2h6a2 2 0 012 2v3" />
                  </svg>
                </div>
              </div>
              <span className="text-white font-semibold text-[15px] tracking-tight">Truck Rounding</span>
            </div>
            <span className="text-white/35 text-xs hidden sm:block tracking-wide">Emma Sleep · D2C Ops</span>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
