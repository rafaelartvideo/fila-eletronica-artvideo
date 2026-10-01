import { CircleHelp, ClipboardList, Monitor, Settings, ShoppingBag, Smartphone, Wrench, Zap } from 'lucide-react';

const iconMap: Record<string, typeof ClipboardList> = {
  clipboard: ClipboardList,
  repair: Wrench,
  phone: Smartphone,
  computer: Monitor,
  sale: ShoppingBag,
  settings: Settings,
  quick: Zap,
  help: CircleHelp,
};

export const serviceTypeIconOptions = [
  { value: 'clipboard', label: 'Atendimento' },
  { value: 'repair', label: 'Reparo' },
  { value: 'phone', label: 'Celular' },
  { value: 'computer', label: 'Computador / tela' },
  { value: 'sale', label: 'Venda' },
  { value: 'settings', label: 'Configuração' },
  { value: 'quick', label: 'Rápido' },
  { value: 'help', label: 'Ajuda' },
] as const;

export function ServiceTypeIcon({ name, size = 20, className }: { name?: string | null; size?: number; className?: string }) {
  const Icon = iconMap[name || 'clipboard'] ?? ClipboardList;
  return <Icon size={size} className={className} />;
}
