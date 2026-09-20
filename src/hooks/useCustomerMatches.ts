import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { likeTerm } from "@/lib/dateRange";

/**
 * Ids of customers whose name matches the search term.
 *
 * The admin lists let you search by customer name, but that name lives on a
 * joined table and PostgREST can't OR across an embedded resource. So the
 * matching customers are resolved first and the list query then matches either
 * its own text column or `customer_id.in.(...)`.
 *
 * Returns null when no search is active. Capped at 50 customers — beyond that
 * the term is too broad to be a useful search anyway.
 */
export function useCustomerMatches(term: string) {
  const [ids, setIds] = useState<string[] | null>(null);

  useEffect(() => {
    const trimmed = term.trim();
    if (!trimmed) {
      setIds(null);
      return;
    }

    let cancelled = false;
    supabase
      .from("customers")
      .select("id")
      .or(
        [
          `company_name.ilike.${likeTerm(trimmed)}`,
          `contact_person.ilike.${likeTerm(trimmed)}`,
          `customer_code.ilike.${likeTerm(trimmed)}`,
        ].join(",")
      )
      .limit(50)
      .then(({ data }) => {
        if (!cancelled) setIds((data ?? []).map((row) => row.id));
      });

    return () => {
      cancelled = true;
    };
  }, [term]);

  return ids;
}
