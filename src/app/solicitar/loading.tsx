export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Skeleton header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-gray-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
          <div className="h-9 w-32 bg-gray-200 rounded animate-pulse" />
          <div className="w-16" />
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8 lg:py-12">
        {/* Skeleton heading */}
        <div className="text-center mb-8">
          <div className="h-9 w-96 max-w-full bg-gray-200 rounded-lg animate-pulse mx-auto mb-3" />
          <div className="h-4 w-80 max-w-full bg-gray-100 rounded animate-pulse mx-auto" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
          {/* Skeleton form */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 space-y-6">
              {/* Garantía toggle */}
              <div className="h-16 bg-purple-50 rounded-xl animate-pulse" />

              {/* Section: Tu información */}
              <div className="space-y-4">
                <div className="h-3 w-28 bg-gray-200 rounded animate-pulse" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="h-12 bg-gray-100 rounded-lg animate-pulse" />
                  <div className="h-12 bg-gray-100 rounded-lg animate-pulse" />
                </div>
                <div className="h-12 bg-gray-100 rounded-lg animate-pulse" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="h-12 bg-gray-100 rounded-lg animate-pulse" />
                  <div className="h-12 bg-gray-100 rounded-lg animate-pulse" />
                </div>
              </div>

              {/* Section: El equipo */}
              <div className="space-y-4">
                <div className="h-3 w-20 bg-gray-200 rounded animate-pulse" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="h-12 bg-gray-100 rounded-lg animate-pulse" />
                  <div className="h-12 bg-gray-100 rounded-lg animate-pulse" />
                </div>
                <div className="h-12 bg-gray-100 rounded-lg animate-pulse" />
                <div className="h-28 bg-gray-100 rounded-lg animate-pulse" />
              </div>

              {/* Section: Calendars */}
              <div className="space-y-4">
                <div className="h-3 w-36 bg-gray-200 rounded animate-pulse" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="h-52 bg-gray-100 rounded-xl animate-pulse" />
                  <div className="h-52 bg-gray-100 rounded-xl animate-pulse" />
                </div>
                <div className="h-20 bg-green-50 rounded-xl animate-pulse" />
              </div>

              {/* Submit button */}
              <div className="h-14 bg-gradient-to-r from-green-200 to-blue-200 rounded-xl animate-pulse" />
            </div>
          </div>

          {/* Skeleton sidebar */}
          <aside className="lg:col-span-2 space-y-5">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="h-5 w-32 bg-gray-200 rounded animate-pulse mb-4" />
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-green-100 animate-pulse shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-4 w-36 bg-gray-200 rounded animate-pulse" />
                      <div className="h-3 w-full bg-gray-100 rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="h-40 bg-white rounded-2xl shadow-sm border border-gray-100 animate-pulse" />
            <div className="h-36 bg-slate-800 rounded-2xl animate-pulse" />
          </aside>
        </div>
      </div>
    </div>
  )
}
