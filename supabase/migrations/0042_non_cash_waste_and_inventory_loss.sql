-- Migration 0042: Non-Cash Inventory Waste & Loss Accounting
-- 1. Tambahkan kolom is_non_cash pada public.expenses
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS is_non_cash boolean NOT NULL DEFAULT false;

-- 2. Perbarui check constraint pada inventory_mutations.mutation_type jika tabel ada
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'inventory_mutations'
  ) THEN
    ALTER TABLE public.inventory_mutations
      DROP CONSTRAINT IF EXISTS inventory_mutations_mutation_type_check;

    ALTER TABLE public.inventory_mutations
      ADD CONSTRAINT inventory_mutations_mutation_type_check CHECK (
        mutation_type IN (
          'purchase_in',
          'opening_balance',
          'adjustment',
          'waste',
          'transfer_in',
          'transfer_out',
          'waste_expired',
          'lost_shrinkage',
          'production_usage',
          'input_correction'
        )
      );
  END IF;
END $$;

