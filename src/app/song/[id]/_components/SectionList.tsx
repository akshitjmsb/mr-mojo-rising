import type { Database } from "@/lib/database.types";
import { formatTime, getSectionColor } from "./sections";

type Section = Database["public"]["Tables"]["sections"]["Row"];

interface Props {
  sections: Section[];
  activeSection: Section | null;
  onSelect: (section: Section) => void;
}

export default function SectionList({ sections, activeSection, onSelect }: Props) {
  return (
    <div className="px-5 pb-6">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="font-josefin text-[9px] font-thin uppercase tracking-[0.2em] text-text-muted">
          Sections
        </p>
      </div>

      <div className="flex flex-col gap-[5px]">
        {sections.map((section) => {
          const isActive = activeSection?.id === section.id;
          const color = getSectionColor(section.label);
          return (
            <button
              key={section.id}
              onClick={() => onSelect(section)}
              className="flex w-full cursor-pointer items-center justify-between rounded-[2px] border bg-transparent px-4 py-3 text-left transition-colors duration-200"
              style={{
                borderColor: isActive ? color : "var(--color-border-dark)",
                borderLeftWidth: isActive ? 3 : 1,
                borderLeftColor: isActive ? color : "var(--color-border-dark)",
              }}
            >
              <div>
                <p
                  className="font-playfair text-[13px] italic"
                  style={{
                    color: isActive ? color : "var(--color-text-darker)",
                  }}
                >
                  {section.label}
                </p>
                <p className="mt-0.5 font-josefin text-[10px] font-thin tracking-[0.06em] text-text-dark">
                  {formatTime(section.start_time)} &mdash;{" "}
                  {formatTime(section.end_time)}
                </p>
              </div>
              <span className="font-josefin text-[9px] text-text-darkest">
                {formatTime(section.end_time - section.start_time)}
              </span>
            </button>
          );
        })}

        {sections.length === 0 && (
          <p className="py-4 text-center font-josefin text-[11px] font-thin text-text-muted">
            No sections detected yet
          </p>
        )}
      </div>
    </div>
  );
}
