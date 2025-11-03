import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";

export interface UserRole {
  role: 'super_admin' | 'warehouse_manager' | 'warehouse_staff' | 'customer_admin' | 'customer_user';
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
        .from('user_roles')
        .select('role, customer_id')
        .eq('user_id', userId)
        .single();

      if (error) throw error;
      setUserRole(data);
    } catch (error) {
      console.error('Error fetching user role:', error);
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = () => {
    return userRole?.role === 'super_admin' || 
           userRole?.role === 'warehouse_manager' || 
           userRole?.role === 'warehouse_staff';
  };

  const isCustomer = () => {
    return userRole?.role === 'customer_admin' || 
           userRole?.role === 'customer_user';
  };

  return { user, userRole, loading, isAdmin, isCustomer };
}
