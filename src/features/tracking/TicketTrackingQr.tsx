import { useState } from 'react';
import { ExternalLink, Maximize2, QrCode, X } from 'lucide-react';
import { Button, Surface } from '../../components/ui';
import { createQrMatrix } from '../../lib/qr';

export function trackingUrl(token: string) {
  return `${window.location.origin}/acompanhar/${token}`;
}

function QrVisual({ matrix, size, path, large = false }: { matrix: boolean[][] | null; size: number; path: string; large?: boolean }) {
  return <div className={`tracking-qr-visual ${large ? 'large' : ''}`} aria-label="QR Code para acompanhar a fila">
    {matrix ? <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="QR Code de acompanhamento" shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg> : <QrCode size={large ? 76 : 38} />}
  </div>;
}

export function TicketTrackingQr({ token, compact = false }: { token: string; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const url = trackingUrl(token);
  let matrix: boolean[][] | null = null;
  try { matrix = createQrMatrix(url); } catch {}
  const quiet = 4;
  const size = (matrix?.length ?? 41) + quiet * 2;
  const path = matrix
    ? matrix.flatMap((row, y) => row.map((dark, x) => dark ? `M${x + quiet} ${y + quiet}h1v1h-1z` : '')).join('')
    : '';

  return <>
    {compact ? <Button className="tracking-qr-trigger no-print" variant="secondary" type="button" onClick={() => setExpanded(true)}>
      <span className="tracking-qr-trigger-icon"><QrCode size={22} /></span>
      <span><strong>Mostrar QR Code</strong><small>Abra para o cliente escanear e acompanhar a fila.</small></span>
      <Maximize2 size={18} />
    </Button> : <Surface className="tracking-qr-card no-print">
      <QrVisual matrix={matrix} size={size} path={path} />
      <div>
        <strong>Acompanhe sua fila</strong>
        <small>Escaneie o QR Code para ver sua posição e receber o alerta da chamada.</small>
        <div className="tracking-qr-links">
          <Button variant="ghost" size="sm" type="button" onClick={() => setExpanded(true)} startIcon={<Maximize2 size={14} />}>Ampliar QR Code</Button>
          <a className="ui-button ui-button--ghost ui-button--sm" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> <span className="ui-button__label">Abrir acompanhamento</span></a>
        </div>
      </div>
    </Surface>}

    {expanded && <div className="tracking-qr-overlay no-print" onMouseDown={(event) => { if (event.target === event.currentTarget) setExpanded(false); }}>
      <Surface tone="raised" className="tracking-qr-dialog" role="dialog" aria-modal="true" aria-labelledby="tracking-qr-dialog-title">
        <Button className="tracking-qr-dialog-close" variant="ghost" size="sm" iconOnly type="button" aria-label="Fechar QR Code" onClick={() => setExpanded(false)}><X size={21} /></Button>
        <span className="ui-eyebrow">ACOMPANHAMENTO DA FILA</span>
        <h2 id="tracking-qr-dialog-title">Escaneie o QR Code</h2>
        <p>Aponte a câmera do celular para acompanhar a posição da senha e receber o alerta quando for chamada.</p>
        <QrVisual matrix={matrix} size={size} path={path} large />
        <a className="ui-button ui-button--secondary ui-button--sm tracking-qr-dialog-link" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> <span className="ui-button__label">Abrir acompanhamento neste aparelho</span></a>
      </Surface>
    </div>}
  </>;
}
