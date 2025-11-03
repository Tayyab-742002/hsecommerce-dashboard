-- Add sample inventory items
INSERT INTO inventory_items (
  item_code, customer_id, warehouse_id, item_name, description, category, 
  quantity, weight, dimension_length, dimension_width, dimension_height,
  status, received_date, declared_value
) 
SELECT 
  'ITM00001', c.id, w.id, 
  'Office Furniture Set', 'Complete office desk and chair set', 'furniture', 
  5, 45.5, 120, 80, 75, 'in_stock', '2024-11-15'::DATE, 1500.00
FROM customers c, warehouses w
WHERE c.customer_code = 'CUST001' AND w.warehouse_code = 'WH001'
UNION ALL
SELECT 
  'ITM00002', c.id, w.id, 
  'Electronic Equipment', 'Laptops and monitors', 'electronics', 
  10, 15.2, 50, 40, 10, 'in_stock', '2024-11-20'::DATE, 8000.00
FROM customers c, warehouses w
WHERE c.customer_code = 'CUST001' AND w.warehouse_code = 'WH001'
UNION ALL
SELECT 
  'ITM00003', c.id, w.id, 
  'Shipping Boxes', 'Cardboard boxes with documents', 'documents', 
  25, 8.5, 40, 30, 30, 'in_stock', '2024-11-25'::DATE, 500.00
FROM customers c, warehouses w
WHERE c.customer_code = 'CUST001' AND w.warehouse_code = 'WH001'
UNION ALL
SELECT 
  'ITM00004', c.id, w.id, 
  'Textile Goods', 'Clothing and fabric materials', 'clothing', 
  50, 12.0, 60, 40, 40, 'in_stock', '2024-12-01'::DATE, 2500.00
FROM customers c, warehouses w
WHERE c.customer_code = 'CUST001' AND w.warehouse_code = 'WH001'
UNION ALL
SELECT 
  'ITM00005', c.id, w.id, 
  'Industrial Parts', 'Machine components and spare parts', 'industrial', 
  15, 35.0, 80, 60, 50, 'in_stock', '2024-12-05'::DATE, 5000.00
FROM customers c, warehouses w
WHERE c.customer_code = 'CUST001' AND w.warehouse_code = 'WH001';

-- Add sample outbound orders
INSERT INTO outbound_orders (
  order_number, customer_id, warehouse_id, order_type, priority,
  requested_date, status, total_items, delivery_contact_name, delivery_contact_phone
) 
SELECT 
  'OUT-2024-00001', c.id, w.id,
  'delivery', 'normal', '2024-12-10'::DATE, 'pending', 2, 'John Doe', '+92-300-1234567'
FROM customers c, warehouses w
WHERE c.customer_code = 'CUST001' AND w.warehouse_code = 'WH001'
UNION ALL
SELECT 
  'OUT-2024-00002', c.id, w.id,
  'pickup', 'high', '2024-12-12'::DATE, 'approved', 1, 'Jane Smith', '+92-300-9876543'
FROM customers c, warehouses w
WHERE c.customer_code = 'CUST001' AND w.warehouse_code = 'WH001'
UNION ALL
SELECT 
  'OUT-2024-00003', c.id, w.id,
  'delivery', 'urgent', '2024-12-08'::DATE, 'picking', 3, 'Mike Johnson', '+92-321-5555555'
FROM customers c, warehouses w
WHERE c.customer_code = 'CUST001' AND w.warehouse_code = 'WH001';