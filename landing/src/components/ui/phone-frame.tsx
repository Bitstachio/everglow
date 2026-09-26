import { cn } from "@/lib/cn";
import Image from "next/image";

type PhoneFrameProps = {
  src: string;
  alt: string;
  className?: string;
};

/** Device screenshot. Prefer assets that already include a phone chrome. */
export const PhoneFrame = ({ src, alt, className }: PhoneFrameProps) => (
  <figure className={cn("mx-auto w-[min(100%,17.5rem)]", className)}>
    <Image
      src={src}
      alt={alt}
      width={680}
      height={1432}
      className="h-auto w-full"
      sizes="(max-width: 768px) 70vw, 280px"
    />
  </figure>
);
