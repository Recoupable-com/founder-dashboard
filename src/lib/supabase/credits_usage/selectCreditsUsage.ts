import { supabase, supabaseAdmin } from "@/lib/supabase";
import { Tables } from "@/lib/supabase/database.types";

export type CreditsUsage = Tables<"credits_usage">;

export type CreditsUsageWithEmail = CreditsUsage & {
  email: string | null;
};

interface SelectCreditsUsageParams {
  account_id?: string;
  timestampAfter?: string;
}

export const selectCreditsUsage = async (
  params?: SelectCreditsUsageParams
): Promise<CreditsUsageWithEmail[]> => {
  let query = supabaseAdmin
    .from("credits_usage")
    .select(`
      *,
      accounts!inner(
        account_emails!inner(email)
      )
    `)
    .order("timestamp", { ascending: false })
    .limit(100);

  if (params?.account_id) {
    query = query.eq("account_id", params.account_id);
  }

  if (params?.timestampAfter) {
    query = query.gte("timestamp", params.timestampAfter);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error selecting credits usage:", error);
    throw error;
  }

  // Transform the data to flatten the joined structure
  return data?.map(item => ({
    ...item,
    email: item.accounts?.account_emails?.[0]?.email || null
  })) || [];
};
