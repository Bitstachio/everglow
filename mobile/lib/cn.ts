import { clsx, type ClassValue } from "clsx";

/** Join conditional NativeWind class names. */
export const cn = (...inputs: ClassValue[]) => clsx(inputs);
