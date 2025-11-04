import { Outlet, useNavigate, NavLink } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Package,
  LayoutDashboard,
  PackageSearch,
  Users,
  FileText,
  Settings,
  LogOut,
  PackagePlus,
  Menu,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import Spinner from "@/components/Spinner";

const navigation = [
  { name: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { name: "Inventory", href: "/admin/inventory", icon: PackageSearch },
  // { name: 'Receive Items', href: '/admin/receive-inventory', icon: PackagePlus },
  { name: "Orders", href: "/admin/orders", icon: Package },
  { name: "Customers", href: "/admin/customers", icon: Users },
  { name: "Reports", href: "/admin/reports", icon: FileText },
  { name: "Settings", href: "/admin/settings", icon: Settings },
];

export default function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Redirect if not admin
  if (!loading && (!user || !isAdmin())) {
    navigate("/login");
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
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex w-full">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex md:w-64 bg-sidebar border-r border-sidebar-border flex-col shadow-lg">
        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl shadow-sm">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-bold text-sidebar-foreground tracking-tight">
                HSEcommerce
              </h1>
              <p className="text-xs text-sidebar-foreground/60 mt-0.5">
                Admin Portal
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-2">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary text-foreground shadow-md"
                    : "text-white hover:bg-primary/20 hover:text-white"
                )
              }
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              <span>{item.name}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-sidebar-border">
          <Button
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-all duration-200 rounded-xl"
            onClick={handleLogout}
          >
            <LogOut className="mr-3 h-4 w-4" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Sidebar - Mobile Drawer */}
      <div
        className={cn(
          "fixed inset-0 z-40 md:hidden",
          mobileOpen ? "" : "pointer-events-none"
        )}
      >
        {/* Backdrop */}
        <div
          className={cn(
            "absolute inset-0 bg-black/40 transition-opacity",
            mobileOpen ? "opacity-100" : "opacity-0"
          )}
          onClick={() => setMobileOpen(false)}
        />
        {/* Drawer */}
        <aside
          className={cn(
            "absolute left-0 top-0 h-full w-64 bg-sidebar border-r border-sidebar-border flex flex-col transform transition-transform duration-300 ease-out shadow-2xl",
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="p-5 border-b border-sidebar-border">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-primary/10 rounded-xl shadow-sm">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-base font-bold text-sidebar-foreground tracking-tight">
                  HSEcommerce
                </h1>
                <p className="text-xs text-sidebar-foreground/60 mt-0.5">
                  Admin Portal
                </p>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-primary text-foreground shadow-md"
                      : "text-white hover:bg-primary/20 hover:text-white"
                  )
                }
                onClick={() => setMobileOpen(false)}
              >
                <item.icon className="h-4 w-4 flex-shrink-0" />
                <span>{item.name}</span>
              </NavLink>
            ))}
          </nav>

          <div className="p-3 border-t border-sidebar-border">
            <Button
              variant="ghost"
              className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-all duration-200 rounded-xl"
              onClick={() => {
                setMobileOpen(false);
                handleLogout();
              }}
            >
              <LogOut className="mr-3 h-4 w-4" />
              Logout
            </Button>
          </div>
        </aside>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {/* Top bar for mobile */}
        <div className="md:hidden sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border shadow-sm px-4 py-3 flex items-center justify-between">
          <button
            type="button"
            aria-label="Open menu"
            className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-3 py-2 hover:bg-muted transition-colors shadow-sm"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm tracking-tight">
              HSEcommerce
            </span>
          </div>
          <div className="w-12" />
        </div>

        <div className="mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 max-w-7xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
