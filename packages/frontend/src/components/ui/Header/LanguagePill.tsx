function ChevronDownIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function LanguagePill() {
  return (
    <button
      aria-label="Select language"
      className="h-8 px-2 inline-flex items-center gap-1 rounded text-[11px] font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 transition-colors"
    >
      EN
      <ChevronDownIcon />
    </button>
  );
}
