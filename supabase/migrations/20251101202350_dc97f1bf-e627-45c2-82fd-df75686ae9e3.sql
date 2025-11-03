-- =====================================================
-- 3PL WAREHOUSE MANAGEMENT SYSTEM - DATABASE SCHEMA
-- =====================================================

-- Create app_role enum type
CREATE TYPE public.app_role AS ENUM ('super_admin', 'warehouse_manager', 'warehouse_staff', 'customer_admin', 'customer_user');

-- =====================================================
-- CUSTOMERS (must be created first)
-- =====================================================
CREATE TABLE public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_code VARCHAR(50) UNIQUE NOT NULL,
    company_name VARCHAR(255),
    customer_type VARCHAR(20) NOT NULL CHECK (customer_type IN ('individual', 'business')),
    contact_person VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    alternate_phone VARCHAR(20),
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100) DEFAULT 'Pakistan',
    tax_id VARCHAR(50),
    credit_limit DECIMAL(15, 2) DEFAULT 0.00,
    payment_terms VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- USER ROLES TABLE (for role-based access control)
-- =====================================================
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Function to get user's customer_id
CREATE OR REPLACE FUNCTION public.get_user_customer_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT customer_id
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- =====================================================
-- PROFILES TABLE
-- =====================================================
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Trigger to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'first_name', ''),
    COALESCE(new.raw_user_meta_data->>'last_name', '')
  );
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- WAREHOUSES
-- =====================================================
CREATE TABLE public.warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_code VARCHAR(50) UNIQUE NOT NULL,
    warehouse_name VARCHAR(255) NOT NULL,
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100) DEFAULT 'Pakistan',
    total_capacity DECIMAL(15, 2),
    capacity_unit VARCHAR(10) DEFAULT 'sqft' CHECK (capacity_unit IN ('sqft', 'sqm', 'cbm', 'cbft')),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- INVENTORY ITEMS
-- =====================================================
CREATE TABLE public.inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_code VARCHAR(100) UNIQUE NOT NULL,
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE NOT NULL,
    sku VARCHAR(100),
    item_name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    quantity INT NOT NULL DEFAULT 1,
    unit_of_measure VARCHAR(20) DEFAULT 'pcs',
    weight DECIMAL(10, 2),
    weight_unit VARCHAR(10) DEFAULT 'kg' CHECK (weight_unit IN ('kg', 'lbs', 'g')),
    dimension_length DECIMAL(10, 2),
    dimension_width DECIMAL(10, 2),
    dimension_height DECIMAL(10, 2),
    dimension_unit VARCHAR(10) DEFAULT 'cm' CHECK (dimension_unit IN ('cm', 'inch', 'm', 'ft')),
    condition_on_arrival VARCHAR(20) DEFAULT 'good' CHECK (condition_on_arrival IN ('new', 'good', 'fair', 'damaged')),
    current_condition VARCHAR(20) DEFAULT 'good' CHECK (current_condition IN ('new', 'good', 'fair', 'damaged')),
    status VARCHAR(20) DEFAULT 'in_stock' CHECK (status IN ('in_stock', 'reserved', 'picked', 'dispatched', 'returned', 'damaged', 'disposed')),
    received_date DATE NOT NULL,
    barcode VARCHAR(100) UNIQUE,
    qr_code VARCHAR(255) UNIQUE,
    declared_value DECIMAL(15, 2),
    storage_rate DECIMAL(10, 2),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- OUTBOUND ORDERS
