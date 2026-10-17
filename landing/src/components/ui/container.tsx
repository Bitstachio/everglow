import { cn } from "@/lib/cn";
import { ReactNode } from "react";

type ContainerProps = {
  children: ReactNode;
  className?: string;
  as?: "div" | "main" | "section" | "header" | "footer";
};

export const Container = ({ children, className, as: Tag = "div" }: ContainerProps) => (
  <Tag className={cn("mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-8", className)}>{children}</Tag>
);
