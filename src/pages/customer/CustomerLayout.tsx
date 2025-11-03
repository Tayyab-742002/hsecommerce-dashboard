import { Outlet, useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Package, LayoutDashboard, PackageSearch, FileText, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const navigation = [
  { name: 'Dashboard', href: '/customer/dashboard', icon: LayoutDashboard },
  { name: 'My Inventory', href: '/customer/inventory', icon: PackageSearch },
  { name: 'Orders', href: '/customer/orders', icon: Package },
  { name: 'Billing', href: '/customer/billing', icon: FileText },
];

export default function CustomerLayout() {
  const { user, loading, isCustomer } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Redirect if not customer
  if (!loading && (!user || !isCustomer())) {
    navigate('/login');
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Logged out",
      description: "You have been logged out successfully",
    });
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Package className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-xl font-bold">Depot Buddy</h1>
          </div>
          <Button variant="ghost" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto p-6">
        <Outlet />
      </main>

      {/* Bottom Navigation (Mobile) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border">
        <div className="flex items-center justify-around p-2">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground"
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Desktop Navigation */}
      <nav className="hidden md:block fixed top-20 left-0 right-0 bg-card border-b border-border">
        <div className="container mx-auto px-4">
          <div className="flex gap-1">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2",
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>
    </div>
  );
}
