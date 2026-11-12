import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'peach';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-leaf-600 text-white hover:bg-leaf-700 shadow-soft',
  peach: 'bg-peach-500 text-white hover:bg-peach-600 shadow-soft',
  secondary: 'bg-white text-ink border-2 border-cream-300 hover:border-leaf-500 hover:bg-leaf-50',
  ghost: 'bg-transparent text-ink-soft hover:bg-cream-200',
  danger: 'bg-white text-red-700 border-2 border-red-200 hover:bg-red-50',
};

export function Button({
  variant = 'primary', size = 'md', className = '', children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'min-h-11 px-4 text-base', md: 'min-h-14 px-5 text-lg', lg: 'min-h-16 px-6 text-xl' };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-2xl font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${sizes[size]} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-3xl border border-cream-200 bg-white p-5 shadow-soft md:p-6 ${className}`}>{children}</div>;
}

export function Chip({ children, tone = 'cream', className = '' }: { children: ReactNode; tone?: 'cream' | 'leaf' | 'peach' | 'ink'; className?: string }) {
  const tones = {
    cream: 'bg-cream-100 text-ink-soft border-cream-300',
    leaf: 'bg-leaf-50 text-leaf-700 border-leaf-200',
    peach: 'bg-peach-50 text-peach-700 border-peach-200',
    ink: 'bg-ink text-white border-ink',
  };
  return <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-0.5 text-base font-medium ${tones[tone]} ${className}`}>{children}</span>;
}

export function Toggle({ checked, onChange, label, description, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description?: ReactNode; disabled?: boolean;
}) {
  return (
    <label className={`flex items-start gap-4 rounded-2xl border-2 p-4 ${checked ? 'border-leaf-200 bg-leaf-50' : 'border-cream-200 bg-white'} ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <span className="flex-1">
        <span className="block text-lg font-bold">{label}</span>
        {description && <span className="mt-1 block text-base text-ink-soft">{description}</span>}
      </span>
      <input type="checkbox" className="sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden className={`relative mt-1 h-8 w-14 shrink-0 rounded-full transition-colors ${checked ? 'bg-leaf-500' : 'bg-cream-300'}`}>
        <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? 'left-7' : 'left-1'}`} />
      </span>
      <span className="sr-only">{checked ? '켜짐' : '꺼짐'}</span>
    </label>
  );
}

export function Modal({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="dandi-in max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-cream-50 p-6 outline-none sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-2xl font-extrabold">{title}</h2>
        {children}
        {footer && <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>
  );
}

export function Spinner({ label = '불러오는 중이에요…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-lg text-ink-soft" role="status">
      <span className="flex gap-1.5">
        {[0, 1, 2].map((i) => <span key={i} className="dandi-dot h-2.5 w-2.5 rounded-full bg-leaf-500" style={{ animationDelay: `${i * 0.15}s` }} />)}
      </span>
      {label}
    </div>
  );
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[1.75rem] font-extrabold leading-tight md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-lg text-ink-soft">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function DemoBanner({ children, tone = 'peach' }: { children: ReactNode; tone?: 'peach' | 'leaf' }) {
  return (
    <div className={`flex items-start gap-3 rounded-2xl border-2 border-dashed p-4 text-base ${tone === 'peach' ? 'border-peach-200 bg-peach-50 text-peach-700' : 'border-leaf-200 bg-leaf-50 text-leaf-700'}`}>
      <span aria-hidden className="text-xl leading-none">🎬</span>
      <div>{children}</div>
    </div>
  );
}
