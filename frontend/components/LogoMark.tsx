interface Props {
  className?: string;
}

export default function LogoMark({ className = 'w-8 h-8' }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      className={className}
      aria-hidden="true"
    >
      <g
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeWidth="6.5"
      >
        <line x1="46" y1="14" x2="46" y2="86" />
        <path d="M 46,50 A 25,25 0 1,1 46,86" />
        <line x1="46" y1="14" x2="14" y2="50" />
        <line x1="14" y1="50" x2="46" y2="86" />
      </g>
      <g fill="currentColor">
        <circle cx="46" cy="14" r="9" />
        <circle cx="14" cy="50" r="9" />
        <circle cx="46" cy="86" r="9" />
      </g>
    </svg>
  );
}
