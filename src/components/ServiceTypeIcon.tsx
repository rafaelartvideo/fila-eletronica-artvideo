import { Accessibility, Baby, CircleHelp, ClipboardList, HeartHandshake, Infinity as InfinityIcon, Monitor, Settings, ShoppingBag, Smartphone, Wrench, Zap } from 'lucide-react';

const iconMap: Record<string, typeof ClipboardList> = {
  clipboard: ClipboardList,
  repair: Wrench,
  phone: Smartphone,
  computer: Monitor,
  sale: ShoppingBag,
  settings: Settings,
  quick: Zap,
  help: CircleHelp,
  accessibility: Accessibility,
  neurodiversity: InfinityIcon,
  priority: HeartHandshake,
  family: Baby,
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

export const serviceTypeExtraIconOptions = [
  { value: 'priority', label: 'Atendimento prioritário' },
  { value: 'accessibility', label: 'Acessibilidade' },
  { value: 'neurodiversity', label: 'Autismo / neurodiversidade' },
  { value: 'family', label: 'Gestante / criança' },
] as const;

export function serviceTypeExtraIconLabel(value: string): string {
  return serviceTypeExtraIconOptions.find((option) => option.value === value)?.label ?? 'Informação adicional';
}

export function isServiceTypeImageUrl(value?: string | null): boolean {
  return /^https?:\/\//i.test(String(value ?? '').trim());
}

export function ServiceTypeIcon({ name, size = 20, className }: { name?: string | null; size?: number; className?: string }) {
  const normalized = String(name || 'clipboard').trim();

  if (isServiceTypeImageUrl(normalized)) {
    return <img
      className={['service-type-icon-image', className].filter(Boolean).join(' ')}
      src={normalized}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
    />;
  }

  const Icon = iconMap[normalized] ?? ClipboardList;
  return <Icon size={size} className={className} />;
}
