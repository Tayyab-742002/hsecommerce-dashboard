import { Outlet, useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import Spinner from "@/components/Spinner";
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
        <Spinner size="lg" />
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
      <header className="border-b border-border bg-card/95 backdrop-blur-sm sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4 py-3.5 flex items-center justify-between max-w-7xl">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl shadow-sm">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-lg font-bold tracking-tight">HSEcommerce</h1>
          </div>
          <Button variant="ghost" onClick={handleLogout} className="rounded-xl">
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-5 sm:px-6 sm:py-6 max-w-7xl md:pt-16 pb-20 md:pb-6">
        <Outlet />
      </main>

      {/* Bottom Navigation (Mobile) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-sm border-t border-border shadow-lg">
        <div className="flex items-center justify-around p-2">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-200",
                  isActive
                    ? "text-primary bg-primary/10 shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
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
      <nav className="hidden md:block fixed top-[4.25rem] left-0 right-0 bg-card/95 backdrop-blur-sm border-b border-border shadow-sm z-10">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="flex gap-1">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 px-4 py-3.5 text-sm font-medium transition-all duration-200 border-b-2 rounded-t-xl",
                    isActive
                      ? "border-primary text-primary bg-primary/5 shadow-sm"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
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
