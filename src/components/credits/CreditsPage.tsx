import { CreditsUsageWithEmail } from "@/lib/supabase/credits_usage/selectCreditsUsage";
import CreditsRow from "./CreditsRow";

interface CreditsPageProps {
  creditsUsage: CreditsUsageWithEmail[];
}

const CreditsPage = ({ creditsUsage }: CreditsPageProps) => {
  // Sort by remaining credits (ascending) - most used at top, least used at bottom
  const sortedCreditsUsage = [...creditsUsage].sort(
    (a, b) => a.remaining_credits - b.remaining_credits
  );

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Credits</h1>
      <div className="space-y-4">
        {sortedCreditsUsage.length === 0 ? (
          <p className="text-gray-500">No credits usage data available</p>
        ) : (
          sortedCreditsUsage.map((usage, index) => (
            <CreditsRow key={usage.id} usage={usage} rank={index + 1} />
          ))
        )}
      </div>
    </div>
  );
};

export default CreditsPage;
