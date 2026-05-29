import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// probePushEstimate (v2) — read an existing SOS estimate to inspect line item shape.
// DELETE after #43 live exercise.
const SOS_API_BASE = 'https://api.sosinventory.com/api/v2';
function err(s,c,m){return Response.json({ok:false,code:c,error:m},{status:s});}
function sanitizeToken(r){return String(r||'').replace(/[\s\x00-\x1F\x7F]/g,'');}

Deno.serve(async (req)=>{
  try{
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if(!user || user.role!=='admin') return err(403,'forbidden','admin only');
    const body = await req.json().catch(()=>({}));
    const configs = await base44.asServiceRole.entities.IntegrationConfig.filter({service:'SOS'});
    const config = configs?.[0];
    const token = sanitizeToken(config?.access_token);

    // Get a list of existing estimates + extract shape of first one's lines.
    const listRes = await fetch(`${SOS_API_BASE}/estimate?maxresults=5`,{
      headers:{Authorization:`Bearer ${token}`}
    });
    const listBody = await listRes.json();
    const first = Array.isArray(listBody?.data) ? listBody.data[0] : null;

    // Also get any existing item from SOS catalog for reference shape.
    const itemListRes = await fetch(`${SOS_API_BASE}/item?maxresults=5`,{
      headers:{Authorization:`Bearer ${token}`}
    });
    const itemListBody = await itemListRes.json();

    return Response.json({
      ok:true,
      list_status: listRes.status,
      list_count: listBody?.count,
      first_estimate: first ? {
        id: first.id,
        keys_top_level: Object.keys(first),
        lines: first.lines,
      } : null,
      item_list_status: itemListRes.status,
      item_list_count: itemListBody?.count,
      first_item_keys: itemListBody?.data?.[0] ? Object.keys(itemListBody.data[0]) : null,
      first_item_sample: itemListBody?.data?.[0] ? {
        id: itemListBody.data[0].id,
        name: itemListBody.data[0].name,
        sku: itemListBody.data[0].sku,
        salesPrice: itemListBody.data[0].salesPrice,
      } : null,
    });
  }catch(e){return err(500,'internal',e?.message||'unknown');}
});
