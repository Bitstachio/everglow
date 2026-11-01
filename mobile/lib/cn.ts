import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Join conditional NativeWind class names and resolve conflicts. */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(...inputs));
