import type { AssistantPetEmotion } from '../model/assistant-pet-contract';

export function RoverVector({ emotion }: { emotion: AssistantPetEmotion }) {
  return (
    <svg className={`rover-vector rover-vector-${emotion}`} viewBox="0 0 512 512" aria-hidden="true">
      <defs>
        <linearGradient id="rover-shell" x1="82" y1="42" x2="420" y2="462" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" /><stop offset="0.55" stopColor="#eef3f8" /><stop offset="1" stopColor="#cfd9e4" />
        </linearGradient>
        <linearGradient id="rover-screen" x1="140" y1="122" x2="374" y2="294" gradientUnits="userSpaceOnUse">
          <stop stopColor="#253449" /><stop offset="0.42" stopColor="#080d17" /><stop offset="1" stopColor="#02050a" />
        </linearGradient>
        <radialGradient id="rover-eye" cx="0.5" cy="0.4" r="0.64">
          <stop stopColor="#e8ffff" /><stop offset="0.36" stopColor="#7ceeff" /><stop offset="0.78" stopColor="#20aee9" /><stop offset="1" stopColor="#0877c8" />
        </radialGradient>
        <filter id="rover-shadow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="12" stdDeviation="10" floodColor="#0b1626" floodOpacity="0.25" />
        </filter>
      </defs>
      <ellipse className="rover-ground-shadow" cx="265" cy="462" rx="132" ry="23" fill="#12223a" opacity="0.18" />
      <g filter="url(#rover-shadow)">
        <g className="rover-arm rover-arm-left">
          <path d="M123 303c-41 4-70 26-77 59-3 16 7 28 22 28 13 0 21-8 26-21 8-22 27-32 53-35Z" fill="url(#rover-shell)" stroke="#b7c4d2" strokeWidth="7" />
          <circle cx="78" cy="367" r="21" fill="#e9f1f7" stroke="#afbdcb" strokeWidth="7" />
          <path d="M57 353c-15-17-33-11-30 5 2 13 13 16 25 13M75 345c-4-21 14-29 25-18 8 9 2 20-8 25" fill="none" stroke="#b4c1cd" strokeWidth="8" strokeLinecap="round" />
        </g>
        <g className="rover-arm rover-arm-wave">
          <path d="M387 302c43 4 70 29 76 60 3 15-7 28-22 28-13 0-21-8-26-21-8-22-27-32-53-35Z" fill="url(#rover-shell)" stroke="#b7c4d2" strokeWidth="7" />
          <circle cx="433" cy="367" r="22" fill="#e9f1f7" stroke="#afbdcb" strokeWidth="7" />
          <path d="M431 351c4-23 24-30 34-16M446 358c17-15 33-4 26 12M445 375c14 6 22 19 12 29" fill="none" stroke="#b4c1cd" strokeWidth="8" strokeLinecap="round" />
        </g>
        <path d="M178 316c8 76 31 130 77 143 47-10 74-67 80-143-39-21-116-21-157 0Z" fill="url(#rover-shell)" stroke="#b7c4d2" strokeWidth="7" />
        <circle cx="256" cy="376" r="30" fill="#18253a" stroke="#aab9c7" strokeWidth="6" />
        <circle className="rover-core" cx="256" cy="376" r="18" fill="#36d8ff" />
        <path d="M189 449c-22 0-38 14-38 30 0 16 20 23 52 21l23-8-7-36c-10-5-19-7-30-7ZM323 449c22 0 38 14 38 30 0 16-20 23-52 21l-23-8 7-36c10-5 19-7 30-7Z" fill="url(#rover-shell)" stroke="#adbbc9" strokeWidth="7" />
        <path d="M153 162c0-79 57-126 128-126 75 0 127 49 127 125v97c0 66-52 105-128 105-76 0-127-40-127-105Z" fill="url(#rover-shell)" stroke="#acbbc9" strokeWidth="8" />
        <path d="M188 146c18-37 54-57 95-57 45 0 81 21 97 58l-5 121c-14 36-49 57-94 57-43 0-78-21-94-57Z" fill="url(#rover-screen)" />
        <path d="M197 153c20-31 52-48 86-48 37 0 68 17 84 48" fill="none" stroke="#91a4b6" strokeOpacity="0.45" strokeWidth="7" strokeLinecap="round" />
        <g className="rover-eye rover-eye-left">
          <ellipse cx="239" cy="209" rx="39" ry="45" fill="url(#rover-eye)" />
          <ellipse cx="239" cy="215" rx="20" ry="27" fill="#06111d" />
          <circle cx="250" cy="198" r="8" fill="#fff" /><circle cx="231" cy="225" r="4" fill="#d6ffff" />
        </g>
        <g className="rover-eye rover-eye-right">
          <ellipse cx="327" cy="209" rx="39" ry="45" fill="url(#rover-eye)" />
          <ellipse cx="327" cy="215" rx="20" ry="27" fill="#06111d" />
          <circle cx="338" cy="198" r="8" fill="#fff" /><circle cx="319" cy="225" r="4" fill="#d6ffff" />
        </g>
        <path className="rover-smile" d="M260 270c14 13 31 13 45 0" fill="none" stroke="#67e9ff" strokeWidth="9" strokeLinecap="round" />
        <path d="M341 65l27-33 21 53-31 14Z" fill="url(#rover-shell)" stroke="#adbbc9" strokeWidth="7" strokeLinejoin="round" />
        <path d="M367 51l11 29" stroke="#35d4ff" strokeWidth="7" strokeLinecap="round" />
        <ellipse cx="130" cy="206" rx="20" ry="37" fill="#dae5ee" stroke="#aab8c6" strokeWidth="7" />
        <ellipse cx="130" cy="206" rx="11" ry="24" fill="#37d7ff" />
      </g>
    </svg>
  );
}
