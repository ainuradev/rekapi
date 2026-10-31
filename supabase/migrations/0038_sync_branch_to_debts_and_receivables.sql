-- ================================================================
-- Migration 0038: Automatic Branch Sync Triggers & Backfill for Debts & Receivables
-- Memastikan debts_payables dan receivables selalu memiliki branch_id yang sinkron
-- ================================================================

-- 1. Backfill ulang baris yang belum memiliki branch_id
UPDATE debts_payables d
SET branch_id = p.branch_id
FROM purchases p
WHERE d.purchase_id = p.id
  AND d.branch_id IS NULL
  AND p.branch_id IS NOT NULL;

UPDATE receivables r
SET branch_id = s.branch_id
FROM sales s
WHERE r.sale_id = s.id
  AND r.branch_id IS NULL
  AND s.branch_id IS NOT NULL;

-- 2. Trigger function: Sinkronisasi branch_id pada debts_payables otomatis dari purchases
CREATE OR REPLACE FUNCTION fn_sync_debt_branch_from_purchase()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.purchase_id IS NOT NULL AND NEW.branch_id IS NULL THEN
        SELECT branch_id INTO NEW.branch_id
        FROM purchases
        WHERE id = NEW.purchase_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_debt_branch ON debts_payables;
CREATE TRIGGER trg_sync_debt_branch
    BEFORE INSERT OR UPDATE OF purchase_id, branch_id ON debts_payables
    FOR EACH ROW
    EXECUTE FUNCTION fn_sync_debt_branch_from_purchase();

-- 3. Trigger function: Sinkronisasi branch_id pada receivables otomatis dari sales
CREATE OR REPLACE FUNCTION fn_sync_receivable_branch_from_sale()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.sale_id IS NOT NULL AND NEW.branch_id IS NULL THEN
        SELECT branch_id INTO NEW.branch_id
        FROM sales
        WHERE id = NEW.sale_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_receivable_branch ON receivables;
CREATE TRIGGER trg_sync_receivable_branch
    BEFORE INSERT OR UPDATE OF sale_id, branch_id ON receivables
    FOR EACH ROW
    EXECUTE FUNCTION fn_sync_receivable_branch_from_sale();

