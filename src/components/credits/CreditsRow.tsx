import { CreditsUsageWithEmail } from "@/lib/supabase/credits_usage/selectCreditsUsage";
import { getBackgroundColor } from "@/lib/credits/getBackgroundColor";
import CreditsRowHeader from "./CreditsRowHeader";
import CreditsRowSummary from "./CreditsRowSummary";

interface CreditsRowProps {
  usage: CreditsUsageWithEmail;
  rank: number;
}

const CreditsRow = ({ usage, rank }: CreditsRowProps) => {
  return (
    <div className={`border rounded-lg p-4 ${getBackgroundColor(rank)}`}>
      <CreditsRowHeader usage={usage} rank={rank} />
      <CreditsRowSummary usage={usage} />
    </div>
  );
};

export default CreditsRow;
