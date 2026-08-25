export default function Home() {
  return (
    <main className="min-h-screen bg-white text-gray-900 flex flex-col justify-between p-8 md:p-16 max-w-5xl mx-auto">
      {/* Header */}
      <header className="flex justify-between items-center py-4">
        <span className="font-semibold text-lg tracking-tight">Ntalo</span>
        <a
          href="#early-access"
          className="text-sm font-medium px-4 py-2 rounded-md bg-gray-900 text-white hover:bg-gray-800 transition"
        >
          Get early access
        </a>
      </header>

      {/* Hero Section */}
      <section className="my-auto py-16">
        <h1 className="text-4xl md:text-6xl font-semibold tracking-tight leading-tight max-w-2xl">
          Speak better where it matters.
        </h1>
        <p className="mt-6 text-lg md:text-xl text-gray-600 max-w-xl">
          Practice spoken English for job interviews and workplace conversations. Get measurable feedback every day.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-4 items-start">
          <a
            id="early-access"
            href="#early-access"
            className="px-6 py-3 rounded-md bg-gray-900 text-white font-medium hover:bg-gray-800 transition"
          >
            Join early access
          </a>
        </div>
      </section>

      {/* Product Loop Summary */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-6 py-12 border-t border-gray-100 text-sm">
        <div>
          <div className="font-medium text-gray-900">1. Assess</div>
          <div className="text-gray-500 mt-1">3-minute baseline</div>
        </div>
        <div>
          <div className="font-medium text-gray-900">2. AI Practice</div>
          <div className="text-gray-500 mt-1">10-minute daily drills</div>
        </div>
        <div>
          <div className="font-medium text-gray-900">3. Feedback</div>
          <div className="text-gray-500 mt-1">Actionable metrics</div>
        </div>
        <div>
          <div className="font-medium text-gray-900">4. Peer Practice</div>
          <div className="text-gray-500 mt-1">Scheduled 1-to-1 audio</div>
        </div>
      </section>

      {/* Footer */}
      <footer className="text-xs text-gray-400 py-6 border-t border-gray-100">
        © 2026 Ntalo. All rights reserved.
      </footer>
    </main>
  );
}
