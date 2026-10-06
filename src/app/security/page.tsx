import { LegalPlaceholder } from "../_components/LegalPlaceholder";

// Rendered per request so its scripts carry the CSP nonce (a prerendered page has none, and its scripts are blocked).
export const dynamic = "force-dynamic";
export const metadata = { title: "Security contact" };

export default function Page() {
  return <LegalPlaceholder title="Security contact" />;
}
