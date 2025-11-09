import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";

export interface UserRole {
  role: "super_admin" | "customer_admin";
  customer_id?: string;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserRole(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserRole(session.user.id);
      } else {
        setUserRole(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role, customer_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        // If error is "PGRST116" (no rows found), that's okay - user might not have a role entry yet
        // This can happen for super_admins or newly created users
        if (error.code !== "PGRST116") {
          throw error;
        }
        // No role found - set to null and continue
        setUserRole(null);
      } else {
        setUserRole(data);
      }
    } catch (error) {
      console.error("Error fetching user role:", error);
      // On error, set userRole to null so the app doesn't break
      setUserRole(null);
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = () => {
    // CRITICAL FIX: Only return true if user has explicit super_admin role
    // Do NOT default to admin for users without a role
    return userRole?.role === "super_admin";
  };

  const isCustomer = () => {
    // Only return true if user has explicit customer_admin role
    return userRole?.role === "customer_admin";
  };

  return { user, userRole, loading, isAdmin, isCustomer };
}
