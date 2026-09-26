export function Brand({ light = false }: { light?: boolean }) {
  return <span className={`brand${light ? ' brand-light' : ''}`}><span className="brand-mark">c.</span><span>conectavagasdf</span></span>;
}
