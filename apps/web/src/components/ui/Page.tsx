import type { LucideIcon } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export function Page({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'mx-auto w-full max-w-232.5 px-11 pt-10 pb-13.75 max-tablet:px-6.75 max-tablet:py-7.5 max-compact:px-4.25 max-compact:py-6.25',
        className,
      )}
      {...props}
    />
  );
}
export function PageHeader({
  kicker,
  title,
  description,
  children,
}: {
  kicker: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-7 flex items-center justify-between gap-5 max-compact:gap-2.5">
      <div>
        <span className="text-mini font-medium tracking-[1.5px] text-subtle">{kicker}</span>
        <h1 className="mt-2 mb-2 text-[26px] font-medium tracking-[-0.7px] text-strong max-compact:text-[23px]">
          {title}
        </h1>
        <p className="text-label text-muted">{description}</p>
      </div>
      {children}
    </div>
  );
}
export function SettingsSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section className="mb-7.5">
      <h2 className="mb-2.5 flex items-center gap-2 border-b border-border pb-2.25 text-label font-medium text-foreground">
        {Icon && <Icon size={16} />}
        {title}
      </h2>
      {children}
    </section>
  );
}
export function SettingRow({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: ReactNode;
  description: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3.25 border-b border-border-subtle py-3.75 text-muted max-compact:gap-2.25">
      <Icon size={17} className="max-compact:size-3.5" />
      <span className="min-w-0 flex-1">
        <strong className="block text-label font-[450] text-strong">{title}</strong>
        <small className="mt-1.25 block text-caption leading-[1.8] wrap-anywhere text-muted">
          {description}
        </small>
      </span>
      {children}
    </div>
  );
}
