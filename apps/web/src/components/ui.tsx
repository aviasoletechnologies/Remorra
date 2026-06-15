import React, { forwardRef } from "react";
import { motion } from "framer-motion";
import { Button as ShadcnButton } from "./ui/button";
import { Card as ShadcnCard } from "./ui/card";
import { Badge as ShadcnBadge } from "./ui/badge";
import { Avatar as ShadcnAvatar, AvatarFallback } from "./ui/avatar";
import { Progress as ShadcnProgress } from "./ui/progress";

const MotionButton = motion.create(ShadcnButton);
const MotionCard = motion.create(ShadcnCard);

// Motion-enhanced button wrapping shadcn Button
export const Button = forwardRef<HTMLButtonElement, any>(({ className, variant = "primary", ...props }, ref) => {
  const mappedVariant = variant === "primary" ? "default" : variant === "secondary" ? "outline" : variant;
  return (
    <MotionButton 
      ref={ref}
      whileTap={{ scale: 0.97 }} 
      whileHover={{ scale: 1.01 }} 
      className={className} 
      variant={mappedVariant} 
      {...props} 
    />
  );
});

// Motion-enhanced card wrapping shadcn Card
export const Card = forwardRef<HTMLDivElement, any>(({ className, ...props }, ref) => {
  return (
    <MotionCard
      ref={ref}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={className}
      {...props}
    />
  );
});

// Custom Badge wrapping shadcn Badge
export function Badge({ children, tone = "neutral", ...props }: any) {
  let colorClass = "";
  if (tone === "neutral") colorClass = "bg-[#eceeea] text-[#667269] hover:bg-[#eceeea]/80";
  if (tone === "green") colorClass = "bg-accent-soft text-[#296344] hover:bg-accent-soft/80";
  if (tone === "amber") colorClass = "bg-amber-soft text-amber hover:bg-amber-soft/80";
  if (tone === "red") colorClass = "bg-red-soft text-red hover:bg-red-soft/80";
  if (tone === "blue") colorClass = "bg-blue-soft text-blue hover:bg-blue-soft/80";

  return (
    <ShadcnBadge className={`${colorClass} px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wide uppercase border-none`} {...props}>
      {children}
    </ShadcnBadge>
  );
}

// Custom Avatar wrapping shadcn Avatar
export function Avatar({ initials, ...props }: any) {
  return (
    <ShadcnAvatar className="w-8 h-8 rounded-full border border-border-remorra" {...props}>
      <AvatarFallback className="bg-[#ddefdf] text-[#184c35] text-[10px] font-bold">
        {initials}
      </AvatarFallback>
    </ShadcnAvatar>
  );
}

export { Input } from "./ui/input";
export { Textarea } from "./ui/textarea";

// Custom Progress wrapping shadcn Progress
export function Progress({ value, label, ...props }: any) {
  return (
    <ShadcnProgress
      value={value}
      aria-label={label}
      className="w-full"
      {...props}
    />
  );
}
