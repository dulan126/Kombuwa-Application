// A template re-renders (remounts) on every navigation, unlike a layout. Wrapping
// children in `.page-fade` gives a subtle fade on each route change. This is a
// plain server component — no client JS, no effects.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-fade">{children}</div>;
}
