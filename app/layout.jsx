import './globals.css';

export const metadata = {
  title: 'Truck Rounding Tool',
  description: 'Round PO quantities into full trucks and containers',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="h-13 bg-[#403833] sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-6 h-13 flex items-center justify-between" style={{height:'52px'}}>
            <div className="flex items-center gap-2.5">
              <svg className="w-5 h-5 text-[#ffa236]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M1 3h15v13H1V3zm15 4h4l3 3v6h-7V7zM5 19a2 2 0 100-4 2 2 0 000 4zm14 0a2 2 0 100-4 2 2 0 000 4z" />
              </svg>
              <span className="text-white font-semibold text-sm tracking-tight">Truck Rounding</span>
            </div>
            <span className="text-white/40 text-xs hidden sm:block">Emma Sleep · Transportation D2C Ops</span>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
