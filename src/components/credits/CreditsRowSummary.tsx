import { CreditsUsageWithEmail } from "@/lib/supabase/credits_usage/selectCreditsUsage";

interface CreditsRowSummaryProps {
  usage: CreditsUsageWithEmail;
}

const CreditsRowSummary = ({ usage }: CreditsRowSummaryProps) => {
  const totalCredits = 333;
  const creditsUsed = totalCredits - usage.remaining_credits;

  return (
    <div className="bg-white/70 rounded-lg p-3 backdrop-blur-sm">
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
            Used
          </div>
          <div className="text-xl font-bold text-red-600">{creditsUsed}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
            Remaining
          </div>
          <div className="text-xl font-bold text-blue-600">
            {usage.remaining_credits}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
            Total
          </div>
          <div className="text-xl font-bold text-gray-700">
            {totalCredits}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreditsRowSummary;
