import CreditsPage from "@/components/credits/CreditsPage";
import { selectCreditsUsage } from "@/lib/supabase/credits_usage/selectCreditsUsage";

export const dynamic = "force-dynamic";

const Credits = async () => {
  try {
    // Calculate timestamp for 1 month ago
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const timestampAfter = oneMonthAgo.toISOString();

    const creditsUsage = await selectCreditsUsage({ timestampAfter });
    return <CreditsPage creditsUsage={creditsUsage} />;
  } catch (error) {
    console.error("Error fetching credits usage:", error);
    return <CreditsPage creditsUsage={[]} />;
  }
};

export default Credits;
