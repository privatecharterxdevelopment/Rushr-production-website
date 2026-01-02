export default function Loading() {
  return (
    <div className="fixed inset-0 bg-white flex items-center justify-center z-50">
      <div className="relative flex items-center justify-center" style={{ width: 72, height: 72 }}>
        {/* Spinning ring */}
        <div
          className="absolute inset-0 rounded-full border-emerald-200 border-t-emerald-600 animate-spin"
          style={{ borderWidth: 3 }}
        />
        {/* Logo in center */}
        <img
          src="https://jtrxdcccswdwlritgstp.supabase.co/storage/v1/object/public/contractor-logos/Rushr%20Logo%20Vector.svg"
          alt="Rushr"
          style={{ width: 44, height: 44 }}
          className="object-contain"
        />
      </div>
    </div>
  )
}
