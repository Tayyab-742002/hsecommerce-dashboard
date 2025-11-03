-- Inventory stock validation and adjustment for outbound orders
-- Ensures quantities are validated and decremented atomically on create/update/delete of order items

-- Function: Decrement or increment inventory based on order item changes
create or replace function public.handle_outbound_order_item_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  available_qty integer;
begin
  if NEW.quantity is null or NEW.quantity <= 0 then
    raise exception 'Quantity must be greater than zero' using errcode = '22023';
  end if;

  select quantity into available_qty
  from public.inventory_items
  where id = NEW.inventory_item_id
  for update;

  if available_qty is null then
    raise exception 'Inventory item % not found', NEW.inventory_item_id using errcode = '22023';
  end if;

  if available_qty < NEW.quantity then
    raise exception 'Insufficient stock: available %, requested %', available_qty, NEW.quantity using errcode = '22023';
  end if;

  update public.inventory_items
  set quantity = quantity - NEW.quantity,
      updated_at = now()
  where id = NEW.inventory_item_id;

  return NEW;
end;
$$;

create or replace function public.handle_outbound_order_item_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  available_qty integer;
  delta integer;
begin
  -- Calculate change in requested quantity
  delta := coalesce(NEW.quantity, 0) - coalesce(OLD.quantity, 0);

  if delta = 0 then
    return NEW; -- no change
  end if;

  if delta > 0 then
    -- Need to consume additional stock
    select quantity into available_qty
    from public.inventory_items
    where id = NEW.inventory_item_id
    for update;

    if available_qty is null then
      raise exception 'Inventory item % not found', NEW.inventory_item_id using errcode = '22023';
    end if;

    if available_qty < delta then
      raise exception 'Insufficient stock: available %, additional requested %', available_qty, delta using errcode = '22023';
    end if;

    update public.inventory_items
    set quantity = quantity - delta,
        updated_at = now()
    where id = NEW.inventory_item_id;
  else
    -- Reduce reserved quantity; return stock back
    update public.inventory_items
    set quantity = quantity + (0 - delta),
        updated_at = now()
    where id = NEW.inventory_item_id;
  end if;

  return NEW;
end;
$$;

create or replace function public.handle_outbound_order_item_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Return stock on item deletion
  update public.inventory_items
  set quantity = quantity + coalesce(OLD.quantity, 0),
      updated_at = now()
  where id = OLD.inventory_item_id;

  return OLD;
end;
$$;

-- Drop existing triggers if re-running
drop trigger if exists trg_outbound_order_items_insert on public.outbound_order_items;
drop trigger if exists trg_outbound_order_items_update on public.outbound_order_items;
drop trigger if exists trg_outbound_order_items_delete on public.outbound_order_items;

-- Create triggers
create trigger trg_outbound_order_items_insert
before insert on public.outbound_order_items
for each row
execute function public.handle_outbound_order_item_insert();

create trigger trg_outbound_order_items_update
before update of quantity, inventory_item_id on public.outbound_order_items
for each row
execute function public.handle_outbound_order_item_update();

create trigger trg_outbound_order_items_delete
after delete on public.outbound_order_items
for each row
execute function public.handle_outbound_order_item_delete();

-- Permissions: allow authenticated to execute functions (triggers run as definer)
revoke all on function public.handle_outbound_order_item_insert from public;
revoke all on function public.handle_outbound_order_item_update from public;
revoke all on function public.handle_outbound_order_item_delete from public;
grant execute on function public.handle_outbound_order_item_insert to authenticated;
grant execute on function public.handle_outbound_order_item_update to authenticated;
grant execute on function public.handle_outbound_order_item_delete to authenticated;


