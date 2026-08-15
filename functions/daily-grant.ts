import { createAdminClient, createClient } from 'npm:@insforge/sdk'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export default async function (req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })

  const baseUrl = Deno.env.get('INSFORGE_BASE_URL')
  const apiKey = Deno.env.get('API_KEY')
  const anonKey = Deno.env.get('ANON_KEY')
  if (!baseUrl || !apiKey || !anonKey) return json({ error: 'Server is missing keys' }, 500)

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '')
  const isCron = token === apiKey

  if (!isCron) {
    const userClient = createClient({ baseUrl, anonKey, accessToken: token })
    const { data: userData } = await userClient.auth.getCurrentUser()
    if (!userData?.user?.id) return json({ error: 'Unauthorized' }, 401)
    const adminCheck = createAdminClient({ baseUrl, apiKey })
    const { data: caller } = await adminCheck.database
      .from('profiles')
      .select('role, active')
      .eq('id', userData.user.id)
      .maybeSingle()
    if (!caller?.active || !['guide', 'admin'].includes(caller.role as string)) {
      return json({ error: 'Guides and admins only' }, 403)
    }
  }

  const admin = createAdminClient({ baseUrl, apiKey })
  const { data, error } = await admin.database.rpc('run_daily_grant')
  if (error) return json({ error: error.message }, 400)
  return json(data)
}
