import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminInventory from "./pages/admin/Inventory";
import AdminOrders from "./pages/admin/Orders";
import AdminCustomers from "./pages/admin/Customers";
import AdminReports from "./pages/admin/Reports";
import AdminSettings from "./pages/admin/Settings";
import ReceiveInventory from "./pages/admin/ReceiveInventory";
import CustomerLayout from "./pages/customer/CustomerLayout";
import CustomerDashboard from "./pages/customer/CustomerDashboard";
import CustomerInventory from "./pages/customer/CustomerInventory";
import CustomerOrders from "./pages/customer/CustomerOrders";
import CustomerBilling from "./pages/customer/CustomerBilling";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          
          {/* Admin Routes */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="inventory" element={<AdminInventory />} />
            {/* <Route path="receive-inventory" element={<ReceiveInventory />} /> */}
            <Route path="orders" element={<AdminOrders />} />
            <Route path="customers" element={<AdminCustomers />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>

          {/* Customer Routes */}
          <Route path="/customer" element={<CustomerLayout />}>
            <Route index element={<Navigate to="/customer/dashboard" replace />} />
            <Route path="dashboard" element={<CustomerDashboard />} />
            <Route path="inventory" element={<CustomerInventory />} />
            <Route path="orders" element={<CustomerOrders />} />
            <Route path="billing" element={<CustomerBilling />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
