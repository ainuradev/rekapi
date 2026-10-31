import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const raw = fs.readFileSync('.env.staging.local', 'utf8')
const env = {}
for (const line of raw.split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function checkPhase2Tables() {
  console.log('Target URL:', env.NEXT_PUBLIC_SUPABASE_URL)
  
  const tables = ['suppliers', 'raw_materials', 'raw_material_branch_stocks', 'inventory_mutations']
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('id').limit(1)
    console.log(`Table ${table}:`, error ? `ERROR: ${error.message} (${error.code})` : 'EXISTS (count: ' + (data?.length ?? 0) + ')')
  }

  // Also check purchases columns
  const { data: pData, error: pErr } = await supabase.from('purchases').select('id, supplier_id').limit(1)
  console.log('purchases.supplier_id:', pErr ? `ERROR: ${pErr.message}` : 'EXISTS')

  const { data: piData, error: piErr } = await supabase.from('purchase_items').select('id, raw_material_id, unit').limit(1)
  console.log('purchase_items.raw_material_id:', piErr ? `ERROR: ${piErr.message}` : 'EXISTS')
}

checkPhase2Tables().catch(console.error)
