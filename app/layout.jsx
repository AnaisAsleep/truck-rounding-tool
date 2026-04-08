import './globals.css';

export const metadata = {
  title: 'Truck Rounding Tool',
  description: 'Round purchase order quantities into full trucks and containers',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {/* Top navigation bar */}
        <header
          style={{ backgroundColor: '#403833' }}
          className="sticky top-0 z-50 shadow-md"
        >
          <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Truck icon */}
              <svg className="w-6 h-6 text-[#ffa236]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M1 3h15v13H1V3zm15 4h4l3 3v6h-7V7zM5 19a2 2 0 100-4 2 2 0 000 4zm14 0a2 2 0 100-4 2 2 0 000 4z" />
              </svg>
              <span className="text-white font-bold text-base tracking-tight">
                Truck Rounding Tool
              </span>
            </div>
            <span className="text-white/50 text-xs hidden sm:block font-normal tracking-wide">
              Emma Sleep · Transportation D2C Ops
            </span>
          </div>
        </header>

        {/* Main content area */}
        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
