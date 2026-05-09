import ThemeToggle from "./ThemeToggle";

export default function Footer() {
  return (
    <footer className="border-t border-border-darkest pt-2.5 pb-4 px-5">
      <div className="relative flex items-center justify-center">
        <div className="h-px max-w-[60px] flex-1 bg-gradient-to-r from-transparent to-border-dark" />
        <span className="mx-2.5 font-josefin text-[8px] font-thin uppercase tracking-[0.25em] text-text-darkest">
          m &middot; m &middot; r
        </span>
        <div className="h-px max-w-[60px] flex-1 bg-gradient-to-l from-transparent to-border-dark" />
        <div className="absolute right-0 top-1/2 -translate-y-1/2">
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
