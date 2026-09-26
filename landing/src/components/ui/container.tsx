import { cn } from "@/lib/cn";
import { ReactNode } from "react";

type ContainerProps = {
  children: ReactNode;
  className?: string;
  as?: "div" | "main" | "section" | "header" | "footer";
};

export const Container = ({ children, className, as: Tag = "div" }: ContainerProps) => (
  <Tag className={cn("mx-auto w-full max-w-5xl px-6 sm:px-8", className)}>{children}</Tag>
);
