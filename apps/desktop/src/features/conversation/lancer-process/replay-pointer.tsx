import "./replay-pointer.css";

// Pointer samples measured from 111.mp4 (SHA-256 bc1e8158…568593).
// Null samples contain no visible pointer; never show one in native sessions.
const POINTER: readonly (readonly [number, number] | null)[] = [
  [761, 623],
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  [760, 622],
  [642, 562],
  [398, 437],
  null,
  null,
  [382, 437],
  [379, 462],
  [379, 462],
  [379, 462],
  [382, 458],
  [391, 447],
  [391, 447],
  [391, 447],
  [391, 447],
  [391, 447],
  [391, 447],
  [391, 447],
  [391, 445],
  [385, 370],
  [383, 339],
  [383, 339],
  [383, 339],
  [383, 339],
  [383, 339],
  [383, 339],
  [383, 339],
  [383, 339],
  [383, 339],
  [383, 339],
  [383, 339],
  [384, 339],
  [615, 406],
  [1090, 543],
  [1119, 552],
  [1119, 552],
  [1119, 552],
  [1039, 558],
  [403, 611],
  [379, 613],
  [379, 613],
  [380, 613],
  [391, 612],
  [391, 612],
  [391, 612],
  [391, 612],
  [391, 612],
  [391, 612],
  [391, 612],
  [391, 612],
  [391, 612],
  [391, 612],
  [391, 612],
  [391, 612],
  [391, 612],
  [391, 612],
  [491, 548],
  [1023, 206],
  null,
  null,
  null,
  null,
  null,
  [1024, 192],
  [501, 385],
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  [471, 463],
  [843, 698],
  [960, 772],
  [961, 773],
  [961, 773],
  [961, 773],
  [961, 773],
  [961, 773],
  [961, 773],
  null,
  null,
  null,
  null,
];
export function ReplayPointer({ seconds }: { readonly seconds: number }) {
  const index = Math.min(POINTER.length - 1, Math.floor(seconds * 2));
  const a = POINTER[index];
  if (!a) return null;
  const b = POINTER[index + 1] ?? a;
  const fraction = Math.min(1, seconds * 2 - index);
  return (
    <svg
      className="process-replay-pointer"
      aria-hidden="true"
      viewBox="0 0 18 24"
      style={{ left: a[0] + (b[0] - a[0]) * fraction, top: a[1] + (b[1] - a[1]) * fraction }}
    >
      <path
        d="M.8.8v16l4.3-4.2 3.6 8.2 3-1.3-3.5-7.8 6.1-.5Z"
        fill="#11151b"
        stroke="white"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}
