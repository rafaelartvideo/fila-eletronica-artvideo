import { ExternalLink, QrCode } from 'lucide-react';
import { createQrMatrix } from '../../lib/qr';

export function trackingUrl(token: string) {
  return `${window.location.origin}/acompanhar/${token}`;
}

export function TicketTrackingQr({ token, compact = false }: { token: string; compact?: boolean }) {
  const url = trackingUrl(token);
  let matrix: boolean[][] | null = null;
  try { matrix = createQrMatrix(url); } catch {}
  const quiet = 4;
  const size = (matrix?.length ?? 41) + quiet * 2;
  const path = matrix
    ? matrix.flatMap((row, y) => row.map((dark, x) => dark ? `M${x + quiet} ${y + quiet}h1v1h-1z` : '')).join('')
    : '';

  return <div className={`tracking-qr-card no-print ${compact ? 'compact' : ''}`}>
    <div className="tracking-qr-visual" aria-label="QR Code para acompanhar a fila">
      {matrix ? <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="QR Code de acompanhamento" shapeRendering="crispEdges">
        <rect width={size} height={size} fill="#fff" />
        <path d={path} fill="#000" />
      </svg> : <QrCode size={38} />}
    </div>
    <div>
      <strong>Acompanhe sua fila</strong>
      <small>Escaneie o QR Code para ver sua posição e receber o alerta da chamada.</small>
      <a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Abrir acompanhamento</a>
    </div>
  </div>;
}