-- =====================================================
CREATE TABLE public.outbound_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE NOT NULL,
    order_type VARCHAR(20) DEFAULT 'pickup' CHECK (order_type IN ('pickup', 'delivery', 'return_to_customer')),
    priority VARCHAR(10) DEFAULT 'normal' CHECK (priority IN ('normal', 'high', 'urgent')),
    requested_date DATE NOT NULL,
    scheduled_date DATE,
    completed_date DATE,
    delivery_address_line1 VARCHAR(255),
    delivery_address_line2 VARCHAR(255),
    delivery_city VARCHAR(100),
    delivery_state VARCHAR(100),
    delivery_postal_code VARCHAR(20),
    delivery_country VARCHAR(100),
    delivery_contact_name VARCHAR(100),
    delivery_contact_phone VARCHAR(20),
    total_items INT DEFAULT 0,
    total_quantity INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'picking', 'packed', 'ready', 'in_transit', 'delivered', 'completed', 'cancelled')),
    handling_charges DECIMAL(10, 2) DEFAULT 0.00,
    delivery_charges DECIMAL(10, 2) DEFAULT 0.00,
    total_charges DECIMAL(10, 2) DEFAULT 0.00,
    notes TEXT,
    special_instructions TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.outbound_orders ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- OUTBOUND ORDER ITEMS
-- =====================================================
CREATE TABLE public.outbound_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outbound_order_id UUID REFERENCES public.outbound_orders(id) ON DELETE CASCADE NOT NULL,
    inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE CASCADE NOT NULL,
    quantity INT NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.outbound_order_items ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- Customers: Admins can see all, customers can only see their own
CREATE POLICY "Admins can view all customers"
  ON public.customers FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'warehouse_manager') OR
    public.has_role(auth.uid(), 'warehouse_staff')
  );

CREATE POLICY "Customers can view own data"
  ON public.customers FOR SELECT
  TO authenticated
  USING (id = public.get_user_customer_id(auth.uid()));

-- Profiles: Users can view and update their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

-- Warehouses: Admins can manage, customers can view
CREATE POLICY "Admins can manage warehouses"
  ON public.warehouses FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'warehouse_manager')
  );

CREATE POLICY "All authenticated users can view warehouses"
  ON public.warehouses FOR SELECT
  TO authenticated
  USING (true);

-- Inventory: Admins see all, customers see only their items
CREATE POLICY "Admins can manage all inventory"
  ON public.inventory_items FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'warehouse_manager') OR
    public.has_role(auth.uid(), 'warehouse_staff')
  );

CREATE POLICY "Customers can view own inventory"
  ON public.inventory_items FOR SELECT
  TO authenticated
  USING (customer_id = public.get_user_customer_id(auth.uid()));

-- Outbound Orders: Admins see all, customers see only their orders
CREATE POLICY "Admins can manage all orders"
  ON public.outbound_orders FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'warehouse_manager') OR
    public.has_role(auth.uid(), 'warehouse_staff')
  );

CREATE POLICY "Customers can view own orders"
  ON public.outbound_orders FOR SELECT
  TO authenticated
  USING (customer_id = public.get_user_customer_id(auth.uid()));

CREATE POLICY "Customers can create orders"
  ON public.outbound_orders FOR INSERT
  TO authenticated
  WITH CHECK (customer_id = public.get_user_customer_id(auth.uid()));

-- Outbound Order Items
CREATE POLICY "Users can view order items for accessible orders"
  ON public.outbound_order_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.outbound_orders
      WHERE id = outbound_order_id
      AND (
        public.has_role(auth.uid(), 'super_admin') OR
        public.has_role(auth.uid(), 'warehouse_manager') OR
        public.has_role(auth.uid(), 'warehouse_staff') OR
        customer_id = public.get_user_customer_id(auth.uid())
      )
    )
  );

-- User Roles policies
CREATE POLICY "Admins can manage user roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'warehouse_manager')
  );

CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- =====================================================
-- SEED DATA
-- =====================================================

-- Insert default warehouse
INSERT INTO public.warehouses (warehouse_code, warehouse_name, city, state, country, total_capacity, status)
VALUES ('WH001', 'Main Warehouse', 'Karachi', 'Sindh', 'Pakistan', 10000, 'active');

-- Insert sample customer
INSERT INTO public.customers (customer_code, company_name, customer_type, contact_person, email, phone, city, country, status)
VALUES ('CUST001', 'ABC Trading Co.', 'business', 'John Doe', 'john@abctrading.com', '+92-300-1234567', 'Karachi', 'Pakistan', 'active');