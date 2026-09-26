import { useEffect, useState } from "react";

const NAV_OFFSET_PX = 120;

/** The last section whose top has crossed the nav line. */
export const useActiveSection = (sectionIds: readonly string[]) => {
  const [activeId, setActiveId] = useState(sectionIds[0] ?? "");

  useEffect(() => {
    const update = () => {
      let current = sectionIds[0] ?? "";

      for (const id of sectionIds) {
        const element = document.getElementById(id);
        if (!element) continue;
        if (element.getBoundingClientRect().top - NAV_OFFSET_PX <= 0) {
          current = id;
        }
      }

      setActiveId(current);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("hashchange", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("hashchange", update);
    };
  }, [sectionIds]);

  return activeId;
};
