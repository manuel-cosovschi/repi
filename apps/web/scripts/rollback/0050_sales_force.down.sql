-- Reversión de 0050 (D209). Sólo si se abandona también el código de Ventas: el código anterior no lee nada de 0050, así
-- que revertir el código NO requiere correr esto (alternativa sin pérdida: REPI_SALES=off apaga el módulo).
-- Se NIEGA si hay vendedores, ventas, comisiones o liquidaciones: son historial comercial y económico; exportarlos antes
-- (Admin › Ventas › CSV) y decidir con el titular. En una transacción: todo o nada. Producción: respaldo verde antes.
-- Migración: sha256 2cd8fec43cd78fe0139a302e5709b86e11e00659ee14a6b56817064a98034fa6
begin;
set local lock_timeout = '5s';
do $$ begin
  if exists (select 1 from sales_rep) or exists (select 1 from sales_deal) or exists (select 1 from commission_entry) or exists (select 1 from payout_batch) then
    raise exception '0050: hay datos comerciales (vendedores, ventas, comisiones o liquidaciones); exportarlos y decidir antes de revertir';
  end if;
end $$;
drop table "sales_notice", "sales_material", "sales_target", "payout_payment", "payout_item", "payout_batch", "commission_entry", "sales_request", "sales_attribution",
  "sales_activity", "sales_deal", "sales_opportunity", "sales_prospect", "sales_rep_plan", "commission_plan_version", "commission_plan", "sales_rep_invitation", "sales_rep", "sales_region";
drop function if exists "commission_entry_immutable"();
alter table "commercial_lead" drop column "referral_code";
delete from drizzle.__drizzle_migrations where hash = '2cd8fec43cd78fe0139a302e5709b86e11e00659ee14a6b56817064a98034fa6';
commit;
