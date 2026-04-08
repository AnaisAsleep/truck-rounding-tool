import './globals.css';

export const metadata = {
  title: 'Truck Rounding',
  description: 'Round purchase order quantities into full trucks and containers',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="h-12 border-b border-stone-200 flex items-center px-6 bg-white sticky top-0 z-50">
          <div className="max-w-5xl w-full mx-auto flex items-center justify-between">
            <span className="text-sm font-semibold text-stone-900 tracking-tight">
              Truck Rounding
            </span>
            <span className="text-xs text-stone-400 hidden sm:block">
              Emma Sleep · Transportation D2C Ops
            </span>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
