export default function MonitorPanel({ title, children, className = "", headerExtra }) {
  return (
    <div
      className={`relative bg-[#020b1a]/60 border border-[#16436e] shadow-[inset_0_0_20px_rgba(0,163,255,0.1)] rounded flex flex-col backdrop-blur-sm overflow-hidden ${className}`}
    >
      <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-[#00f0ff]" />
      <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-[#00f0ff]" />
      <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-[#00f0ff]" />
      <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-[#00f0ff]" />

      {title && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#16436e]/50 bg-gradient-to-r from-[#003666]/30 to-transparent">
          <div className="flex items-center">
            <div className="w-1 h-3.5 bg-[#00f0ff] mr-2 shadow-[0_0_8px_#00f0ff]" />
            <span className="text-[#00f0ff] text-sm font-bold tracking-widest">{title}</span>
          </div>
          {headerExtra && <div>{headerExtra}</div>}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 relative">{children}</div>
    </div>
  );
}
