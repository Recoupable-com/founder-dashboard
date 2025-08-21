import { CreditsUsageWithEmail } from "@/lib/supabase/credits_usage/selectCreditsUsage";
import { getRankBadgeColor } from "@/lib/credits/getRankBadgeColor";

interface CreditsRowHeaderProps {
  usage: CreditsUsageWithEmail;
  rank: number;
}

const CreditsRowHeader = ({ usage, rank }: CreditsRowHeaderProps) => {
  return (
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
          Last Refilled
        </div>
        <div className="text-sm text-gray-600">
          {usage.timestamp
            ? new Date(usage.timestamp).toLocaleDateString()
            : "No date"}
        </div>
      </div>
    </div>
  );
};

export default CreditsRowHeader;
