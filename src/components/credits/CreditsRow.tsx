import { CreditsUsageWithEmail } from "@/lib/supabase/credits_usage/selectCreditsUsage";
import { getBackgroundColor } from "@/lib/credits/getBackgroundColor";
import { getRankBadgeColor } from "@/lib/credits/getRankBadgeColor";

interface CreditsRowProps {
  usage: CreditsUsageWithEmail;
  rank: number;
}

const CreditsRow = ({ usage, rank }: CreditsRowProps) => {
  const totalCredits = 333;
  const creditsUsed = totalCredits - usage.remaining_credits;

  return (
    <div className={`border rounded-lg p-4 ${getBackgroundColor(rank)}`}>
      {/* Header Row */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${getRankBadgeColor(
              rank
            )}`}
          >
            #{rank}
          </div>
          <div>
            <div className="font-semibold text-gray-900">{usage.email}</div>
            <div className="text-xs text-gray-500 mt-1">
              ID: {usage.account_id}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-semibold text-gray-900"></div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
            Last Refilled Credits
          </div>
          <div className="text-sm text-gray-600">
            {usage.timestamp
              ? new Date(usage.timestamp).toLocaleDateString()
              : "No date"}
          </div>
        </div>
      </div>

      {/* Credits Summary */}
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
    </div>
  );
};

export default CreditsRow;
