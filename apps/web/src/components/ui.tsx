import { forwardRef, type ComponentProps } from "react";
import { Button as ShadcnButton } from "./ui/button";
import { Card as ShadcnCard } from "./ui/card";
import { Badge as ShadcnBadge } from "./ui/badge";
import { Avatar as ShadcnAvatar, AvatarFallback } from "./ui/avatar";
import { Progress as ShadcnProgress } from "./ui/progress";
import { cn } from "../lib/utils";

type LegacyButtonProps = Omit<ComponentProps<typeof ShadcnButton>, "variant"> & {
  variant?: ComponentProps<typeof ShadcnButton>["variant"] | "primary";
};

export const Button = forwardRef<HTMLButtonElement, LegacyButtonProps>(({ className, variant = "primary", ...props }, ref) => {
  const mappedVariant: ComponentProps<typeof ShadcnButton>["variant"] =
    variant === "primary" ? "default" : variant === "secondary" ? "outline" : variant;
  return (
    <ShadcnButton
      ref={ref}
      className={className}
      variant={mappedVariant}
      {...props}
    />
  );
});
Button.displayName = "Button";

export const Card = forwardRef<HTMLDivElement, ComponentProps<typeof ShadcnCard>>(
  ({ className, ...props }, ref) => (
    <ShadcnCard ref={ref} className={cn("border border-border/80 shadow-[0_1px_2px_rgba(22,35,28,.03),0_12px_32px_rgba(22,35,28,.04)]", className)} {...props} />
  ),
);
Card.displayName = "Card";

type Tone = "neutral" | "green" | "amber" | "red" | "blue";
type BadgeProps = ComponentProps<typeof ShadcnBadge> & { tone?: Tone };

export function Badge({ children, tone = "neutral", className, ...props }: BadgeProps) {
  const tones: Record<Tone, string> = {
    neutral: "bg-muted text-muted-foreground",
    green: "bg-accent-soft text-accent-dark",
    amber: "bg-warning-soft text-warning",
    red: "bg-destructive-soft text-destructive",
    blue: "bg-info-soft text-info",
  };
  return (
    <ShadcnBadge className={cn("rounded-full border-0 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.08em]", tones[tone], className)} {...props}>
      {children}
    </ShadcnBadge>
  );
}

type AvatarProps = Omit<ComponentProps<typeof ShadcnAvatar>, "children"> & { initials: string };
export function Avatar({ initials, className, ...props }: AvatarProps) {
  return (
    <ShadcnAvatar className={cn("size-9 rounded-xl border border-border", className)} {...props}>
      <AvatarFallback className="rounded-xl bg-accent-soft text-accent-dark text-[11px] font-bold">
        {initials}
      </AvatarFallback>
    </ShadcnAvatar>
  );
}

export { Input } from "./ui/input";
export { Textarea } from "./ui/textarea";

type ProgressProps = ComponentProps<typeof ShadcnProgress> & { label?: string };
export function Progress({ value, label, ...props }: ProgressProps) {
  return (
    <ShadcnProgress
      value={value}
      aria-label={label}
      className="w-full"
      {...props}
    />
  );
}
